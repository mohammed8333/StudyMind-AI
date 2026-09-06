"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Flame,
  GraduationCap,
  HelpCircle,
  Loader2,
  LogOut,
  Mail,
  School,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const storedUser = localStorage.getItem("studymind_user");
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {}
        }

        const [meData, analyticsData] = await Promise.all([
          api.auth.getMe().catch(() => null),
          api.analytics.getDashboard().catch(() => null),
        ]);

        if (meData) {
          setUser(meData);
        }
        if (analyticsData) {
          setAnalytics(analyticsData);
        }
      } catch (err) {
        console.error("Error loading profile data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleLogout = () => {
    api.auth.logout();
    router.push("/");
  };

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.auth.deleteAccount();
      setDeleteModalOpen(false);
      window.location.href = "/";
    } catch (err: any) {
      setDeleteError(err.message || "تعذر حذف الحساب والبيانات");
      setIsDeleting(false);
    }
  };

  const totalDocs = analytics?.total_documents ?? 0;
  const totalQuizzes = analytics?.total_quizzes_taken ?? 0;
  const totalQuestions = analytics?.total_questions_answered ?? 0;
  const avgScore = analytics?.average_score ?? 0;
  const streakDays = analytics?.streak_days ?? (totalDocs > 0 ? 1 : 0);

  const getUnderstandingInsight = () => {
    if (totalQuizzes === 0) {
      return {
        level: "في انتظار أول تقييم",
        stage: "مرحلة البداية",
        percent: 0,
        badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
        barColor: "bg-slate-300",
        summary: "لم تقم بحل أي اختبار حتى الآن. بمجرد حل أول كويز، سيقوم محرك الذكاء الاصطناعي بتشخيص أدائك وتوقع مستوى استيعابك الفعلي بدقة.",
        recommendation: "ابدأ برفع أول ملزمة وخوض كويز تجريبي قصير من 5 أسئلة."
      };
    }
    if (avgScore >= 85) {
      return {
        level: "استيعاب متقدم فائق (إتقان تام)",
        stage: "المرحلة 4 من 4 (إتقان كامل)",
        percent: Math.min(100, Math.round(avgScore)),
        badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
        barColor: "bg-emerald-500",
        summary: "تُظهر نتائجك فهماً دقيقاً للمفاهيم الأساسية والتطبيقية، مع قدرة عالية على التمييز بين الخيارات واسترجاع المعلومات في أول محاولة.",
        recommendation: "أنت جاهز للامتحانات النهائية! استمر في حل التحديات السريعة لتثبيت المعلومة على المدى الطويل."
      };
    }
    if (avgScore >= 70) {
      return {
        level: "استيعاب جيد جداً (قريب من الامتياز)",
        stage: "المرحلة 3 من 4 (استيعاب متقدم)",
        percent: Math.round(avgScore),
        badgeBg: "bg-blue-50 text-blue-800 border-blue-200",
        barColor: "bg-blue-500",
        summary: "مستواك ممتاز في معظم جزئيات المنهج مع وجود بعض المفاهيم الدقيقة التي تحتاج لمراجعة سريعة مع المعلم الذكي.",
        recommendation: "قم بحل كويز علاجي مركز للمفاهيم غير المتقنة لترفع استيعابك فوراً إلى 90%+."
      };
    }
    if (avgScore >= 50) {
      return {
        level: "استيعاب متوسط (قيد التطور)",
        stage: "المرحلة 2 من 4 (بناء الأساسيات)",
        percent: Math.round(avgScore),
        badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
        barColor: "bg-amber-500",
        summary: "لديك استيعاب عام للموضوعات، لكن بعض المفاهيم تحتاج لتبسيط وشرح إضافي لتجنب الوقوع في مشتتات الأسئلة.",
        recommendation: "اطلب من المعلم الذكي شرح الدروس بأسلوب [بسيط جداً] مع أمثلة واقعية قبل إعادة الاختبار."
      };
    }
    return {
      level: "في مرحلة التأسيس والمراجعة",
      stage: "المرحلة 1 من 4 (تأسيس أولي)",
      percent: Math.max(25, Math.round(avgScore)),
      badgeBg: "bg-rose-50 text-rose-800 border-rose-200",
      barColor: "bg-rose-500",
      summary: "تظهر البيانات أنك بحاجة لإعادة قراءة المذكرات واستخراج الأفكار الرئيسية قبل التسرع في حل الأسئلة.",
      recommendation: "استعن بملخصات المواد المُولّدة ذكياً واسأل المعلم عن كل جزئية تشعر فيها بالغموض."
    };
  };

  const insight = getUnderstandingInsight();

  const formatJoinDate = (dateStr?: string) => {
    if (!dateStr) return "طالب معتمد في StudyMind";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24">
      <div className="max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 space-y-6 sm:space-y-8">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand-600 transition-colors p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة للوحة المتابعة</span>
          </Link>
          <div className="flex items-center gap-1.5 bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-bold border border-brand-200/60">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            <span>الملف الشخصي والحساب</span>
          </div>
        </div>

        {/* 1. Profile Hero Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-100/40 via-transparent to-transparent rounded-full -mr-20 -mt-20 pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Big Initial Avatar */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center font-black text-2xl sm:text-3xl shadow-lg shadow-brand-500/20 shrink-0">
                {user?.full_name?.charAt(0) || "ط"}
              </div>

              <div className="space-y-1.5 text-right">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                    {user?.full_name || "الطالب"}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    طالب نشط 🌟
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{user?.email || "user@example.com"}</span>
                  </div>
                  {user?.grade_or_level && (
                    <div className="flex items-center gap-1.5">
                      <School className="w-3.5 h-3.5 text-slate-400" />
                      <span>{user.grade_or_level}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>انضم: {formatJoinDate(user?.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Streak Badge */}
            <div className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 px-4 py-3 rounded-2xl shrink-0 self-stretch sm:self-auto justify-between sm:justify-start">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm shadow-amber-200 shrink-0">
                <Flame className="w-5 h-5 fill-white animate-pulse" />
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-amber-900">حماسة مستمرة</p>
                <p className="text-sm font-black text-amber-600">
                  {streakDays} {streakDays === 1 ? "يوم" : "أيام متتالية"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Academic Stats Grid (نبذة عن إنجازات الطالب) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            <h2 className="text-base font-black text-slate-900">نبذة عن نشاطك الأكاديمي</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Materials Count */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs hover:border-brand-200 transition-all text-right space-y-2">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{totalDocs}</p>
                <p className="text-xs font-bold text-slate-500">ملازم ومذكرات مرفوعة</p>
              </div>
              <p className="text-[11px] text-brand-600 font-semibold">مفهرسة وجاهزة للشرح</p>
            </div>

            {/* 2. Quizzes Solved */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs hover:border-indigo-200 transition-all text-right space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{totalQuizzes}</p>
                <p className="text-xs font-bold text-slate-500">اختبارات تم حلها</p>
              </div>
              <p className="text-[11px] text-indigo-600 font-semibold">تقييمات مراجعة ذاتية</p>
            </div>

            {/* 3. Questions Solved */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs hover:border-purple-200 transition-all text-right space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{totalQuestions}</p>
                <p className="text-xs font-bold text-slate-500">أسئلة تم التدرب عليها</p>
              </div>
              <p className="text-[11px] text-purple-600 font-semibold">تدريب نشط ومتنوع</p>
            </div>

            {/* 4. Average Score */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs hover:border-emerald-200 transition-all text-right space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{avgScore}%</p>
                <p className="text-xs font-bold text-slate-500">متوسط نتائج الاختبارات</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, avgScore)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Expected Understanding Level (مستوى الفهم المتوقع) */}
        <div className="bg-gradient-to-br from-white to-brand-50/30 rounded-3xl p-6 sm:p-8 border border-brand-200 shadow-sm space-y-6 text-right">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md shadow-brand-500/20 shrink-0">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  مستوى الفهم والاستيعاب المتوقع
                </h3>
                <p className="text-xs text-slate-500">
                  تشخيص ذكي مبني على جودة الإجابات، سرعة الاسترجاع، وتحليل المفاهيم
                </p>
              </div>
            </div>

            <div className={`px-3.5 py-1.5 rounded-full text-xs font-black border ${insight.badgeBg} shrink-0`}>
              {insight.level}
            </div>
          </div>

          {/* Visual Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span>معدل الإتقان المقاس: {insight.percent}%</span>
              <span>{insight.stage}</span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-3.5 p-0.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${insight.barColor} transition-all duration-700 shadow-xs`}
                style={{ width: `${Math.max(5, insight.percent)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-1">
              <span>تأسيس (25%)</span>
              <span>تطبيق (50%)</span>
              <span>استيعاب عميق (75%)</span>
              <span>إتقان تام (100%)</span>
            </div>
          </div>

          {/* AI Pedagogical Diagnosis */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-700">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <span>تحليل المعلم الذكي لأدائك:</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {insight.summary}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold pt-1 border-t border-slate-100">
              💡 <span className="text-slate-800 font-bold">نصيحة لتطوير مستواك:</span> {insight.recommendation}
            </p>
          </div>

          {/* Concepts Breakdown (Strong vs Weak) */}
          {(analytics?.strong_concepts?.length > 0 || analytics?.weak_concepts?.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {analytics?.strong_concepts?.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2.5">
                  <p className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>أقوى المفاهيم التي تتقنها:</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {analytics.strong_concepts.slice(0, 4).map((c: any) => (
                      <span
                        key={c.concept_id}
                        className="px-2.5 py-1 bg-white text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 shadow-2xs"
                      >
                        {c.concept_name} ({Math.round(c.mastery_score)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analytics?.weak_concepts?.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2.5">
                  <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>مفاهيم يُنصح بمراجعتها:</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {analytics.weak_concepts.slice(0, 4).map((c: any) => (
                      <span
                        key={c.concept_id}
                        className="px-2.5 py-1 bg-white text-amber-800 rounded-lg text-xs font-bold border border-amber-200 shadow-2xs"
                      >
                        {c.concept_name} ({Math.round(c.mastery_score)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Bottom Session & Danger Zone (من تحت خالص في آخر الصفحة خالص) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5 text-right">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-slate-500" />
              <h3 className="text-base font-black">إدارة الحساب والجلسة</h3>
            </div>
            <p className="text-xs text-slate-500">
              خيارات التحكم في تسجيل الدخول أو إزالة الحساب والبيانات نهائياً من النظام
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 p-3.5 text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all shadow-xs active:scale-[0.99]"
            >
              <LogOut className="w-4 h-4 text-slate-600" />
              <span>تسجيل الخروج من الحساب</span>
            </button>

            {/* Delete Account Button */}
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="flex items-center justify-center gap-2 p-3.5 text-xs sm:text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-2xl transition-all shadow-xs active:scale-[0.99]"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>حذف الحساب وكافة البيانات نهائياً</span>
            </button>
          </div>
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 text-right rtl">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900">
                حذف الحساب والبيانات نهائياً؟
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                تنبيه لا يمكن التراجع عنه: سيتم حذف حسابك نهائياً من قاعدة البيانات، وسيشمل ذلك مسح جميع مذكراتك المرفوعة، والكويزات، ونتائج الاختبارات، وسجل الشات بالكامل. لن تتمكن من استرجاع هذه البيانات بعد الحذف.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAccount}
                className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-xs font-bold transition-colors shadow-sm shadow-rose-200 flex items-center justify-center gap-2"
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isDeleting ? "جارٍ الحذف ومسح البيانات..." : "نعم، احذف الحساب نهائياً"}</span>
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalOpen(false)}
                className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
