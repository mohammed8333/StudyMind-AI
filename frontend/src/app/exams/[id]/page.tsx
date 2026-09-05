"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileQuestion,
  FileText,
  Flag,
  HelpCircle,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  api,
  Exam,
  ExamAttemptStartResponse,
  ExamQuestion,
  ExamResultResponse,
} from "@/lib/api";

export default function ExamRunnerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const examId = Number(params.id);
  const requestedAttemptId = searchParams.get("attempt") ? Number(searchParams.get("attempt")) : null;

  // View Mode: 'loading' | 'exam' | 'result'
  const [viewMode, setViewMode] = useState<"loading" | "exam" | "result">("loading");

  // Exam and Attempt Meta
  const [exam, setExam] = useState<Exam | null>(null);
  const [attemptData, setAttemptData] = useState<ExamAttemptStartResponse | null>(null);
  const [resultData, setResultData] = useState<ExamResultResponse | null>(null);

  // Solving State
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<number, number>>({});

  // Countdown Timer
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Timer interval ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeQuestionStartTimeRef = useRef<number>(Date.now());

  // Load Initial Data
  useEffect(() => {
    if (!examId) return;
    initExam();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examId, requestedAttemptId]);

  const initExam = async () => {
    setViewMode("loading");
    try {
      const examObj = await api.exams.get(examId);
      setExam(examObj);

      // If viewing a previous attempt directly
      if (requestedAttemptId) {
        const pastResult = await api.exams.getAttemptResult(examId, requestedAttemptId);
        setResultData(pastResult);
        setViewMode("result");
        return;
      }

      // Start new attempt or resume active in-progress
      const attemptStart = await api.exams.start(examId);
      setAttemptData(attemptStart);
      setRemainingSeconds(attemptStart.remaining_seconds);

      // Restore saved answers from localStorage if available
      try {
        const saved = localStorage.getItem(`studymind_exam_${examId}_attempt_${attemptStart.attempt_id}`);
        if (saved) {
          setAnswers(JSON.parse(saved));
        }
      } catch (e) {
        // ignore
      }

      setViewMode("exam");
      startTimer();
    } catch (err: any) {
      console.error("Exam init failed:", err);
      router.push("/exams");
    }
  };

  // Real Countdown Timer Hook
  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Auto-submit when countdown hits zero
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Track time spent per question on question switch
  useEffect(() => {
    const now = Date.now();
    const elapsed = Math.round((now - activeQuestionStartTimeRef.current) / 1000);
    activeQuestionStartTimeRef.current = now;

    if (attemptData && attemptData.questions[currentIndex]) {
      const prevQId = attemptData.questions[currentIndex].id;
      setQuestionTimeSpent((prev) => ({
        ...prev,
        [prevQId]: (prev[prevQId] || 0) + elapsed,
      }));
    }
  }, [currentIndex]);

  const handleSelectAnswer = (qId: number, ans: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [qId]: ans };
      if (attemptData) {
        try {
          localStorage.setItem(`studymind_exam_${examId}_attempt_${attemptData.attempt_id}`, JSON.stringify(next));
        } catch (e) {
          // ignore
        }
      }
      return next;
    });
  };

  const toggleFlagQuestion = (qId: number) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
  };

  const handleAutoSubmit = () => {
    doSubmitExam(true);
  };

  const doSubmitExam = async (isTimeout = false) => {
    if (!attemptData || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    // Stop timer
    if (timerRef.current) clearInterval(timerRef.current);

    // Build payload
    const answersPayload = attemptData.questions.map((q) => ({
      question_id: q.id,
      student_answer: answers[q.id] || "",
      time_spent_seconds: questionTimeSpent[q.id] || 0,
    }));

    try {
      const res = await api.exams.submit(examId, attemptData.attempt_id, {
        answers: answersPayload,
      });

      // Clear local storage
      try {
        localStorage.removeItem(`studymind_exam_${examId}_attempt_${attemptData.attempt_id}`);
      } catch (e) {
        // ignore
      }

      setResultData(res);
      setViewMode("result");
      setShowSubmitModal(false);
    } catch (err: any) {
      setSubmitError(err.message || "فشل تسليم الامتحان، يرجى المحاولة مرة أخرى.");
      setIsSubmitting(false);
    }
  };

  const handleRetryExam = async () => {
    setViewMode("loading");
    try {
      const newAttempt = await api.exams.start(examId);
      setAttemptData(newAttempt);
      setRemainingSeconds(newAttempt.remaining_seconds);
      setAnswers({});
      setFlaggedQuestions(new Set());
      setQuestionTimeSpent({});
      setCurrentIndex(0);
      setViewMode("exam");
      startTimer();
    } catch (err) {
      console.error(err);
      router.push("/exams");
    }
  };

  // Timer Formatting & Styling
  const timerDisplay = useMemo(() => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }, [remainingSeconds]);

  const isWarningTime = remainingSeconds <= 600 && remainingSeconds > 300; // < 10 mins
  const isDangerTime = remainingSeconds <= 300; // < 5 mins

  // Current Question
  const currentQuestion: ExamQuestion | undefined = attemptData?.questions[currentIndex];
  const totalQuestions = attemptData?.questions.length || 0;
  const answeredCount = Object.keys(answers).filter((k) => (answers[Number(k)] || "").trim() !== "").length;

  if (viewMode === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-sm w-full">
          <Loader2 className="w-10 h-10 animate-spin text-orange-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 mt-4">جاري إعداد بيئة الامتحان...</h3>
          <p className="text-xs text-slate-500 mt-1">مزامنة المؤقت مع السيرفر وتجهيز الأسئلة الموثقة</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE: RESULT REPORT
  // ==========================================
  if (viewMode === "result" && resultData) {
    const resMins = Math.floor(resultData.time_taken_seconds / 60);
    const resSecs = resultData.time_taken_seconds % 60;
    const timeTakenStr = `${resMins} دقيقة و ${resSecs} ثانية`;

    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header Bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/exams"
              className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة للامتحانات</span>
            </Link>

            <button
              onClick={handleRetryExam}
              className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-orange-600/20 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة خوض الامتحان</span>
            </button>
          </div>

          {/* Main Score Hero Card */}
          <div
            className={`p-6 sm:p-8 rounded-3xl border shadow-sm text-white relative overflow-hidden ${
              resultData.passed
                ? "bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-500"
                : "bg-gradient-to-br from-red-600 to-rose-700 border-red-500"
            }`}
          >
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-white/20 backdrop-blur-sm">
                    {resultData.status === "TIMED_OUT" ? "انتهى الوقت المحدد ⏱️" : "تسليم مكتمل 📝"}
                  </span>
                  <span className="text-xs text-white/80">محاولة #{resultData.attempt_number}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black mt-2">{resultData.exam_title}</h1>
                <p className="text-sm text-white/90 mt-2 max-w-xl leading-relaxed">
                  {resultData.summary_feedback}
                </p>
              </div>

              <div className="bg-white/15 backdrop-blur-md p-6 rounded-2xl border border-white/20 text-center shrink-0 self-start md:self-auto min-w-[170px]">
                <p className="text-xs text-white/80 font-medium">النسبة المئوية</p>
                <p className="text-4xl font-black mt-1">{resultData.percentage}%</p>
                <div className="mt-2 pt-2 border-t border-white/20 text-xs font-bold text-white/90">
                  {resultData.score} من {resultData.total_marks} درجة
                </div>
              </div>
            </div>
          </div>

          {/* 4 Performance Indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">الإجابات الصحيحة</p>
                <p className="text-xl font-black text-emerald-600 mt-0.5">{resultData.correct_count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">الإجابات الخاطئة</p>
                <p className="text-xl font-black text-rose-600 mt-0.5">{resultData.wrong_count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">أسئلة متروكة</p>
                <p className="text-xl font-black text-amber-600 mt-0.5">{resultData.unanswered_count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">متوسط وقت السؤال</p>
                <p className="text-xl font-black text-blue-600 mt-0.5">{resultData.avg_time_per_question_seconds} ث</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Remedial Recommendations & Weak Concepts */}
          {resultData.remedial_recommendations.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">توصيات علاجية مستهدفة لتحسين أدائك</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resultData.remedial_recommendations.map((rec, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">{rec.title}</span>
                      {rec.priority === "high" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-700">
                          أولوية قصوى
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">{rec.recommended_action}</p>
                    {rec.source_page && (
                      <p className="text-[11px] text-amber-700/80 font-medium">موجود في صفحة {rec.source_page} بمذكرتك</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Question Review */}
          <div className="space-y-4">
            <h3 className="text-lg font-black text-slate-900 px-1">المراجعة التفصيلية لأسئلة الامتحان</h3>

            {resultData.questions_feedback.map((q, idx) => (
              <div
                key={q.question_id}
                className={`p-6 bg-white rounded-3xl border shadow-sm transition-all space-y-4 ${
                  q.is_correct ? "border-slate-200" : "border-red-200 bg-rose-50/20"
                }`}
              >
                {/* Question Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-xl text-xs font-bold flex items-center justify-center ${
                        q.is_correct ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {q.question_type === "mcq"
                        ? "اختيار من متعدد"
                        : q.question_type === "true_false"
                        ? "صح أو خطأ"
                        : "سؤال مقالي"}
                    </span>
                    {q.concept_name && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                        {q.concept_name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">{q.time_spent_seconds} ثانية</span>
                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-black ${
                        q.is_correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {q.score_awarded} / {q.max_marks} درجة
                    </span>
                  </div>
                </div>

                {/* Question Text */}
                <p className="text-base font-bold text-slate-900 leading-relaxed">{q.question_text}</p>

                {/* Answers Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div
                    className={`p-3.5 rounded-2xl text-xs ${
                      q.is_correct ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"
                    }`}
                  >
                    <span className="font-bold block mb-1">إجابتك:</span>
                    <span>{q.student_answer ? q.student_answer : "(لم تتم الإجابة)"}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 text-slate-900 text-xs">
                    <span className="font-bold block mb-1">الإجابة النموذجية الصحيحة:</span>
                    <span className="font-bold text-emerald-700">{q.correct_answer}</span>
                  </div>
                </div>

                {/* Error Diagnosis if wrong */}
                {!q.is_correct && q.error_reason && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">تشخيص الخطأ:</span>
                      <span>{q.error_reason}</span>
                    </div>
                  </div>
                )}

                {/* Explanation & Source Page */}
                <div className="pt-3 border-t border-slate-100 flex items-start justify-between gap-4 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <span>{q.explanation}</span>
                  </div>
                  {q.source_page && (
                    <span className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                      صفحة {q.source_page}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE: EXAM SOLVING RUNNER
  // ==========================================
  if (!attemptData || !currentQuestion) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between" dir="rtl">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-black shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 line-clamp-1">
                  {attemptData.exam_title}
                </h1>
                {attemptData.is_mock_mode && (
                  <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700 border border-red-200">
                    MOCK MODE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                السؤال {currentIndex + 1} من {totalQuestions} • تم الإجابة على {answeredCount}
              </p>
            </div>
          </div>

          {/* Countdown Timer Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-black text-base shadow-sm transition-all ${
                isDangerTime
                  ? "bg-red-500 text-white border-red-600 animate-pulse shadow-red-500/30"
                  : isWarningTime
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : "bg-slate-100 text-slate-800 border-slate-200"
              }`}
            >
              <Timer className="w-4 h-4" />
              <span>{timerDisplay}</span>
            </div>

            <button
              onClick={() => setShowSubmitModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/20 transition-all"
            >
              إنهاء وتسليم
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Question Palette Navigation */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 shrink-0">فهرس الأسئلة:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {attemptData.questions.map((q, idx) => {
              const isAns = (answers[q.id] || "").trim() !== "";
              const isFlag = flaggedQuestions.has(q.id);
              const isCur = idx === currentIndex;

              let btnClass = "bg-slate-100 text-slate-700 border-slate-200";
              if (isCur) {
                btnClass = "ring-2 ring-orange-500 bg-orange-600 text-white font-black border-transparent shadow-md";
              } else if (isFlag) {
                btnClass = "bg-amber-100 text-amber-800 border-amber-300 font-bold";
              } else if (isAns) {
                btnClass = "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold";
              }

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-8 h-8 rounded-lg text-xs border flex items-center justify-center transition-all shrink-0 ${btnClass}`}
                  title={`الانتقال للسؤال ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Question Box */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          {/* Question Metadata */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg font-bold bg-orange-50 text-orange-800 border border-orange-200">
                {currentQuestion.question_type === "mcq"
                  ? "اختيار من متعدد"
                  : currentQuestion.question_type === "true_false"
                  ? "صح أو خطأ"
                  : "سؤال مقالي"}
              </span>
              <span className="text-slate-400 font-medium">•</span>
              <span className="text-slate-500 font-medium">الدرجة: {currentQuestion.marks}</span>
            </div>

            <button
              onClick={() => toggleFlagQuestion(currentQuestion.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                flaggedQuestions.has(currentQuestion.id)
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{flaggedQuestions.has(currentQuestion.id) ? "تم التمييز للمراجعة" : "تمييز للمراجعة"}</span>
            </button>
          </div>

          {/* Question Statement */}
          <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-relaxed">
            {currentQuestion.question_text}
          </h2>

          {/* Answer Inputs by Type */}
          <div className="pt-2">
            {/* MCQ */}
            {currentQuestion.question_type === "mcq" && currentQuestion.options && (
              <div className="grid grid-cols-1 gap-3">
                {currentQuestion.options.map((option, optIdx) => {
                  const isSelected = answers[currentQuestion.id] === option;
                  const optionLetters = ["أ", "ب", "ج", "د", "هـ"];
                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelectAnswer(currentQuestion.id, option)}
                      className={`p-4 rounded-2xl border text-right text-sm font-medium transition-all flex items-center justify-between gap-4 group ${
                        isSelected
                          ? "bg-orange-50 border-orange-500 text-orange-950 ring-2 ring-orange-500/20 shadow-sm"
                          : "bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/80 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-orange-600 text-white"
                              : "bg-white text-slate-600 border border-slate-200 group-hover:border-slate-300"
                          }`}
                        >
                          {optionLetters[optIdx] || optIdx + 1}
                        </span>
                        <span className="leading-relaxed">{option}</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300"
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* True / False */}
            {currentQuestion.question_type === "true_false" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { value: "صح", label: "صح (العبارة صحيحة)", color: "emerald" },
                  { value: "خطأ", label: "خطأ (العبارة خاطئة)", color: "rose" },
                ].map((choice) => {
                  const isSelected = answers[currentQuestion.id] === choice.value;
                  return (
                    <button
                      key={choice.value}
                      onClick={() => handleSelectAnswer(currentQuestion.id, choice.value)}
                      className={`p-5 rounded-2xl border text-center font-bold text-base transition-all flex flex-col items-center justify-center gap-2 ${
                        isSelected
                          ? choice.color === "emerald"
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20"
                            : "bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-500/20"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="text-xl">{choice.value === "صح" ? "✅" : "❌"}</span>
                      <span>{choice.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Short Answer */}
            {currentQuestion.question_type === "short_answer" && (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={answers[currentQuestion.id] || ""}
                  onChange={(e) => handleSelectAnswer(currentQuestion.id, e.target.value)}
                  placeholder="اكتب إجابتك العلمية الوافية هنا مستنداً إلى نصوص الدرس..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 leading-relaxed focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <div className="flex justify-between text-[11px] text-slate-400 px-1">
                  <span>احرص على استخدام المصطلحات والقوانين العلمية المقررة بدقة.</span>
                  <span>عدد الحروف: {(answers[currentQuestion.id] || "").length}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-40"
          >
            <ArrowRight className="w-4 h-4" />
            <span>السابق</span>
          </button>

          {currentIndex < totalQuestions - 1 ? (
            <button
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-orange-600/20 transition-all"
            >
              <span>التالي</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>مراجعة وتسليم الامتحان</span>
            </button>
          )}
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
              <Award className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">هل أنت متأكد من تسليم الامتحان؟</h3>
              <p className="text-xs text-slate-500 mt-1">
                بمجرد التسليم، سيقوم النظام بالتصحيح التلقائي ولن يمكنك تعديل أي إجابة.
              </p>
            </div>

            {/* Quick Stats in Modal */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl text-xs text-slate-700">
              <div className="text-right">
                <span className="text-slate-400 block">الأسئلة المجابة:</span>
                <span className="font-bold text-emerald-600">
                  {answeredCount} من أصل {totalQuestions}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block">الوقت المتبقي:</span>
                <span className="font-bold text-orange-600">{timerDisplay}</span>
              </div>
            </div>

            {totalQuestions - answeredCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2 text-right">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  تنبيه: لديك {totalQuestions - answeredCount} سؤال بدون إجابة، وسيتم احتسابها 0 درجة.
                </span>
              </div>
            )}

            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-right">
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors"
              >
                العودة للحل
              </button>

              <button
                type="button"
                onClick={() => doSubmitExam(false)}
                disabled={isSubmitting}
                className="py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التصحيح...</span>
                  </>
                ) : (
                  <span>تأكيد وتسليم</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
