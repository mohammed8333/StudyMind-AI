import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_

from app.models.user import User
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.quiz import Quiz, StudentSubmission
from app.models.exam import Exam, ExamAttempt
from app.models.study_plan import StudyPlan, StudyPlanTask
from app.models.flashcard import Flashcard
from app.models.copilot import CopilotMessage

from app.schemas.copilot import (
    ConceptWeaknessItem,
    StudentLearningStateResponse,
    CopilotActionItem,
    WhatToStudyNowResponse,
    DailyBriefingResponse,
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotMessageItem,
    CopilotRebalanceResponse,
)
from app.services.llm_adapter import call_llm
from app.services.vector_store import search_relevant_chunks
from app.services.study_planner import reschedule_overdue_tasks

logger = logging.getLogger(__name__)

ERROR_TYPE_LABELS: Dict[str, str] = {
    "knowledge_gap": "فجوة معرفية في المفهوم",
    "misconception": "سوء فهم والتباس في القواعد",
    "calculation_mistake": "خطأ حسابي أو رقمي",
    "careless_error": "عدم انتباه أو تسرع",
    "unanswered": "سؤال متروك دون إجابة",
}

ARABIC_WEEKDAYS: Dict[int, str] = {
    0: "الإثنين",
    1: "الثلاثاء",
    2: "الأربعاء",
    3: "الخميس",
    4: "الجمعة",
    5: "السبت",
    6: "الأحد",
}

ARABIC_MONTHS: Dict[int, str] = {
    1: "يناير", 2: "فبراير", 3: "مارس", 4: "أبريل", 5: "مايو", 6: "يونيو",
    7: "يوليو", 8: "أغسطس", 9: "سبتمبر", 10: "أكتوبر", 11: "نوفمبر", 12: "ديسمبر"
}


def format_arabic_date(d: date) -> str:
    day_name = ARABIC_WEEKDAYS.get(d.weekday(), "")
    month_name = ARABIC_MONTHS.get(d.month, "")
    return f"{day_name}، {d.day} {month_name} {d.year}"


# ==============================================================================
# 1. State Aggregation Engine (User Data + Learning State Layers)
# ==============================================================================

async def aggregate_student_learning_state(
    db: AsyncSession,
    student_id: int
) -> StudentLearningStateResponse:
    """
    Collects and aggregates the student's actual database records into a single
    structured learning state snapshot:
    - Documents & subjects
    - Quiz and exam histories
    - Concept mastery scores, weak points, and error diagnosis
    - Active study plan, exam countdown, and overdue/neglect detection
    - Due flashcards
    """
    today = date.today()
    now = datetime.utcnow()

    # 1. Documents
    doc_stmt = select(Document).where(Document.owner_id == student_id)
    doc_res = await db.execute(doc_stmt)
    documents = doc_res.scalars().all()
    total_documents = len(documents)
    subjects = list({d.subject for d in documents if d.subject})

    # 2. Quizzes taken
    quiz_sub_stmt = select(func.count(StudentSubmission.id)).where(
        StudentSubmission.student_id == student_id
    )
    total_quizzes = (await db.execute(quiz_sub_stmt)).scalar() or 0

    # 3. Exams taken
    exam_att_stmt = select(func.count(ExamAttempt.id)).where(
        ExamAttempt.student_id == student_id,
        ExamAttempt.status.in_(["completed", "SUBMITTED", "TIMED_OUT"])
    )
    total_exams = (await db.execute(exam_att_stmt)).scalar() or 0

    # 4. Mastery and Concepts
    mastery_stmt = (
        select(StudentMastery, Concept)
        .join(Concept, StudentMastery.concept_id == Concept.id)
        .where(StudentMastery.student_id == student_id)
    )
    mastery_res = await db.execute(mastery_stmt)
    mastery_records = mastery_res.all()

    weak_concepts_list: List[ConceptWeaknessItem] = []
    strong_concepts_list: List[str] = []
    total_mastery_sum = 0.0

    for sm, c in mastery_records:
        total_mastery_sum += sm.mastery_score
        err_type = sm.primary_error_type or "knowledge_gap"
        err_label = ERROR_TYPE_LABELS.get(err_type, "فجوة معرفية في المفهوم")

        if sm.is_weak_point or sm.mastery_score < 70.0:
            weak_concepts_list.append(
                ConceptWeaknessItem(
                    concept_id=c.id,
                    concept_name=c.name,
                    subject=c.subject,
                    chapter=c.chapter,
                    document_id=c.document_id,
                    mastery_score=round(sm.mastery_score, 1),
                    total_attempts=sm.total_attempts,
                    correct_attempts=sm.correct_attempts,
                    primary_error_type=err_type,
                    primary_error_label=err_label,
                    error_summary=sm.error_summary,
                )
            )
        elif sm.mastery_score >= 75.0:
            strong_concepts_list.append(c.name)

    # Sort weak concepts by lowest mastery first
    weak_concepts_list.sort(key=lambda x: x.mastery_score)

    overall_mastery = (
        round(total_mastery_sum / len(mastery_records), 1)
        if mastery_records
        else 0.0
    )

    # 5. Active Study Plan & Tasks
    plan_stmt = (
        select(StudyPlan)
        .where(StudyPlan.student_id == student_id, StudyPlan.is_active == True)
        .order_by(desc(StudyPlan.id))
    )
    plan_res = await db.execute(plan_stmt)
    active_plan = plan_res.scalars().first()

    nearest_exam_date: Optional[date] = None
    days_until_exam: Optional[int] = None
    exam_target_subjects: List[str] = []
    active_plan_progress = 0.0
    active_plan_id: Optional[int] = None
    today_tasks_count = 0
    today_estimated_minutes = 0
    overdue_tasks_count = 0
    is_neglected = False

    if active_plan:
        active_plan_id = active_plan.id
        nearest_exam_date = active_plan.exam_date
        days_until_exam = max(0, (active_plan.exam_date - today).days)
        active_plan_progress = round(active_plan.progress_percentage, 1)

        try:
            exam_target_subjects = json.loads(active_plan.subjects_json or "[]")
        except Exception:
            exam_target_subjects = subjects

        # Query tasks for active plan
        tasks_stmt = select(StudyPlanTask).where(StudyPlanTask.plan_id == active_plan.id)
        tasks_res = await db.execute(tasks_stmt)
        all_tasks = tasks_res.scalars().all()

        for t in all_tasks:
            # Check overdue
            if t.scheduled_date < today and t.status in ("PENDING", "OVERDUE"):
                overdue_tasks_count += 1
            # Check today
            elif t.scheduled_date == today and t.status in ("PENDING", "OVERDUE"):
                today_tasks_count += 1
                today_estimated_minutes += t.duration_minutes

        is_neglected = overdue_tasks_count > 0
    else:
        # Fallback check if user has exams directly
        exam_stmt = select(Exam).where(Exam.user_id == student_id).order_by(desc(Exam.id))
        first_exam = (await db.execute(exam_stmt)).scalars().first()
        if first_exam:
            exam_target_subjects = [first_exam.subject] if first_exam.subject else []

    # Exam readiness: combination of mastery and progress
    exam_readiness_score = round(
        (overall_mastery * 0.6) + (active_plan_progress * 0.4),
        1
    ) if active_plan else overall_mastery

    # 6. Due Flashcards
    fc_stmt = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == student_id,
        Flashcard.is_suspended == False,
        Flashcard.next_review_at <= now
    )
    due_flashcards = (await db.execute(fc_stmt)).scalar() or 0

    # 7. Current focus subject
    current_focus_subject: Optional[str] = None
    if weak_concepts_list and weak_concepts_list[0].subject:
        current_focus_subject = weak_concepts_list[0].subject
    elif exam_target_subjects:
        current_focus_subject = exam_target_subjects[0]
    elif subjects:
        current_focus_subject = subjects[0]

    return StudentLearningStateResponse(
        overall_mastery=overall_mastery,
        total_documents=total_documents,
        total_quizzes_taken=total_quizzes,
        total_exams_taken=total_exams,
        weak_concepts=weak_concepts_list,
        strong_concepts=strong_concepts_list[:8],
        nearest_exam_date=nearest_exam_date,
        days_until_exam=days_until_exam,
        exam_target_subjects=exam_target_subjects,
        exam_readiness_score=exam_readiness_score,
        active_plan_id=active_plan_id,
        active_plan_progress=active_plan_progress,
        today_tasks_count=today_tasks_count,
        today_estimated_minutes=today_estimated_minutes,
        overdue_tasks_count=overdue_tasks_count,
        is_neglected=is_neglected,
        due_flashcards_count=due_flashcards,
        current_focus_subject=current_focus_subject,
    )


# ==============================================================================
# 2. Decision Engine: What Should the Student Study Right Now?
# ==============================================================================

def determine_what_to_study_now(
    state: StudentLearningStateResponse
) -> WhatToStudyNowResponse:
    """
    Deterministic & reasoned decision engine that selects the single highest-impact
    learning action for the student right now, along with an explicit data-driven
    rationale, direct action URL, and alternative actions.
    """
    alternatives: List[CopilotActionItem] = []

    # -------------------------------------------------------------------------
    # PRIORITY 1: Overdue Neglect Alert (Critical for Plan Adherence)
    # -------------------------------------------------------------------------
    if state.is_neglected and state.overdue_tasks_count > 0:
        primary = CopilotActionItem(
            action_type="REBALANCE",
            title="إعادة توزيع المهام المتأخرة على جدولك",
            description=f"لديك {state.overdue_tasks_count} مهمة متأخرة لم تكتمل؛ إعادة جدولتها الآن سيمنع تراكم المنهج.",
            rationale=f"تم رصد {state.overdue_tasks_count} مهام متأخرة عن جدولها المحدد. إعادة التوزيع التلقائي بنقرة واحدة ستوزع العبء بمرونة على الأيام القادمة حتى موعد الامتحان دون ضغط.",
            urgency="CRITICAL",
            badge_label="مطلوب تنظيم 🔄",
            action_url="/planner",
            payload={"reschedule": True, "overdue_count": state.overdue_tasks_count}
        )

        # Alternative: tackle weak concept or study today's task
        if state.weak_concepts:
            w = state.weak_concepts[0]
            alternatives.append(
                CopilotActionItem(
                    action_type="REMEDIATE",
                    title=f"جلسة علاجية: {w.concept_name}",
                    description=f"معالجة فجوة معرفية ({w.mastery_score:.0f}% إتقان).",
                    rationale=f"مفهوم أساسي يعاني من {w.primary_error_label}.",
                    urgency="HIGH",
                    badge_label="علاج فوري 🎯",
                    action_url=f"/material/{w.document_id}" if w.document_id else "/dashboard",
                    payload={"concept_id": w.concept_id, "document_id": w.document_id}
                )
            )

        return WhatToStudyNowResponse(
            recommendation=primary,
            alternative_actions=alternatives,
            student_headline=f"تنبيه جدول المذاكرة: {state.overdue_tasks_count} مهام متأخرة بحاجة لإعادة جدولة",
            state_summary={
                "overdue_tasks": state.overdue_tasks_count,
                "days_until_exam": state.days_until_exam,
                "overall_mastery": state.overall_mastery
            }
        )

    # -------------------------------------------------------------------------
    # PRIORITY 2: Severe Weak Concept in Target Subject (< 60% Mastery)
    # -------------------------------------------------------------------------
    if state.weak_concepts and state.weak_concepts[0].mastery_score < 60.0:
        w = state.weak_concepts[0]
        exam_text = (
            f"قبل موعد الامتحان بـ {state.days_until_exam} يوماً"
            if state.days_until_exam is not None
            else "لضمان التميز في المنهج"
        )
        rationale = (
            f"نسبة إتقانك لمفهوم '{w.concept_name}' هي {w.mastery_score:.0f}% فقط "
            f"بسبب ({w.primary_error_label}). {exam_text}، معالجة هذا المفهوم عبر درس مصغر "
            f"وأسئلة علاجية فورية سيرفع مستوى إتقانك ويمنع خسارة الدرجات."
        )

        primary = CopilotActionItem(
            action_type="REMEDIATE",
            title=f"جلسة علاجية مكثفة: {w.concept_name}",
            description=f"معالجة {w.primary_error_label} في مادة {w.subject or 'الدراسة'}.",
            rationale=rationale,
            urgency="HIGH",
            badge_label="علاج فوري 🎯",
            action_url=f"/material/{w.document_id}" if w.document_id else "/dashboard",
            payload={
                "concept_id": w.concept_id,
                "concept_name": w.concept_name,
                "document_id": w.document_id,
                "mastery_score": w.mastery_score
            }
        )

        # Alternative: quiz or flashcards
        if state.today_tasks_count > 0:
            alternatives.append(
                CopilotActionItem(
                    action_type="STUDY",
                    title="متابعة مهام خطة اليوم المجدولة",
                    description=f"إنجاز {state.today_tasks_count} مهام مقدرة بـ {state.today_estimated_minutes} دقيقة.",
                    rationale="الالتزام بجدول المذاكرة المخطط لليوم.",
                    urgency="NORMAL",
                    badge_label="جدول اليوم 📅",
                    action_url="/planner",
                    payload={"plan_id": state.active_plan_id}
                )
            )

        if state.due_flashcards_count > 0:
            alternatives.append(
                CopilotActionItem(
                    action_type="REVIEW_FLASHCARDS",
                    title=f"مراجعة {state.due_flashcards_count} بطاقات مستحقة",
                    description="تثبيت المفاهيم بالتكرار المتباعد.",
                    rationale="الحفاظ على الذاكرة طويلة المدى.",
                    urgency="NORMAL",
                    badge_label="تكرار متباعد 🎴",
                    action_url="/flashcards",
                    payload={"count": state.due_flashcards_count}
                )
            )

        return WhatToStudyNowResponse(
            recommendation=primary,
            alternative_actions=alternatives,
            student_headline=f"الهدف الأهم الآن: معالجة نقطة الضعف في ({w.concept_name})",
            state_summary={
                "weak_concept": w.concept_name,
                "score": w.mastery_score,
                "error_type": w.primary_error_type
            }
        )

    # -------------------------------------------------------------------------
    # PRIORITY 3: Today's Scheduled Plan Tasks (On Track)
    # -------------------------------------------------------------------------
    if state.today_tasks_count > 0:
        primary = CopilotActionItem(
            action_type="STUDY",
            title=f"إنجاز مهام اليوم المجدولة في {state.current_focus_subject or 'المنهج'}",
            description=f"لديك {state.today_tasks_count} مهام مقدرة بحوالي {state.today_estimated_minutes} دقيقة.",
            rationale=(
                f"جدولك الذكي حدد لك اليوم {state.today_tasks_count} مهام مذاكرة. "
                f"إنجازها اليوم يحافظ على وتيرة دراستك بنسبة 100% ويمنع أي تراكم قبل موعد الامتحان."
            ),
            urgency="NORMAL",
            badge_label="مهام اليوم 📅",
            action_url="/planner",
            payload={"plan_id": state.active_plan_id, "tasks_count": state.today_tasks_count}
        )

        # Alternative: Quick quiz
        alternatives.append(
            CopilotActionItem(
                action_type="QUIZ",
                title="كويز فوري لتثبيت ما ذاكرته",
                description="اختبار فوري من 5 أسئلة لتقييم استيعابك.",
                rationale="التأكد من جاهزية المفهوم قبل الانتقال للموضوع التالي.",
                urgency="NORMAL",
                badge_label="كويز سريع 📝",
                action_url="/quizzes",
                payload={"num_questions": 5}
            )
        )

        return WhatToStudyNowResponse(
            recommendation=primary,
            alternative_actions=alternatives,
            student_headline=f"خطة اليوم: إنجاز {state.today_tasks_count} مهام ({state.today_estimated_minutes} دقيقة)",
            state_summary={"today_tasks": state.today_tasks_count, "minutes": state.today_estimated_minutes}
        )

    # -------------------------------------------------------------------------
    # PRIORITY 4: Flashcards Due Review
    # -------------------------------------------------------------------------
    if state.due_flashcards_count > 0:
        primary = CopilotActionItem(
            action_type="REVIEW_FLASHCARDS",
            title=f"مراجعة {state.due_flashcards_count} بطاقات استذكار مستحقة",
            description="جلسة استرجاع نشط بخوارزمية SM-2 تستغرق حوالي 5 دقائق.",
            rationale=(
                f"خوارزمية التكرار المتباعد رصدت {state.due_flashcards_count} بطاقة مستحقة اليوم. "
                f"مراجعتها الآن تمنع نسيانها وتضمن نقلها للذاكرة الدائمة بكفاءة عالية."
            ),
            urgency="NORMAL",
            badge_label="استذكار سريع 🎴",
            action_url="/flashcards",
            payload={"due_count": state.due_flashcards_count}
        )

        return WhatToStudyNowResponse(
            recommendation=primary,
            alternative_actions=alternatives,
            student_headline=f"فرصة استذكار سريعة: {state.due_flashcards_count} بطاقات تنتظر مراجعتك",
            state_summary={"due_cards": state.due_flashcards_count}
        )

    # -------------------------------------------------------------------------
    # PRIORITY 5: Impending Exam Mock Simulation
    # -------------------------------------------------------------------------
    if state.days_until_exam is not None and state.days_until_exam <= 7:
        primary = CopilotActionItem(
            action_type="MOCK_EXAM",
            title="خوض محاكاة واقعية للامتحان (Mock Exam)",
            description="امتحان تدريبي بمؤقت زمني وتصحيح ذكي شامل.",
            rationale=(
                f"باقي {state.days_until_exam} أيام فقط على موعد الامتحان، ومستوى إتقانك العام هو {state.overall_mastery:.0f}%. "
                f"خوض امتحان محاكاة بوقت حقيقي سيكشف لك مدى جاهزيتك تحت الضغط ويوجهك للنقاط الأخيرة."
            ),
            urgency="HIGH",
            badge_label="محاكاة امتحان ⏱️",
            action_url="/exams",
            payload={"is_mock": True, "subject": state.current_focus_subject}
        )

        return WhatToStudyNowResponse(
            recommendation=primary,
            alternative_actions=alternatives,
            student_headline=f"العد التنازلي: باقي {state.days_until_exam} أيام على الامتحان - حان وقت المحاكاة",
            state_summary={"days_left": state.days_until_exam, "readiness": state.exam_readiness_score}
        )

    # -------------------------------------------------------------------------
    # FALLBACK: General Study or Document Upload
    # -------------------------------------------------------------------------
    if state.total_documents > 0:
        primary = CopilotActionItem(
            action_type="QUIZ",
            title=f"كويز قياس مستوى في {state.current_focus_subject or 'مذكراتك'}",
            description="كويز ذكي من 5 أسئلة لتحديث مؤشرات إتقانك.",
            rationale=(
                f"أنهيت كافة المهام المجدولة لليوم بنجاح! كويز سريع من 5 أسئلة سيساعد المساعد الذكي "
                f"في اكتشاف أي فجوات جديدة ورفع رصيد إتقانك العام ({state.overall_mastery:.0f}%)."
            ),
            urgency="NORMAL",
            badge_label="تحدي جديد 💡",
            action_url="/quizzes",
            payload={"num_questions": 5}
        )
    else:
        primary = CopilotActionItem(
            action_type="STUDY",
            title="رفع أول مذكرة دراسية في مكتبتك",
            description="ابدأ برفع كتابك أو ملخصك بصيغة PDF أو DOCX.",
            rationale="لبدء رحلة المذاكرة الذكية، ارفع مذكرتك ليقوم المساعد الذكي بتحليلها وتوليد جدول وخطة مخصصة لك.",
            urgency="NORMAL",
            badge_label="البداية 🚀",
            action_url="/library",
            payload={}
        )

    return WhatToStudyNowResponse(
        recommendation=primary,
        alternative_actions=alternatives,
        student_headline="مستواك مستقر! جاهز لتحدي ذكي جديد؟",
        state_summary={"overall_mastery": state.overall_mastery}
    )


# ==============================================================================
# 3. Daily Briefing Generator ("Today's Learning Plan")
# ==============================================================================

async def generate_daily_briefing(
    db: AsyncSession,
    student_id: int
) -> DailyBriefingResponse:
    """
    Generates a personalized daily briefing for the student, detailing:
    - Today's date in Arabic
    - Exam countdown tracking
    - Neglect/Overdue alert if applicable
    - Today's focused learning plan summary
    - The top priority actionable item with rationale
    """
    state = await aggregate_student_learning_state(db, student_id)
    what_to_study = determine_what_to_study_now(state)
    today = date.today()

    # Greeting based on time of day (Cairo / local)
    current_hour = datetime.utcnow().hour + 3  # approx UTC+3
    if 5 <= current_hour < 12:
        greeting = "صباح الخير والهمة العالية! ☀️"
    elif 12 <= current_hour < 18:
        greeting = "مساء الخير والنشاط الأكاديمي! 🌤️"
    else:
        greeting = "مساء التوفيق والتركيز العميق! 🌙"

    date_str = format_arabic_date(today)
    day_name = ARABIC_WEEKDAYS.get(today.weekday(), "")

    # Exam countdown text
    exam_countdown_text: Optional[str] = None
    if state.days_until_exam is not None:
        if state.days_until_exam == 0:
            exam_countdown_text = "اليوم هو موعد الامتحان! ثق بنفسك وتوكل على الله 🎯"
        elif state.days_until_exam == 1:
            exam_countdown_text = "غداً موعد الامتحان! مراجعة خفيفة ونوم مبكر ⏰"
        else:
            subj = f" في ({state.current_focus_subject})" if state.current_focus_subject else ""
            exam_countdown_text = f"متبقي {state.days_until_exam} يوماً على موعد الامتحان النهائي{subj} ⏳"

    # Neglect alert
    neglect_alert: Optional[str] = None
    if state.is_neglected and state.overdue_tasks_count > 0:
        neglect_alert = (
            f"تنبيه: تم رصد {state.overdue_tasks_count} مهام متأخرة عن موعدها. "
            f"يُفضل استخدام زر 'إعادة توزيع المهام' لضبط الجدول بسلاسة دون تراكم."
        )

    # Focus headline
    if state.weak_concepts:
        focus_headline = f"التركيز اليوم: معالجة فجوة ({state.weak_concepts[0].concept_name}) لرفع درجة إتقانك 🚀"
    elif state.today_tasks_count > 0:
        focus_headline = f"التركيز اليوم: إنجاز {state.today_tasks_count} مهام مجدولة بانتظام 🎯"
    elif state.due_flashcards_count > 0:
        focus_headline = f"التركيز اليوم: مراجعة سريعة لـ {state.due_flashcards_count} بطاقات استذكار 🎴"
    else:
        focus_headline = f"التركيز اليوم: استثمار الوقت في حل كويزات وتثبيت المعلومات 💡"

    # Today's tasks summary
    if state.today_tasks_count > 0:
        today_tasks_summary = (
            f"لديك اليوم {state.today_tasks_count} مهام في جدولك تستغرق حوالي "
            f"{state.today_estimated_minutes} دقيقة مذاكرة."
        )
    else:
        today_tasks_summary = "لا توجد مهام جديدة مجدولة اليوم في خطتك؛ يمكنك المراجعة أو استباق المنهج."

    quick_tips = [
        "قسّم وقت المذاكرة لجلسات 25 دقيقة مع 5 دقائق استراحة (Pomodoro) لزيادة التركيز.",
        "حل الأسئلة والكويزات يثبت 80% من المعلومات أكثر من مجرد قراءة المذكرة السلبية."
    ]

    return DailyBriefingResponse(
        greeting=greeting,
        date_str=date_str,
        day_name_arabic=day_name,
        exam_countdown_text=exam_countdown_text,
        days_until_exam=state.days_until_exam,
        neglect_alert=neglect_alert,
        focus_headline=focus_headline,
        today_tasks_summary=today_tasks_summary,
        primary_action=what_to_study.recommendation,
        quick_tips=quick_tips
    )


# ==============================================================================
# 4. Context-Routed Conversational Assistant
# ==============================================================================

async def execute_copilot_chat(
    db: AsyncSession,
    student_id: int,
    user_message: str,
    document_id: Optional[int] = None,
    history_limit: int = 10
) -> CopilotChatResponse:
    """
    Executes conversational Copilot interaction with explicit context separation:
    - User Data & Learning State: Injected as ground-truth numbers into the prompt.
    - RAG Context: Queried ONLY when the query is academic/syllabus related.
    - Action Attachment: Recommends direct executable action cards when applicable.
    - Message Persistence: Saves user and copilot messages to DB.
    """
    state = await aggregate_student_learning_state(db, student_id)
    what_to_study = determine_what_to_study_now(state)

    # 1. Classify Query Intent:
    # State / Administrative query vs Document / Concept query
    msg_lower = user_message.lower().strip()

    admin_keywords = [
        "أذاكر إيه", "ماذا أذاكر", "جدول", "خطة", "نقاط ضعف", "أخطائي",
        "كم باقي", "امتحان", "متأخر", "إهمال", "ملخص اليوم", "نصيحة",
        "توزيع", "أعد", "مستواي", "إتقان", "درجاتي", "flashcard", "كويز"
    ]
    is_state_query = any(k in msg_lower for k in admin_keywords)

    rag_keywords = [
        "اشرح", "ما هو", "ما هي", "كيف", "قانون", "علل", "بم تفسر",
        "ما وظيفة", "مكونات", "تعريف", "قارن", "احسب", "مسألة", "صفحة"
    ]
    is_academic_query = any(k in msg_lower for k in rag_keywords)

    # 2. RAG Retrieval if applicable
    citations: List[Dict[str, Any]] = []
    rag_context_text = ""

    target_doc_id = document_id
    if not target_doc_id and state.weak_concepts:
        target_doc_id = state.weak_concepts[0].document_id

    if is_academic_query and target_doc_id:
        try:
            chunks = await search_relevant_chunks(db, target_doc_id, user_message, top_k=3)
            if chunks:
                rag_parts = []
                for c in chunks:
                    page_num = c.get("page_number")
                    chunk_text = c.get("text", "")
                    rag_parts.append(f"[صفحة {page_num}]:\n{chunk_text}")
                    citations.append({
                        "page_number": page_num,
                        "document_id": target_doc_id,
                        "snippet": chunk_text[:120] + "..."
                    })
                rag_context_text = "\n---\n".join(rag_parts)
        except Exception as e:
            logger.warning(f"RAG search error in copilot: {e}")

    # 3. Build Prompt with Strict Layer Separation
    weak_str = ", ".join([f"{w.concept_name} ({w.mastery_score:.0f}%)" for w in state.weak_concepts[:4]]) or "لا توجد نقاط ضعف مسجلة"
    strong_str = ", ".join(state.strong_concepts[:4]) or "قيد التقييم"
    exam_str = f"بعد {state.days_until_exam} يوماً" if state.days_until_exam is not None else "غير محدد"

    system_prompt = (
        "أنت StudyMind AI Learning Copilot: الموجه الأكاديمي والمدرب التعليمي الشخصي للطالب.\n"
        "وظيفتك ليست مجرد شات عام، بل أنت تفهم بدقة ما يعرفه الطالب، ما لا يعرفه، وما الذي يجب أن يذاكره الآن.\n\n"
        "=== [1. بيانات الطالب وحالة التعلم الفعلية (حقائق مؤكدة من قاعدة البيانات)] ===\n"
        f"• نسبة الإتقان الإجمالية للمفاهيم: {state.overall_mastery:.0f}%\n"
        f"• موعد الامتحان النهائي: {exam_str}\n"
        f"• المفاهيم الضعيفة التي تحتاج معالجة: {weak_str}\n"
        f"• المفاهيم المتقنة: {strong_str}\n"
        f"• المهام المجدولة لليوم: {state.today_tasks_count} مهام ({state.today_estimated_minutes} دقيقة)\n"
        f"• المهام المتأخرة (تنبيه الإهمال): {state.overdue_tasks_count} مهام متأخرة\n"
        f"• بطاقات الاستذكار المستحقة اليوم: {state.due_flashcards_count} بطاقة\n"
        f"• التوصية الفورية الآن: {what_to_study.recommendation.title} (السبب: {what_to_study.recommendation.rationale})\n\n"
        "=== [2. القواعد الصارمة لمنع الهلاوس] ===\n"
        "1. اعتمد كلياً على الأرقام والبيانات المذكورة أعلاه. لا تخترع تواريخ أو درجات غير موجودة.\n"
        "2. إذا سأل الطالب عن مذاكرته أو جدوله، أجب بناءً على أرقام حالته أعلاه ووجهه لخطوته القادمة بوضوح.\n"
        "3. إذا كان هناك نص من المذكرة في سياق RAG أدناه، التزم به واذكر رقم الصفحة.\n"
        "4. أسلوبك: دافئ، محفز، مباشر، وباللغة العربية الفصحى الميسرة مع التركيز على العمل والتنفيذ.\n"
    )

    if rag_context_text:
        system_prompt += f"\n=== [3. نصوص المذكرة المسترجعة (RAG Context)] ===\n{rag_context_text}\n"

    # Fetch recent history
    hist_stmt = (
        select(CopilotMessage)
        .where(CopilotMessage.user_id == student_id)
        .order_by(desc(CopilotMessage.id))
        .limit(history_limit)
    )
    hist_res = await db.execute(hist_stmt)
    prev_messages = list(reversed(hist_res.scalars().all()))

    messages_payload: List[Dict[str, str]] = []
    for m in prev_messages:
        messages_payload.append({"role": m.role, "content": m.content})
    messages_payload.append({"role": "user", "content": user_message})

    # Call LLM with fallback
    reply_text = ""
    try:
        reply_text = await call_llm(
            messages=messages_payload,
            system_prompt=system_prompt,
            temperature=0.3
        )
    except Exception as e:
        logger.warning(f"LLM call failed in copilot, using intelligent deterministic reply: {e}")
        # Deterministic rich fallback
        if is_state_query or "ماذا" in user_message or "أذاكر" in user_message:
            reply_text = (
                f"أهلاً بك! بناءً على تحليلي لبياناتك ومستواك الحالي:\n\n"
                f"🎯 **المهمة ذات الأولوية القصوى لك الآن:**\n"
                f"**{what_to_study.recommendation.title}**\n\n"
                f"💡 **سبب الاختيار:**\n"
                f"{what_to_study.recommendation.rationale}\n\n"
                f"📊 **مؤشراتك اليومية:**\n"
                f"• نسبة الإتقان العام: {state.overall_mastery:.0f}%\n"
                f"• المهام المتأخرة: {state.overdue_tasks_count} مهمة\n"
                f"• المهام المجدولة اليوم: {state.today_tasks_count} مهمة ({state.today_estimated_minutes} دقيقة)\n\n"
                f"يمكنك البدء فوراً بالنقر على بطاقة الإجراء المرفقة أدناه!"
            )
        else:
            reply_text = (
                f"أنا معك لمساعدتك في مذاكرتك! نسبة إتقانك الحالية هي {state.overall_mastery:.0f}%، "
                f"وأهم خطوة لك الآن هي {what_to_study.recommendation.title}. "
                f"يمكنك سؤالي عن أي جزئية في مذكراتك أو طلب إعادة جدولة مهامك في أي وقت."
            )

    # 4. Attach Suggested Action Card if relevant
    suggested_action: Optional[CopilotActionItem] = None
    if is_state_query or "ماذا" in user_message or "أذاكر" in user_message or "علاج" in user_message or "جدول" in user_message or state.is_neglected:
        suggested_action = what_to_study.recommendation

    # 5. Determine Quick Prompts
    quick_prompts = [
        "ماذا يجب أن أذاكر الآن؟",
        "أعطني ملخص اليوم (Daily Briefing)",
        "اختبرني في أضعف مفهوم لدي",
    ]
    if state.is_neglected:
        quick_prompts.insert(0, "أعد توزيع المهام المتأخرة على جدولي")

    # 6. Persist to Database
    user_msg_record = CopilotMessage(
        user_id=student_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg_record)

    copilot_msg_record = CopilotMessage(
        user_id=student_id,
        role="copilot",
        content=reply_text,
        action_type=suggested_action.action_type if suggested_action else None,
        action_payload_json=json.dumps(suggested_action.payload) if suggested_action else None,
        citations_json=json.dumps(citations) if citations else None,
    )
    db.add(copilot_msg_record)
    await db.commit()

    return CopilotChatResponse(
        reply=reply_text,
        suggested_action=suggested_action,
        citations=citations,
        quick_prompts=quick_prompts[:4],
    )


# ==============================================================================
# 5. Action Execution: One-Click Plan Rebalance
# ==============================================================================

async def rebalance_neglected_tasks(
    db: AsyncSession,
    student_id: int
) -> CopilotRebalanceResponse:
    """
    One-click resolution for neglected study plans:
    Redistributes all overdue tasks evenly across the remaining days up to the exam date.
    """
    res_dict = await reschedule_overdue_tasks(db, student_id)
    rescheduled_count = res_dict.get("rescheduled_count", 0) if isinstance(res_dict, dict) else (res_dict or 0)

    # Fetch updated active plan
    plan_stmt = select(StudyPlan).where(StudyPlan.student_id == student_id, StudyPlan.is_active == True)
    plan = (await db.execute(plan_stmt)).scalars().first()
    target_date = plan.exam_date if plan else None

    if rescheduled_count > 0:
        msg = f"تم بنجاح إعادة توزيع {rescheduled_count} مهمة متأخرة على الأيام القادمة حتى موعد الامتحان."
    else:
        msg = "جدولك الدراسي منظم بالفعل ولا توجد أي مهام متأخرة بحاجة لإعادة توزيع."

    return CopilotRebalanceResponse(
        success=True,
        message=msg,
        rescheduled_count=rescheduled_count,
        new_target_date=target_date
    )
