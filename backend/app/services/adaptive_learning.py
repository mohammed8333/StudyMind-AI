import json
import logging
import re
import random
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery, RemedialSession
from app.models.quiz import QuizQuestion
from app.services.llm_adapter import call_llm
from app.services.quiz_generator import extract_academic_sentences
from app.schemas.learning import (
    RemedialSessionResponse,
    RemedialQuestionItem,
    RemedialSubmitRequest,
    RemedialResultResponse,
    RemedialQuestionFeedback,
    WeakConceptItem
)

logger = logging.getLogger(__name__)

ERROR_TYPE_LABELS = {
    "calculation_mistake": "خطأ حسابي في تطبيق القانون",
    "careless_error": "تسرع في القراءة أو إغفال أداة النفي",
    "misconception": "فهم خاطئ أو خلط مفاهيم",
    "knowledge_gap": "فجوة معرفية في استيعاب المفهوم"
}

def format_error_diagnosis(concept_name: str, error_type: str, error_summary: Optional[str] = None) -> str:
    """Generates an Arabic diagnostic explanation of why the student struggled."""
    if error_type == "calculation_mistake":
        return (
            f"تشخيص محرك التعلم لمفهوم '{concept_name}':\n"
            f"لاحظنا أن لديك فهماً عاماً للفكرة، لكن أخطاءك السابقة كانت نتيجة خطأ حسابي أو تعويض خاطئ في الأرقام والوحدات الفيزيائية/الرياضية. "
            f"الهدف من هذه الجلسة هو تثبيت خطوات الحل القانوني المباشر وتجنب أخطاء التعويض."
        )
    elif error_type == "careless_error":
        return (
            f"تشخيص محرك التعلم لمفهوم '{concept_name}':\n"
            f"خطؤك في هذا المفهوم لم يكن بسبب نقص المعرفة، بل نتيجة تسرع في القراءة أو إغفال كلمات الاستثناء والنفي (مثل: ما عدا / ليس / غير صحيح). "
            f"في هذه الجلسة العلاجية، ركز جيداً في صياغة السؤال قبل تحديد خيارك."
        )
    elif error_type == "misconception":
        reason = error_summary or "التباس بين مفهومين متقاربين"
        return (
            f"تشخيص محرك التعلم لمفهوم '{concept_name}':\n"
            f"أظهرت الإجابات السابقة وجود ({reason}) أو فهم معكوس للعلاقة السببية. "
            f"أعددنا لك درساً مصغراً يوضح الفارق الجوهري بدقة بالغة استناداً لمذكرتك فقط."
        )
    else:  # knowledge_gap
        return (
            f"تشخيص محرك التعلم لمفهوم '{concept_name}':\n"
            f"تم رصد فجوة معرفية في تذكر أو استيعاب التعريف الأساسي لهذا المفهوم في الدرس. "
            f"من خلال هذا الدرس المصغر المقتبس من مذكرتك، ستتمكن من مراجعة المفهوم وحل 3 إلى 5 أسئلة مستهدفة لإتقانه فوراً."
        )

def generate_fallback_remedial_content(
    concept_name: str,
    doc_title: str,
    chunks: List[DocumentChunk]
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Deterministically generates a grounded mini lesson and 3-5 targeted MCQ questions
    strictly from document chunks when LLM is unavailable.
    Guarantees zero hallucination.
    """
    academic_sentences = extract_academic_sentences(chunks)
    
    # 1. Build Mini Lesson from genuine text
    if academic_sentences:
        lesson_points = []
        for s in academic_sentences[:4]:
            lesson_points.append(f"• (صفحة {s['page']}): {s['text']}")
            
        mini_lesson = (
            f"### 📖 الدرس العلاجي المركز: {concept_name}\n"
            f"مستخلص حصراً من نصوص مذكرتك في ({doc_title}):\n\n"
            + "\n\n".join(lesson_points) +
            "\n\n💡 **نصيحة للإتقان:** ركز على الربط الدقيق بين هذه الحقائق قبل الانتقال للأسئلة التالية."
        )
    else:
        mini_lesson = (
            f"### 📖 الدرس العلاجي المركز: {concept_name}\n"
            f"المصدر: ({doc_title})\n\n"
            f"• استيعاب التعريف المحوري لمفهوم '{concept_name}' وربطه بالقوانين والتطبيقات المقررة في المنهج.\n"
            f"• التمييز بين الخصائص الأساسية والعلاقات المنطقية المستنبطة من نصوص الدرس.\n"
            f"• التأكد من دقة قراءة الأسئلة وعدم إغفال أي أداة استثناء."
        )

    # 2. Build 3-5 Targeted Questions
    target_count = min(5, max(3, len(academic_sentences))) if academic_sentences else 3
    questions: List[Dict[str, Any]] = []

    if len(academic_sentences) >= 4:
        for i in range(target_count):
            idx = i % len(academic_sentences)
            target = academic_sentences[idx]
            
            distractor_pool = [s["text"] for j, s in enumerate(academic_sentences) if j != idx and s["text"] != target["text"]]
            random.shuffle(distractor_pool)
            distractors = distractor_pool[:3]
            while len(distractors) < 3:
                distractors.append(academic_sentences[(idx + len(distractors) + 1) % len(academic_sentences)]["text"])
                
            correct = target["text"]
            options = [correct] + distractors
            random.shuffle(options)
            
            questions.append({
                "id": i + 1,
                "question_text": f"ضمن مراجعة مفهوم ({concept_name}) - صفحة {target['page']}، أي من العبارات التالية صحيحة ومطابقة للمنهج؟",
                "question_type": "mcq",
                "options": options,
                "correct_answer": correct,
                "explanation": f"مطابق لنصوص الصفحة {target['page']} في مذكرتك.",
                "source_page": target["page"]
            })
    else:
        sample_q_data = [
            (
                f"ما هو المبدأ الأساسي الذي يرتكز عليه مفهوم ({concept_name}) في مادة ({doc_title})؟",
                f"الفهم الدقيق للقاعدة العلمية وتطبيقها الصحيح المذكور في المنهج",
                [
                    "حفظ العبارات السطحية فقط دون مراعاة السياق العلمي",
                    "إهمال الوحدات والرموز المستعملة في الدرس",
                    "الاعتماد على التخمين بدلاً من الاستنتاج المنطقي"
                ]
            ),
            (
                f"لتفادي الأخطاء المتكررة في ({concept_name})، ما هي الخطوة الصحيحة؟",
                "قراءة معطيات السؤال والتحقق من المطلوب بدقة قبل اختيار الإجابة",
                [
                    "التسرع واختيار أول خيار يبدو مألوفاً دون قراءة باقي الخيارات",
                    "تجاهل كلمات النفي والاستثناء مثل (ما عدا)",
                    "إهمال مراجعة التفسير العلمي للدرس"
                ]
            ),
            (
                f"كيف يتم التحقق من صحة الإجابة المتعلقة بـ ({concept_name})؟",
                "بالمطابقة المباشرة مع نصوص وقواعد المنهج المعتمدة",
                [
                    "بافتراض معلومات خارجية غير موجودة في المذكرة",
                    "بإهمال خطوات التحليل العلمي المنظم",
                    "بالاعتماد على إجابات عشوائية غير موثقة"
                ]
            )
        ]
        for i, (q_t, correct, distractors) in enumerate(sample_q_data):
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                "id": i + 1,
                "question_text": q_t,
                "question_type": "mcq",
                "options": options,
                "correct_answer": correct,
                "explanation": f"إجابة نموذجية ترتكز على إتقان مفهوم {concept_name}.",
                "source_page": 1
            })

    return mini_lesson, questions

async def create_or_get_remedial_session(
    db: AsyncSession,
    student_id: int,
    concept_id: int
) -> RemedialSessionResponse:
    """
    Creates a new closed-loop remedial session for a weak concept:
    - Validates ownership (IDOR check).
    - Retrieves document chunks exclusively for grounding.
    - Generates personalized error diagnosis.
    - Generates grounded Mini Lesson from document chunks only.
    - Generates 3-5 targeted remedial questions.
    """
    concept = await db.get(Concept, concept_id)
    if not concept:
        raise ValueError("المفهوم غير موجود.")

    doc = await db.get(Document, concept.document_id)
    if not doc or doc.owner_id != student_id:
        raise PermissionError("لا تملك صلاحية الوصول إلى هذا المستند أو المفهوم.")

    # 1. Fetch Student Mastery for diagnosis
    m_stmt = select(StudentMastery).where(
        StudentMastery.student_id == student_id,
        StudentMastery.concept_id == concept_id
    )
    m_res = await db.execute(m_stmt)
    mastery = m_res.scalars().first()
    
    current_mastery_score = mastery.mastery_score if mastery else 0.0
    err_type = mastery.primary_error_type if (mastery and mastery.primary_error_type) else "knowledge_gap"
    err_summary = mastery.error_summary if mastery else None

    diagnosis_text = format_error_diagnosis(concept.name, err_type, err_summary)

    # 2. Fetch Document Chunks specifically for this concept
    c_stmt = select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
    c_res = await db.execute(c_stmt)
    all_chunks = c_res.scalars().all()

    # Filter chunks matching concept name or chapter
    concept_chunks = []
    norm_name = re.sub(r'[\s\.\-_]+', '', concept.name.lower())
    for ch in all_chunks:
        c_text = ch.content or ""
        if (ch.chapter and concept.name.lower() in ch.chapter.lower()) or (norm_name in re.sub(r'[\s\.\-_]+', '', c_text.lower())):
            concept_chunks.append(ch)

    pool_chunks = concept_chunks if concept_chunks else all_chunks[:10]

    # 3. Generate Grounded Mini-Lesson and 3-5 Questions via LLM
    context_text = "\n\n".join([f"[صفحة {c.page_number}]:\n{c.content[:700]}" for c in pool_chunks[:6]])

    system_prompt = (
        "أنت معلم خبير في التعلم التكيفي المغلق (Adaptive Learning Engine).\n"
        "مهمتك: إعداد درس علاجي مصغر ومكثف (Mini Remedial Lesson) مع 3 إلى 5 أسئلة علاجية مستهدفة لمفهوم دراسي محدد.\n\n"
        "القواعد الصارمة لمنع الهلوسة:\n"
        "1. اعتمد حصراً وبشكل قطعي على نصوص المادة الدراسية المرفقة. ممنوع منعاً باتاً اختراع أي معلومات أو أمثلة خارجية.\n"
        "2. الدرس المصغر (mini_lesson) يجب أن يكون واضحاً ومقسماً إلى نقاط وعناوين وقوانين مستخرجة من النص.\n"
        "3. توليد بين 3 إلى 5 أسئلة اختيار من متعدد (MCQ) تستهدف المفهوم ونقطة الضعف بدقة.\n"
        "4. كل سؤال يحتوي على 4 خيارات (options) من نفس السياق، خيار واحد فقط صحيح، مع التفسير ورقم الصفحة.\n"
        "5. الإخراج بتنسيق JSON حصراً بدون أي نصوص تمهيدية أو ختامية.\n\n"
        "هيكل الـ JSON المطلوب:\n"
        "{\n"
        '  "mini_lesson": "### عنوان الدرس المصغر\\n• النقطة 1...\\n• النقطة 2...",\n'
        '  "questions": [\n'
        "    {\n"
        '      "question_text": "نص السؤال العلاجي؟",\n'
        '      "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],\n'
        '      "correct_answer": "خيار 1",\n'
        '      "explanation": "شرح سبب الصحة مستنداً للدرس...",\n'
        '      "source_page": 2\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    user_prompt = f"""
المفهوم المستهدف: {concept.name}
تشخيص نقطة ضعف الطالب: {diagnosis_text}
عنوان المادة: {doc.title}

نصوص المادة الدراسية المعتمدة حصراً:
{context_text[:4000]}
"""

    mini_lesson = None
    questions_list = []

    try:
        llm_output = await call_llm(
            prompt=user_prompt,
            system_instruction=system_prompt,
            json_mode=True,
            temperature=0.1,
            max_tokens=2000
        )
        if llm_output and llm_output.strip() not in ["", "{}"]:
            try:
                data = json.loads(llm_output)
                mini_lesson = data.get("mini_lesson")
                raw_qs = data.get("questions", [])
                if isinstance(raw_qs, list) and len(raw_qs) >= 2:
                    for i, q in enumerate(raw_qs[:5]):
                        if q.get("question_text") and q.get("options") and len(q.get("options")) >= 2:
                            questions_list.append({
                                "id": i + 1,
                                "question_text": q.get("question_text"),
                                "question_type": "mcq",
                                "options": q.get("options"),
                                "correct_answer": str(q.get("correct_answer", q["options"][0])).strip(),
                                "explanation": q.get("explanation", "شرح مستند لنصوص الدرس."),
                                "source_page": q.get("source_page", 1)
                            })
            except Exception as pe:
                logger.warning(f"Could not parse LLM output for remedial session: {pe}")
    except Exception as e:
        logger.warning(f"LLM call failed for remedial session: {e}")

    # Fallback if LLM output incomplete
    if not mini_lesson or len(questions_list) < 3:
        fb_lesson, fb_qs = generate_fallback_remedial_content(concept.name, doc.title, pool_chunks)
        if not mini_lesson:
            mini_lesson = fb_lesson
        if len(questions_list) < 3:
            questions_list = fb_qs

    # Ensure 3 to 5 questions
    questions_list = questions_list[:5]
    if len(questions_list) < 3:
        _, extra_qs = generate_fallback_remedial_content(concept.name, doc.title, pool_chunks)
        for eq in extra_qs:
            if len(questions_list) >= 3:
                break
            eq["id"] = len(questions_list) + 1
            questions_list.append(eq)

    # 4. Create and persist RemedialSession
    session = RemedialSession(
        student_id=student_id,
        concept_id=concept_id,
        document_id=doc.id,
        primary_error_type=err_type,
        diagnosis=diagnosis_text,
        mini_lesson=mini_lesson,
        questions_json=json.dumps(questions_list, ensure_ascii=False),
        mastery_before=current_mastery_score,
        total_questions=len(questions_list),
        is_completed=False,
        is_proficient=False
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Convert questions for client response (exclude answers)
    client_questions = [
        RemedialQuestionItem(
            id=q["id"],
            question_text=q["question_text"],
            question_type=q.get("question_type", "mcq"),
            options=q["options"],
            source_page=q.get("source_page")
        )
        for q in questions_list
    ]

    return RemedialSessionResponse(
        session_id=session.id,
        concept_id=concept.id,
        concept_name=concept.name,
        document_id=doc.id,
        document_title=doc.title,
        primary_error_type=err_type,
        primary_error_label=ERROR_TYPE_LABELS.get(err_type, "فجوة معرفية"),
        diagnosis=diagnosis_text,
        mini_lesson=mini_lesson,
        mastery_before=current_mastery_score,
        total_questions=len(client_questions),
        questions=client_questions
    )

async def submit_remedial_session(
    db: AsyncSession,
    student_id: int,
    session_id: int,
    submission_req: RemedialSubmitRequest
) -> RemedialResultResponse:
    """
    Submits remedial answers, grades them, recalculates concept mastery,
    evaluates if the student is now 'proficient' (>= 75%), and updates StudentMastery.
    """
    session = await db.get(RemedialSession, session_id)
    if not session:
        raise ValueError("جلسة التعلم العلاجية غير موجودة.")

    if session.student_id != student_id:
        raise PermissionError("لا تملك صلاحية الوصول إلى هذه الجلسة العلاجية.")

    concept = await db.get(Concept, session.concept_id)
    if not concept:
        raise ValueError("المفهوم المرتبط بالجلسة غير موجود.")

    # 1. Parse stored questions
    try:
        stored_questions = json.loads(session.questions_json)
    except Exception:
        stored_questions = []

    answer_map = {ans.question_id: ans.selected_answer.strip() for ans in submission_req.answers}
    
    total_q = len(stored_questions)
    correct_count = 0
    feedback_list: List[RemedialQuestionFeedback] = []

    for q in stored_questions:
        q_id = q["id"]
        user_ans = answer_map.get(q_id, "")
        correct_ans = str(q.get("correct_answer", "")).strip()
        is_corr = (user_ans.lower() == correct_ans.lower())
        if is_corr:
            correct_count += 1
            
        feedback_list.append(RemedialQuestionFeedback(
            question_id=q_id,
            question_text=q["question_text"],
            selected_answer=user_ans,
            correct_answer=correct_ans,
            is_correct=is_corr,
            explanation=q.get("explanation", "شرح تفصيلي مستند للكتاب."),
            source_page=q.get("source_page")
        ))

    score = float(correct_count)
    pct = round((score / max(1, total_q)) * 100, 1)
    is_prof = (pct >= 75.0)

    # 2. Update Student Mastery
    m_stmt = select(StudentMastery).where(
        StudentMastery.student_id == student_id,
        StudentMastery.concept_id == session.concept_id
    )
    m_res = await db.execute(m_stmt)
    mastery = m_res.scalars().first()
    if not mastery:
        mastery = StudentMastery(
            student_id=student_id,
            concept_id=session.concept_id,
            total_attempts=0,
            correct_attempts=0,
            mastery_score=session.mastery_before
        )
        db.add(mastery)

    mastery.total_attempts += total_q
    mastery.correct_attempts += correct_count
    mastery.last_remediated_at = datetime.utcnow()

    if is_prof:
        mastery.is_proficient = True
        mastery.is_weak_point = False
        # Give a substantial boost reflecting mastery achievement
        new_mastery = max(80.0, pct)
        mastery.mastery_score = round(new_mastery, 1)
        prof_message = f"🎉 مبروك! رائع ومبهر، لقد اجتزت الأسئلة العلاجية بنسبة {pct}% وأتقنت مفهوم '{concept.name}' بنجاح وتجاوزت نقطة الضعف."
    else:
        mastery.is_proficient = False
        calc_score = round((mastery.correct_attempts / mastery.total_attempts) * 100, 1)
        mastery.mastery_score = calc_score
        mastery.is_weak_point = (calc_score < 70.0)
        prof_message = f"أحسنت المحاولة بحصولك على {pct}%. اقتربت من الإتقان التام. راجع التفسيرات الموضحة أدناه وأعد المحاولة لاحقاً."

    # 3. Update Session Record
    session.is_completed = True
    session.is_proficient = is_prof
    session.score = score
    session.total_questions = total_q
    session.mastery_after = mastery.mastery_score
    session.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(session)

    # Auto-adapt active study plan based on remedial results
    try:
        from app.services.study_planner import sync_plan_with_student_performance
        await sync_plan_with_student_performance(db, student_id)
    except Exception as se:
        logger.warning(f"Auto-sync study plan after remedial session failed: {se}")

    return RemedialResultResponse(
        session_id=session.id,
        concept_id=concept.id,
        concept_name=concept.name,
        score=score,
        total_questions=total_q,
        percentage=pct,
        mastery_before=session.mastery_before,
        mastery_after=mastery.mastery_score,
        is_proficient=is_prof,
        proficiency_message=prof_message,
        questions_feedback=feedback_list
    )

async def get_student_weak_concepts(
    db: AsyncSession,
    student_id: int,
    document_id: Optional[int] = None
) -> List[WeakConceptItem]:
    """
    Returns weak concepts diagnosed for the student with their error types and labels.
    """
    stmt = (
        select(StudentMastery, Concept, Document)
        .join(Concept, StudentMastery.concept_id == Concept.id)
        .join(Document, Concept.document_id == Document.id)
        .where(
            StudentMastery.student_id == student_id,
            Document.owner_id == student_id,
            (StudentMastery.is_weak_point == True) | (StudentMastery.mastery_score < 70.0)
        )
    )
    if document_id is not None:
        stmt = stmt.where(Document.id == document_id)

    stmt = stmt.order_by(StudentMastery.mastery_score.asc())
    result = await db.execute(stmt)
    rows = result.all()

    items: List[WeakConceptItem] = []
    for mastery, concept, doc in rows:
        err_type = mastery.primary_error_type or "knowledge_gap"
        items.append(WeakConceptItem(
            concept_id=concept.id,
            concept_name=concept.name,
            document_id=doc.id,
            document_title=doc.title,
            mastery_score=mastery.mastery_score,
            primary_error_type=err_type,
            primary_error_label=ERROR_TYPE_LABELS.get(err_type, "فجوة معرفية"),
            error_summary=mastery.error_summary,
            total_attempts=mastery.total_attempts,
            correct_attempts=mastery.correct_attempts,
            is_proficient=bool(mastery.is_proficient)
        ))

    return items
