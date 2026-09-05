"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Copy,
  Edit3,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquare,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
  X
} from "lucide-react";
import { api } from "@/lib/api";

interface ConceptItem {
  concept_id: number;
  concept_name: string;
  subject?: string;
  mastery_score: number;
  total_attempts: number;
  correct_attempts: number;
  is_weak_point: boolean;
}

interface DocumentAnalytics {
  total_documents: number;
  total_quizzes_taken: number;
  average_score: number;
  weak_concepts: ConceptItem[];
  strong_concepts: ConceptItem[];
  recommended_revision_plan: string[];
}

export default function MaterialDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const docId = Number(params.id);

  const [documentData, setDocumentData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<DocumentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Summary state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string>("");
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Quiz Generator state
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizDifficulty, setQuizDifficulty] = useState("medium");
  const [quizNumQuestions, setQuizNumQuestions] = useState(5);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");

  // Rename & Delete state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameSubject, setRenameSubject] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openRenameModal = () => {
    if (!documentData) return;
    setRenameTitle(documentData.title);
    setRenameSubject(documentData.subject || "الفيزياء");
    setRenameError(null);
    setShowRenameModal(true);
  };

  const handleRenameDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTitle.trim()) return;
    setIsRenaming(true);
    setRenameError(null);
    try {
      const updated = await api.documents.update(docId, {
        title: renameTitle.trim(),
        subject: renameSubject.trim(),
      });
      setDocumentData((prev: any) => ({ ...prev, title: updated.title, subject: updated.subject }));
      setShowRenameModal(false);
    } catch (err: any) {
      setRenameError(err.message || "فشل تعديل اسم المستند");
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteDocument = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.documents.delete(docId);
      router.replace("/library");
    } catch (err: any) {
      setDeleteError(err.message || "فشل حذف المستند");
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (docId) {
      loadMaterialData();
    }
  }, [docId]);

  const loadMaterialData = async () => {
    setLoading(true);
    try {
      // 1. Load document metadata
      const doc = await api.documents.get(docId);
      setDocumentData(doc);

      // 2. Load document specific analytics
      const anl = await api.analytics.getDocument(docId);
      setAnalytics(anl);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSummary = async () => {
    setShowSummaryModal(true);
    if (!summaryContent) {
      setSummaryLoading(true);
      try {
        const res = await api.tutor.summarize(docId);
        setSummaryContent(res.summary || "تم تجهيز الملخص بنجاح.");
      } catch (err: any) {
        setSummaryContent(err.message || "حدث خطأ أثناء إعداد الملخص الذكي.");
      } finally {
        setSummaryLoading(false);
      }
    }
  };

  const handleCopySummary = () => {
    if (summaryContent) {
      navigator.clipboard.writeText(summaryContent);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  const handleGenerateQuiz = async () => {
    setIsGeneratingQuiz(true);
    setQuizError("");
    try {
      const newQuiz = await api.quizzes.generate({
        document_id: docId,
        difficulty: quizDifficulty,
        num_questions: quizNumQuestions,
      });
      router.push(`/quiz/${newQuiz.id}`);
    } catch (err: any) {
      setQuizError(err.message || "فشل توليد الاختبار. حاول مرة أخرى.");
      setIsGeneratingQuiz(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-xs text-slate-500">جاري تحميل لوحة تحكم المادة وتحليل الإتقان...</p>
      </div>
    );
  }

  if (!documentData) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 text-center">
        <h2 className="text-lg font-bold text-slate-800 mb-2">المادة الدراسية غير موجودة</h2>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-xl"
        >
          <span>الرجوع للوحة التحكم</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-24 space-y-6 sm:space-y-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard"
                className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1 transition-colors"
              >
                <span>المكتبة الدراسية</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
              <span className="text-xs text-slate-300">/</span>
              <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                {documentData.subject || "مادة عامة"}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
              {documentData.title}
            </h1>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
              <span>ملف: {documentData.filename}</span>
              <span>•</span>
              <span>عدد الصفحات: {documentData.total_pages} صفحة</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button
            type="button"
            onClick={openRenameModal}
            className="px-3 py-2 text-xs font-bold text-slate-700 hover:text-brand-600 bg-slate-100 hover:bg-brand-50 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            title="تعديل اسم المذكرة"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>تعديل الاسم</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            title="حذف المذكرة"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف المذكرة</span>
          </button>

          <Link
            href="/library"
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <ArrowRight className="w-4 h-4" />
            <span>المكتبة</span>
          </Link>
        </div>
      </div>

      {/* The 3 Core Action Buttons requested by the user */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. زرار للشات (المدرس الذكي) */}
        <Link
          href={`/study/${docId}`}
          className="group p-6 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <MessageSquare className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              محادثة ذكية 💬
            </span>
          </div>
          <div className="mt-6">
            <h3 className="text-lg font-bold">المدرس الذكي (الشات)</h3>
            <p className="text-xs text-blue-100 mt-1 leading-relaxed">
              اسأل المعلم عن أي جزئية، وحدد مستوى التبسيط، مع مراجع موثقة من الكتاب.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90">
            <span>ابدأ المحادثة الآن</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 2. زرار للـ Quiz */}
        <button
          onClick={() => setShowQuizModal(true)}
          className="group text-right p-6 bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <PlayCircle className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              اختبار فوري 📝
            </span>
          </div>
          <div className="mt-6">
            <h3 className="text-lg font-bold">بدء اختبار (Quiz)</h3>
            <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
              توليد كويز اختياري ذكي من مذكرتك مع تصحيح فوري وتحديث لنقاط القوة والضعف.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90 w-full">
            <span>توليد كويز جديد</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>

        {/* 3. زرار للتلخيص */}
        <button
          onClick={handleOpenSummary}
          className="group text-right p-6 bg-gradient-to-br from-purple-600 to-violet-700 hover:from-purple-700 hover:to-violet-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              ملخص المادة 📑
            </span>
          </div>
          <div className="mt-6">
            <h3 className="text-lg font-bold">تلخيص شامل للمادة</h3>
            <p className="text-xs text-purple-100 mt-1 leading-relaxed">
              استخراج الفكرة العامة، أهم المفاهيم والقوانين، وملاحظات الامتحان بنص منظم.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90 w-full">
            <span>عرض الملخص الذكي</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Quick Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">الاختبارات المكتملة في المادة</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{analytics?.total_quizzes_taken || 0}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">متوسط درجات الاختبارات</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{analytics?.average_score || 0}%</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500">المفاهيم المتقنة مقابل الضعيفة</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">
              <span className="text-emerald-600">{analytics?.strong_concepts.length || 0}</span>
              {" / "}
              <span className="text-rose-600">{analytics?.weak_concepts.length || 0}</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* The Exact Section Circled in Red: تشخيص مستوى الطالب (Adaptive Engine) */}
      <section className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            <span>تشخيص مستوى الطالب في هذه المادة (Adaptive Engine)</span>
          </h2>
          <span className="text-xs text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 font-medium">
            تحديث تلقائي بعد كل اختبار
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 1. نقاط تحتاج تركيز (Weak Points) */}
          <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                نقاط تحتاج تركيز (Weak Points)
              </span>
              <span className="text-xs bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                {analytics?.weak_concepts.length || 0}
              </span>
            </div>

            {!analytics || analytics.weak_concepts.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-xs text-slate-500 leading-relaxed">
                  رائع جداً! لا توجد نقاط ضعف مسجلة في هذه المادة حتى الآن.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {analytics.weak_concepts.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{c.concept_name}</span>
                    <span className="font-bold text-rose-600 font-mono">{c.mastery_score}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. المفاهيم المتقنة (Strong Points) */}
          <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                المفاهيم المتقنة (Strong Points)
              </span>
              <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                {analytics?.strong_concepts.length || 0}
              </span>
            </div>

            {!analytics || analytics.strong_concepts.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-xs text-slate-500 leading-relaxed">
                  قم بحل أول كويز في المادة لتسجيل مفاهيمك المتقنة هنا.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {analytics.strong_concepts.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{c.concept_name}</span>
                    <span className="font-bold text-emerald-600 font-mono">{c.mastery_score}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. خطة المذاكرة المقترحة لك */}
          <div className="bg-white p-5 rounded-2xl border border-brand-200 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-brand-700 flex items-center gap-1.5 mb-4">
                <Sparkles className="w-4 h-4 text-brand-600" />
                خطة المذاكرة المقترحة لك
              </span>
              <div className="space-y-2.5 text-xs text-slate-600">
                {analytics?.recommended_revision_plan.map((step, i) => (
                  <div key={i} className="leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {step}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100">
              <Link
                href={`/study/${docId}`}
                className="w-full py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>مراجعة النقاط مع المدرس الآن</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">ملخص المادة الذكي</h3>
                  <p className="text-xs text-slate-400">{documentData.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-slate-800 leading-relaxed text-sm whitespace-pre-line font-sans">
              {summaryLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                  <p className="text-xs text-slate-500">جاري صياغة ملخص تعليمي شامل للمادة بواسطة الذكاء الاصطناعي...</p>
                </div>
              ) : (
                summaryContent
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex items-center justify-between">
              <button
                onClick={handleCopySummary}
                disabled={summaryLoading || !summaryContent}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedSummary ? "تم النسخ!" : "نسخ الملخص"}</span>
              </button>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Quiz Generator Modal */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">بدء اختبار جديد في المادة</h3>
              </div>
              <button
                onClick={() => setShowQuizModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {quizError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                {quizError}
              </div>
            )}

            <div className="space-y-4 text-xs">
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
                      onClick={() => setQuizDifficulty(lvl.id)}
                      className={`py-2 rounded-xl border font-bold transition-all ${
                        quizDifficulty === lvl.id
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
                      onClick={() => setQuizNumQuestions(num)}
                      className={`py-2 rounded-xl border font-bold transition-all ${
                        quizNumQuestions === num
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
                  type="button"
                  onClick={handleGenerateQuiz}
                  disabled={isGeneratingQuiz}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingQuiz ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري صياغة الأسئلة...</span>
                    </>
                  ) : (
                    <span>توليد وبدء الكويز الآن</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuizModal(false)}
                  disabled={isGeneratingQuiz}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">تعديل المذكرة</h3>
                  <p className="text-xs text-slate-400">تحديث عنوان المادة أو التصنيف</p>
                </div>
              </div>
              <button
                onClick={() => setShowRenameModal(false)}
                disabled={isRenaming}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renameError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{renameError}</span>
              </div>
            )}

            <form onSubmit={handleRenameDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان المذكرة الجديد</label>
                <input
                  type="text"
                  required
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  placeholder="مثال: مذكرة الفيزياء الحديثة"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  disabled={isRenaming}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">المادة الدراسية</label>
                <select
                  value={renameSubject}
                  onChange={(e) => setRenameSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  disabled={isRenaming}
                >
                  <option value="الفيزياء">الفيزياء</option>
                  <option value="الكيمياء">الكيمياء</option>
                  <option value="الأحياء">الأحياء</option>
                  <option value="اللغة العربية">اللغة العربية</option>
                  <option value="الرياضيات">الرياضيات</option>
                  <option value="البرمجة">البرمجة</option>
                  <option value="التاريخ">التاريخ</option>
                  <option value="الجغرافيا">الجغرافيا</option>
                  <option value="اللغة الإنجليزية">اللغة الإنجليزية</option>
                  <option value="أخرى">مادة أخرى</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isRenaming || !renameTitle.trim()}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {isRenaming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <span>حفظ التعديلات</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  disabled={isRenaming}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">تأكيد حذف المذكرة</h3>
                <p className="text-xs text-slate-500">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                هل أنت متأكد من حذف مذكرة <strong className="text-slate-900 font-bold">"{documentData.title}"</strong>؟
              </p>
              <p className="text-[11px] text-red-500 mt-2 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                سيتم حذف كافة الأسئلة، الاختبارات، والمفاهيم المرتبطة بها نهائيًا وستتم إعادة توجيهك إلى المكتبة.
              </p>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، احذف المذكرة</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl transition-colors"
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
