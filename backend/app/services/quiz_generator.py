import json
import logging
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.document import Document, DocumentChunk
from app.models.quiz import Quiz, QuizQuestion, StudentSubmission, QuestionResponse
from app.models.mastery import Concept, StudentMastery
from app.services.llm_adapter import call_llm
from app.schemas.quiz import (
    QuizGenerateRequest, 
    QuizResponse, 
    QuestionItem, 
    QuizSubmitRequest, 
    QuizResultResponse, 
    QuestionResultDetail
)

logger = logging.getLogger(__name__)

async def generate_quiz_for_document(
    db: AsyncSession,
    req: QuizGenerateRequest
) -> QuizResponse:
    """
    Generates a structured exam/quiz from document content using LLM.
    Tags each question with a concept and source page.
    """
    # Fetch sample chunks from the document
    stmt = select(DocumentChunk).where(DocumentChunk.document_id == req.document_id)
    if req.chapter:
        stmt = stmt.where(DocumentChunk.chapter.ilike(f"%{req.chapter}%"))
    if req.target_page:
        stmt = stmt.where(DocumentChunk.page_number == req.target_page)
        
    stmt = stmt.limit(12)
    result = await db.execute(stmt)
    chunks = result.scalars().all()
    
    if not chunks:
        # Fallback: get first few chunks of document
        stmt = select(DocumentChunk).where(DocumentChunk.document_id == req.document_id).limit(10)
        result = await db.execute(stmt)
        chunks = result.scalars().all()
        
    context_text = "\n\n".join([f"[صفحة {c.page_number} - {c.chapter}]:\n{c.content}" for c in chunks])
    
    system_prompt = (
        "أنت واضع امتحانات محترف ومتخصص في بناء أسئلة ذكية وفق معايير التقييم الحديثة والامتحانات الوزارية. "
        "مهمتك هي صياغة أسئلة اختبار دقيقة ومتنوعة مبنية بالكامل على المادة المرفقة.\n"
        "يجب أن تكون المخرجات بتنسيق JSON حصراً بالشكل التالي:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question_text": "نص السؤال باللغة العربية...",\n'
        '      "question_type": "mcq",\n'
        '      "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],\n'
        '      "correct_answer": "الخيار أ",\n'
        '      "explanation": "شرح سبب صحة هذا الخيار مستنداً للمنهج...",\n'
        '      "concept_name": "اسم المفهوم العلمي المرتبط بالسؤال",\n'
        '      "source_page": 12\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    
    user_prompt = f"""
قم بتوليد عدد {req.num_questions} سؤال بمستوى صعوبة ({req.difficulty}) ونوع ({req.question_type}).
اعتمد بدقة على نصوص المادة الدراسية التالية:

{context_text[:5000]}
"""

    llm_output = await call_llm(
        prompt=user_prompt,
        system_instruction=system_prompt,
        json_mode=True,
        temperature=0.4
    )
    
    # Parse JSON
    try:
        data = json.loads(llm_output)
        raw_questions = data.get("questions", [])
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON: {e}. Output was: {llm_output}")
        # Regex fallback to extract JSON object
        match = re.search(r'\{.*\}', llm_output, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                raw_questions = data.get("questions", [])
            except Exception:
                raw_questions = []
        else:
            raw_questions = []

    if not raw_questions:
        # Provide default questions if generation returned empty
        raw_questions = [
            {
                "question_text": "أي من العبارات التالية تعبر بدقة عن المفاهيم الأساسية في هذا الدرس؟",
                "question_type": "mcq",
                "options": ["المفهوم الأساسي متوافق مع قوانين الحركة", "لا توجد علاقة رياضية", "المتغيرات مستقلة تماماً", "جميع ما سبق غير صحيح"],
                "correct_answer": "المفهوم الأساسي متوافق مع قوانين الحركة",
                "explanation": "استناداً للنصوص المقررة في هذا الفصل.",
                "concept_name": "المفاهيم الأساسية للمادة",
                "source_page": chunks[0].page_number if chunks else 1
            }
        ]

    # Create Quiz in DB
    doc = await db.get(Document, req.document_id)
    quiz_title = f"اختبار {doc.title if doc else 'المادة'}"
    if req.chapter:
        quiz_title += f" - {req.chapter}"
        
    db_quiz = Quiz(
        title=quiz_title,
        document_id=req.document_id,
        chapter=req.chapter,
        difficulty=req.difficulty,
        total_questions=len(raw_questions)
    )
    db.add(db_quiz)
    await db.flush()
    
    created_questions: List[QuestionItem] = []
    
    for q_data in raw_questions:
        # Find or create concept
        concept_name = q_data.get("concept_name", "مفهوم عام").strip()
        concept_stmt = select(Concept).where(Concept.document_id == req.document_id, Concept.name == concept_name)
        c_res = await db.execute(concept_stmt)
        concept = c_res.scalars().first()
        if not concept:
            concept = Concept(
                document_id=req.document_id,
                name=concept_name,
                chapter=req.chapter,
                subject=doc.subject if doc else None
            )
            db.add(concept)
            await db.flush()
            
        options_list = q_data.get("options", ["صح", "خطأ"]) if q_data.get("question_type") != "true_false" else ["صح", "خطأ"]
        
        db_q = QuizQuestion(
            quiz_id=db_quiz.id,
            concept_id=concept.id,
            question_type=q_data.get("question_type", "mcq"),
            question_text=q_data.get("question_text", ""),
            options_json=json.dumps(options_list, ensure_ascii=False),
            correct_answer=q_data.get("correct_answer", options_list[0]),
            explanation=q_data.get("explanation", "شرح تفصيلي مستند للكتاب."),
            source_page=q_data.get("source_page", 1)
        )
        db.add(db_q)
        await db.flush()
        
        created_questions.append(QuestionItem(
            id=db_q.id,
            question_type=db_q.question_type,
            question_text=db_q.question_text,
            options=options_list,
            source_page=db_q.source_page,
            concept_name=concept.name
        ))
        
    await db.commit()
    await db.refresh(db_quiz)
    
    return QuizResponse(
        id=db_quiz.id,
        title=db_quiz.title,
        document_id=db_quiz.document_id,
        difficulty=db_quiz.difficulty,
        total_questions=len(created_questions),
        questions=created_questions
    )

async def grade_quiz_submission(
    db: AsyncSession,
    quiz_id: int,
    student_id: int,
    submission_req: QuizSubmitRequest
) -> QuizResultResponse:
    """
    Grades student answers, calculates score, provides detailed feedback,
    and feeds results into the Adaptive Mastery system.
    """
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise ValueError("Quiz not found")
        
    q_stmt = select(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id)
    q_result = await db.execute(q_stmt)
    questions = {q.id: q for q in q_result.scalars().all()}
    
    total_q = len(questions)
    correct_count = 0
    feedback_list: List[QuestionResultDetail] = []
    
    # Map student answers
    answer_map = {ans.question_id: ans.selected_answer.strip() for ans in submission_req.answers}
    
    # Create submission record
    sub = StudentSubmission(
        quiz_id=quiz_id,
        student_id=student_id,
        time_taken_seconds=submission_req.time_taken_seconds
    )
    db.add(sub)
    await db.flush()
    
    for q_id, question in questions.items():
        user_ans = answer_map.get(q_id, "")
        is_corr = (user_ans.lower() == question.correct_answer.strip().lower())
        if is_corr:
            correct_count += 1
            
        # Record response
        resp = QuestionResponse(
            submission_id=sub.id,
            question_id=q_id,
            student_answer=user_ans,
            is_correct=is_corr
        )
        db.add(resp)
        
        # Concept name lookup
        c_name = None
        if question.concept_id:
            concept = await db.get(Concept, question.concept_id)
            if concept:
                c_name = concept.name
                # Update Student Mastery
                m_stmt = select(StudentMastery).where(
                    StudentMastery.student_id == student_id,
                    StudentMastery.concept_id == concept.id
                )
                m_res = await db.execute(m_stmt)
                mastery = m_res.scalars().first()
                if not mastery:
                    mastery = StudentMastery(
                        student_id=student_id,
                        concept_id=concept.id,
                        total_attempts=0,
                        correct_attempts=0,
                        mastery_score=0.0
                    )
                    db.add(mastery)
                
                mastery.total_attempts += 1
                if is_corr:
                    mastery.correct_attempts += 1
                # Calculate percentage
                mastery.mastery_score = round((mastery.correct_attempts / mastery.total_attempts) * 100, 1)
                mastery.is_weak_point = (mastery.mastery_score < 70.0)
                
        feedback_list.append(QuestionResultDetail(
            question_id=q_id,
            question_text=question.question_text,
            selected_answer=user_ans,
            correct_answer=question.correct_answer,
            is_correct=is_corr,
            explanation=question.explanation,
            source_page=question.source_page,
            concept_name=c_name
        ))
        
    score = float(correct_count)
    pct = round((score / max(1, total_q)) * 100, 1)
    
    sub.score = score
    sub.total_questions = total_q
    sub.percentage = pct
    
    await db.commit()
    await db.refresh(sub)
    
    return QuizResultResponse(
        submission_id=sub.id,
        score=score,
        total_questions=total_q,
        percentage=pct,
        passed=(pct >= 60.0),
        time_taken_seconds=submission_req.time_taken_seconds,
        questions_feedback=feedback_list
    )
