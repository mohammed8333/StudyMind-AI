import json
import logging
import re
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.document import Document, DocumentChunk
from app.models.exam import Exam, ExamQuestion, ExamAttempt, ExamQuestionResponse
from app.models.mastery import Concept, StudentMastery
from app.schemas.exam import (
    ExamGenerateRequest,
    ExamResponse,
    ExamQuestionPublic,
    ExamAttemptStartResponse,
    ExamSubmitRequest,
    ExamResultResponse,
    QuestionResultItem,
    WeakConceptItem,
    RemedialRecommendationItem,
    ExamHistoryItem
)
from app.services.llm_adapter import call_llm

logger = logging.getLogger(__name__)

def normalize_arabic(text: str) -> str:
    """Normalize Arabic text for resilient comparison."""
    if not text:
        return ""
    t = text.strip()
    t = re.sub(r'[\u064B-\u0652]', '', t)  # Remove Tashkeel
    t = re.sub(r'[\u0640]', '', t)        # Remove Tatweel
    t = re.sub(r'[إأآا]', 'ا', t)          # Normalize Alif
    t = re.sub(r'ة', 'ه', t)               # Normalize Ta Marbuta
    t = re.sub(r'ى', 'ي', t)               # Normalize Ya
    t = re.sub(r'\s+', ' ', t).strip()
    return t.lower()

def normalize_true_false(text: str) -> str:
    """Normalize True/False values in Arabic and English."""
    norm = normalize_arabic(text)
    if any(k in norm for k in ["صح", "صحيح", "صواب", "نعم", "true", "t", "yes", "1"]):
        return "true"
    if any(k in norm for k in ["خطا", "خاطئ", "خاطئه", "لا", "false", "f", "no", "0"]):
        return "false"
    return norm

def extract_academic_sentences_from_chunks(chunks: List[DocumentChunk]) -> List[Dict[str, Any]]:
    """Extracts authentic academic sentences from document chunks, skipping noise."""
    noise_keywords = [
        "حقوق الطبع", "رقم الإيداع", "دار النشر", "مطبعة", "الفهرس", 
        "جدول المحتويات", "مقدمة الطبعة", "إهداء", "جميع الحقوق محفوظة",
        "قطاع الكتب", "وزارة التربية", "اشترك", "قناة", "تأليف", "إعداد الأستاذ",
        "صفحة الغلاف", "الوحدة الأولى", "الفصل الأول", "تليفون", "موبايل"
    ]
    sentences = []
    for c in chunks:
        page = c.page_number or 1
        text = (c.content or "").strip()
        if page <= 2 and any(k in text for k in noise_keywords[:6]):
            continue
        parts = re.split(r'[\n\.\!\؟\;\،]+', text)
        for part in parts:
            s = part.strip()
            if 30 <= len(s) <= 130 and any('\u0600' <= char <= '\u06FF' for char in s):
                if not any(k in s for k in noise_keywords):
                    sentences.append({
                        "text": s,
                        "page": page,
                        "chapter": c.chapter or "مفهوم دراسي أساسي"
                    })
    return sentences

def generate_deterministic_exam_questions(
    chunks: List[DocumentChunk],
    doc: Optional[Document],
    req: ExamGenerateRequest
) -> List[Dict[str, Any]]:
    """
    Deterministic grounded fallback generator for MCQ, True/False, and Short Answer.
    Guarantees zero hallucinations even without LLM connectivity.
    """
    sentences = extract_academic_sentences_from_chunks(chunks)
    doc_title = doc.title if doc else "المادة الدراسية"
    target_count = req.num_questions
    allowed_types = req.question_types or ["mcq", "true_false", "short_answer"]
    
    generated: List[Dict[str, Any]] = []
    
    if len(sentences) >= 4:
        for i in range(target_count):
            q_type = allowed_types[i % len(allowed_types)]
            idx = i % len(sentences)
            target = sentences[idx]
            page = target["page"]
            concept = target["chapter"]
            
            if q_type == "mcq":
                # Distractors from other authentic sentences
                distractor_pool = [s["text"] for j, s in enumerate(sentences) if j != idx and s["text"] != target["text"]]
                random.shuffle(distractor_pool)
                distractors = distractor_pool[:3]
                while len(distractors) < 3:
                    distractors.append(sentences[(idx + len(distractors) + 1) % len(sentences)]["text"])
                
                correct = target["text"]
                options = [correct] + distractors
                random.shuffle(options)
                
                generated.append({
                    "question_type": "mcq",
                    "question_text": f"استناداً إلى نصوص ({doc_title}) - صفحة ({page})، أي العبارات التالية صحيحة ودقيقة علمياً؟",
                    "options": options,
                    "correct_answer": correct,
                    "rubric_keywords": [w for w in re.findall(r'[\u0600-\u06FF]{4,}', correct)[:4]],
                    "explanation": f"مطابق لنص الدرس الموثق بالصفحة {page} في مذكرتك.",
                    "concept_name": concept,
                    "source_page": page,
                    "marks": 1.0
                })
            elif q_type == "true_false":
                is_true = (i % 2 == 0)
                options = ["صح", "خطأ"]
                if is_true:
                    q_text = f"ضع علامة (صح) أو (خطأ): استناداً إلى مذكرتك في صفحة ({page}): \"{target['text']}\"."
                    correct = "صح"
                    explanation = f"العبارة صحيحة تماماً ومذكورة بنصها في صفحة {page}."
                else:
                    negated_text = target['text']
                    if " لا " not in negated_text and " ليس " not in negated_text:
                        negated_text = "لا ينطبق أن " + target['text']
                    else:
                        negated_text = negated_text.replace(" لا ", " دائماً ").replace(" ليس ", " هو ")
                    q_text = f"ضع علامة (صح) أو (خطأ): وفقاً لمذكرتك في صفحة ({page}): \"{negated_text}\"."
                    correct = "خطأ"
                    explanation = f"العبارة خاطئة؛ الصواب حسب صفحة {page} هو: {target['text']}."
                
                generated.append({
                    "question_type": "true_false",
                    "question_text": q_text,
                    "options": options,
                    "correct_answer": correct,
                    "rubric_keywords": ["صح", "خطأ"],
                    "explanation": explanation,
                    "concept_name": concept,
                    "source_page": page,
                    "marks": 1.0
                })
            else:  # short_answer
                keywords = [w for w in re.findall(r'[\u0600-\u06FF]{4,}', target["text"])[:5]]
                q_text = f"سؤال مقالي موجز: اذكر الأساس العلمي أو علل بإيجاز ما ورد في صفحة ({page}) بشأن: ({concept}) مستنداً لمذكرتك."
                generated.append({
                    "question_type": "short_answer",
                    "question_text": q_text,
                    "options": None,
                    "correct_answer": target["text"],
                    "rubric_keywords": keywords,
                    "explanation": f"الإجابة النموذجية المعتمدة من صفحة {page}: {target['text']}.",
                    "concept_name": concept,
                    "source_page": page,
                    "marks": 2.0
                })
    else:
        # Fallback for empty/short texts
        for i in range(target_count):
            q_type = allowed_types[i % len(allowed_types)]
            if q_type == "mcq":
                generated.append({
                    "question_type": "mcq",
                    "question_text": f"في إطار دراسة واستيعاب منهج ({doc_title})، ما هي الركيزة الأساسية لحل المسائل والأسئلة التحليلية؟",
                    "options": [
                        "التطبيق المباشر للقوانين الحاكمة وفهم معاني الرموز والوحدات",
                        "حفظ أرقام الصفحات دون التركيز على المحتوى العلمي",
                        "إهمال الوحدات الفيزيائية والاكتفاء بالأرقام التقريبية",
                        "الاعتماد على التخمين بدلاً من التحليل العلمي المنطقي"
                    ],
                    "correct_answer": "التطبيق المباشر للقوانين الحاكمة وفهم معاني الرموز والوحدات",
                    "rubric_keywords": ["التطبيق", "القوانين", "الرموز", "الوحدات"],
                    "explanation": "يرتكز حل المسائل والامتحانات على الاستيعاب العميق للقوانين والوحدات.",
                    "concept_name": "التطبيق العلمي والمسائل",
                    "source_page": 1,
                    "marks": 1.0
                })
            elif q_type == "true_false":
                generated.append({
                    "question_type": "true_false",
                    "question_text": f"ضع علامة (صح) أو (خطأ): يعد الفهم التحليلي والربط بين المفاهيم في ({doc_title}) شرطاً أساسياً للتفوق الدراسي.",
                    "options": ["صح", "خطأ"],
                    "correct_answer": "صح",
                    "rubric_keywords": ["صح"],
                    "explanation": "الفهم التحليلي هو المعيار الأهم في الامتحانات الحديثة.",
                    "concept_name": "التحليل والاستنتاج",
                    "source_page": 1,
                    "marks": 1.0
                })
            else:
                generated.append({
                    "question_type": "short_answer",
                    "question_text": f"سؤال مقالي: وضح باختصار كيف يؤثر استيعاب المفاهيم الأساسية في ({doc_title}) على سرعة ودقة حل الامتحان.",
                    "options": None,
                    "correct_answer": "يساعد الاستيعاب الدقيق للمفاهيم على استدعاء القوانين المناسبة بسرعة وتجنب الأخطاء الشائعة وحل الأسئلة غير المباشرة بدقة.",
                    "rubric_keywords": ["الاستيعاب", "القوانين", "الدقة", "المفاهيم"],
                    "explanation": "الفهم الدقيق يقلل زمن التفكير ويزيد من صحة الاستنتاج في الامتحانات.",
                    "concept_name": "مهارات الحل المقالي",
                    "source_page": 1,
                    "marks": 2.0
                })
                
    return generated

async def generate_exam_questions_with_llm(
    chunks: List[DocumentChunk],
    doc: Optional[Document],
    req: ExamGenerateRequest
) -> List[Dict[str, Any]]:
    """
    Calls LLM to generate exam questions across MCQ, True/False, and Short Answer.
    Falls back to deterministic generation if LLM is unreachable or invalid.
    """
    if not chunks:
        return generate_deterministic_exam_questions(chunks, doc, req)
        
    # Sample up to 8 distinct chunks
    if len(chunks) > 8:
        step = len(chunks) / 8
        selected = [chunks[int(i * step)] for i in range(8)]
    else:
        selected = chunks
        
    context_text = "\n\n".join([f"[صفحة {c.page_number}]:\n{c.content[:800]}" for c in selected])
    types_str = ", ".join(req.question_types or ["mcq", "true_false", "short_answer"])
    
    system_prompt = (
        "أنت خبير تربوي ومستشار أول لوضع الامتحانات المدرسية والوزارية للطلاب العرب.\n"
        "مهمتك: صياغة امتحان قياسي واقعي وشامل يتكون من أسئلة متنوعة مبنية بنسبة 100% على نصوص المادة الدراسية المرفقة فقط.\n\n"
        "الأنواع المطلوبة بالتحديد:\n"
        "1. 'mcq': سؤال اختيار من متعدد، يحتوي على 'options' (4 خيارات علمية حقيقية)، خيار واحد صحيح بدقة.\n"
        "2. 'true_false': سؤال صح أو خطأ، 'options' يكون دائماً ['صح', 'خطأ']، والإجابة الصحيحة 'صح' أو 'خطأ'.\n"
        "3. 'short_answer': سؤال مقالي قصير (علل، اشرح باختصار، ما الأساس العلمي)، 'options' يكون null، مع إجابة نموذجية وافية وقائمة كلمات مفتاحية للتصحيح 'rubric_keywords'.\n\n"
        "القواعد الصارمة لمنع الهلوسة:\n"
        "- ممنوع وضع أي سؤال عن الفهرس أو دار النشر أو رقم الإيداع أو اسم المؤلف.\n"
        "- يجب توثيق رقم الصفحة 'source_page' واسم المفهوم العلمي 'concept_name'.\n"
        "- الإخراج حصراً بصيغة JSON بدون أي كلام إضافي.\n\n"
        "هيكل JSON المطلوب:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question_type": "mcq",\n'
        '      "question_text": "نص السؤال الدقيق؟",\n'
        '      "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],\n'
        '      "correct_answer": "خيار أ",\n'
        '      "rubric_keywords": ["كلمة1", "كلمة2"],\n'
        '      "explanation": "شرح علمي دقيق معلل...",\n'
        '      "concept_name": "اسم المفهوم",\n'
        '      "source_page": 2,\n'
        '      "marks": 1.0\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    
    user_prompt = f"""
ضع امتحاناً بعدد {req.num_questions} سؤال يغطي الأنواع التالية ({types_str}) بمستوى صعوبة ({req.difficulty}) ومحاكاة ({'رسمية مكثفة' if req.is_mock_mode else 'تدريبية'}).
المادة الدراسية:
{context_text[:5000]}
"""

    llm_output = await call_llm(
        prompt=user_prompt,
        system_instruction=system_prompt,
        json_mode=True,
        temperature=0.15,
        max_tokens=3000
    )
    
    raw_questions = []
    if llm_output and llm_output.strip() not in ["", "{}"]:
        try:
            data = json.loads(llm_output)
            raw_questions = data.get("questions", [])
        except Exception:
            match = re.search(r'\{.*\}', llm_output, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(0))
                    raw_questions = data.get("questions", [])
                except Exception:
                    raw_questions = []
                    
    valid = []
    for q in raw_questions:
        if not isinstance(q, dict):
            continue
        q_text = str(q.get("question_text") or "").strip()
        q_type = str(q.get("question_type") or "mcq").strip()
        correct = str(q.get("correct_answer") or "").strip()
        if not q_text or not correct:
            continue
        if q_type == "mcq" and len(q.get("options") or []) < 2:
            continue
        if q_type == "true_false":
            q["options"] = ["صح", "خطأ"]
            if normalize_true_false(correct) == "true":
                q["correct_answer"] = "صح"
            else:
                q["correct_answer"] = "خطأ"
        valid.append({
            "question_type": q_type,
            "question_text": q_text,
            "options": q.get("options"),
            "correct_answer": q["correct_answer"],
            "rubric_keywords": q.get("rubric_keywords") or [],
            "explanation": q.get("explanation") or "مبني على نص المذكرة.",
            "concept_name": q.get("concept_name") or "مفهوم دراسي",
            "source_page": q.get("source_page") or 1,
            "marks": float(q.get("marks", 2.0 if q_type == "short_answer" else 1.0))
        })
        
    if len(valid) < req.num_questions:
        deterministic = generate_deterministic_exam_questions(chunks, doc, req)
        needed = req.num_questions - len(valid)
        existing_types = {q["question_type"] for q in valid}
        missing = [d for d in deterministic if d["question_type"] not in existing_types]
        other = [d for d in deterministic if d not in missing]
        fillers = missing + other
        valid.extend(fillers[:needed])
        
    return valid[:req.num_questions]

async def create_exam_for_document(
    db: AsyncSession,
    user_id: int,
    req: ExamGenerateRequest
) -> ExamResponse:
    """Creates an Exam with questions generated and persisted in the database."""
    doc = await db.get(Document, req.document_id)
    if not doc or doc.owner_id != user_id:
        raise ValueError("المستند غير موجود أو لا تملك صلاحية الوصول إليه.")
        
    stmt = select(DocumentChunk).where(DocumentChunk.document_id == req.document_id)
    if req.chapters and len(req.chapters) > 0:
        stmt = stmt.where(DocumentChunk.chapter.in_(req.chapters))
    result = await db.execute(stmt)
    chunks = result.scalars().all()
    if not chunks:
        # fallback to all chunks
        stmt_all = select(DocumentChunk).where(DocumentChunk.document_id == req.document_id)
        res_all = await db.execute(stmt_all)
        chunks = res_all.scalars().all()
        
    raw_questions = await generate_exam_questions_with_llm(chunks, doc, req)
    
    exam_title = req.title or f"امتحان {doc.subject or 'المادة'} - {req.difficulty}"
    total_marks = sum(q.get("marks", 1.0) for q in raw_questions)
    
    exam = Exam(
        user_id=user_id,
        document_id=doc.id,
        title=exam_title,
        subject=doc.subject or "مادة دراسية",
        chapters_json=json.dumps(req.chapters or [], ensure_ascii=False),
        difficulty=req.difficulty,
        duration_minutes=req.duration_minutes,
        total_questions=len(raw_questions),
        total_marks=float(total_marks),
        passing_score_pct=60.0,
        is_mock_mode=req.is_mock_mode
    )
    db.add(exam)
    await db.flush()
    
    public_questions: List[ExamQuestionPublic] = []
    
    for i, q_data in enumerate(raw_questions):
        concept_name = q_data.get("concept_name", "مفهوم رئيسي")
        # Find or create concept
        c_stmt = select(Concept).where(
            Concept.document_id == doc.id,
            Concept.name == concept_name
        )
        c_res = await db.execute(c_stmt)
        concept = c_res.scalars().first()
        if not concept:
            concept = Concept(
                document_id=doc.id,
                name=concept_name,
                subject=doc.subject,
                chapter=req.chapters[0] if req.chapters else "الفصل الأول"
            )
            db.add(concept)
            await db.flush()
            
        eq = ExamQuestion(
            exam_id=exam.id,
            concept_id=concept.id,
            question_type=q_data["question_type"],
            question_text=q_data["question_text"],
            options_json=json.dumps(q_data["options"], ensure_ascii=False) if q_data.get("options") else None,
            correct_answer=q_data["correct_answer"],
            rubric_keywords_json=json.dumps(q_data.get("rubric_keywords", []), ensure_ascii=False),
            explanation=q_data["explanation"],
            marks=q_data.get("marks", 1.0),
            source_page=q_data.get("source_page", 1),
            order_index=i + 1
        )
        db.add(eq)
        await db.flush()
        
        public_questions.append(ExamQuestionPublic(
            id=eq.id,
            question_type=eq.question_type,
            question_text=eq.question_text,
            options=q_data.get("options"),
            marks=eq.marks,
            source_page=eq.source_page,
            order_index=eq.order_index
        ))
        
    await db.commit()
    await db.refresh(exam)
    
    return ExamResponse(
        id=exam.id,
        title=exam.title,
        document_id=exam.document_id,
        document_title=doc.title,
        subject=exam.subject,
        chapters=req.chapters or [],
        difficulty=exam.difficulty,
        duration_minutes=exam.duration_minutes,
        total_questions=exam.total_questions,
        total_marks=exam.total_marks,
        passing_score_pct=exam.passing_score_pct,
        is_mock_mode=exam.is_mock_mode,
        created_at=exam.created_at.isoformat(),
        questions=public_questions
    )

async def start_exam_attempt(
    db: AsyncSession,
    user_id: int,
    exam_id: int
) -> ExamAttemptStartResponse:
    """
    Starts an exam attempt with server-calculated expiration time.
    If an in-progress attempt is currently active and within time, resumes it.
    """
    exam = await db.get(Exam, exam_id)
    if not exam or exam.user_id != user_id:
        raise ValueError("الامتحان غير موجود أو لا تملك صلاحية الوصول إليه.")
        
    now = datetime.utcnow()
    
    # Check for existing active attempt
    stmt = (
        select(ExamAttempt)
        .where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == user_id,
            ExamAttempt.status == "IN_PROGRESS"
        )
        .order_by(ExamAttempt.id.desc())
    )
    res = await db.execute(stmt)
    active = res.scalars().first()
    
    if active:
        # Check if expired
        if now > active.expires_at:
            active.status = "TIMED_OUT"
            active.submitted_at = active.expires_at
            await db.commit()
        else:
            # Resume current active attempt
            remaining_secs = max(0, int((active.expires_at - now).total_seconds()))
            return await build_attempt_start_response(db, exam, active, remaining_secs)
            
    # Calculate attempt number
    count_stmt = select(func.count(ExamAttempt.id)).where(
        ExamAttempt.exam_id == exam_id,
        ExamAttempt.student_id == user_id
    )
    count_res = await db.execute(count_stmt)
    prev_count = count_res.scalar() or 0
    attempt_num = prev_count + 1
    
    # Server-enforced timing: duration + 30 seconds network grace
    expires_at = now + timedelta(minutes=exam.duration_minutes, seconds=30)
    
    attempt = ExamAttempt(
        exam_id=exam_id,
        student_id=user_id,
        attempt_number=attempt_num,
        started_at=now,
        expires_at=expires_at,
        status="IN_PROGRESS",
        total_marks=exam.total_marks
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    
    remaining_secs = int((expires_at - now).total_seconds())
    return await build_attempt_start_response(db, exam, attempt, remaining_secs)

async def build_attempt_start_response(
    db: AsyncSession,
    exam: Exam,
    attempt: ExamAttempt,
    remaining_seconds: int
) -> ExamAttemptStartResponse:
    """Builds sanitized question list for the student taking the exam."""
    q_stmt = (
        select(ExamQuestion)
        .where(ExamQuestion.exam_id == exam.id)
        .order_by(ExamQuestion.order_index.asc())
    )
    q_res = await db.execute(q_stmt)
    questions = q_res.scalars().all()
    
    public_qs = []
    for q in questions:
        try:
            options = json.loads(q.options_json) if q.options_json else None
        except Exception:
            options = None
        public_qs.append(ExamQuestionPublic(
            id=q.id,
            question_type=q.question_type,
            question_text=q.question_text,
            options=options,
            marks=q.marks,
            source_page=q.source_page,
            order_index=q.order_index
        ))
        
    return ExamAttemptStartResponse(
        attempt_id=attempt.id,
        exam_id=exam.id,
        exam_title=exam.title,
        attempt_number=attempt.attempt_number,
        started_at=attempt.started_at.isoformat(),
        expires_at=attempt.expires_at.isoformat(),
        remaining_seconds=remaining_seconds,
        is_mock_mode=exam.is_mock_mode,
        total_questions=exam.total_questions,
        total_marks=exam.total_marks,
        duration_minutes=exam.duration_minutes,
        questions=public_qs
    )

def evaluate_short_answer(
    student_ans: str,
    correct_ans: str,
    rubric_keywords: List[str],
    max_marks: float
) -> Tuple[bool, float, Optional[str], Optional[str], str]:
    """
    Semantic and keyword-based evaluation for short answer questions.
    Returns (is_correct, score_awarded, error_type, error_reason, ai_feedback).
    """
    s_norm = normalize_arabic(student_ans)
    c_norm = normalize_arabic(correct_ans)
    
    if not s_norm:
        return (False, 0.0, "unanswered", "لم يُجب الطالب على السؤال المقالي.", "لم تقدم إجابة.")
        
    # Check exact match or high substring inclusion
    if s_norm == c_norm or c_norm in s_norm or s_norm in c_norm:
        return (True, max_marks, None, None, "إجابة نموذجية دقيقة مطابقة للدرس.")
        
    # Check rubric keywords presence
    clean_rubric = [normalize_arabic(k) for k in rubric_keywords if len(k.strip()) >= 3]
    if not clean_rubric:
        clean_rubric = [w for w in re.findall(r'[\u0600-\u06FF]{3,}', c_norm)[:6]]
        
    matched_keywords = [k for k in clean_rubric if k in s_norm]
    match_ratio = len(matched_keywords) / max(1, len(clean_rubric))
    
    if match_ratio >= 0.65:
        # Full credit
        return (True, max_marks, None, None, f"إجابة ممتازة، تضمنت أهم العناصر العلمية ({', '.join(matched_keywords)}).")
    elif match_ratio >= 0.35:
        # Partial credit
        partial = round(max_marks * 0.5, 1)
        return (
            True,
            partial,
            "knowledge_gap",
            "إجابة جزئية؛ تضمنت بعض المفاهيم مع إغفال عناصر مكملة.",
            f"إجابة مقبولة حصلت على درجة جزئية ({partial}/{max_marks}). افتقدت إلى: {', '.join([k for k in clean_rubric if k not in matched_keywords][:3])}."
        )
    else:
        return (
            False,
            0.0,
            "misconception",
            "الإجابة غير مكتملة أو تفتقر إلى الكلمات المفتاحية والمفاهيم العلمية المقررة.",
            "إجابة غير كافية لم تستوفِ الأفكار الأساسية المطلوبة في السؤال."
        )

async def grade_and_submit_exam_attempt(
    db: AsyncSession,
    user_id: int,
    exam_id: int,
    attempt_id: int,
    submit_req: ExamSubmitRequest
) -> ExamResultResponse:
    """
    Grades exam attempt, enforces time limits, prevents re-submission,
    evaluates MCQ, True/False, and Short Answer, updates StudentMastery,
    and returns comprehensive analytics with remedial recommendations.
    """
    attempt = await db.get(ExamAttempt, attempt_id)
    if not attempt or attempt.student_id != user_id or attempt.exam_id != exam_id:
        raise ValueError("المحاولة غير موجودة أو لا تملك صلاحية الوصول إليها.")
        
    # Tamper-proofing: Prevent re-submission
    if attempt.status in ["SUBMITTED", "TIMED_OUT"]:
        raise ValueError("تم تسليم هذا الاختبار مسبقاً ولا يمكن تعديل الإجابات.")
        
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise ValueError("الامتحان غير موجود.")
        
    now = datetime.utcnow()
    is_timed_out = (now > attempt.expires_at)
    attempt.status = "TIMED_OUT" if is_timed_out else "SUBMITTED"
    attempt.submitted_at = now
    
    # Calculate actual time taken
    raw_time = int((now - attempt.started_at).total_seconds())
    max_duration_secs = exam.duration_minutes * 60
    time_taken = min(raw_time, max_duration_secs)
    effective_time = submit_req.total_time_taken_seconds if (submit_req.total_time_taken_seconds is not None and submit_req.total_time_taken_seconds > 0) else time_taken
    attempt.time_taken_seconds = effective_time
    
    # Fetch all questions
    q_stmt = (
        select(ExamQuestion)
        .options(selectinload(ExamQuestion.concept))
        .where(ExamQuestion.exam_id == exam_id)
        .order_by(ExamQuestion.order_index.asc())
    )
    q_res = await db.execute(q_stmt)
    questions = q_res.scalars().all()
    
    # Map student answers
    answer_map = {ans.question_id: ans.student_answer.strip() for ans in submit_req.answers}
    time_map = {ans.question_id: ans.time_spent_seconds for ans in submit_req.answers}
    
    total_score = 0.0
    correct_count = 0
    wrong_count = 0
    unanswered_count = 0
    
    questions_feedback: List[QuestionResultItem] = []
    concept_miss_counts: Dict[str, Dict[str, Any]] = {}
    
    for q in questions:
        student_ans = answer_map.get(q.id, "").strip()
        time_spent = time_map.get(q.id, 0)
        max_marks = q.marks or 1.0
        
        is_corr = False
        score_awarded = 0.0
        err_type = None
        err_reason = None
        ai_feedback = None
        
        if not student_ans:
            unanswered_count += 1
            err_type = "unanswered"
            err_reason = "لم يتم اختيار أو كتابة أي إجابة لهذا السؤال."
            ai_feedback = "سؤال متروك دون إجابة."
        else:
            if q.question_type == "mcq":
                is_corr = (normalize_arabic(student_ans) == normalize_arabic(q.correct_answer))
                if is_corr:
                    score_awarded = max_marks
                    correct_count += 1
                else:
                    wrong_count += 1
                    err_type = "knowledge_gap"
                    err_reason = f"اختيار غير صحيح. الصواب هو ({q.correct_answer})."
            elif q.question_type == "true_false":
                is_corr = (normalize_true_false(student_ans) == normalize_true_false(q.correct_answer))
                if is_corr:
                    score_awarded = max_marks
                    correct_count += 1
                else:
                    wrong_count += 1
                    err_type = "misconception"
                    err_reason = f"تقدير غير دقيق للعبارة. الإجابة الصحيحة هي ({q.correct_answer})."
            else:  # short_answer
                rubric = []
                if q.rubric_keywords_json:
                    try:
                        rubric = json.loads(q.rubric_keywords_json)
                    except Exception:
                        rubric = []
                is_corr, score_awarded, err_type, err_reason, ai_feedback = evaluate_short_answer(
                    student_ans=student_ans,
                    correct_ans=q.correct_answer,
                    rubric_keywords=rubric,
                    max_marks=max_marks
                )
                if is_corr:
                    correct_count += 1
                else:
                    wrong_count += 1
                    
        total_score += score_awarded
        
        # Save response record
        resp = ExamQuestionResponse(
            attempt_id=attempt.id,
            question_id=q.id,
            student_answer=student_ans,
            is_correct=is_corr,
            score_awarded=score_awarded,
            max_marks=max_marks,
            time_spent_seconds=time_spent,
            error_type=err_type,
            error_reason=err_reason,
            ai_feedback=ai_feedback
        )
        db.add(resp)
        
        concept_name = q.concept.name if q.concept else "مفهوم رئيسي"
        
        # Track concept weakness
        if not is_corr or score_awarded < max_marks:
            if concept_name not in concept_miss_counts:
                concept_miss_counts[concept_name] = {
                    "count": 0,
                    "page": q.source_page
                }
            concept_miss_counts[concept_name]["count"] += 1
            
        # Update StudentMastery in Adaptive Learning
        if q.concept_id:
            m_stmt = select(StudentMastery).where(
                StudentMastery.student_id == user_id,
                StudentMastery.concept_id == q.concept_id
            )
            m_res = await db.execute(m_stmt)
            mastery = m_res.scalars().first()
            if not mastery:
                mastery = StudentMastery(
                    student_id=user_id,
                    concept_id=q.concept_id,
                    total_attempts=0,
                    correct_attempts=0,
                    mastery_score=0.0
                )
                db.add(mastery)
                
            mastery.total_attempts += 1
            if is_corr and score_awarded >= max_marks:
                mastery.correct_attempts += 1
            else:
                if err_type and err_type != "unanswered":
                    mastery.primary_error_type = err_type
                    mastery.error_summary = err_reason
            mastery.mastery_score = round((mastery.correct_attempts / max(1, mastery.total_attempts)) * 100, 1)
            mastery.is_weak_point = (mastery.mastery_score < 70.0)
            mastery.last_practiced_at = now
            
        questions_feedback.append(QuestionResultItem(
            question_id=q.id,
            question_type=q.question_type,
            question_text=q.question_text,
            student_answer=student_ans,
            correct_answer=q.correct_answer,
            is_correct=is_corr,
            score_awarded=score_awarded,
            max_marks=max_marks,
            time_spent_seconds=time_spent,
            explanation=q.explanation,
            source_page=q.source_page,
            concept_name=concept_name,
            error_type=err_type,
            error_reason=err_reason,
            ai_feedback=ai_feedback
        ))
        
    # Calculate percentage
    pct = round((total_score / max(1.0, exam.total_marks)) * 100, 1)
    passed = (pct >= exam.passing_score_pct)
    avg_time_per_q = round(attempt.time_taken_seconds / max(1, len(questions)), 1)
    
    # Build Weak Concepts
    weak_concepts_list = [
        WeakConceptItem(
            concept_name=c_name,
            questions_missed=info["count"],
            source_page=info["page"]
        )
        for c_name, info in concept_miss_counts.items()
    ]
    
    # Build Remedial Recommendations
    remedial_recs = []
    for c_name, info in concept_miss_counts.items():
        page_str = f"صفحة {info['page']}" if info['page'] else "المذكرة"
        remedial_recs.append(RemedialRecommendationItem(
            title=f"مراجعة مستهدفة: {c_name}",
            concept_name=c_name,
            source_page=info["page"],
            recommended_action=f"أعد قراءة ومذاكرة نصوص الدرس في {page_str} وحل الأسئلة التطبيقية المرتبطة بـ ({c_name}).",
            priority="high" if info["count"] >= 2 else "medium"
        ))
        
    if unanswered_count > 0:
        remedial_recs.append(RemedialRecommendationItem(
            title="إدارة وقت الامتحان وتجنب الأسئلة المتروكة",
            concept_name="إدارة الوقت",
            source_page=None,
            recommended_action=f"تركت {unanswered_count} سؤال دون إجابة؛ تدرب على وضع علامة للرجوع للأسئلة الصعبة في نهاية الوقت.",
            priority="medium"
        ))
        
    # Build Summary Feedback
    if passed:
        if pct >= 90:
            summary = f"أداء استثنائي وتفوق باهر! حققت {pct}% في محاكاة الامتحان، واستيعابك للمفاهيم ممتاز."
        else:
            summary = f"أداء جيد جداً وناجح بنسبة {pct}%. ركز على مراجعة بعض النقاط البسيطة الموضحة في التوصيات للوصول إلى الدرجة النهائية."
    else:
        summary = f"حصلت على {pct}%. الامتحان تضمن نقاط ضعف تحتاج إلى تركيز علاجي فوري. راجع التوصيات وأعد خوض الامتحان لتثبيت المعلومة."
        
    if is_timed_out:
        summary += " (ملاحظة: انتهى وقت الامتحان المحدد وتم التسليم التلقائي لما تم إجابته)."
        
    # Update Attempt Record
    attempt.score = total_score
    attempt.percentage = pct
    attempt.passed = passed
    attempt.correct_count = correct_count
    attempt.wrong_count = wrong_count
    attempt.unanswered_count = unanswered_count
    attempt.avg_time_per_question_seconds = avg_time_per_q
    attempt.weak_concepts_json = json.dumps([w.model_dump() for w in weak_concepts_list], ensure_ascii=False)
    attempt.remedial_recommendations_json = json.dumps([r.model_dump() for r in remedial_recs], ensure_ascii=False)
    attempt.summary_feedback = summary
    
    await db.commit()
    await db.refresh(attempt)
    
    # Sync study planner if active
    try:
        from app.services.study_planner import sync_plan_with_student_performance
        await sync_plan_with_student_performance(db, user_id)
    except Exception as se:
        logger.warning(f"Failed to auto-sync study plan after exam: {se}")
        
    return ExamResultResponse(
        attempt_id=attempt.id,
        exam_id=exam.id,
        exam_title=exam.title,
        attempt_number=attempt.attempt_number,
        status=attempt.status,
        score=attempt.score,
        total_marks=attempt.total_marks,
        percentage=attempt.percentage,
        passed=attempt.passed,
        time_taken_seconds=attempt.time_taken_seconds,
        correct_count=attempt.correct_count,
        wrong_count=attempt.wrong_count,
        unanswered_count=attempt.unanswered_count,
        avg_time_per_question_seconds=attempt.avg_time_per_question_seconds,
        weak_concepts=weak_concepts_list,
        remedial_recommendations=remedial_recs,
        summary_feedback=summary,
        questions_feedback=questions_feedback
    )

async def get_exam_attempt_result(
    db: AsyncSession,
    user_id: int,
    exam_id: int,
    attempt_id: int
) -> ExamResultResponse:
    """Retrieves full result and feedback for a finished attempt."""
    attempt = await db.get(ExamAttempt, attempt_id)
    if not attempt or attempt.student_id != user_id or attempt.exam_id != exam_id:
        raise ValueError("المحاولة غير موجودة أو لا تملك صلاحية الوصول إليها.")
        
    exam = await db.get(Exam, exam_id)
    
    # Load responses with questions
    stmt = (
        select(ExamQuestionResponse)
        .options(selectinload(ExamQuestionResponse.question).selectinload(ExamQuestion.concept))
        .where(ExamQuestionResponse.attempt_id == attempt_id)
        .order_by(ExamQuestionResponse.id.asc())
    )
    res = await db.execute(stmt)
    responses = res.scalars().all()
    
    questions_feedback = []
    for r in responses:
        q = r.question
        concept_name = q.concept.name if q and q.concept else "مفهوم رئيسي"
        questions_feedback.append(QuestionResultItem(
            question_id=q.id if q else r.question_id,
            question_type=q.question_type if q else "mcq",
            question_text=q.question_text if q else "نص السؤال",
            student_answer=r.student_answer or "",
            correct_answer=q.correct_answer if q else "",
            is_correct=r.is_correct,
            score_awarded=r.score_awarded,
            max_marks=r.max_marks,
            time_spent_seconds=r.time_spent_seconds,
            explanation=q.explanation if q else "",
            source_page=q.source_page if q else 1,
            concept_name=concept_name,
            error_type=r.error_type,
            error_reason=r.error_reason,
            ai_feedback=r.ai_feedback
        ))
        
    weak_concepts = []
    if attempt.weak_concepts_json:
        try:
            raw_w = json.loads(attempt.weak_concepts_json)
            weak_concepts = [WeakConceptItem(**w) for w in raw_w]
        except Exception:
            pass
            
    recs = []
    if attempt.remedial_recommendations_json:
        try:
            raw_r = json.loads(attempt.remedial_recommendations_json)
            recs = [RemedialRecommendationItem(**r) for r in raw_r]
        except Exception:
            pass
            
    return ExamResultResponse(
        attempt_id=attempt.id,
        exam_id=exam.id,
        exam_title=exam.title,
        attempt_number=attempt.attempt_number,
        status=attempt.status,
        score=attempt.score,
        total_marks=attempt.total_marks,
        percentage=attempt.percentage,
        passed=attempt.passed,
        time_taken_seconds=attempt.time_taken_seconds,
        correct_count=attempt.correct_count,
        wrong_count=attempt.wrong_count,
        unanswered_count=attempt.unanswered_count,
        avg_time_per_question_seconds=attempt.avg_time_per_question_seconds,
        weak_concepts=weak_concepts,
        remedial_recommendations=recs,
        summary_feedback=attempt.summary_feedback or "",
        questions_feedback=questions_feedback
    )

async def get_user_exam_history(
    db: AsyncSession,
    user_id: int
) -> List[ExamHistoryItem]:
    """Retrieves all completed or timed-out exam attempts of the student."""
    stmt = (
        select(ExamAttempt)
        .options(selectinload(ExamAttempt.exam).selectinload(Exam.document))
        .where(
            ExamAttempt.student_id == user_id,
            ExamAttempt.status.in_(["SUBMITTED", "TIMED_OUT"])
        )
        .order_by(ExamAttempt.submitted_at.desc())
    )
    res = await db.execute(stmt)
    attempts = res.scalars().all()
    
    items = []
    for a in attempts:
        if not a.exam:
            continue
        doc_title = a.exam.document.title if a.exam.document else "مذكرة دراسية"
        items.append(ExamHistoryItem(
            attempt_id=a.id,
            exam_id=a.exam_id,
            exam_title=a.exam.title,
            document_id=a.exam.document_id,
            document_title=doc_title,
            subject=a.exam.subject,
            attempt_number=a.attempt_number,
            score=a.score,
            total_marks=a.total_marks,
            percentage=a.percentage,
            passed=a.passed,
            time_taken_seconds=a.time_taken_seconds,
            status=a.status,
            is_mock_mode=a.exam.is_mock_mode,
            submitted_at=a.submitted_at.isoformat() if a.submitted_at else a.created_at.isoformat()
        ))
    return items
