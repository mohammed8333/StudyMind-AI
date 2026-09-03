from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.mastery import Concept, StudentMastery
from app.models.quiz import Quiz, StudentSubmission
from app.models.document import Document
from app.schemas.analytics import StudentAnalyticsResponse, ConceptMasteryItem

async def get_student_analytics(
    db: AsyncSession,
    student_id: int,
    document_id: Optional[int] = None
) -> StudentAnalyticsResponse:
    """
    Computes statistics, identifies weak & strong concepts,
    and formulates an adaptive study/revision plan in Arabic.
    Optionally scoped to a specific document_id.
    """
    # 1. Total documents
    doc_count_stmt = select(func.count(Document.id)).where(Document.owner_id == student_id)
    if document_id is not None:
        doc_count_stmt = doc_count_stmt.where(Document.id == document_id)
    doc_res = await db.execute(doc_count_stmt)
    total_docs = doc_res.scalar() or 0
    
    # 2. Total quizzes taken & average score
    if document_id is not None:
        sub_stmt = (
            select(
                func.count(StudentSubmission.id),
                func.avg(StudentSubmission.percentage)
            )
            .join(Quiz, StudentSubmission.quiz_id == Quiz.id)
            .where(StudentSubmission.student_id == student_id, Quiz.document_id == document_id)
        )
    else:
        sub_stmt = select(
            func.count(StudentSubmission.id),
            func.avg(StudentSubmission.percentage)
        ).where(StudentSubmission.student_id == student_id)
        
    sub_res = await db.execute(sub_stmt)
    total_quizzes, avg_score = sub_res.first() or (0, 0.0)
    avg_score = round(avg_score or 0.0, 1)
    
    # 3. Masteries join with Concepts
    m_stmt = (
        select(StudentMastery, Concept)
        .join(Concept, StudentMastery.concept_id == Concept.id)
        .where(StudentMastery.student_id == student_id)
    )
    if document_id is not None:
        m_stmt = m_stmt.where(Concept.document_id == document_id)
        
    m_stmt = m_stmt.order_by(StudentMastery.mastery_score.asc())
    m_res = await db.execute(m_stmt)
    rows = m_res.all()
    
    weak_concepts: List[ConceptMasteryItem] = []
    strong_concepts: List[ConceptMasteryItem] = []
    
    for mastery, concept in rows:
        item = ConceptMasteryItem(
            concept_id=concept.id,
            concept_name=concept.name,
            subject=concept.subject,
            mastery_score=mastery.mastery_score,
            total_attempts=mastery.total_attempts,
            correct_attempts=mastery.correct_attempts,
            is_weak_point=mastery.is_weak_point
        )
        if mastery.is_weak_point or mastery.mastery_score < 70.0:
            weak_concepts.append(item)
        else:
            strong_concepts.append(item)
            
    # Sort strong descending
    strong_concepts.sort(key=lambda x: x.mastery_score, reverse=True)
    
    # 4. Formulate personalized Arabic revision recommendations
    plan: List[str] = []
    if weak_concepts:
        top_weak = weak_concepts[:3]
        weak_names = " و ".join([f"'{c.concept_name}'" for c in top_weak])
        plan.append(f"⚠️ الأولوية العاجلة: ركّز أولاً على مراجعة المفاهيم الحرجة: {weak_names}.")
        plan.append("💡 اسأل المدرس الذكي بأسلوب [بسيط جداً] عن كل مفهوم لفهم الفكرة الأساسية قبل حل المسائل المعقدة.")
        plan.append("🎯 انقر على زر 'كويز علاجي مركز' لحل أسئلة تستهدف فقط أخطاءك السابقة حتى ترفع نسبة الإتقان إلى 85%+.")
    elif strong_concepts:
        plan.append("🎉 أداء ممتاز! لم يتم تسجيل نقاط ضعف حرجة في هذه المادة حتى الآن.")
        plan.append("🚀 يُنصح ببدء اختبار شامل على المنهج بمستوى صعوبة [امتحان متقدم] لاختبار سرعة الحل.")
    else:
        plan.append("📚 مرحباً بك في لوحة تحكم هذه المادة! لم تقم بحل اختبارات عليها بعد.")
        plan.append("🎯 انقر على زر 'بدء اختبار (Quiz)' في الأعلى لاختبار معلوماتك واكتشاف نقاط القوة والضعف تلقائياً.")
        plan.append("💡 يمكنك استخدام 'شات المدرس الذكي' أو زر 'تلخيص المادة' لبدء مذاكرة محتوى المذكرة فوراً.")
        
    return StudentAnalyticsResponse(
        total_documents=total_docs,
        total_quizzes_taken=total_quizzes or 0,
        average_score=avg_score,
        weak_concepts=weak_concepts,
        strong_concepts=strong_concepts,
        recommended_revision_plan=plan
    )
