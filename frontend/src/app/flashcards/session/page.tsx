"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  CornerDownLeft,
  Flame,
  HelpCircle,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { api, Flashcard, FlashcardReviewResponse } from "@/lib/api";

const CARD_TYPE_NAMES: Record<string, string> = {
  definition: "تعريف ومصطلح",
  concept: "مفهوم وعلاقة",
  formula: "قانون ومعادلة",
  fact: "حقيقة علمية",
  qa: "سؤال وجواب",
};

export default function FlashcardSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[75vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-xs text-slate-500">جاري إعداد جلسة المراجعة التفاعلية...</p>
        </div>
      }
    >
      <FlashcardSessionContent />
    </Suspense>
  );
}

function FlashcardSessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdParam = searchParams.get("document_id");

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submittingRating, setSubmittingRating] = useState(false);

  // Session stats summary
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionResults, setSessionResults] = useState<{
    totalReviewed: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
  }>({
    totalReviewed: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
  });

  const [lastReviewFeedback, setLastReviewFeedback] = useState<string | null>(null);

  // Load due cards
  const loadDueCards = useCallback(async () => {
    try {
      setLoading(true);
      const docId = docIdParam ? Number(docIdParam) : undefined;
      const due = await api.flashcards.getDue(40, docId);
      setCards(due);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionCompleted(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [docIdParam]);

  useEffect(() => {
    const token = localStorage.getItem("studymind_token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadDueCards();
  }, [loadDueCards, router]);

  const currentCard = cards[currentIndex];

  // Submit Rating
  const handleRating = async (rating: "again" | "hard" | "good" | "easy") => {
    if (!currentCard || submittingRating) return;
    try {
      setSubmittingRating(true);
      const res = await api.flashcards.review(currentCard.id, rating);
      setLastReviewFeedback(res.message);

      // Update counters
      setSessionResults((prev) => ({
        ...prev,
        totalReviewed: prev.totalReviewed + 1,
        againCount: rating === "again" ? prev.againCount + 1 : prev.againCount,
        hardCount: rating === "hard" ? prev.hardCount + 1 : prev.hardCount,
        goodCount: rating === "good" ? prev.goodCount + 1 : prev.goodCount,
        easyCount: rating === "easy" ? prev.easyCount + 1 : prev.easyCount,
      }));

      // Next card or finish
      if (currentIndex + 1 < cards.length) {
        setIsFlipped(false);
        setCurrentIndex((prev) => prev + 1);
      } else {
        setSessionCompleted(true);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setSubmittingRating(false);
    }
  };

  // Keyboard Shortcuts (Space to flip, 1/2/3/4 to rate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped && !submittingRating) {
        if (e.key === "1") {
          e.preventDefault();
          handleRating("again");
        } else if (e.key === "2") {
          e.preventDefault();
          handleRating("hard");
        } else if (e.key === "3") {
          e.preventDefault();
          handleRating("good");
        } else if (e.key === "4") {
          e.preventDefault();
          handleRating("easy");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, submittingRating, currentCard]);

  // Toggle Favorite in session
  const handleToggleFavorite = async () => {
    if (!currentCard) return;
    try {
      const updated = await api.flashcards.toggleFavorite(currentCard.id);
      setCards((prev) => prev.map((c) => (c.id === currentCard.id ? updated : c)));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-xs text-slate-500">جاري إعداد الجلسة الذكية واسترجاع البطاقات المستحقة...</p>
      </div>
    );
  }

  // If no due cards
  if (!loading && cards.length === 0 && !sessionCompleted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">رائع! لا توجد بطاقات مستحقة للمراجعة اليوم</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          لقد أنجزت كافة بطاقات التكرار المتباعد المستحقة في جدولك، أو لم تقم بتوليد بطاقات لهذه المادة بعد.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/flashcards"
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md"
          >
            لوحة البطاقات الرئيسية
          </Link>
          <button
            onClick={() => loadDueCards()}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            إعادة الفحص
          </button>
        </div>
      </div>
    );
  }

  // Session Completed Screen
  if (sessionCompleted) {
    const successRate =
      sessionResults.totalReviewed > 0
        ? Math.round(
            ((sessionResults.goodCount + sessionResults.easyCount) / sessionResults.totalReviewed) * 100
          )
        : 100;

    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center animate-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-brand-500 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/25">
          <Trophy className="w-10 h-10" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">أحسنت! أتممت جلسة اليوم بنجاح 🎯</h2>
        <p className="text-xs sm:text-sm text-slate-500 mb-6">
          تم تحديث خوارزمية التكرار المتباعد ومواعيد المراجعة القادمة لترسيخ المعلومات في الذاكرة الدائمة.
        </p>

        {/* Results Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6 text-right space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-500">إجمالي البطاقات المراجعة</span>
            <span className="text-lg font-black text-slate-900">{sessionResults.totalReviewed} بطاقة</span>
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-500">نسبة التمكن الفوري</span>
            <span className="text-lg font-black text-emerald-600">{successRate}%</span>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-1 text-center">
            <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
              <span className="text-xs text-rose-600 font-bold block">Again</span>
              <span className="text-sm font-black text-rose-800">{sessionResults.againCount}</span>
            </div>
            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100">
              <span className="text-xs text-amber-600 font-bold block">Hard</span>
              <span className="text-sm font-black text-amber-800">{sessionResults.hardCount}</span>
            </div>
            <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100">
              <span className="text-xs text-blue-600 font-bold block">Good</span>
              <span className="text-sm font-black text-blue-800">{sessionResults.goodCount}</span>
            </div>
            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
              <span className="text-xs text-emerald-600 font-bold block">Easy</span>
              <span className="text-sm font-black text-emerald-800">{sessionResults.easyCount}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/flashcards"
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20"
          >
            العودة للوحة البطاقات
          </Link>
          <button
            onClick={() => loadDueCards()}
            className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
          >
            مراجعة جولة أخرى
          </button>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(((currentIndex + 1) / cards.length) * 100);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Session Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/flashcards"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          إنهاء والعودة
        </Link>

        {/* Progress Display */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500">
            بطاقة {currentIndex + 1} من {cards.length}
          </span>
          <div className="w-24 sm:w-36 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Card Wrapper (3D Perspective Flip) */}
      <div className="relative min-h-[360px] sm:min-h-[420px] select-none perspective-1000">
        <div
          onClick={() => setIsFlipped(!isFlipped)}
          className={`w-full h-full min-h-[360px] sm:min-h-[420px] rounded-3xl border transition-all duration-500 cursor-pointer p-6 sm:p-8 flex flex-col justify-between shadow-lg relative ${
            isFlipped
              ? "bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white border-indigo-700/50 ring-2 ring-brand-500/20"
              : "bg-white text-slate-900 border-slate-200/90 hover:border-brand-300"
          }`}
        >
          {/* Card Top Header */}
          <div className="flex items-center justify-between gap-2 border-b pb-3 border-current/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  isFlipped ? "bg-white/15 text-sky-200" : "bg-brand-50 text-brand-700 border border-brand-200"
                }`}
              >
                {CARD_TYPE_NAMES[currentCard.card_type] || "مفهوم دراسي"}
              </span>

              {currentCard.document_title && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                    isFlipped ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {currentCard.document_title}
                </span>
              )}

              {currentCard.source_page && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                    isFlipped ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  صفحة {currentCard.source_page}
                </span>
              )}
            </div>

            {/* Favorite Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFavorite();
              }}
              className="p-1 rounded-lg hover:scale-110 transition-transform"
              title="تفضيل البطاقة"
            >
              <Star
                className={`w-5 h-5 ${
                  currentCard.is_favorite
                    ? "fill-amber-400 text-amber-400"
                    : isFlipped
                    ? "text-slate-400"
                    : "text-slate-300"
                }`}
              />
            </button>
          </div>

          {/* Card Center Content */}
          <div className="my-auto py-6 text-center space-y-4">
            {!isFlipped ? (
              <>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-2">
                  السؤال أو المصطلح
                </span>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-black leading-relaxed tracking-tight text-slate-900 max-w-2xl mx-auto">
                  {currentCard.front}
                </h3>
              </>
            ) : (
              <div className="animate-in fade-in duration-200">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-300 block mb-2">
                  الإجابة والشرح الدقيق
                </span>
                <p className="text-base sm:text-xl font-bold leading-relaxed text-slate-100 max-w-2xl mx-auto whitespace-pre-wrap">
                  {currentCard.back}
                </p>
                {currentCard.concept_name && (
                  <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs text-sky-200 font-medium">
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    المفهوم المرتبط: {currentCard.concept_name}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card Bottom Flip Hint */}
          <div className="flex items-center justify-between text-[11px] font-semibold opacity-75 border-t pt-3 border-current/10">
            <span>
              {isFlipped ? "ظهر البطاقة (الحل)" : "وجه البطاقة (السؤال)"}
            </span>
            <span className="flex items-center gap-1">
              <span>انقر أو اضغط مسافة للقلب</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Action Rating Buttons (Visible Always or after Flip) */}
      <div className="space-y-3">
        {!isFlipped ? (
          <button
            onClick={() => setIsFlipped(true)}
            className="w-full py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>إظهار الحل والتقييم (مسافة)</span>
          </button>
        ) : (
          <div>
            <div className="text-xs font-bold text-slate-500 text-center mb-2.5">
              كيف كان استرجاعك لهذه المعلومة؟ (اضغط 1 أو 2 أو 3 أو 4)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Again (1) */}
              <button
                disabled={submittingRating}
                onClick={() => handleRating("again")}
                className="p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-black text-xs sm:text-sm transition-all hover:scale-105 flex flex-col items-center gap-1 disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <span>إعادة (Again)</span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px]">1</span>
                </div>
                <span className="text-[10px] text-rose-600 font-normal">نسيتها تماماً</span>
              </button>

              {/* Hard (2) */}
              <button
                disabled={submittingRating}
                onClick={() => handleRating("hard")}
                className="p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-black text-xs sm:text-sm transition-all hover:scale-105 flex flex-col items-center gap-1 disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <span>صعب (Hard)</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px]">2</span>
                </div>
                <span className="text-[10px] text-amber-600 font-normal">تذكرتها بصعوبة</span>
              </button>

              {/* Good (3) */}
              <button
                disabled={submittingRating}
                onClick={() => handleRating("good")}
                className="p-3.5 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-black text-xs sm:text-sm transition-all hover:scale-105 flex flex-col items-center gap-1 disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <span>جيد (Good)</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-200 text-blue-900 text-[10px]">3</span>
                </div>
                <span className="text-[10px] text-blue-600 font-normal">تذكر صحيح وطبيعي</span>
              </button>

              {/* Easy (4) */}
              <button
                disabled={submittingRating}
                onClick={() => handleRating("easy")}
                className="p-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-black text-xs sm:text-sm transition-all hover:scale-105 flex flex-col items-center gap-1 disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <span>سهل (Easy)</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px]">4</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-normal">إتقان تام وسريع</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live AI Feedback Banner */}
      {lastReviewFeedback && (
        <div className="p-3 bg-brand-50 border border-brand-200/70 text-brand-800 text-xs font-bold rounded-xl text-center">
          {lastReviewFeedback}
        </div>
      )}
    </div>
  );
}
