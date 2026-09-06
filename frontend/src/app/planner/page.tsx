"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  GraduationCap,
  HelpCircle,
  Info,
  Layers,
  ListTodo,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { api, StudyPlan, StudyPlanTask, TodayPlanResponse, CalendarDayTasks } from "@/lib/api";

const ALL_WEEKDAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

const ACTIVITY_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  Remedial: {
    label: "جلسة علاجية مكثفة",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    icon: Zap,
  },
  Study: {
    label: "مذاكرة فصل أساسي",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    icon: BookOpen,
  },
  Review: {
    label: "مراجعة سريعة وتثبيت",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: RotateCcw,
  },
  Quiz: {
    label: "اختبار تقييمي",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    icon: GraduationCap,
  },
  "Mock Exam": {
    label: "امتحان محاكاة شامل",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
    icon: Target,
  },
};

export default function StudyPlannerPage() {
  const router = useRouter();

  // Core Data States
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [todayPlan, setTodayPlan] = useState<TodayPlanResponse | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDayTasks[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'today' | 'calendar' | 'all'
  const [activeTab, setActiveTab] = useState<"today" | "calendar" | "all">("today");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Operation States
  const [rescheduling, setRescheduling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Generator Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formSubjects, setFormSubjects] = useState<string[]>([]);
  const [formStudyTime, setFormStudyTime] = useState(720); // 12 hours total
  const [formDailyLimit, setFormDailyLimit] = useState(120); // 2 hours
  const [formPreferredDays, setFormPreferredDays] = useState<string[]>(ALL_WEEKDAYS);
  const [formPriority, setFormPriority] = useState<"weak_points_first" | "balanced" | "exam_readiness">("weak_points_first");

  // Load All Data
  const loadPlannerData = async () => {
    try {
      setLoading(true);
      const [activePlan, todayData, calData, docsData] = await Promise.all([
        api.planner.getActive().catch(() => null),
        api.planner.getToday().catch(() => null),
        api.planner.getCalendar().catch(() => []),
        api.documents.list().catch(() => []),
      ]);

      setPlan(activePlan);
      setTodayPlan(todayData);
      setCalendarDays(calData || []);

      if (docsData && docsData.length > 0) {
        const subs = Array.from(new Set(docsData.map((d: any) => d.subject).filter(Boolean))) as string[];
        setAvailableSubjects(subs.length > 0 ? subs : ["الفيزياء", "الكيمياء", "الأحياء"]);
        if (subs.length > 0 && formSubjects.length === 0) {
          setFormSubjects(subs);
        }
      }

      // Default selected calendar date to today or first available
      if (todayData?.date) {
        setSelectedCalendarDate(todayData.date);
      }
    } catch (err: any) {
      console.error("Failed to load study planner data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("studymind_token");
    if (!token) {
      router.replace("/");
      return;
    }

    // Default exam date to 3 weeks ahead
    const d = new Date();
    d.setDate(d.getDate() + 21);
    setFormDate(d.toISOString().split("T")[0]);

    loadPlannerData();
  }, [router]);

  // Handle Mark Complete / Toggle Task
  const handleToggleTaskStatus = async (task: StudyPlanTask) => {
    const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      const updated = await api.planner.updateTask(task.id, { status: newStatus });

      // Optimistic update in active plan
      if (plan) {
        const updatedTasks = plan.tasks.map((t) => (t.id === task.id ? updated : t));
        const compCount = updatedTasks.filter((t) => t.status === "COMPLETED").length;
        const total = updatedTasks.length;
        setPlan({
          ...plan,
          completed_tasks: compCount,
          progress_percentage: Math.round((compCount / Math.max(1, total)) * 100),
          tasks: updatedTasks,
        });
      }

      // Update today's plan if relevant
      if (todayPlan) {
        const updatedToday = todayPlan.tasks.map((t) => (t.id === task.id ? updated : t));
        const compToday = updatedToday.filter((t) => t.status === "COMPLETED").length;
        setTodayPlan({
          ...todayPlan,
          completed_tasks_today: compToday,
          today_progress_percentage: Math.round((compToday / Math.max(1, updatedToday.length)) * 100),
          tasks: updatedToday,
        });
      }

      // Update calendar days
      setCalendarDays((prev) =>
        prev.map((day) => {
          if (day.tasks.some((t) => t.id === task.id)) {
            const nextTasks = day.tasks.map((t) => (t.id === task.id ? updated : t));
            const cCount = nextTasks.filter((t) => t.status === "COMPLETED").length;
            return {
              ...day,
              completed_count: cCount,
              tasks: nextTasks,
            };
          }
          return day;
        })
      );
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "تعذر تحديث حالة المهمة." });
    }
  };

  // Handle Reschedule Overdue
  const handleRescheduleOverdue = async () => {
    try {
      setRescheduling(true);
      setActionFeedback(null);
      const res = await api.planner.rescheduleOverdue();
      setActionFeedback({ type: "success", text: res.message });
      await loadPlannerData();
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "فشلت إعادة جدولة المهام المتأخرة." });
    } finally {
      setRescheduling(false);
    }
  };

  // Handle Adaptive Sync
  const handleAdaptiveSync = async () => {
    try {
      setSyncing(true);
      setActionFeedback(null);
      const res = await api.planner.sync();
      setActionFeedback({ type: "success", text: res.message });
      await loadPlannerData();
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "فشلت المزامنة الذكية." });
    } finally {
      setSyncing(false);
    }
  };

  // Handle Generate Plan
  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate) {
      setActionFeedback({ type: "error", text: "يرجى تحديد موعد الامتحان." });
      return;
    }
    try {
      setGenerating(true);
      setActionFeedback(null);
      await api.planner.generate({
        exam_date: formDate,
        subjects: formSubjects.length > 0 ? formSubjects : availableSubjects,
        available_study_time: formStudyTime,
        daily_time_limit: formDailyLimit,
        preferred_days: formPreferredDays,
        priority: formPriority,
      });
      setIsModalOpen(false);
      setActionFeedback({ type: "success", text: "تم إنشاء جدول المذاكرة الذكي وتوزيعه بنجاح!" });
      await loadPlannerData();
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "فشل إنشاء الخطة الدراسية." });
    } finally {
      setGenerating(false);
    }
  };

  // Tasks of selected date in calendar
  const selectedDayTasks = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const day = calendarDays.find((d) => d.date === selectedCalendarDate);
    return day ? day.tasks : [];
  }, [calendarDays, selectedCalendarDate]);

  // Overdue count
  const overdueCount = useMemo(() => {
    if (!plan) return 0;
    const today = new Date().toISOString().split("T")[0];
    return plan.tasks.filter((t) => t.status === "PENDING" && t.scheduled_date < today).length;
  }, [plan]);

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 animate-pulse">
          <BrainCircuit className="w-8 h-8 animate-spin" />
        </div>
        <p className="text-slate-600 font-medium">جاري تحميل جدول المذاكرة الذكي وتفاصيل الخطة...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Notification / Action Feedback */}
      {actionFeedback && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm border transition-all ${
            actionFeedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {actionFeedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <p className="text-sm font-medium">{actionFeedback.text}</p>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200/60">
              <Sparkles className="w-3.5 h-3.5" />
              Intelligent Study Planner
            </span>
            {plan && plan.priority === "weak_points_first" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                أولوية نقاط الضعف
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            جدول المذاكرة الذكي والتكيفي
          </h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1">
            خطة متطورة تتكيف ديناميكياً مع أدائك في الاختبارات ومستوى إتقانك لكل مفهوم
          </p>
        </div>

        {/* Global Plan Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {overdueCount > 0 && (
            <button
              onClick={handleRescheduleOverdue}
              disabled={rescheduling}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all disabled:opacity-50"
              title="إعادة توزيع المهام التي لم تُنجز إلى أقرب أيام مذاكرة متاحة"
            >
              <RotateCcw className={`w-4 h-4 ${rescheduling ? "animate-spin" : ""}`} />
              جدولة المتأخرات ({overdueCount})
            </button>
          )}

          {plan && (
            <button
              onClick={handleAdaptiveSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all disabled:opacity-50"
              title="مزامنة جدولك فورياً مع مستوى إتقان المفاهيم الحالي"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              مزامنة تكيفية
            </button>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {plan ? "تعديل / إعادة توليد الخطة" : "توليد الخطة الذكية"}
          </button>
        </div>
      </div>

      {/* If No Plan Exists Yet */}
      {!plan ? (
        <div className="bg-gradient-to-b from-white to-slate-50 border border-slate-200 rounded-3xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
            لم تقم بإنشاء خطة دراسية بعد!
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
            يقوم محرك StudyMind بتحليل كافة مذكراتك ونقاط ضعفك في الكويزات، لتوليد جدول زمني يومي ذكي يضمن لك إنهاء المنهج ومراجعة المفاهيم الضعيفة قبل موعد الامتحان.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-brand-500/25 transition-transform hover:scale-105"
          >
            <Sparkles className="w-5 h-5" />
            توليد خطة مذاكرة ذكية الآن
          </button>
        </div>
      ) : (
        <>
          {/* Exam Countdown & Progress Overview Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {/* Exam Countdown Card */}
            <div className="md:col-span-2 bg-gradient-to-br from-brand-600 to-sky-700 rounded-2xl p-6 text-white shadow-lg shadow-brand-500/15 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 opacity-10">
                <Calendar className="w-40 h-40" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/15 backdrop-blur-sm">
                    العد التنازلي للامتحان
                  </span>
                  <span className="text-xs text-brand-100">
                    {plan.exam_date}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl sm:text-5xl font-black tracking-tight">
                    {plan.days_until_exam}
                  </span>
                  <span className="text-lg font-bold text-brand-100">يوم متبقي</span>
                </div>
                <p className="text-xs sm:text-sm text-brand-100/90 mt-1 line-clamp-1 font-medium">
                  {plan.title}
                </p>
              </div>

              {/* Progress Bar inside Card */}
              <div className="relative z-10 mt-6 pt-4 border-t border-white/15">
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span>نسبة إنجاز الخطة</span>
                  <span>{plan.progress_percentage}%</span>
                </div>
                <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${plan.progress_percentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Metric 1: Tasks Completed */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">إجمالي المهام</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">
                    {plan.completed_tasks}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">/ {plan.total_tasks} مهمة</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {plan.total_tasks - plan.completed_tasks} مهمة متبقية للإتمام
                </p>
              </div>
              <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" />
                استمر! كل مهمة تزيد جاهزيتك
              </div>
            </div>

            {/* Quick Metric 2: Today's Time & Load */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">مهام اليوم</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">
                    {todayPlan?.completed_tasks_today || 0}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    / {todayPlan?.total_tasks_today || 0} منجزة اليوم
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  المتبقي: {todayPlan ? Math.max(0, (todayPlan.total_tasks_today - todayPlan.completed_tasks_today)) : 0} مهمة ({todayPlan?.estimated_total_minutes || 0} دقيقة)
                </p>
              </div>
              <div className="text-[11px] font-medium text-blue-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                حدك اليومي: {plan.daily_time_limit} دقيقة
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveTab("today")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "today"
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ListTodo className="w-4 h-4" />
              خطة اليوم
              {todayPlan && todayPlan.total_tasks_today > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-brand-100 text-brand-700">
                  {todayPlan.completed_tasks_today}/{todayPlan.total_tasks_today}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("calendar")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "calendar"
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              التقويم الدراسي التفاعلي
              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                {calendarDays.length} يوم
              </span>
            </button>

            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "all"
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Layers className="w-4 h-4" />
              كافة مهام الخطة ({plan.tasks.length})
            </button>
          </div>

          {/* TAB 1: Today's Plan */}
          {activeTab === "today" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>مهام اليوم: {todayPlan?.day_name}</span>
                    <span className="text-xs text-slate-500 font-normal">({todayPlan?.date})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    المدة التقديرية الإجمالية: {todayPlan?.estimated_total_minutes || 0} دقيقة
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-left sm:text-right">
                    <span className="text-xs font-semibold text-slate-600">
                      إنجاز اليوم: {todayPlan?.today_progress_percentage || 0}%
                    </span>
                  </div>
                  <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full transition-all"
                      style={{ width: `${todayPlan?.today_progress_percentage || 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {(!todayPlan || todayPlan.tasks.length === 0) ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mb-1">
                    لا توجد مهام مجدولة لليوم!
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                    إما أن اليوم يوم راحة مفضل لديك، أو أنك أنهيت كافة مهام اليوم بنجاح. يمكنك استعراض التقويم للتحضير للأيام القادمة.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {todayPlan.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggleTaskStatus}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Interactive Calendar */}
          {activeTab === "calendar" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Calendar Grid (2 Cols on Large) */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-brand-600" />
                    خريطة الأيام الدراسية
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> مكتمل
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-500 inline-block" /> مجدول
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> متأخر
                    </span>
                  </div>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {calendarDays.map((cDay) => {
                    const isSelected = selectedCalendarDate === cDay.date;
                    const isFullyCompleted = cDay.completed_count === cDay.tasks_count && cDay.tasks_count > 0;
                    return (
                      <button
                        key={cDay.date}
                        onClick={() => setSelectedCalendarDate(cDay.date)}
                        className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between min-h-[90px] relative ${
                          isSelected
                            ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/20 shadow-sm"
                            : cDay.is_overdue
                            ? "border-rose-200 bg-rose-50/30 hover:border-rose-300"
                            : isFullyCompleted
                            ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-slate-900">
                            {cDay.day_name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {cDay.date.slice(5)}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between w-full">
                          <span className="text-[11px] text-slate-600 font-medium">
                            {cDay.completed_count}/{cDay.tasks_count} مهمة
                          </span>
                          <div className="flex gap-1">
                            {cDay.is_overdue && (
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                            )}
                            {isFullyCompleted ? (
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-brand-500" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Side Panel: Tasks for Selected Date */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-brand-600" />
                    مهام يوم: {selectedCalendarDate || "اختر يوماً"}
                  </h4>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                    {selectedDayTasks.length} مهام
                  </span>
                </div>

                {selectedDayTasks.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">
                    لا توجد مهام مسجلة لهذا اليوم. اضغط على أي يوم في التقويم لعرض مهامه.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                    {selectedDayTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        compact
                        onToggle={handleToggleTaskStatus}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: All Tasks Breakdown */}
          {activeTab === "all" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  كافة مهام الخطة الدراسية ({plan.tasks.length} مهمة)
                </h3>
                <span className="text-xs text-slate-500">
                  مرتبة زمنياً حسب أيام الجدول
                </span>
              </div>

              <div className="space-y-3">
                {plan.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={handleToggleTaskStatus}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Plan Generator & Customizer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    توليد جدول المذاكرة الذكي
                  </h3>
                  <p className="text-xs text-slate-500">
                    خصص معايير خطتك الدراسية ليتولى الذكاء الاصطناعي توزيعها
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGeneratePlan} className="space-y-5">
              {/* Exam Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  موعد الامتحان المستهدف *
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Priority Strategy */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  استراتيجية وأولوية الخطة *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormPriority("weak_points_first")}
                    className={`p-3 rounded-xl border text-right text-xs font-semibold transition-all ${
                      formPriority === "weak_points_first"
                        ? "border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-400/20"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 mb-1">
                      <Zap className="w-3.5 h-3.5 text-rose-500" />
                      نقاط الضعف أولاً
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal leading-tight">
                      تركيز الجلسات العلاجية على المفاهيم غير المتقنة
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority("balanced")}
                    className={`p-3 rounded-xl border text-right text-xs font-semibold transition-all ${
                      formPriority === "balanced"
                        ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-400/20"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 mb-1">
                      <Layers className="w-3.5 h-3.5 text-brand-500" />
                      خطة متوازنة
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal leading-tight">
                      توزيع متساوي بين الشرح والمراجعات والكويزات
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority("exam_readiness")}
                    className={`p-3 rounded-xl border text-right text-xs font-semibold transition-all ${
                      formPriority === "exam_readiness"
                        ? "border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-400/20"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 mb-1">
                      <Target className="w-3.5 h-3.5 text-amber-500" />
                      جاهزية الامتحان
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal leading-tight">
                      تكثيف الأسئلة ونماذج المحاكاة الشاملة
                    </div>
                  </button>
                </div>
              </div>

              {/* Daily Limit & Total Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الحد الأقصى اليومي للمذاكرة (بالدقائق)
                  </label>
                  <select
                    value={formDailyLimit}
                    onChange={(e) => setFormDailyLimit(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value={60}>60 دقيقة (ساعة واحدة)</option>
                    <option value={90}>90 دقيقة (ساعة ونصف)</option>
                    <option value={120}>120 دقيقة (ساعتان - موصى به)</option>
                    <option value={180}>180 دقيقة (3 ساعات)</option>
                    <option value={240}>240 دقيقة (4 ساعات)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    إجمالي ساعات المذاكرة المتوقعة
                  </label>
                  <select
                    value={formStudyTime}
                    onChange={(e) => setFormStudyTime(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value={360}>6 ساعات</option>
                    <option value={600}>10 ساعات</option>
                    <option value={720}>12 ساعة (موصى به)</option>
                    <option value={1200}>20 ساعة</option>
                    <option value={1800}>30 ساعة</option>
                  </select>
                </div>
              </div>

              {/* Preferred Study Days */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  أيام المذاكرة المفضلة أسبوعياً
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_WEEKDAYS.map((day) => {
                    const isChecked = formPreferredDays.includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => {
                          if (isChecked) {
                            if (formPreferredDays.length > 1) {
                              setFormPreferredDays(formPreferredDays.filter((d) => d !== day));
                            }
                          } else {
                            setFormPreferredDays([...formPreferredDays, day]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          isChecked
                            ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-brand-500/20 transition-all disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري تحليل المحتوى وتوليد الخطة...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      إنشاء الخطة الدراسية الآن
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Individual Task Card
function TaskCard({
  task,
  compact = false,
  onToggle,
}: {
  task: StudyPlanTask;
  compact?: boolean;
  onToggle: (task: StudyPlanTask) => void;
}) {
  const badge = ACTIVITY_BADGES[task.activity_type] || ACTIVITY_BADGES["Study"];
  const BadgeIcon = badge.icon;
  const isCompleted = task.status === "COMPLETED";

  // Action link for "Start"
  let startHref = "/library";
  if (task.document_id) {
    startHref = `/study/${task.document_id}`;
  } else if (task.activity_type === "Quiz" || task.activity_type === "Mock Exam") {
    startHref = "/quizzes";
  }

  return (
    <div
      className={`rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isCompleted
          ? "bg-slate-50/70 border-slate-200/80 opacity-80"
          : "bg-white border-slate-200 hover:border-brand-300 shadow-sm"
      } ${compact ? "p-3.5" : "p-4 sm:p-5"}`}
    >
      {/* Left Details */}
      <div className="flex items-start gap-3">
        {/* Toggle Complete Button */}
        <button
          onClick={() => onToggle(task)}
          className={`p-1.5 rounded-xl transition-colors mt-0.5 shrink-0 ${
            isCompleted
              ? "text-emerald-600 hover:text-emerald-700 bg-emerald-50"
              : "text-slate-300 hover:text-brand-600 hover:bg-slate-100"
          }`}
          title={isCompleted ? "تحديد كغير منجز" : "تحديد كمكتمل"}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
            >
              <BadgeIcon className="w-3 h-3" />
              {task.activity_label || badge.label}
            </span>

            {task.subject && (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {task.subject}
              </span>
            )}

            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {task.duration_minutes} دقيقة
            </span>

            {task.recommended_questions_count > 0 && (
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                {task.recommended_questions_count} أسئلة
              </span>
            )}
          </div>

          <h4
            className={`text-sm sm:text-base font-bold text-slate-900 ${
              isCompleted ? "line-through text-slate-400" : ""
            }`}
          >
            {task.concept_name || task.chapter || task.subject || "مهمة دراسية"}
          </h4>

          {task.chapter && task.concept_name && (
            <p className="text-xs text-slate-500 mt-0.5">
              فصل: {task.chapter}
            </p>
          )}

          {task.notes && (
            <p className="text-xs text-brand-700 bg-brand-50/70 border border-brand-100 rounded-lg px-2.5 py-1 mt-2 inline-block font-medium">
              💡 {task.notes}
            </p>
          )}
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        <Link
          href={startHref}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          ابدأ الآن
        </Link>
      </div>
    </div>
  );
}
