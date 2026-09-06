import json
import logging
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from app.models.user import User
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.quiz import Quiz, StudentSubmission
from app.models.study_plan import StudyPlan, StudyPlanTask
from app.schemas.study_plan import (
    StudyPlanGenerateRequest,
    StudyPlanUpdateRequest,
    StudyPlanResponse,
    StudyPlanTaskResponse,
    StudyPlanTaskUpdate,
    TodayPlanResponse,
    CalendarDayTasks,
    ACTIVITY_LABELS
)

logger = logging.getLogger(__name__)

ARABIC_WEEKDAYS = {
    0: "الاثنين",
    1: "الثلاثاء",
    2: "الأربعاء",
    3: "الخميس",
    4: "الجمعة",
    5: "السبت",
    6: "الأحد"
}

from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import instance_state

def get_day_arabic_name(d: date) -> str:
    return ARABIC_WEEKDAYS.get(d.weekday(), "")

def build_task_response(task: StudyPlanTask, doc_title: Optional[str] = None) -> StudyPlanTaskResponse:
    dt = doc_title
    if not dt:
        try:
            state = instance_state(task)
            if "document" in state.dict and state.dict["document"] is not None:
                dt = state.dict["document"].title
        except Exception:
            dt = None

    return StudyPlanTaskResponse(
        id=task.id,
        plan_id=task.plan_id,
        scheduled_date=task.scheduled_date,
        day_number=task.day_number,
        subject=task.subject,
        document_id=task.document_id,
        document_title=dt,
        chapter=task.chapter,
        concept_id=task.concept_id,
        concept_name=task.concept_name,
        activity_type=task.activity_type,
        activity_label=ACTIVITY_LABELS.get(task.activity_type, task.activity_type),
        duration_minutes=task.duration_minutes,
        recommended_questions_count=task.recommended_questions_count,
        status=task.status,
        completed_at=task.completed_at,
        notes=task.notes,
        order_index=task.order_index
    )

async def generate_intelligent_study_plan(
    db: AsyncSession,
    student_id: int,
    req: StudyPlanGenerateRequest
) -> StudyPlanResponse:
    """
    Analyzes student documents, weak/strong concepts, and quiz performance
    to generate an intelligent, persistent, and adaptive study plan in the database.
    """
    today = date.today()
    exam_target = req.exam_date
    if exam_target <= today:
        # If exam date is past or today, set it to at least 14 days ahead
        exam_target = today + timedelta(days=14)

    days_until_exam = (exam_target - today).days

    # 1. Fetch student's documents
    doc_stmt = select(Document).where(Document.owner_id == student_id)
    if req.subjects and len(req.subjects) > 0:
        doc_stmt = doc_stmt.where(Document.subject.in_(req.subjects))
    doc_res = await db.execute(doc_stmt)
    documents = doc_res.scalars().all()

    # Determine subjects list
    subjects = req.subjects if req.subjects else list({d.subject for d in documents if d.subject})
    if not subjects:
        subjects = ["المواد الدراسية"]

    # 2. Fetch concepts and student mastery for analysis
    doc_ids = [d.id for d in documents]
    concepts_by_subject: Dict[str, List[Concept]] = {s: [] for s in subjects}
    chapters_by_doc: Dict[int, List[str]] = {}

    if doc_ids:
        c_stmt = select(Concept).where(Concept.document_id.in_(doc_ids))
        c_res = await db.execute(c_stmt)
        all_concepts = c_res.scalars().all()
        for c in all_concepts:
            subj = c.subject or (c.document.subject if c.document else subjects[0])
            if subj in concepts_by_subject:
                concepts_by_subject[subj].append(c)
            elif subjects:
                concepts_by_subject[subjects[0]].append(c)

        # Get distinct chapters per document
        ch_stmt = select(DocumentChunk.document_id, DocumentChunk.chapter).where(
            DocumentChunk.document_id.in_(doc_ids)
        ).distinct()
        ch_res = await db.execute(ch_stmt)
        for d_id, ch in ch_res.all():
            if ch:
                chapters_by_doc.setdefault(d_id, []).append(ch)

    # Analyze Weak vs Strong concepts
    m_stmt = select(StudentMastery).where(StudentMastery.student_id == student_id)
    m_res = await db.execute(m_stmt)
    masteries = {m.concept_id: m for m in m_res.scalars().all()}

    weak_concept_ids = {
        cid for cid, m in masteries.items()
        if (m.is_weak_point or m.mastery_score < 70.0) and not m.is_proficient
    }
    strong_concept_ids = {
        cid for cid, m in masteries.items()
        if m.mastery_score >= 80.0 or m.is_proficient
    }

    # 3. Calculate Available Calendar Study Days
    preferred_days = set(req.preferred_days) if req.preferred_days else set(ARABIC_WEEKDAYS.values())
    available_calendar_days: List[Tuple[date, int]] = []  # (date, day_number)
    
    curr = today
    day_num = 1
    while curr <= exam_target:
        day_name = get_day_arabic_name(curr)
        if day_name in preferred_days:
            available_calendar_days.append((curr, day_num))
            day_num += 1
        curr += timedelta(days=1)

    if not available_calendar_days:
        # Fallback if no days matched
        curr = today
        for i in range(min(14, days_until_exam + 1)):
            available_calendar_days.append((curr + timedelta(days=i), i + 1))

    # 4. Generate Task Queue based on Priority & Material Analysis
    task_queue: List[Dict[str, Any]] = []

    # Priority A: Weak Concepts get Remedial tasks early
    for subj in subjects:
        subj_concepts = concepts_by_subject.get(subj, [])
        for c in subj_concepts:
            if c.id in weak_concept_ids:
                task_queue.append({
                    "subject": subj,
                    "document_id": c.document_id,
                    "chapter": c.chapter,
                    "concept_id": c.id,
                    "concept_name": c.name,
                    "activity_type": "Remedial",
                    "duration_minutes": 35,
                    "recommended_questions_count": 5,
                    "notes": f"جلسة علاجية مكثفة لعلاج نقطة الضعف في ({c.name}).",
                    "priority_weight": 1  # highest
                })

    # Priority B: Remaining Chapters / Documents get Study & Quiz tasks
    for doc in documents:
        subj = doc.subject or subjects[0]
        doc_chapters = chapters_by_doc.get(doc.id, [doc.title])
        for ch in doc_chapters:
            task_queue.append({
                "subject": subj,
                "document_id": doc.id,
                "chapter": ch,
                "concept_id": None,
                "concept_name": None,
                "activity_type": "Study",
                "duration_minutes": 40,
                "recommended_questions_count": 5,
                "notes": f"مذاكرة وتلخيص نصوص فصل ({ch}) من المذكرة.",
                "priority_weight": 2
            })
            task_queue.append({
                "subject": subj,
                "document_id": doc.id,
                "chapter": ch,
                "concept_id": None,
                "concept_name": None,
                "activity_type": "Quiz",
                "duration_minutes": 20,
                "recommended_questions_count": 10,
                "notes": f"كويز تدريبي لقياس مدى استيعاب ({ch}).",
                "priority_weight": 3
            })

    # Priority C: Strong & Normal Concepts get spaced Review
    for subj in subjects:
        subj_concepts = concepts_by_subject.get(subj, [])
        for c in subj_concepts:
            if c.id in strong_concept_ids:
                task_queue.append({
                    "subject": subj,
                    "document_id": c.document_id,
                    "chapter": c.chapter,
                    "concept_id": c.id,
                    "concept_name": c.name,
                    "activity_type": "Review",
                    "duration_minutes": 15,
                    "recommended_questions_count": 5,
                    "notes": f"مراجعة سريعة لتثبيت مفهوم ({c.name}) المتقن.",
                    "priority_weight": 4
                })

    # If queue is small, generate balanced study & review tasks
    if len(task_queue) < len(available_calendar_days):
        for subj in subjects:
            task_queue.append({
                "subject": subj,
                "document_id": documents[0].id if documents else None,
                "chapter": "مراجعة شاملة",
                "concept_id": None,
                "concept_name": None,
                "activity_type": "Review",
                "duration_minutes": 30,
                "recommended_questions_count": 10,
                "notes": f"جلسة مراجعة مركزة لأسئلة الامتحانات في {subj}.",
                "priority_weight": 3
            })

    # Sort queue by priority strategy
    if req.priority == "weak_points_first":
        task_queue.sort(key=lambda x: x["priority_weight"])
    elif req.priority == "exam_readiness":
        task_queue.sort(key=lambda x: (x["activity_type"] not in ["Quiz", "Mock Exam"], x["priority_weight"]))

    # 5. Distribute Tasks Across Available Calendar Days respecting daily_time_limit
    daily_limit = req.daily_time_limit
    assigned_tasks: List[StudyPlanTask] = []
    
    day_idx = 0
    day_time_spent = 0
    current_day_date, current_day_num = available_calendar_days[0]
    day_order = 0

    for t_data in task_queue:
        dur = t_data["duration_minutes"]
        if day_time_spent + dur > daily_limit:
            # Move to next study day
            day_idx += 1
            if day_idx >= len(available_calendar_days):
                # Cycle or cap at the final days
                day_idx = len(available_calendar_days) - 1
                break
            current_day_date, current_day_num = available_calendar_days[day_idx]
            day_time_spent = 0
            day_order = 0

        # Don't schedule regular study on the very last day (reserved for Mock Exam)
        if day_idx == len(available_calendar_days) - 1 and len(available_calendar_days) > 2:
            # Reserve last day
            pass

        assigned_tasks.append(StudyPlanTask(
            student_id=student_id,
            scheduled_date=current_day_date,
            day_number=current_day_num,
            subject=t_data["subject"],
            document_id=t_data.get("document_id"),
            chapter=t_data.get("chapter"),
            concept_id=t_data.get("concept_id"),
            concept_name=t_data.get("concept_name"),
            activity_type=t_data["activity_type"],
            duration_minutes=dur,
            recommended_questions_count=t_data.get("recommended_questions_count", 5),
            status="PENDING",
            notes=t_data.get("notes"),
            order_index=day_order
        ))
        day_time_spent += dur
        day_order += 1

    # Add Final Mock Exam on the last study day
    last_date, last_day_num = available_calendar_days[-1]
    for s_idx, subj in enumerate(subjects[:2]):
        assigned_tasks.append(StudyPlanTask(
            student_id=student_id,
            scheduled_date=last_date,
            day_number=last_day_num,
            subject=subj,
            document_id=documents[0].id if documents else None,
            chapter="شامل المنهج",
            concept_id=None,
            concept_name=None,
            activity_type="Mock Exam",
            duration_minutes=60,
            recommended_questions_count=25,
            status="PENDING",
            notes=f"امتحان تجريبي شامل لمحاكاة بيئة امتحان نهاية العام في {subj}.",
            order_index=s_idx
        ))

    # 6. Deactivate old plans and persist new StudyPlan
    await db.execute(
        update(StudyPlan).where(StudyPlan.student_id == student_id).values(is_active=False)
    )

    plan_title = req.title if req.title else f"خطة الاستعداد لامتحان {', '.join(subjects[:2])}"
    plan = StudyPlan(
        student_id=student_id,
        title=plan_title,
        exam_date=exam_target,
        subjects_json=json.dumps(subjects, ensure_ascii=False),
        available_study_time=req.available_study_time,
        preferred_days_json=json.dumps(list(preferred_days), ensure_ascii=False),
        daily_time_limit=req.daily_time_limit,
        priority=req.priority,
        is_active=True,
        total_tasks=len(assigned_tasks),
        completed_tasks=0,
        progress_percentage=0.0
    )
    db.add(plan)
    await db.flush()

    for task in assigned_tasks:
        task.plan_id = plan.id
        db.add(task)

    await db.commit()
    await db.refresh(plan)

    return await get_active_study_plan(db, student_id)

async def get_active_study_plan(
    db: AsyncSession,
    student_id: int
) -> Optional[StudyPlanResponse]:
    """Retrieves the active persistent study plan with exam countdown and progress."""
    stmt = (
        select(StudyPlan)
        .where(StudyPlan.student_id == student_id, StudyPlan.is_active == True)
        .order_by(StudyPlan.id.desc())
    )
    res = await db.execute(stmt)
    plan = res.scalars().first()
    if not plan:
        return None

    # Load tasks
    t_stmt = (
        select(StudyPlanTask)
        .options(selectinload(StudyPlanTask.document))
        .where(StudyPlanTask.plan_id == plan.id)
        .order_by(StudyPlanTask.scheduled_date.asc(), StudyPlanTask.order_index.asc())
    )
    t_res = await db.execute(t_stmt)
    tasks = t_res.scalars().all()

    today = date.today()
    days_left = max(0, (plan.exam_date - today).days)

    task_responses = [build_task_response(t) for t in tasks]
    try:
        subjects_list = json.loads(plan.subjects_json)
    except Exception:
        subjects_list = []
    try:
        pref_days = json.loads(plan.preferred_days_json)
    except Exception:
        pref_days = []

    return StudyPlanResponse(
        id=plan.id,
        student_id=plan.student_id,
        title=plan.title,
        exam_date=plan.exam_date,
        days_until_exam=days_left,
        subjects=subjects_list,
        available_study_time=plan.available_study_time,
        preferred_days=pref_days,
        daily_time_limit=plan.daily_time_limit,
        priority=plan.priority,
        is_active=plan.is_active,
        total_tasks=plan.total_tasks,
        completed_tasks=plan.completed_tasks,
        progress_percentage=plan.progress_percentage,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        tasks=task_responses
    )

async def get_today_tasks(
    db: AsyncSession,
    student_id: int
) -> TodayPlanResponse:
    """Returns the study tasks scheduled for today with completion metrics."""
    today = date.today()
    stmt = (
        select(StudyPlanTask)
        .options(selectinload(StudyPlanTask.document))
        .where(
            StudyPlanTask.student_id == student_id,
            StudyPlanTask.scheduled_date == today
        )
        .order_by(StudyPlanTask.order_index.asc())
    )
    res = await db.execute(stmt)
    tasks = res.scalars().all()

    total_today = len(tasks)
    completed_today = sum(1 for t in tasks if t.status == "COMPLETED")
    pct_today = round((completed_today / max(1, total_today)) * 100, 1) if total_today > 0 else 0.0
    est_minutes = sum(t.duration_minutes for t in tasks)

    return TodayPlanResponse(
        date=today,
        day_name=get_day_arabic_name(today),
        total_tasks_today=total_today,
        completed_tasks_today=completed_today,
        today_progress_percentage=pct_today,
        estimated_total_minutes=est_minutes,
        tasks=[build_task_response(t) for t in tasks]
    )

async def get_calendar_tasks(
    db: AsyncSession,
    student_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[CalendarDayTasks]:
    """Returns tasks grouped by day for calendar display."""
    today = date.today()
    stmt = select(StudyPlanTask).options(selectinload(StudyPlanTask.document)).where(StudyPlanTask.student_id == student_id)
    if start_date:
        stmt = stmt.where(StudyPlanTask.scheduled_date >= start_date)
    if end_date:
        stmt = stmt.where(StudyPlanTask.scheduled_date <= end_date)

    stmt = stmt.order_by(StudyPlanTask.scheduled_date.asc(), StudyPlanTask.order_index.asc())
    res = await db.execute(stmt)
    tasks = res.scalars().all()

    grouped: Dict[date, List[StudyPlanTask]] = {}
    for t in tasks:
        grouped.setdefault(t.scheduled_date, []).append(t)

    calendar_days: List[CalendarDayTasks] = []
    for d, d_tasks in grouped.items():
        comp_count = sum(1 for t in d_tasks if t.status == "COMPLETED")
        is_overdue = (d < today and comp_count < len(d_tasks))
        calendar_days.append(CalendarDayTasks(
            date=d,
            day_name=get_day_arabic_name(d),
            tasks_count=len(d_tasks),
            completed_count=comp_count,
            is_overdue=is_overdue,
            tasks=[build_task_response(t) for t in d_tasks]
        ))

    return calendar_days

async def update_task_status(
    db: AsyncSession,
    student_id: int,
    task_id: int,
    update_data: StudyPlanTaskUpdate
) -> StudyPlanTaskResponse:
    """Updates task status (Mark Complete, Reschedule, Notes) and recalculates plan progress."""
    stmt = select(StudyPlanTask).options(selectinload(StudyPlanTask.document)).where(StudyPlanTask.id == task_id)
    res = await db.execute(stmt)
    task = res.scalars().first()
    if not task:
        raise ValueError("المهمة غير موجودة.")
    if task.student_id != student_id:
        raise PermissionError("لا تملك صلاحية تعديل هذه المهمة.")

    if update_data.status:
        task.status = update_data.status
        if update_data.status == "COMPLETED":
            task.completed_at = datetime.utcnow()
        elif update_data.status == "PENDING":
            task.completed_at = None

    if update_data.scheduled_date:
        task.scheduled_date = update_data.scheduled_date
    if update_data.duration_minutes is not None:
        task.duration_minutes = update_data.duration_minutes
    if update_data.notes is not None:
        task.notes = update_data.notes

    await db.flush()

    # Recalculate plan total and completed tasks
    plan = await db.get(StudyPlan, task.plan_id)
    if plan:
        count_stmt = select(
            func.count(StudyPlanTask.id),
            func.count(func.nullif(StudyPlanTask.status != "COMPLETED", True))
        ).where(StudyPlanTask.plan_id == plan.id)
        c_res = await db.execute(count_stmt)
        row = c_res.first()
        if row:
            total = row[0] or 0
            completed = row[1] or 0
            plan.total_tasks = total
            plan.completed_tasks = completed
            plan.progress_percentage = round((completed / max(1, total)) * 100, 1)

    await db.commit()
    await db.refresh(task)
    return build_task_response(task)

async def reschedule_overdue_tasks(
    db: AsyncSession,
    student_id: int
) -> Dict[str, Any]:
    """
    Reschedules all overdue pending tasks (scheduled_date < today)
    forward to the earliest available study days.
    """
    today = date.today()
    # Find active plan
    p_stmt = select(StudyPlan).where(StudyPlan.student_id == student_id, StudyPlan.is_active == True)
    p_res = await db.execute(p_stmt)
    plan = p_res.scalars().first()
    if not plan:
        return {"rescheduled_count": 0, "message": "لا توجد خطة دراسية نشطة."}

    # Find overdue tasks
    stmt = (
        select(StudyPlanTask)
        .where(
            StudyPlanTask.plan_id == plan.id,
            StudyPlanTask.scheduled_date < today,
            StudyPlanTask.status.in_(["PENDING", "OVERDUE"])
        )
        .order_by(StudyPlanTask.scheduled_date.asc())
    )
    res = await db.execute(stmt)
    overdue_tasks = res.scalars().all()

    if not overdue_tasks:
        return {"rescheduled_count": 0, "message": "رائع! لا توجد مهام متأخرة تحتاج إعادة جدولة."}

    # Move overdue tasks starting from today onwards
    target_date = today
    day_count = 0
    daily_limit = plan.daily_time_limit
    current_load = 0

    for task in overdue_tasks:
        task.scheduled_date = target_date
        task.status = "PENDING"
        task.notes = (task.notes or "") + " (تمت إعادة جدولتها تلقائياً)"
        current_load += task.duration_minutes
        day_count += 1
        if current_load >= daily_limit:
            target_date += timedelta(days=1)
            current_load = 0

    await db.commit()
    return {
        "rescheduled_count": len(overdue_tasks),
        "message": f"تمت إعادة جدولة {len(overdue_tasks)} مهمة متأخرة بنجاح إلى الأيام القادمة."
    }

async def sync_plan_with_student_performance(
    db: AsyncSession,
    student_id: int
) -> Dict[str, Any]:
    """
    Auto-adaptive plan update:
    - If concept mastery improved (>=75% or is_proficient): reduces review duration/frequency.
    - If concept mastery dropped (<70%): injects remedial tasks into upcoming days.
    """
    p_stmt = select(StudyPlan).where(StudyPlan.student_id == student_id, StudyPlan.is_active == True)
    p_res = await db.execute(p_stmt)
    plan = p_res.scalars().first()
    if not plan:
        return {"updated": False, "message": "لا توجد خطة نشطة للمزامنة."}

    today = date.today()

    # 1. Fetch current concept masteries
    m_stmt = select(StudentMastery, Concept).join(Concept, StudentMastery.concept_id == Concept.id).where(
        StudentMastery.student_id == student_id
    )
    m_res = await db.execute(m_stmt)
    masteries = m_res.all()

    modified_count = 0
    injected_count = 0

    for mastery, concept in masteries:
        # If mastered: reduce review duration on future tasks
        if mastery.is_proficient or mastery.mastery_score >= 75.0:
            future_tasks_stmt = select(StudyPlanTask).where(
                StudyPlanTask.plan_id == plan.id,
                StudyPlanTask.concept_id == concept.id,
                StudyPlanTask.scheduled_date >= today,
                StudyPlanTask.status == "PENDING"
            )
            f_res = await db.execute(future_tasks_stmt)
            tasks = f_res.scalars().all()
            for t in tasks:
                if t.activity_type == "Remedial":
                    t.activity_type = "Review"
                    t.duration_minutes = 15
                    t.notes = "تم تقليص المراجعة لتفوقك وإتقانك لهذا المفهوم بنجاح 🎯"
                    modified_count += 1
                elif t.duration_minutes > 20:
                    t.duration_minutes = 15
                    modified_count += 1

        # If weak: ensure upcoming remedial task exists
        elif mastery.is_weak_point or mastery.mastery_score < 70.0:
            check_remedial_stmt = select(func.count(StudyPlanTask.id)).where(
                StudyPlanTask.plan_id == plan.id,
                StudyPlanTask.concept_id == concept.id,
                StudyPlanTask.scheduled_date >= today,
                StudyPlanTask.activity_type == "Remedial",
                StudyPlanTask.status == "PENDING"
            )
            c_res = await db.execute(check_remedial_stmt)
            has_remedial = (c_res.scalar() or 0) > 0

            if not has_remedial:
                # Inject a remedial task for tomorrow or today
                target_date = today + timedelta(days=1)
                new_task = StudyPlanTask(
                    plan_id=plan.id,
                    student_id=student_id,
                    scheduled_date=target_date,
                    day_number=1,
                    subject=concept.subject or "المادة الدراسية",
                    document_id=concept.document_id,
                    chapter=concept.chapter,
                    concept_id=concept.id,
                    concept_name=concept.name,
                    activity_type="Remedial",
                    duration_minutes=35,
                    recommended_questions_count=5,
                    status="PENDING",
                    notes="تمت إضافة هذه الجلسة العلاجية تلقائياً لتراجع نسبة الإتقان مؤخراً ⚡",
                    order_index=0
                )
                db.add(new_task)
                plan.total_tasks += 1
                injected_count += 1

    if modified_count > 0 or injected_count > 0:
        # Recompute progress
        plan.progress_percentage = round((plan.completed_tasks / max(1, plan.total_tasks)) * 100, 1)
        await db.commit()

    return {
        "updated": True,
        "modified_tasks": modified_count,
        "injected_remedial_tasks": injected_count,
        "message": f"تم تحديث الخطة تكيفياً: تقليص {modified_count} مهمة وإضافة {injected_count} جلسة علاجية."
    }
