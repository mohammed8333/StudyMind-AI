"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Flame,
  GraduationCap,
  Layers,
  Loader2,
  PauseCircle,
  Play,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  Flashcard,
  FlashcardsDashboardMetrics,
} from "@/lib/api";

const CARD_TYPE_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  definition: { label: "تعريف ومصطلح", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  concept: { label: "مفهوم وعلاقة", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  formula: { label: "قانون ومعادلة", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  fact: { label: "حقيقة علمية", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  qa: { label: "سؤال وجواب", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

const STATE_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: "جديدة", bg: "bg-sky-100", text: "text-sky-800" },
  learning: { label: "قيد التعلم", bg: "bg-amber-100", text: "text-amber-800" },
  review: { label: "مراجعة دورية", bg: "bg-indigo-100", text: "text-indigo-800" },
  mastered: { label: "متقنة 🎯", bg: "bg-emerald-100", text: "text-emerald-800" },
};

export default function FlashcardsDashboardPage() {
  const router = useRouter();

  // Data States
  const [metrics, setMetrics] = useState<FlashcardsDashboardMetrics | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDocId, setSelectedDocId] = useState<number | undefined>(undefined);
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showSuspendedOnly, setShowSuspendedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  // Generator Form
  const [genDocId, setGenDocId] = useState<number | undefined>(undefined);
  const [genCount, setGenCount] = useState(10);
  const [genTypes, setGenTypes] = useState<string[]>(["definition", "concept", "formula", "qa"]);
  const [generating, setGenerating] = useState(false);

  // Edit / Create Form
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editType, setEditType] = useState<"definition" | "concept" | "formula" | "fact" | "qa">("concept");
  const [editDifficulty, setEditDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [editPage, setEditPage] = useState<number | undefined>(undefined);
  const [savingCard, setSavingCard] = useState(false);

  // Card Flip / Reveal Tracker
  const [revealedCards, setRevealedCards] = useState<Record<number, boolean>>({});

  // Toast / Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashMetrics, docsRes, listRes] = await Promise.all([
        api.flashcards.getDashboard().catch(() => null),
        api.documents.list().catch(() => []),
        api.flashcards.list({
          document_id: selectedDocId,
          card_type: selectedType || undefined,
          review_state: selectedState || undefined,
          is_favorite: showFavoritesOnly ? true : undefined,
          is_suspended: showSuspendedOnly ? true : undefined,
          search: searchQuery || undefined,
          page_size: 60,
        }).catch(() => ({ items: [], total: 0, page: 1, page_size: 60 })),
      ]);

      setMetrics(dashMetrics);
      setDocuments(docsRes || []);
      setCards(listRes.items || []);
      if (docsRes && docsRes.length > 0 && !genDocId) {
        setGenDocId(docsRes[0].id);
      }
    } catch (err: any) {
      console.error(err);
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
    loadData();
  }, [selectedDocId, selectedType, selectedState, showFavoritesOnly, showSuspendedOnly, searchQuery]);

  // Toggle Reveal Back
  const toggleReveal = (cardId: number) => {
    setRevealedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  // Toggle Favorite
  const handleToggleFavorite = async (cardId: number) => {
    try {
      const updated = await api.flashcards.toggleFavorite(cardId);
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      // Refresh metrics
      api.flashcards.getDashboard().then(setMetrics).catch(() => {});
    } catch (err: any) {
      setFeedback({ type: "error", text: "تعذر تحديث المفضلة." });
    }
  };

  // Toggle Suspend
  const handleToggleSuspend = async (cardId: number) => {
    try {
      const updated = await api.flashcards.toggleSuspend(cardId);
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      api.flashcards.getDashboard().then(setMetrics).catch(() => {});
    } catch (err: any) {
      setFeedback({ type: "error", text: "تعذر تحديث حالة التعليق." });
    }
  };

  // Delete Card
  const handleDeleteCard = async (cardId: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه البطاقة نهائياً؟")) return;
    try {
      await api.flashcards.delete(cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setFeedback({ type: "success", text: "تم حذف البطاقة بنجاح." });
      api.flashcards.getDashboard().then(setMetrics).catch(() => {});
    } catch (err: any) {
      setFeedback({ type: "error", text: "فشل حذف البطاقة." });
    }
  };

  // Generate Flashcards
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genDocId) {
      setFeedback({ type: "error", text: "يرجى اختيار المستند المطلوب." });
      return;
    }
    try {
      setGenerating(true);
      setFeedback(null);
      const generated = await api.flashcards.generate({
        document_id: genDocId,
        count: genCount,
        card_types: genTypes,
      });
      setIsGenerateModalOpen(false);
      setFeedback({
        type: "success",
        text: `تم استخراج وتوليد ${generated.length} بطاقة تعليمية موثقة من صفحات المذكرة بنجاح!`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "فشل توليد البطاقات." });
    } finally {
      setGenerating(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (card: Flashcard) => {
    setEditingCard(card);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditType(card.card_type);
    setEditDifficulty(card.difficulty);
    setEditPage(card.source_page || undefined);
    setIsEditModalOpen(true);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingCard(null);
    setEditFront("");
    setEditBack("");
    setEditType("concept");
    setEditDifficulty("medium");
    setEditPage(1);
    setIsEditModalOpen(true);
  };

  // Save Edit / Create
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingCard(true);
      if (editingCard) {
        const updated = await api.flashcards.update(editingCard.id, {
          front: editFront,
          back: editBack,
          card_type: editType,
          difficulty: editDifficulty,
          source_page: editPage,
        });
        setCards((prev) => prev.map((c) => (c.id === editingCard.id ? updated : c)));
        setFeedback({ type: "success", text: "تم تعديل محتوى البطاقة بنجاح!" });
      } else {
        if (!documents[0]?.id) return;
        const newCard = await api.flashcards.create({
          document_id: selectedDocId || documents[0].id,
          front: editFront,
          back: editBack,
          card_type: editType,
          difficulty: editDifficulty,
          source_page: editPage,
        });
        setCards((prev) => [newCard, ...prev]);
        setFeedback({ type: "success", text: "تمت إضافة البطاقة بنجاح!" });
      }
      setIsEditModalOpen(false);
      api.flashcards.getDashboard().then(setMetrics).catch(() => {});
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "فشل حفظ البطاقة." });
    } finally {
      setSavingCard(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 shadow-sm border transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600" />
            )}
            <p className="text-sm font-bold">{feedback.text}</p>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200/60">
              <Sparkles className="w-3.5 h-3.5" />
              Spaced Repetition & Active Recall
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            البطاقات التعليمية والتكرار المتباعد
          </h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1">
            استرجع المفاهيم والقوانين والتعريفات بنظام علمي يضاعف قوة الذاكرة ويمنع النسيان
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {metrics && metrics.due_today > 0 && (
            <Link
              href="/flashcards/session"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white shadow-md shadow-rose-500/20 transition-all hover:scale-105"
            >
              <Play className="w-4 h-4 fill-current" />
              بدء مراجعة اليوم ({metrics.due_today} بطاقة)
            </Link>
          )}

          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            توليد بطاقات من مذكرة
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            إضافة يدوية
          </button>
        </div>
      </div>

      {/* Dashboard Metrics Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Due Today */}
        <div className="bg-gradient-to-br from-rose-500 to-amber-600 text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-100">مستحق اليوم</span>
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <span className="text-3xl font-black">{metrics?.due_today || 0}</span>
            <span className="text-xs text-rose-100 font-medium mr-1.5">بطاقة</span>
          </div>
          <div className="text-[11px] text-rose-100 font-medium flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            جاهزة للمراجعة لترسيخ الذاكرة
          </div>
        </div>

        {/* New Cards */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">بطاقات جديدة</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <span className="text-3xl font-black text-slate-900">{metrics?.new_cards || 0}</span>
            <span className="text-xs text-slate-400 font-medium mr-1.5">بطاقة</span>
          </div>
          <div className="text-[11px] text-sky-600 font-medium">لم يتم تقييمها بعد</div>
        </div>

        {/* Learning */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">قيد التعلم</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <span className="text-3xl font-black text-slate-900">{metrics?.learning || 0}</span>
            <span className="text-xs text-slate-400 font-medium mr-1.5">بطاقة</span>
          </div>
          <div className="text-[11px] text-amber-600 font-medium">فترات تكرار متقاربة</div>
        </div>

        {/* Mastered */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">متقنة بامتياز</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <span className="text-3xl font-black text-slate-900">{metrics?.mastered || 0}</span>
            <span className="text-xs text-slate-400 font-medium mr-1.5">بطاقة</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
            <span>نسبة التذكر: {metrics?.retention_rate || 100}%</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث في نصوص البطاقات، المفاهيم، القوانين..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Document Filter */}
          <select
            value={selectedDocId || ""}
            onChange={(e) => setSelectedDocId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full md:w-48 px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">جميع المذكرات</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>

          {/* Card Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full md:w-40 px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">جميع الأنواع</option>
            <option value="definition">تعريف ومصطلح</option>
            <option value="concept">مفهوم وعلاقة</option>
            <option value="formula">قانون ومعادلة</option>
            <option value="fact">حقيقة علمية</option>
            <option value="qa">سؤال وجواب</option>
          </select>

          {/* Review State Filter */}
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full md:w-36 px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">كافة الحالات</option>
            <option value="new">جديدة</option>
            <option value="learning">قيد التعلم</option>
            <option value="review">مراجعة دورية</option>
            <option value="mastered">متقنة</option>
          </select>
        </div>

        {/* Quick Filter Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium ml-1">تصفية سريعة:</span>
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`px-3 py-1 rounded-lg font-semibold border transition-all flex items-center gap-1 ${
              showFavoritesOnly
                ? "bg-amber-50 text-amber-700 border-amber-300"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-amber-500 text-amber-500" : ""}`} />
            المفضلة فقط ({metrics?.favorites_count || 0})
          </button>

          <button
            onClick={() => setShowSuspendedOnly(!showSuspendedOnly)}
            className={`px-3 py-1 rounded-lg font-semibold border transition-all flex items-center gap-1 ${
              showSuspendedOnly
                ? "bg-slate-200 text-slate-800 border-slate-300"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            المعلقة مؤقتاً ({metrics?.suspended_count || 0})
          </button>
        </div>
      </div>

      {/* Flashcards Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-xs text-slate-500">جاري تحميل البطاقات التعليمية...</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center max-w-lg mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
            <Layers className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">لا توجد بطاقات مطابقة</h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-5">
            يمكنك توليد بطاقات جديدة فوراً من أي مذكرة عبر الذكاء الاصطناعي مع توثيق المصدر ورقم الصفحة.
          </p>
          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20"
          >
            <Sparkles className="w-4 h-4" />
            توليد بطاقات ذكية الآن
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => {
            const typeInfo = CARD_TYPE_STYLES[card.card_type] || CARD_TYPE_STYLES["concept"];
            const stateInfo = STATE_BADGES[card.review_state] || STATE_BADGES["new"];
            const isRevealed = !!revealedCards[card.id];

            return (
              <div
                key={card.id}
                className={`bg-white rounded-2xl border transition-all flex flex-col justify-between shadow-sm hover:shadow-md ${
                  card.is_suspended ? "opacity-60 border-dashed border-slate-300" : "border-slate-200/90 hover:border-brand-300"
                }`}
              >
                {/* Card Header Info */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeInfo.bg} ${typeInfo.text} ${typeInfo.border}`}
                    >
                      {card.card_type_label || typeInfo.label}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stateInfo.bg} ${stateInfo.text}`}>
                      {stateInfo.label}
                    </span>
                    {card.source_page && (
                      <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                        صـ {card.source_page}
                      </span>
                    )}
                  </div>

                  {/* Favorite and Suspend Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleFavorite(card.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                      title={card.is_favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                    >
                      <Star className={`w-4 h-4 ${card.is_favorite ? "fill-amber-500 text-amber-500" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleToggleSuspend(card.id)}
                      className={`p-1 rounded-lg transition-colors ${
                        card.is_suspended
                          ? "text-amber-600 bg-amber-50"
                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      }`}
                      title={card.is_suspended ? "تفعيل البطاقة في المراجعات" : "تعليق البطاقة مؤقتاً"}
                    >
                      <PauseCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-center">
                  {/* Front: Question / Term */}
                  <div className="mb-3">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">الوجه (السؤال / المصطلح):</span>
                    <p className="text-sm font-bold text-slate-900 leading-relaxed">{card.front}</p>
                  </div>

                  {/* Back: Answer / Explanation */}
                  <div className="mt-2 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400">الظهر (الإجابة / الشرح):</span>
                      <button
                        onClick={() => toggleReveal(card.id)}
                        className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                      >
                        {isRevealed ? (
                          <>
                            <EyeOff className="w-3 h-3" /> إخفاء
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" /> إظهار الحل
                          </>
                        )}
                      </button>
                    </div>

                    {isRevealed ? (
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed font-medium">
                        {card.back}
                      </p>
                    ) : (
                      <div
                        onClick={() => toggleReveal(card.id)}
                        className="h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <span className="text-[11px] text-slate-400 font-medium">انقر لإظهار الإجابة</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Metadata and Actions */}
                <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 rounded-b-2xl flex items-center justify-between text-xs">
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>تكرار: {card.repetition_count}</span>
                    <span>•</span>
                    <span>فاصل: {card.interval_days} يوم</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(card)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
                      title="تعديل البطاقة"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCard(card.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="حذف البطاقة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generator Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">توليد بطاقات بالذكاء الاصطناعي</h3>
                  <p className="text-xs text-slate-500">استخراج موثق من نصوص مذكرتك المرفوعة</p>
                </div>
              </div>
              <button onClick={() => setIsGenerateModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              {/* Select Document */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">المستند المصدر *</label>
                <select
                  required
                  value={genDocId || ""}
                  onChange={(e) => setGenDocId(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-brand-500"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.subject || "عام"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Number of Cards */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">عدد البطاقات المطلوب استخراجها</label>
                <select
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-brand-500"
                >
                  <option value={5}>5 بطاقات (مراجعة سريعة)</option>
                  <option value={10}>10 بطاقات (موصى به)</option>
                  <option value={15}>15 بطاقة (شامل)</option>
                  <option value={20}>20 بطاقة (مكثف)</option>
                </select>
              </div>

              {/* Card Types Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">أنواع البطاقات المستهدفة</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "definition", label: "تعريفات ومصطلحات" },
                    { id: "concept", label: "مفاهيم وعلاقات" },
                    { id: "formula", label: "قوانين ومعادلات" },
                    { id: "qa", label: "أسئلة استرجاع نشط" },
                  ].map((t) => {
                    const checked = genTypes.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => {
                          if (checked) {
                            if (genTypes.length > 1) setGenTypes(genTypes.filter((x) => x !== t.id));
                          } else {
                            setGenTypes([...genTypes, t.id]);
                          }
                        }}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-right ${
                          checked
                            ? "bg-brand-50 text-brand-700 border-brand-300 ring-1 ring-brand-500/20"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري الاستخراج من نصوص المذكرة...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      توليد وحفظ البطاقات الآن
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Create Manual Card Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingCard ? "تعديل محتوى البطاقة" : "إضافة بطاقة تعليمية جديدة"}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-4">
              {/* Front */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">وجه البطاقة (السؤال أو المصطلح) *</label>
                <textarea
                  required
                  rows={2}
                  value={editFront}
                  onChange={(e) => setEditFront(e.target.value)}
                  placeholder="اكتب السؤال أو المفهوم هنا..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Back */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ظهر البطاقة (الإجابة والشرح الدقيق) *</label>
                <textarea
                  required
                  rows={3}
                  value={editBack}
                  onChange={(e) => setEditBack(e.target.value)}
                  placeholder="اكتب الإجابة أو التعريف أو القانون هنا..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Type and Difficulty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع البطاقة</label>
                  <select
                    value={editType}
                    onChange={(e: any) => setEditType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                  >
                    <option value="concept">مفهوم وعلاقة</option>
                    <option value="definition">تعريف ومصطلح</option>
                    <option value="formula">قانون ومعادلة</option>
                    <option value="fact">حقيقة علمية</option>
                    <option value="qa">سؤال وجواب</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">مستوى الصعوبة</label>
                  <select
                    value={editDifficulty}
                    onChange={(e: any) => setEditDifficulty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                  >
                    <option value="easy">سهل</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">صعب</option>
                  </select>
                </div>
              </div>

              {/* Page Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم الصفحة في المذكرة (اختياري)</label>
                <input
                  type="number"
                  value={editPage || ""}
                  onChange={(e) => setEditPage(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="مثلاً: 12"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingCard}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {savingCard ? "جاري الحفظ..." : "حفظ البطاقة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
