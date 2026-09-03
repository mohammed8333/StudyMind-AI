"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  PlayCircle,
  Plus,
  RotateCcw,
  Sparkles,
  TrendingUp,
  X
} from "lucide-react";
import { api } from "@/lib/api";

interface QuizSubmissionRecord {
  id: number;
  quiz_id: number;
  quiz_title: string;
  document_id: number;
  document_title: string;
  subject?: string;
  score: number;
  total_questions: number;
  percentage: number;
  passed: boolean;
  time_taken_seconds: number;
  submitted_at: string;
}

interface DocumentItem {
  id: number;
  title: string;
  subject?: string;
}

export default function QuizzesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<QuizSubmissionRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  // New Quiz Modal State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    loadQuizzesData();
  }, []);

  const loadQuizzesData = async () => {
    setLoading(true);
    try {
      const me = await api.auth.getMe();
      setUser(me);

      const [hist, docs] = await Promise.all([
        api.quizzes.getMyHistory(),
        api.documents.list(),
      ]);
      setHistory(hist);
      setDocuments(docs);
      if (docs.length > 0) {
        setSelectedDocId(docs[0].id);
      }
    } catch (e) {
      setUser(null);
      router.replace("/");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) return;
    setIsGenerating(true);
    setGenError("");

    try {
      const quiz = await api.quizzes.generate({
        document_id: selectedDocId,
        difficulty,
        num_questions: numQuestions,
      });
      router.push(`/quiz/${quiz.id}`);
    } catch (err: any) {
      setGenError(err.message || "فشل توليد الاختبار. يرجى المحاولة ثانية.");
      setIsGenerating(false);
    }
  };

  // Stats calculation
  const totalTaken = history.length;
  const avgScore = useMemo(() => {
    if (history.length === 0) return 0;
    const sum = history.reduce((acc, h) => acc + h.percentage, 0);
    return Math.round(sum / history.length);
  }, [history]);

  const passedCount = useMemo(() => {
    return history.filter((h) => h.passed).length;
  }, [history]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-xs text-slate-500">جاري تحميل سجل اختباراتك وتقييم الأداء...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Launch CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-700 via-teal-600 to-brand-700 text-white p-7 rounded-3xl shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold mb-2">
            <GraduationCap className="w-4 h-4 text-emerald-200" />
            <span>نظام الاختبارات والتقييم الذكي</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">
            سجل الاختبارات والتقييمات 📝
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100 mt-1 max-w-xl">
            توليد كويزات تفاعلية تلقائياً من أي مذكرّة، مع تصحيح فوري برقم الصفحة ومتابعة تطور درجاتك باستمرار.
          </p>
        </div>

        <button
          onClick={() => setShowGenerateModal(true)}
          disabled={documents.length === 0}
          className="self-start sm:self-center px-5 py-3 bg-white text-emerald-800 hover:bg-emerald-50 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0 disabled:opacity-50"
        >
          <PlayCircle className="w-4 h-4" />
          <span>بدء اختبار جديد الآن</span>
        </button>
      </div>

      {/* Proposal 5: Top Summary Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">إجمالي الاختبارات المنجزة</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalTaken}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <PlayCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">متوسط الدرجات العام</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{avgScore}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">نسبة النجاح والتفوق</p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {totalTaken > 0 ? Math.round((passedCount / totalTaken) * 100) : 0}%
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Submissions History Table / Cards */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">سجل الاختبارات السابقة</h2>
              <p className="text-xs text-slate-400">استعرض نتائجك السابقة وراجع الإجابات النموذجية</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {history.length} اختبار
          </span>
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <GraduationCap className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">لم تقم بحل أي اختبارات بعد</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              ابدأ باختبار قصير من مذكراتك لتحديد مستواك واكتشاف نقاط القوة والضعف تلقائياً.
            </p>
            {documents.length > 0 && (
              <button
                onClick={() => setShowGenerateModal(true)}
                className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors"
              >
                توليد أول اختبار الآن
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((sub) => {
              const formattedDate = sub.submitted_at
                ? new Date(sub.submitted_at).toLocaleDateString("ar-EG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "مؤخراً";

              return (
                <div
                  key={sub.id}
                  className="p-5 sm:p-6 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                        {sub.subject || "مادة عامة"}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formattedDate}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-base">
                      {sub.quiz_title}
                    </h3>

                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <span>المصدر: {sub.document_title}</span>
                      <span>•</span>
                      <span>عدد الأسئلة: {sub.total_questions}</span>
                      {sub.time_taken_seconds > 0 && (
                        <>
                          <span>•</span>
                          <span>الوقت: {sub.time_taken_seconds} ثانية</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                    {/* Score Badge */}
                    <div className="text-left sm:text-right">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-base font-black font-mono ${
                            sub.passed ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {sub.score} / {sub.total_questions}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            sub.passed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {sub.percentage}%
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400">
                        {sub.passed ? "تم الاجتياز بنجاح ✨" : "يحتاج لمراجعة ⚠️"}
                      </span>
                    </div>

                    {/* Review Button */}
                    <Link
                      href={`/quiz/${sub.quiz_id}`}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1"
                    >
                      <span>مراجعة الإجابات</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Generate Quiz Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-black text-slate-900">توليد اختبار جديد</h3>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              اختر المادة الدراسية وحدد الصعوبة ليقوم الذكاء الاصطناعي بصياغة اختبار مطابق للمنهج.
            </p>

            {genError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                {genError}
              </div>
            )}

            <form onSubmit={handleCreateQuiz} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">اختر المادة أو الملزمة</label>
                <select
                  value={selectedDocId || ""}
                  onChange={(e) => setSelectedDocId(Number(e.target.value))}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.subject || "عام"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">مستوى الصعوبة</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "easy", label: "سهل ومباشر" },
                    { id: "medium", label: "متوسط المنهج" },
                    { id: "exam", label: "أسئلة امتحانات" },
                  ].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setDifficulty(lvl.id)}
                      className={`py-2 rounded-xl border font-bold transition-all ${
                        difficulty === lvl.id
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">عدد الأسئلة</label>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setNumQuestions(num)}
                      className={`py-2 rounded-xl border font-bold transition-all ${
                        numQuestions === num
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {num} أسئلة
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isGenerating || !selectedDocId}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري صياغة الأسئلة...</span>
                    </>
                  ) : (
                    <span>توليد وبدء الاختبار فوراً</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  disabled={isGenerating}
                  className="px-4 py-3 text-slate-600 hover:bg-slate-100 font-bold rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
