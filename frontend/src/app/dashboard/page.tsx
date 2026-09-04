"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListTodo,
  Loader2,
  PlayCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";

interface DailyTask {
  id: string;
  text: string;
  completed: boolean;
}

interface QuickChallengeQuestion {
  question_id: number;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  source_page?: number;
  document_title: string;
  subject?: string;
}

const DAILY_STUDY_TIPS = [
  {
    title: "تقنية فاينمان للاستيعاب العميق",
    tip: "حاول دائماً شرح المفهوم الذي تذاكره بأسلوب مبسط جداً وكأنك تشرحه لطفل في العاشرة. إذا تعثرت في الشرح، فذلك يحدد بدقة النقطة التي تحتاج لإعادة قراءتها في المذكرة.",
    category: "أساليب المذاكرة",
  },
  {
    title: "التكرار المتباعد (Spaced Repetition)",
    tip: "مراجعة المعلومة لمدة 10 دقائق بعد يوم، ثم بعد 3 أيام، ثم بعد أسبوع، تثبتها في الذاكرة طويلة الأمد أكثر بكثير من المذاكرة المتواصلة لساعات قبل الامتحان بيوم.",
    category: "قوة الذاكرة",
  },
  {
    title: "الاسترجاع النشط (Active Recall)",
    tip: "لا تكتفِ بإعادة قراءة الصفحات؛ أغلق المذكرة واسأل نفسك: 'ما هي أهم 3 أفكار في هذا الدرس؟' أو اطلب من المعلم الذكي توليد كويز سريع لاختبار فهمك.",
    category: "الامتحانات",
  },
  {
    title: "قوة النوم في تثبيت الذاكرة",
    tip: "أثناء النوم العميق، يقوم المخ بنقل المعلومات من الذاكرة قصيرة المدى إلى الذاكرة الدائمة. المذاكرة المنتظمة مع 7-8 ساعات نوم تعادل مضاعفة ساعات المذاكرة المرهقة.",
    category: "الصحة والتركيز",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Proposal 3: Quick 60-Second Challenge State
  const [challenge, setChallenge] = useState<QuickChallengeQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  // Proposal 4: Daily Goals & To-Do List State
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [newTaskInput, setNewTaskInput] = useState("");

  // Proposal 7: Daily Tip
  const [dailyTipIndex, setDailyTipIndex] = useState(0);

  useEffect(() => {
    loadDashboardData();

    // Random tip on load
    setDailyTipIndex(Math.floor(Math.random() * DAILY_STUDY_TIPS.length));

    // Load saved tasks from localStorage
    const savedTasks = localStorage.getItem("studymind_daily_tasks");
    if (savedTasks) {
      try {
        const parsed = JSON.parse(savedTasks);
        // Clean out legacy default mock tasks if present
        const cleaned = Array.isArray(parsed)
          ? parsed.filter((t: DailyTask) => !["1", "2", "3"].includes(t.id))
          : [];
        setTasks(cleaned);
        localStorage.setItem("studymind_daily_tasks", JSON.stringify(cleaned));
      } catch (e) {
        setTasks([]);
      }
    } else {
      setTasks([]);
    }
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const me = await api.auth.getMe();
      setUser(me);

      const [docs, anl] = await Promise.all([
        api.documents.list(),
        api.analytics.getDashboard(),
      ]);
      setDocuments(docs);
      setAnalytics(anl);

      // Load Quick Challenge
      loadQuickChallenge();
    } catch (e) {
      setUser(null);
      router.replace("/");
    } finally {
      setLoading(false);
    }
  };

  const loadQuickChallenge = async () => {
    setChallengeLoading(true);
    setSelectedAnswer(null);
    try {
      const q = await api.quizzes.getDailyChallenge();
      setChallenge(q);
    } catch (err) {
      console.error(err);
    } finally {
      setChallengeLoading(false);
    }
  };

  // Task management
  const handleToggleTask = (id: string) => {
    const updated = tasks.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    setTasks(updated);
    localStorage.setItem("studymind_daily_tasks", JSON.stringify(updated));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    const newTask: DailyTask = {
      id: Date.now().toString(),
      text: newTaskInput.trim(),
      completed: false,
    };
    const updated = [newTask, ...tasks];
    setTasks(updated);
    localStorage.setItem("studymind_daily_tasks", JSON.stringify(updated));
    setNewTaskInput("");
  };

  const handleDeleteTask = (id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    setTasks(updated);
    localStorage.setItem("studymind_daily_tasks", JSON.stringify(updated));
  };

  // Completed tasks count
  const completedCount = tasks.filter((t) => t.completed).length;
  const taskProgress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Proposal 2: Last accessed material
  const lastMaterial = useMemo(() => {
    return documents.length > 0 ? documents[0] : null;
  }, [documents]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-xs text-slate-500">جاري إعداد لوحة المتابعة المخصصة لك...</p>
      </div>
    );
  }

  if (!user) return null;

  const currentTip = DAILY_STUDY_TIPS[dailyTipIndex];

  return (
    <div className="space-y-8 pb-16">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-700 via-sky-600 to-indigo-700 text-white p-7 rounded-3xl shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold mb-2">
            <Flame className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
            <span>يوم جديد، إنجاز جديد</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">
            أهلاً بك يا {user.full_name} 🎓
          </h1>
          <p className="text-xs sm:text-sm text-sky-100 mt-1 max-w-xl">
            مستعد لمواصلة التفوق اليوم؟ لديك {documents.length} كتاب ومذكرة في مكتبتك الدراسية.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <Link
            href="/library"
            className="px-5 py-3 bg-white text-brand-700 hover:bg-brand-50 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            <span>تصفح المكتبة</span>
          </Link>
          <Link
            href="/quizzes"
            className="px-4 py-3 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl backdrop-blur-sm transition-colors flex items-center gap-1.5"
          >
            <PlayCircle className="w-4 h-4" />
            <span>الاختبارات</span>
          </Link>
        </div>
      </div>

      {/* Proposal 1: Study Stats & Streak Bar (شريط الإنجاز والتحفيز) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Streak */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">أيام المذاكرة المتتالية</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-slate-900">
                {analytics?.streak_days ?? (documents.length > 0 ? 1 : 0)}
              </span>
              <span className="text-xs font-bold text-amber-500">
                {(analytics?.streak_days ?? (documents.length > 0 ? 1 : 0)) > 0 ? "أيام 🔥" : "يوم"}
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Flame className="w-6 h-6 fill-amber-500" />
          </div>
        </div>

        {/* Overall Mastery */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">نسبة الإتقان العام</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-slate-900">
                {analytics && analytics.total_quizzes_taken > 0
                  ? `${Math.round(analytics.average_score)}%`
                  : "0%"}
              </span>
              <span
                className={`text-xs font-bold ${
                  !analytics || analytics.total_quizzes_taken === 0
                    ? "text-slate-400"
                    : analytics.average_score >= 80
                    ? "text-emerald-600"
                    : analytics.average_score >= 60
                    ? "text-amber-600"
                    : "text-rose-600"
                }`}
              >
                {!analytics || analytics.total_quizzes_taken === 0
                  ? "جديد"
                  : analytics.average_score >= 80
                  ? "ممتاز"
                  : analytics.average_score >= 60
                  ? "جيد"
                  : "يحتاج تدريب"}
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Target className="w-6 h-6" />
          </div>
        </div>

        {/* Questions Solved */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">أسئلة تم حلها</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-slate-900">
                {analytics?.total_questions_answered ?? ((analytics?.total_quizzes_taken || 0) * 5)}
              </span>
              <span className="text-xs font-bold text-blue-600">سؤالاً</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Total Documents */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">المذكرات المفهرسة</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-slate-900">{documents.length}</span>
              <span className="text-xs font-bold text-purple-600">كتب</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Proposal 2: Jump Back In Card (استئناف المذاكرة من حيث توقفت) */}
      {lastMaterial && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-6 sm:p-7 rounded-3xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-sky-300">
              <Clock className="w-3.5 h-3.5" />
              <span>استئناف المذاكرة من حيث توقفت</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black">{lastMaterial.title}</h2>
            <p className="text-xs text-slate-300 flex items-center gap-2">
              <span>المادة: {lastMaterial.subject || "عام"}</span>
              <span>•</span>
              <span>عدد الصفحات: {lastMaterial.total_pages} صفحة</span>
              <span>•</span>
              <span className="text-emerald-400">مكتمل الفهرسة وجاهز للشرح</span>
            </p>
          </div>

          <div className="flex items-center gap-3 relative z-10 shrink-0">
            <Link
              href={`/study/${lastMaterial.id}`}
              className="px-6 py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-black text-xs rounded-xl shadow-lg shadow-brand-600/30 transition-all flex items-center gap-2 group"
            >
              <span>تابع المذاكرة الآن</span>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </Link>

            <Link
              href={`/material/${lastMaterial.id}`}
              className="px-4 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-colors"
            >
              لوحة المادة
            </Link>
          </div>

          <div className="absolute left-0 bottom-0 top-0 w-1/3 bg-gradient-to-r from-transparent to-brand-500/10 pointer-events-none" />
        </div>
      )}

      {/* Grid: Daily Challenge (Proposal 3) & Daily Goals / To-Do (Proposal 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Proposal 3: Quick 60-Second Daily Challenge */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Zap className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">تحدي اليوم السريع ⚡</h3>
                  <p className="text-[11px] text-slate-400">اختبر معلوماتك في 60 ثانية</p>
                </div>
              </div>

              {challenge && (
                <button
                  onClick={loadQuickChallenge}
                  disabled={challengeLoading}
                  className="text-xs font-bold text-slate-500 hover:text-brand-600 flex items-center gap-1 bg-slate-100 hover:bg-brand-50 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${challengeLoading ? "animate-spin" : ""}`} />
                  <span>سؤال آخر</span>
                </button>
              )}
            </div>

            {challengeLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
                <p className="text-xs text-slate-400">جاري اختيار سؤال سريع من مذكراتك...</p>
              </div>
            ) : challenge ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      {challenge.subject || "مادة دراسية"}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      كتاب: {challenge.document_title}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 leading-relaxed">
                    {challenge.question_text}
                  </p>
                </div>

                {/* Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {challenge.options.map((opt, i) => {
                    const isSelected = selectedAnswer === opt;
                    const isCorrect = opt === challenge.correct_answer;
                    let btnClass = "border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700";

                    if (selectedAnswer) {
                      if (isCorrect) {
                        btnClass = "bg-emerald-50 border-emerald-500 text-emerald-800 font-bold ring-2 ring-emerald-500/20";
                      } else if (isSelected && !isCorrect) {
                        btnClass = "bg-rose-50 border-rose-500 text-rose-800 font-bold ring-2 ring-rose-500/20";
                      } else {
                        btnClass = "opacity-50 border-slate-200 text-slate-400";
                      }
                    }

                    return (
                      <button
                        key={i}
                        disabled={selectedAnswer !== null}
                        onClick={() => setSelectedAnswer(opt)}
                        className={`p-3 text-xs text-right rounded-xl border transition-all ${btnClass}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {/* Immediate Answer Explanation */}
                {selectedAnswer && (
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed border transition-all ${
                      selectedAnswer === challenge.correct_answer
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-rose-50 border-rose-200 text-rose-900"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      {selectedAnswer === challenge.correct_answer ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>إجابة صحيحة وممتازة! 🎉</span>
                        </>
                      ) : (
                        <>
                          <HelpCircle className="w-4 h-4 text-rose-600" />
                          <span>إجابة غير دقيقة! الإجابة الصحيحة: {challenge.correct_answer}</span>
                        </>
                      )}
                    </div>
                    <p className="text-slate-700 mt-1">{challenge.explanation}</p>
                    {challenge.source_page && (
                      <p className="text-[11px] text-slate-500 mt-2 font-bold">
                        📚 المرجع: صفحة {challenge.source_page} في {challenge.document_title}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                قم برفع أول مذكرة لتبدأ الأسئلة السريعة في الظهور هنا يومياً.
              </div>
            )}
          </div>
        </div>

        {/* Proposal 4: Daily Goals & Interactive To-Do List */}
        <div className="lg:col-span-5 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <ListTodo className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">مهام وأهداف اليوم 📝</h3>
                  <p className="text-[11px] text-slate-400">
                    {tasks.length > 0
                      ? `أنجزت ${completedCount} من ${tasks.length} مهام (${taskProgress}%)`
                      : "لا توجد مهام مضافة بعد"}
                  </p>
                </div>
              </div>
              <span className="text-xs font-black text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full font-mono">
                {taskProgress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-5">
              <div
                className="h-full bg-gradient-to-l from-purple-600 to-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${taskProgress}%` }}
              />
            </div>

            {/* Add task input */}
            <form onSubmit={handleAddTask} className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="أضف هدفاً دراسياً لليوم..."
                className="flex-1 px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
              >
                إضافة
              </button>
            </form>

            {/* Task items */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {tasks.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">لا توجد مهام حالياً. أضف هدفك الأول!</p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      task.completed
                        ? "bg-slate-50 border-slate-200 text-slate-400"
                        : "bg-white border-slate-200 text-slate-800 shadow-xs"
                    }`}
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1 select-none">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTask(task.id)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                      />
                      <span className={`text-xs font-medium ${task.completed ? "line-through" : ""}`}>
                        {task.text}
                      </span>
                    </label>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-slate-300 hover:text-rose-500 p-1 transition-colors"
                      title="حذف المهمة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {taskProgress === 100 && tasks.length > 0 && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 text-center flex items-center justify-center gap-1.5 animate-bounce">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>أحسنت يا بطل! أتممت جميع أهدافك لليوم بنجاح 🌟</span>
            </div>
          )}
        </div>
      </div>

      {/* Proposal 7: AI Tutor Daily Study Tip (نصيحة المعلم الذكي لليوم) */}
      <div className="bg-gradient-to-l from-brand-50 via-sky-50 to-indigo-50 border border-brand-200/80 p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md shadow-brand-600/20 shrink-0">
            <Lightbulb className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black text-brand-700 bg-brand-100/80 px-2.5 py-0.5 rounded-full">
                💡 نصيحة المعلم الذكي اليومية
              </span>
              <span className="text-[11px] text-slate-400">•</span>
              <span className="text-[11px] font-bold text-slate-500">{currentTip.category}</span>
            </div>
            <h4 className="font-bold text-slate-900 text-sm mb-1">{currentTip.title}</h4>
            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{currentTip.tip}</p>
          </div>
        </div>

        <button
          onClick={() => setDailyTipIndex((prev) => (prev + 1) % DAILY_STUDY_TIPS.length)}
          className="self-end sm:self-center px-4 py-2 bg-white hover:bg-slate-100 text-brand-700 font-bold text-xs rounded-xl border border-brand-200 shadow-sm transition-colors shrink-0"
        >
          نصيحة أخرى ↻
        </button>
      </div>
    </div>
  );
}
