import json
import logging
import re
import random
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional, Tuple, Literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete, or_, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import instance_state

from app.models.user import User
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.flashcard import Flashcard, FlashcardReviewLog
from app.schemas.flashcard import (
    FlashcardCreate,
    FlashcardUpdate,
    FlashcardGenerateRequest,
    FlashcardReviewRequest,
    FlashcardResponse,
    FlashcardListResponse,
    FlashcardsDashboardMetrics,
    FlashcardReviewResponse,
    CARD_TYPE_LABELS
)
from app.services.llm_adapter import call_llm
from app.services.arabic_nlp import normalize_arabic

logger = logging.getLogger(__name__)

def build_flashcard_response(card: Flashcard, doc_title: Optional[str] = None) -> FlashcardResponse:
    """Converts a Flashcard ORM instance safely into FlashcardResponse without lazy loading errors."""
    dt = doc_title
    if not dt:
        try:
            state = instance_state(card)
            if "document" in state.dict and state.dict["document"] is not None:
                dt = state.dict["document"].title
        except Exception:
            dt = None

    now = datetime.utcnow()
    is_due = (card.next_review_at <= now and not card.is_suspended)

    return FlashcardResponse(
        id=card.id,
        user_id=card.user_id,
        document_id=card.document_id,
        document_title=dt,
        concept_id=card.concept_id,
        concept_name=card.concept_name,
        front=card.front,
        back=card.back,
        card_type=card.card_type,
        card_type_label=CARD_TYPE_LABELS.get(card.card_type, card.card_type),
        difficulty=card.difficulty,
        source_page=card.source_page,
        source_section=card.source_section,
        is_suspended=card.is_suspended,
        is_favorite=card.is_favorite,
        repetition_count=card.repetition_count,
        ease_factor=card.ease_factor,
        interval_days=card.interval_days,
        next_review_at=card.next_review_at,
        last_reviewed_at=card.last_reviewed_at,
        review_state=card.review_state,
        is_due=is_due,
        created_at=card.created_at,
        updated_at=card.updated_at
    )


def extract_deterministic_grounded_cards(
    chunks: List[DocumentChunk],
    target_count: int = 10,
    requested_types: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Deterministic zero-hallucination extractor that parses academic texts directly from chunks.
    Guarantees every card is 100% sourced from document content with true page numbers.
    """
    extracted_cards: List[Dict[str, Any]] = []
    types_pool = requested_types or ["definition", "concept", "formula", "fact", "qa"]

    for chunk in chunks:
        content = chunk.content or ""
        lines = [line.strip() for line in re.split(r'[\n\r.]+', content) if len(line.strip()) > 20]

        for line in lines:
            # 1. Definition patterns
            if any(k in line for k in ["هو ", "هي ", "يُقصد بـ", "يقصد بـ", "يُعرف بـ", "يعرف بأنه", "تعريف"]):
                parts = re.split(r'هو|هي|يُقصد بـ|يقصد بـ|يُعرف بـ|يعرف بأنه', line, maxsplit=1)
                if len(parts) == 2 and len(parts[0].strip()) > 2 and len(parts[1].strip()) > 8:
                    term = parts[0].strip(" :-\t")
                    definition = parts[1].strip(" :-\t")
                    if len(term.split()) <= 6:
                        extracted_cards.append({
                            "front": f"ما هو تعريف «{term}»؟",
                            "back": f"{definition}.",
                            "card_type": "definition",
                            "difficulty": "medium",
                            "source_page": chunk.page_number,
                            "source_section": chunk.chapter or chunk.section_title or "مفاهيم ومصطلحات",
                            "concept_name": term
                        })

            # 2. Formula patterns
            elif any(k in line for k in ["قانون", "صيغة", "علاقة رياضية", "=", "يتناسب"]):
                if "=" in line or "قانون" in line:
                    extracted_cards.append({
                        "front": f"ما هو القانون أو العلاقة العلمية الخاصة بـ: {line[:50]}؟",
                        "back": f"{line}.",
                        "card_type": "formula",
                        "difficulty": "hard",
                        "source_page": chunk.page_number,
                        "source_section": chunk.chapter or "قوانين وعلاقات",
                        "concept_name": chunk.chapter or "قوانين المقرر"
                    })

            # 3. Fact / Concept patterns
            elif any(k in line for k in ["يؤدي إلى", "ينتج عن", "تعتمد على", "السبب في", "بسبب", "تتميز"]):
                extracted_cards.append({
                    "front": f"ما الحقيقة أو النتيجة المترتبة على: {line[:60]}...؟",
                    "back": f"{line}.",
                    "card_type": "concept",
                    "difficulty": "medium",
                    "source_page": chunk.page_number,
                    "source_section": chunk.chapter or "حقائق ومفاهيم",
                    "concept_name": chunk.chapter or "مفاهيم الدرس"
                })

            # 4. Q/A general academic sentence
            elif len(line) > 35 and "?" not in line:
                extracted_cards.append({
                    "front": f"ما المعلومة الأساسية المقررة بخصوص: «{line[:40]}...»؟",
                    "back": f"{line}.",
                    "card_type": "qa",
                    "difficulty": "easy",
                    "source_page": chunk.page_number,
                    "source_section": chunk.chapter or "استرجاع معلومات",
                    "concept_name": chunk.chapter or "معلومات عامة"
                })

            if len(extracted_cards) >= target_count * 2:
                break
        if len(extracted_cards) >= target_count * 2:
            break

    # If nothing matched (e.g. very sparse text), create fallback cards directly from chunk bodies
    if not extracted_cards:
        for i, chunk in enumerate(chunks[:target_count]):
            snippet = chunk.content[:200].strip()
            extracted_cards.append({
                "front": f"استرجع النقطة المحورية الواردة في صفحة {chunk.page_number}: {snippet[:45]}...",
                "back": f"{snippet}.",
                "card_type": "concept",
                "difficulty": "medium",
                "source_page": chunk.page_number,
                "source_section": chunk.chapter or "نصوص المذكرة",
                "concept_name": chunk.chapter or "فصل دراسي"
            })

    # Shuffle and trim to requested count
    random.shuffle(extracted_cards)
    return extracted_cards[:target_count]


async def generate_flashcards_from_document(
    db: AsyncSession,
    user_id: int,
    req: FlashcardGenerateRequest
) -> List[FlashcardResponse]:
    """
    Extracts concepts and generates flashcards strictly grounded in document text.
    Persists them into the database and returns them.
    """
    # 1. Fetch document and verify ownership
    doc_stmt = select(Document).where(Document.id == req.document_id)
    doc_res = await db.execute(doc_stmt)
    doc = doc_res.scalars().first()
    if not doc:
        raise ValueError("المستند المطلوب غير موجود.")
    if doc.owner_id != user_id:
        raise PermissionError("لا تملك صلاحية الوصول إلى هذا المستند.")

    # 2. Fetch chunks
    c_stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == req.document_id)
        .order_by(DocumentChunk.page_number.asc(), DocumentChunk.chunk_index.asc())
    )
    c_res = await db.execute(c_stmt)
    chunks = c_res.scalars().all()
    if not chunks:
        raise ValueError("لا يوجد محتوى نصي مفهرس في هذا المستند لتوليد البطاقات منه.")

    # Optional Concept info
    concept_obj = None
    if req.concept_id:
        concept_obj = await db.get(Concept, req.concept_id)

    # 3. Prepare Grounded Prompt for LLM
    target_count = req.count
    context_parts = []
    total_len = 0
    for ch in chunks:
        snippet = f"[صفحة {ch.page_number} - {ch.chapter or ''}]: {ch.content}"
        context_parts.append(snippet)
        total_len += len(snippet)
        if total_len > 12000:
            break
    context_text = "\n\n".join(context_parts)

    system_instruction = (
        "أنت معلم ومصمم بطاقات تعليمية ذكي وخبير في المناهج الدراسية. مهمتك استخراج بطاقات استرجاع نشط (Active Recall Flashcards) "
        "معتمدة حصراً ومباشرة على نصوص المذكرة المرفقة مع منع الهلوسة تماماً."
    )

    types_str = ", ".join(req.card_types) if req.card_types else "definition, concept, formula, fact, qa"
    prompt = f"""قم باستخراج وتوليد عدد {target_count} بطاقة تعليمية (Flashcards) من المحتوى الدراسي المرفق أدناه لمادة ({doc.subject or 'المادة'}).

قواعد حاسمة لمنع الهلوسة:
1. اعتمد حصراً وبشكل قطعي على المعلومات الواردة في النصوص المرفقة؛ لا تضف أي فكرة خارجية.
2. حدد بدقة رقم الصفحة المصدرية الحقيقية (source_page) المذكورة في النص.
3. نوّع في أنواع البطاقات بين الأنواع المطلوبة ({types_str}):
   - definition: تعريفات ومصطلحات أساسية.
   - concept: مفاهيم وعلاقات ومنطق علمي.
   - formula: قوانين ورموز وصيغ وحسابات.
   - fact: حقائق وملاحظات علمية مؤكدة.
   - qa: أسئلة استرجاع نشط.
4. يجب أن يكون وجه البطاقة (front) مركزاً ومثيراً للتفكير، وظهر البطاقة (back) دقيقاً وشاملاً.

النصوص المعتمدة من المذكرة:
{context_text}

المطلوب إخراج مصفوفة JSON حصراً بدون أي شروحات إضافية:
[
  {{
    "front": "السؤال أو المصطلح أو المفهوم أو القانون",
    "back": "الشرح والإجابة والتعريف الدقيق",
    "card_type": "definition | concept | formula | fact | qa",
    "difficulty": "easy | medium | hard",
    "source_page": 1,
    "source_section": "اسم الفصل أو القسم",
    "concept_name": "اسم المفهوم المرتبط"
  }}
]"""

    cards_to_persist: List[Dict[str, Any]] = []
    try:
        raw_response = await call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True,
            temperature=0.2,
            max_tokens=2500
        )
        if raw_response:
            # Clean possible markdown fence
            cleaned = re.sub(r'^```(?:json)?\s*', '', raw_response.strip(), flags=re.MULTILINE)
            cleaned = re.sub(r'\s*```$', '', cleaned.strip(), flags=re.MULTILINE)
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) > 0:
                for item in parsed:
                    if isinstance(item, dict) and "front" in item and "back" in item:
                        cards_to_persist.append({
                            "front": str(item.get("front", "")).strip(),
                            "back": str(item.get("back", "")).strip(),
                            "card_type": str(item.get("card_type", "concept")).lower(),
                            "difficulty": str(item.get("difficulty", "medium")).lower(),
                            "source_page": int(item.get("source_page")) if item.get("source_page") else chunks[0].page_number,
                            "source_section": str(item.get("source_section") or chunks[0].chapter or ""),
                            "concept_name": str(item.get("concept_name") or (concept_obj.name if concept_obj else doc.subject or ""))
                        })
    except Exception as e:
        logger.warning(f"Flashcard LLM extraction failed or returned invalid JSON ({e}). Falling back to deterministic extractor.")

    # If LLM didn't return enough cards, supplement with deterministic grounded cards
    if len(cards_to_persist) < target_count:
        fallback_cards = extract_deterministic_grounded_cards(
            chunks=chunks,
            target_count=(target_count - len(cards_to_persist)),
            requested_types=req.card_types
        )
        cards_to_persist.extend(fallback_cards)

    now = datetime.utcnow()
    created_flashcards: List[Flashcard] = []

    for item in cards_to_persist[:target_count]:
        c_type = item.get("card_type", "concept")
        if c_type not in ["definition", "concept", "formula", "fact", "qa"]:
            c_type = "concept"
        diff = item.get("difficulty", "medium")
        if diff not in ["easy", "medium", "hard"]:
            diff = "medium"

        fc = Flashcard(
            user_id=user_id,
            document_id=doc.id,
            concept_id=req.concept_id if req.concept_id else (concept_obj.id if concept_obj else None),
            concept_name=item.get("concept_name") or (concept_obj.name if concept_obj else doc.subject),
            front=item["front"],
            back=item["back"],
            card_type=c_type,
            difficulty=diff,
            source_page=item.get("source_page"),
            source_section=item.get("source_section"),
            is_suspended=False,
            is_favorite=False,
            repetition_count=0,
            ease_factor=2.5,
            interval_days=0,
            next_review_at=now,
            review_state="new",
            created_at=now,
            updated_at=now
        )
        db.add(fc)
        created_flashcards.append(fc)

    await db.commit()
    for fc in created_flashcards:
        await db.refresh(fc)

    return [build_flashcard_response(fc, doc_title=doc.title) for fc in created_flashcards]


def calculate_sm2_spaced_repetition(
    rating: Literal["again", "hard", "good", "easy"],
    current_rep: int,
    current_interval: int,
    current_ef: float,
    is_weak_point: bool = False
) -> Tuple[int, int, float, str]:
    """
    Computes new repetition count, interval days, ease factor, and review state
    using an enhanced SuperMemo SM-2 algorithm integrated with Adaptive Learning.
    """
    # 1. Adjust Ease Factor
    if rating == "again":
        new_ef = max(1.3, round(current_ef - 0.20, 2))
    elif rating == "hard":
        new_ef = max(1.3, round(current_ef - 0.15, 2))
    elif rating == "good":
        new_ef = current_ef
    else:  # easy
        new_ef = min(3.0, round(current_ef + 0.15, 2))

    # 2. Adjust Repetition and Interval Days
    if rating == "again":
        new_rep = 0
        new_interval = 1
        new_state = "learning"
    elif rating == "hard":
        new_rep = current_rep + 1
        if new_rep == 1:
            new_interval = 1
        elif new_rep == 2:
            new_interval = 3
        else:
            new_interval = max(1, round(current_interval * 1.2))
        new_state = "learning" if new_rep < 3 else "review"
    elif rating == "good":
        new_rep = current_rep + 1
        if new_rep == 1:
            new_interval = 1
        elif new_rep == 2:
            new_interval = 4
        else:
            new_interval = max(1, round(current_interval * new_ef))
        new_state = "mastered" if new_rep >= 4 else "review"
    else:  # easy
        new_rep = current_rep + 1
        if new_rep == 1:
            new_interval = 3
        elif new_rep == 2:
            new_interval = 7
        else:
            new_interval = max(1, round(current_interval * new_ef * 1.3))
        new_state = "mastered" if new_rep >= 3 else "review"

    # 3. Adaptive Learning Boost for Weak Concepts
    # If the student is struggling with this concept, compress interval so they practice it sooner!
    if is_weak_point:
        new_interval = max(1, round(new_interval * 0.65))

    return new_rep, new_interval, new_ef, new_state


async def record_card_review(
    db: AsyncSession,
    user_id: int,
    card_id: int,
    req: FlashcardReviewRequest
) -> FlashcardReviewResponse:
    """
    Submits a review grade for a flashcard, updates SM-2 parameters and next review date,
    and feeds back into the student's concept mastery in Adaptive Learning.
    """
    stmt = (
        select(Flashcard)
        .options(selectinload(Flashcard.document))
        .where(Flashcard.id == card_id)
    )
    res = await db.execute(stmt)
    card = res.scalars().first()
    if not card:
        raise ValueError("البطاقة التعليمية غير موجودة.")
    if card.user_id != user_id:
        raise PermissionError("لا تملك صلاحية مراجعة هذه البطاقة.")

    # Check if concept is weak point in StudentMastery
    is_weak = False
    mastery_record: Optional[StudentMastery] = None
    if card.concept_id:
        m_stmt = select(StudentMastery).where(
            StudentMastery.student_id == user_id,
            StudentMastery.concept_id == card.concept_id
        )
        m_res = await db.execute(m_stmt)
        mastery_record = m_res.scalars().first()
        if mastery_record:
            is_weak = mastery_record.is_weak_point or (mastery_record.mastery_score < 70.0)

    # Compute SM-2
    new_rep, new_interval, new_ef, new_state = calculate_sm2_spaced_repetition(
        rating=req.rating,
        current_rep=card.repetition_count,
        current_interval=card.interval_days,
        current_ef=card.ease_factor,
        is_weak_point=is_weak
    )

    now = datetime.utcnow()
    next_date = now + timedelta(days=new_interval)

    # Update card
    card.repetition_count = new_rep
    card.interval_days = new_interval
    card.ease_factor = new_ef
    card.review_state = new_state
    card.last_reviewed_at = now
    card.next_review_at = next_date
    card.updated_at = now

    # Log review
    log = FlashcardReviewLog(
        card_id=card.id,
        user_id=user_id,
        rating=req.rating,
        repetition_number=new_rep,
        interval_days_applied=new_interval,
        ease_factor_applied=new_ef,
        reviewed_at=now
    )
    db.add(log)

    # Adaptive Learning Feedback: update concept mastery
    concept_updated = False
    new_score = None
    if mastery_record:
        concept_updated = True
        mastery_record.total_attempts += 1
        if req.rating in ["good", "easy"]:
            mastery_record.correct_attempts += 1
            gain = 5.0 if req.rating == "easy" else 3.0
            mastery_record.mastery_score = min(100.0, round(mastery_record.mastery_score + gain, 1))
            if mastery_record.mastery_score >= 75.0:
                mastery_record.is_weak_point = False
                mastery_record.is_proficient = True
        else:  # again
            mastery_record.mastery_score = max(0.0, round(mastery_record.mastery_score - 2.0, 1))
            mastery_record.is_weak_point = True

        mastery_record.last_practiced_at = now
        new_score = mastery_record.mastery_score

    await db.commit()
    await db.refresh(card)

    msg_map = {
        "again": "تمت جدولة البطاقة لإعادة مراجعتها قريباً لتثبيتها في الذاكرة 🔄",
        "hard": "أحسنت المحاولة! سيتكرر ظهور البطاقة قريباً لزيادة السهولة ⏳",
        "good": "ممتاز! تم تمديد الفاصل الزمني وموعد المراجعة القادمة 🎯",
        "easy": "رائع ومبهر! بطاقة متقنة وتم تحديث مستوى استيعاب المفهوم 🚀"
    }

    return FlashcardReviewResponse(
        card=build_flashcard_response(card),
        rating=req.rating,
        next_review_at=next_date,
        interval_days=new_interval,
        ease_factor=new_ef,
        review_state=new_state,
        concept_mastery_updated=concept_updated,
        new_mastery_score=new_score,
        message=msg_map.get(req.rating, "تم تسجيل المراجعة بنجاح.")
    )


async def get_dashboard_metrics(
    db: AsyncSession,
    user_id: int
) -> FlashcardsDashboardMetrics:
    """Computes high-level Spaced Repetition metrics for the student's dashboard."""
    now = datetime.utcnow()

    # Total cards
    total_q = select(func.count(Flashcard.id)).where(Flashcard.user_id == user_id)
    total_res = await db.execute(total_q)
    total_cards = total_res.scalar() or 0

    # Due today (next_review_at <= now and not suspended)
    due_q = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == user_id,
        Flashcard.is_suspended == False,
        Flashcard.next_review_at <= now
    )
    due_res = await db.execute(due_q)
    due_today = due_res.scalar() or 0

    # New cards
    new_q = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == user_id,
        Flashcard.is_suspended == False,
        Flashcard.review_state == "new"
    )
    new_res = await db.execute(new_q)
    new_cards = new_res.scalar() or 0

    # Learning
    learn_q = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == user_id,
        Flashcard.is_suspended == False,
        Flashcard.review_state == "learning"
    )
    learn_res = await db.execute(learn_q)
    learning = learn_res.scalar() or 0

    # Mastered
    mast_q = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == user_id,
        Flashcard.is_suspended == False,
        Flashcard.review_state == "mastered"
    )
    mast_res = await db.execute(mast_q)
    mastered = mast_res.scalar() or 0

    # Favorites
    fav_q = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == user_id,
        Flashcard.is_favorite == True
    )
    fav_res = await db.execute(fav_q)
    favorites_count = fav_res.scalar() or 0

    # Suspended
    susp_q = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == user_id,
        Flashcard.is_suspended == True
    )
    susp_res = await db.execute(susp_q)
    suspended_count = susp_res.scalar() or 0

    # Retention rate from reviews
    rev_total_q = select(func.count(FlashcardReviewLog.id)).where(FlashcardReviewLog.user_id == user_id)
    rev_tot_res = await db.execute(rev_total_q)
    rev_total = rev_tot_res.scalar() or 0

    if rev_total > 0:
        rev_success_q = select(func.count(FlashcardReviewLog.id)).where(
            FlashcardReviewLog.user_id == user_id,
            FlashcardReviewLog.rating.in_(["good", "easy"])
        )
        rev_suc_res = await db.execute(rev_success_q)
        rev_success = rev_suc_res.scalar() or 0
        retention_rate = round((rev_success / rev_total) * 100, 1)
    else:
        retention_rate = 100.0 if total_cards > 0 else 0.0

    return FlashcardsDashboardMetrics(
        due_today=due_today,
        new_cards=new_cards,
        learning=learning,
        mastered=mastered,
        total_cards=total_cards,
        favorites_count=favorites_count,
        suspended_count=suspended_count,
        retention_rate=retention_rate
    )


async def get_due_flashcards(
    db: AsyncSession,
    user_id: int,
    limit: int = 50,
    document_id: Optional[int] = None
) -> List[FlashcardResponse]:
    """
    Retrieves cards due for review now.
    Adaptive Priority: Prioritizes cards associated with weak concepts first!
    """
    now = datetime.utcnow()
    stmt = (
        select(Flashcard)
        .options(selectinload(Flashcard.document))
        .where(
            Flashcard.user_id == user_id,
            Flashcard.is_suspended == False,
            Flashcard.next_review_at <= now
        )
    )
    if document_id:
        stmt = stmt.where(Flashcard.document_id == document_id)

    res = await db.execute(stmt)
    cards = res.scalars().all()

    # Identify weak concept IDs for this student to prioritize them
    weak_stmt = select(StudentMastery.concept_id).where(
        StudentMastery.student_id == user_id,
        or_(StudentMastery.is_weak_point == True, StudentMastery.mastery_score < 70.0)
    )
    w_res = await db.execute(weak_stmt)
    weak_concept_ids = set(w_res.scalars().all())

    # Sort: weak concepts first, then closest due date
    sorted_cards = sorted(
        cards,
        key=lambda c: (
            0 if (c.concept_id and c.concept_id in weak_concept_ids) else 1,
            c.next_review_at
        )
    )

    return [build_flashcard_response(c) for c in sorted_cards[:limit]]


async def list_flashcards(
    db: AsyncSession,
    user_id: int,
    document_id: Optional[int] = None,
    card_type: Optional[str] = None,
    review_state: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    is_suspended: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> FlashcardListResponse:
    """Lists flashcards with extensive filtering and pagination."""
    stmt = (
        select(Flashcard)
        .options(selectinload(Flashcard.document))
        .where(Flashcard.user_id == user_id)
    )

    if document_id:
        stmt = stmt.where(Flashcard.document_id == document_id)
    if card_type:
        stmt = stmt.where(Flashcard.card_type == card_type)
    if review_state:
        stmt = stmt.where(Flashcard.review_state == review_state)
    if is_favorite is not None:
        stmt = stmt.where(Flashcard.is_favorite == is_favorite)
    if is_suspended is not None:
        stmt = stmt.where(Flashcard.is_suspended == is_suspended)
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Flashcard.front.ilike(term), Flashcard.back.ilike(term), Flashcard.concept_name.ilike(term)))

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    c_res = await db.execute(count_stmt)
    total = c_res.scalar() or 0

    # Paginate and order
    stmt = stmt.order_by(Flashcard.next_review_at.asc(), Flashcard.id.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    res = await db.execute(stmt)
    items = res.scalars().all()

    return FlashcardListResponse(
        items=[build_flashcard_response(c) for c in items],
        total=total,
        page=page,
        page_size=page_size
    )


async def create_flashcard(
    db: AsyncSession,
    user_id: int,
    data: FlashcardCreate
) -> FlashcardResponse:
    """Manually creates a new flashcard with ownership validation."""
    doc = await db.get(Document, data.document_id)
    if not doc:
        raise ValueError("المستند المحدد غير موجود.")
    if doc.owner_id != user_id:
        raise PermissionError("لا تملك صلاحية إضافة بطاقات لهذا المستند.")

    now = datetime.utcnow()
    fc = Flashcard(
        user_id=user_id,
        document_id=data.document_id,
        concept_id=data.concept_id,
        concept_name=data.concept_name or doc.subject,
        front=data.front,
        back=data.back,
        card_type=data.card_type,
        difficulty=data.difficulty,
        source_page=data.source_page,
        source_section=data.source_section,
        is_suspended=False,
        is_favorite=False,
        repetition_count=0,
        ease_factor=2.5,
        interval_days=0,
        next_review_at=now,
        review_state="new",
        created_at=now,
        updated_at=now
    )
    db.add(fc)
    await db.commit()
    await db.refresh(fc)
    return build_flashcard_response(fc, doc_title=doc.title)


async def update_flashcard(
    db: AsyncSession,
    user_id: int,
    card_id: int,
    data: FlashcardUpdate
) -> FlashcardResponse:
    """Updates a flashcard with strict IDOR verification."""
    stmt = select(Flashcard).options(selectinload(Flashcard.document)).where(Flashcard.id == card_id)
    res = await db.execute(stmt)
    card = res.scalars().first()
    if not card:
        raise ValueError("البطاقة غير موجودة.")
    if card.user_id != user_id:
        raise PermissionError("لا تملك صلاحية تعديل هذه البطاقة.")

    if data.front is not None:
        card.front = data.front
    if data.back is not None:
        card.back = data.back
    if data.card_type is not None:
        card.card_type = data.card_type
    if data.difficulty is not None:
        card.difficulty = data.difficulty
    if data.source_page is not None:
        card.source_page = data.source_page
    if data.source_section is not None:
        card.source_section = data.source_section
    if data.is_suspended is not None:
        card.is_suspended = data.is_suspended
    if data.is_favorite is not None:
        card.is_favorite = data.is_favorite

    card.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(card)
    return build_flashcard_response(card)


async def delete_flashcard(
    db: AsyncSession,
    user_id: int,
    card_id: int
) -> Dict[str, Any]:
    """Deletes a flashcard with IDOR protection."""
    card = await db.get(Flashcard, card_id)
    if not card:
        raise ValueError("البطاقة غير موجودة.")
    if card.user_id != user_id:
        raise PermissionError("لا تملك صلاحية حذف هذه البطاقة.")

    await db.delete(card)
    await db.commit()
    return {"success": True, "message": "تم حذف البطاقة التعليمية بنجاح."}


async def toggle_favorite(
    db: AsyncSession,
    user_id: int,
    card_id: int
) -> FlashcardResponse:
    """Toggles favorite status for a card."""
    stmt = select(Flashcard).options(selectinload(Flashcard.document)).where(Flashcard.id == card_id)
    res = await db.execute(stmt)
    card = res.scalars().first()
    if not card:
        raise ValueError("البطاقة غير موجودة.")
    if card.user_id != user_id:
        raise PermissionError("لا تملك صلاحية تعديل هذه البطاقة.")

    card.is_favorite = not card.is_favorite
    card.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(card)
    return build_flashcard_response(card)


async def toggle_suspend(
    db: AsyncSession,
    user_id: int,
    card_id: int
) -> FlashcardResponse:
    """Toggles suspend status for a card (exclude/include in reviews)."""
    stmt = select(Flashcard).options(selectinload(Flashcard.document)).where(Flashcard.id == card_id)
    res = await db.execute(stmt)
    card = res.scalars().first()
    if not card:
        raise ValueError("البطاقة غير موجودة.")
    if card.user_id != user_id:
        raise PermissionError("لا تملك صلاحية تعديل هذه البطاقة.")

    card.is_suspended = not card.is_suspended
    card.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(card)
    return build_flashcard_response(card)
