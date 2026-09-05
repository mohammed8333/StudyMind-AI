import os
import json
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.flashcard import Flashcard, FlashcardReviewLog
from sqlalchemy import select

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()

async def get_or_create_user(ac: AsyncClient, email: str, name: str) -> str:
    await ac.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": name,
        "grade_or_level": "الثانوية العامة"
    })
    login_res = await ac.post("/api/v1/auth/login", data={
        "username": email,
        "password": "Password123!"
    })
    return login_res.json()["access_token"]


@pytest.mark.asyncio
async def test_generate_flashcards_grounded():
    """Verify that generated flashcards are strictly grounded in document text with source pages."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "fc_user1@example.com", "طالب البطاقات")
        headers = {"Authorization": f"Bearer {token}"}

        # Get user id
        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        # Create Document & Chunks
        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الفيزياء الذكية",
                subject="الفيزياء",
                filename="phys_fc.pdf",
                file_path="mock/phys_fc.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunk1 = DocumentChunk(
                document_id=doc.id,
                page_number=1,
                chunk_index=0,
                chapter="الكهربية الساكنة",
                content="المقاومة الكهربية هي ممانعة الموصل لمرور التيار الكهربي فيه. وتقاس بوحدة الأوم. قانون أوم ينص على أن شدة التيار تتناسب طردياً مع فرق الجهد.",
                content_normalized="المقاومة الكهربية هي ممانعة الموصل لمرور التيار الكهربي فيه"
            )
            chunk2 = DocumentChunk(
                document_id=doc.id,
                page_number=2,
                chunk_index=1,
                chapter="المغناطيسية",
                content="الحث الكهرومغناطيسي هو ظاهرة توليد قوة دافعة كهربية مستحثة وتيار مستحث في موصل نتيجة تغير الفيض المغناطيسي. قانون فراداي يحدد مقدار القوة الدافعة المستحثة.",
                content_normalized="الحث الكهرومغناطيسي هو ظاهرة توليد قوة دافعة كهربية مستحثة"
            )
            db.add(chunk1)
            db.add(chunk2)
            await db.commit()
            doc_id = doc.id

        # 1. Generate Flashcards via API
        gen_res = await ac.post(
            "/api/v1/flashcards/generate",
            headers=headers,
            json={
                "document_id": doc_id,
                "count": 4,
                "card_types": ["definition", "concept", "formula"]
            }
        )
        assert gen_res.status_code == 200
        cards = gen_res.json()
        assert len(cards) >= 2

        for card in cards:
            assert card["document_id"] == doc_id
            assert card["user_id"] == user_id
            assert len(card["front"]) > 0
            assert len(card["back"]) > 0
            assert card["source_page"] in [1, 2]
            assert card["card_type"] in ["definition", "concept", "formula", "fact", "qa"]
            assert card["review_state"] == "new"
            assert card["repetition_count"] == 0

        # 2. Verify Persistence in DB
        async with AsyncSessionLocal() as db:
            stmt = select(Flashcard).where(Flashcard.document_id == doc_id)
            res = await db.execute(stmt)
            db_cards = res.scalars().all()
            assert len(db_cards) == len(cards)


@pytest.mark.asyncio
async def test_sm2_spaced_repetition_grading():
    """Verify that rating flashcards correctly updates SM-2 repetition, ease factor, and intervals."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "sm2_tester@example.com", "مختبر التكرار المتباعد")
        headers = {"Authorization": f"Bearer {token}"}

        # Create manual card
        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الكيمياء العضوية",
                subject="الكيمياء",
                filename="chem_fc.pdf",
                file_path="mock/chem_fc.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            card = Flashcard(
                user_id=user_id,
                document_id=doc.id,
                front="ما هي الألكانات؟",
                back="هيدروكربونات أليفاتية مشبعة ذات روابط أحادية.",
                card_type="definition",
                difficulty="medium",
                source_page=10,
                repetition_count=0,
                ease_factor=2.5,
                interval_days=0,
                next_review_at=datetime.utcnow(),
                review_state="new"
            )
            db.add(card)
            await db.commit()
            card_id = card.id

        # 1. Review with "again" (student failed to recall)
        rev1 = await ac.post(
            f"/api/v1/flashcards/{card_id}/review",
            headers=headers,
            json={"rating": "again"}
        )
        assert rev1.status_code == 200
        data1 = rev1.json()
        assert data1["card"]["repetition_count"] == 0
        assert data1["card"]["interval_days"] == 1
        assert data1["card"]["review_state"] == "learning"
        assert data1["card"]["ease_factor"] < 2.5  # Decreased by 0.2

        # 2. Review with "good" (student recalled correctly)
        rev2 = await ac.post(
            f"/api/v1/flashcards/{card_id}/review",
            headers=headers,
            json={"rating": "good"}
        )
        assert rev2.status_code == 200
        data2 = rev2.json()
        assert data2["card"]["repetition_count"] == 1
        assert data2["card"]["interval_days"] == 1
        assert data2["card"]["review_state"] in ["review", "learning"]

        # 3. Review with "easy" (smooth mastery)
        rev3 = await ac.post(
            f"/api/v1/flashcards/{card_id}/review",
            headers=headers,
            json={"rating": "easy"}
        )
        assert rev3.status_code == 200
        data3 = rev3.json()
        assert data3["card"]["repetition_count"] == 2
        assert data3["card"]["interval_days"] >= 3
        assert data3["card"]["ease_factor"] > data1["card"]["ease_factor"]

        # Verify review log in DB
        async with AsyncSessionLocal() as db:
            log_stmt = select(FlashcardReviewLog).where(FlashcardReviewLog.card_id == card_id)
            res = await db.execute(log_stmt)
            logs = res.scalars().all()
            assert len(logs) == 3


@pytest.mark.asyncio
async def test_adaptive_learning_weak_concept_boost():
    """Verify that cards linked to weak concepts receive compressed intervals and priority in due queue."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "weak_boost_user@example.com", "طالب المفاهيم الضعيفة")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الأحياء الوراثية",
                subject="الأحياء",
                filename="bio_fc.pdf",
                file_path="mock/bio_fc.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            concept = Concept(
                document_id=doc.id,
                name="قانون مندل الثاني",
                subject="الأحياء",
                chapter="علم الوراثة"
            )
            db.add(concept)
            await db.flush()

            # Mark as weak in StudentMastery
            mastery = StudentMastery(
                student_id=user_id,
                concept_id=concept.id,
                mastery_score=40.0,
                is_weak_point=True,
                total_attempts=2,
                correct_attempts=0
            )
            db.add(mastery)

            # Normal card
            normal_card = Flashcard(
                user_id=user_id,
                document_id=doc.id,
                front="ما هو الـ DNA؟",
                back="حمض نووي يحمل التعليمات الوراثية.",
                card_type="definition",
                repetition_count=2,
                ease_factor=2.5,
                interval_days=4,
                next_review_at=datetime.utcnow() - timedelta(hours=5),
                review_state="review"
            )
            # Weak concept card (due more recently, but must be prioritized first due to weakness!)
            weak_card = Flashcard(
                user_id=user_id,
                document_id=doc.id,
                concept_id=concept.id,
                concept_name=concept.name,
                front="ما نص قانون التوزيع الحر لمندل؟",
                back="تتوزع أزواج العوامل الوراثية المنعزلة توزيعاً حراً مستقلاً عند تكوين الأمشاج.",
                card_type="concept",
                repetition_count=2,
                ease_factor=2.5,
                interval_days=4,
                next_review_at=datetime.utcnow() - timedelta(hours=1),
                review_state="review"
            )
            db.add(normal_card)
            db.add(weak_card)
            await db.commit()
            weak_card_id = weak_card.id

        # 1. Check Due cards prioritizes weak concept card first!
        due_res = await ac.get(f"/api/v1/flashcards/due?document_id={doc.id}", headers=headers)
        assert due_res.status_code == 200
        due_cards = due_res.json()
        assert len(due_cards) >= 2
        assert due_cards[0]["id"] == weak_card_id, "Weak concept card must appear first in due queue"

        # 2. Review weak card with 'easy': should boost StudentMastery score!
        rev_res = await ac.post(
            f"/api/v1/flashcards/{weak_card_id}/review",
            headers=headers,
            json={"rating": "easy"}
        )
        assert rev_res.status_code == 200
        rev_data = rev_res.json()
        assert rev_data["concept_mastery_updated"] is True
        assert rev_data["new_mastery_score"] > 40.0  # Boosted!


@pytest.mark.asyncio
async def test_flashcard_crud_and_metadata():
    """Verify manual creation, updating, favoriting, suspending, and deleting flashcards."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "crud_user@example.com", "طالب الإدارة")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الجغرافيا",
                subject="الجغرافيا",
                filename="geo_fc.pdf",
                file_path="mock/geo_fc.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.commit()
            doc_id = doc.id

        # 1. Create manual card
        create_res = await ac.post(
            "/api/v1/flashcards",
            headers=headers,
            json={
                "document_id": doc_id,
                "front": "ما هي عاصمة مصر؟",
                "back": "القاهرة",
                "card_type": "fact",
                "difficulty": "easy",
                "source_page": 5
            }
        )
        assert create_res.status_code == 201
        card_id = create_res.json()["id"]

        # 2. Update card
        patch_res = await ac.patch(
            f"/api/v1/flashcards/{card_id}",
            headers=headers,
            json={"back": "القاهرة الكبرى"}
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["back"] == "القاهرة الكبرى"

        # 3. Toggle favorite
        fav_res = await ac.post(f"/api/v1/flashcards/{card_id}/favorite", headers=headers)
        assert fav_res.status_code == 200
        assert fav_res.json()["is_favorite"] is True

        # 4. Toggle suspend
        susp_res = await ac.post(f"/api/v1/flashcards/{card_id}/suspend", headers=headers)
        assert susp_res.status_code == 200
        assert susp_res.json()["is_suspended"] is True

        # Check dashboard metrics reflect this card
        dash_res = await ac.get("/api/v1/flashcards/dashboard", headers=headers)
        assert dash_res.status_code == 200
        dash_data = dash_res.json()
        assert dash_data["total_cards"] >= 1
        assert dash_data["favorites_count"] >= 1
        assert dash_data["suspended_count"] >= 1

        # 5. Delete card
        del_res = await ac.delete(f"/api/v1/flashcards/{card_id}", headers=headers)
        assert del_res.status_code == 200

        # Verify not found after delete
        get_res = await ac.get(f"/api/v1/flashcards/{card_id}", headers=headers)
        assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_flashcards_idor_protection():
    """Verify that User B cannot view, update, delete, or review User A's flashcards."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "user_a@example.com", "مستخدم أ")
        token_b = await get_or_create_user(ac, "user_b@example.com", "مستخدم ب")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        me_a = (await ac.get("/api/v1/auth/me", headers=headers_a)).json()

        # Create card for User A
        async with AsyncSessionLocal() as db:
            doc_a = Document(
                title="مذكرة سرية للمستخدم أ",
                subject="تاريخ",
                filename="secret_a.pdf",
                file_path="mock/secret_a.pdf",
                owner_id=me_a["id"],
                status="READY"
            )
            db.add(doc_a)
            await db.flush()

            card_a = Flashcard(
                user_id=me_a["id"],
                document_id=doc_a.id,
                front="سؤال خاص بأ",
                back="إجابة خاصة بأ",
                card_type="qa",
                difficulty="medium"
            )
            db.add(card_a)
            await db.commit()
            card_a_id = card_a.id
            doc_a_id = doc_a.id

        # User B attempts to access User A's card -> 403
        get_res = await ac.get(f"/api/v1/flashcards/{card_a_id}", headers=headers_b)
        assert get_res.status_code == 403

        # User B attempts to review User A's card -> 403
        rev_res = await ac.post(
            f"/api/v1/flashcards/{card_a_id}/review",
            headers=headers_b,
            json={"rating": "good"}
        )
        assert rev_res.status_code == 403

        # User B attempts to update User A's card -> 403
        patch_res = await ac.patch(
            f"/api/v1/flashcards/{card_a_id}",
            headers=headers_b,
            json={"front": "محاولة اختراق"}
        )
        assert patch_res.status_code == 403

        # User B attempts to delete User A's card -> 403
        del_res = await ac.delete(f"/api/v1/flashcards/{card_a_id}", headers=headers_b)
        assert del_res.status_code == 403

        # User B attempts to generate cards from User A's document -> 403
        gen_res = await ac.post(
            "/api/v1/flashcards/generate",
            headers=headers_b,
            json={"document_id": doc_a_id, "count": 5}
        )
        assert gen_res.status_code == 403
