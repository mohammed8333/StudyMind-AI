"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  HelpCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";

interface Question {
  id: number;
  question_type: string;
  question_text: string;
  options: string[];
  source_page?: number;
  concept_name?: string;
}

interface QuizData {
  id: number;
  title: string;
  document_id: number;
  difficulty: string;
  total_questions: number;
  questions: Question[];
}

interface QuestionFeedback {
  question_id: number;
  question_text: string;
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
  source_page?: number;
  concept_name?: string;
}

interface SubmissionResult {
  submission_id: number;
  score: number;
  total_questions: number;
  percentage: number;
  passed: boolean;
  time_taken_seconds: number;
  questions_feedback: QuestionFeedback[];
}

export default function QuizRunnerPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = Number(params.id);

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    if (quizId) {
      loadQuiz();
    }
  }, [quizId]);

  useEffect(() => {
    if (!result) {
      const timer = setInterval(() => {
        setTimeSeconds((s) => s + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [result]);

  const loadQuiz = async () => {
    setLoading(true);
    try {
      const data = await api.quizzes.get(quizId);
      setQuiz(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    setIsSubmitting(true);
    try {
      const formattedAnswers = quiz.questions.map((q) => ({
        question_id: q.id,
        selected_answer: answers[q.id] || "",
      }));

      const res = await api.quizzes.submit(quizId, formattedAnswers, timeSeconds);
      setResult(res);
    } catch (err: any) {
      alert(err.message || "فشل إرسال الاختبار");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600 font-bold mb-4">الاختبار غير موجود أو حدث خطأ.</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold"
        >
          الرجوع للوحة التحكم
        </button>
      </div>
    );
  }

  const currentQ = quiz.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/study/${quiz.document_id}`)}
            className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors"
            title="رجوع للمذاكرة"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{quiz.title}</h1>
            <p className="text-xs text-slate-400">
              صعوبة: {quiz.difficulty} • عدد الأسئلة: {quiz.total_questions}
            </p>
          </div>
        </div>

        {!result && (
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700">
            <Clock className="w-4 h-4 text-brand-600" />
            <span>{formatTimer(timeSeconds)}</span>
          </div>
        )}
      </div>

      {/* QUIZ RESULT VIEW */}
      {result ? (
        <div className="space-y-6">
          {/* Result Banner Card */}
          <div
            className={`p-6 rounded-2xl border text-center shadow-sm ${
              result.passed
                ? "bg-gradient-to-b from-emerald-50 to-teal-50 border-emerald-200"
                : "bg-gradient-to-b from-amber-50 to-orange-50 border-amber-200"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md ${
                result.passed
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-600 text-white"
              }`}
            >
              <Trophy className="w-7 h-7" />
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-1">
              {result.passed ? "أداء رائع ومبشّر! 🌟" : "محاولة جيدة، تحتاج مراجعة نقاط الضعف 💪"}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              تم تحديث مقاييس الإتقان الخاصة بك في لوحة التحكم وتحديد المفاهيم المرتبطة بأخطائك.
            </p>

            <div className="flex items-center justify-center gap-6 font-mono">
              <div className="bg-white/80 px-4 py-2 rounded-xl border border-slate-200">
                <span className="block text-[10px] text-slate-400 font-sans">الدرجة</span>
                <span className="text-lg font-bold text-slate-900">
                  {result.score} / {result.total_questions}
                </span>
              </div>
              <div className="bg-white/80 px-4 py-2 rounded-xl border border-slate-200">
                <span className="block text-[10px] text-slate-400 font-sans">النسبة المئوية</span>
                <span
                  className={`text-lg font-bold ${
                    result.percentage >= 80
                      ? "text-emerald-600"
                      : result.percentage >= 60
                      ? "text-brand-600"
                      : "text-amber-600"
                  }`}
                >
                  {result.percentage}%
                </span>
              </div>
              <div className="bg-white/80 px-4 py-2 rounded-xl border border-slate-200">
                <span className="block text-[10px] text-slate-400 font-sans">الوقت المستغرق</span>
                <span className="text-lg font-bold text-slate-900">
                  {formatTimer(result.time_taken_seconds)}
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Question Review List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-600" />
              <span>مراجعة الأسئلة وتبرير الإجابات بنص المنهج:</span>
            </h3>

            {result.questions_feedback.map((fb, idx) => (
              <div
                key={idx}
                className={`p-5 rounded-2xl border shadow-xs ${
                  fb.is_correct
                    ? "bg-white border-emerald-200"
                    : "bg-white border-rose-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    السؤال {idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {fb.concept_name && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {fb.concept_name}
                      </span>
                    )}
                    {fb.source_page && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700">
                        ص {fb.source_page}
                      </span>
                    )}
                    {fb.is_correct ? (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        صحيحة
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                        <XCircle className="w-4 h-4" />
                        خاطئة
                      </span>
                    )}
                  </div>
                </div>

                <p className="font-semibold text-slate-900 text-sm mb-3">
                  {fb.question_text}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      fb.is_correct
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-rose-50 border-rose-200 text-rose-900"
                    }`}
                  >
                    <span className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      إجابتك:
                    </span>
                    <span className="font-bold">{fb.selected_answer || "لم تتم الإجابة"}</span>
                  </div>

                  {!fb.is_correct && (
                    <div className="p-2.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900">
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        الإجابة الصحيحة:
                      </span>
                      <span className="font-bold">{fb.correct_answer}</span>
                    </div>
                  )}
                </div>

                {/* Explanation from Book */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
                  <span className="font-bold text-brand-700 block mb-1">
                    💡 التبرير والتفسير النموذجي:
                  </span>
                  <p>{fb.explanation}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={() => router.push(`/study/${quiz.document_id}`)}
              className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow transition-colors"
            >
              الرجوع لغرفة المذاكرة
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition-colors"
            >
              لوحة التحكم
            </button>
          </div>
        </div>
      ) : (
        /* QUESTION RUNNER VIEW */
        <div className="space-y-6">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-bold text-slate-700">
                السؤال {currentIndex + 1} من {quiz.total_questions}
              </span>
              <span>
                تمت الإجابة على {answeredCount} من {quiz.total_questions}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-brand-600 h-full transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / quiz.total_questions) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Current Question Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              {currentQ.concept_name && (
                <span className="text-[11px] font-bold px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full">
                  المفهوم: {currentQ.concept_name}
                </span>
              )}
              {currentQ.source_page && (
                <span className="text-xs text-slate-400 font-mono">
                  ص {currentQ.source_page}
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed mb-6">
              {currentQ.question_text}
            </h2>

            {/* Options List */}
            <div className="space-y-3">
              {currentQ.options.map((option, idx) => {
                const isSelected = answers[currentQ.id] === option;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectAnswer(currentQ.id, option)}
                    className={`w-full p-4 rounded-xl text-right text-sm font-semibold border transition-all flex items-center justify-between ${
                      isSelected
                        ? "bg-brand-50 border-brand-500 text-brand-950 ring-2 ring-brand-500/20 shadow-xs"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <span>{option}</span>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-2">
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
              className="px-4 py-2.5 text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold disabled:opacity-40"
            >
              السؤال السابق
            </button>

            {currentIndex < quiz.total_questions - 1 ? (
              <button
                onClick={() => setCurrentIndex((i) => i + 1)}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow transition-colors"
              >
                السؤال التالي
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || answeredCount === 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التصحيح...</span>
                  </>
                ) : (
                  <span>إنهاء الاختبار وتصحيح الإجابات</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
