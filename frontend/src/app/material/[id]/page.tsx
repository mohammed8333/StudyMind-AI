"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileText,
  GraduationCap,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquare,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  X,
  Zap
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
  primary_error_type?: string;
  primary_error_label?: string;
  error_summary?: string;
  is_proficient?: boolean;
}

interface RemedialQuestion {
  id: number;
  question_text: string;
  question_type: string;
  options: string[];
  source_page?: number;
}

interface RemedialSessionData {
  session_id: number;
  concept_id: number;
  concept_name: string;
  document_id: number;
  document_title: string;
  primary_error_type: string;
  primary_error_label: string;
  diagnosis: string;
  mini_lesson: string;
  mastery_before: number;
  total_questions: number;
  questions: RemedialQuestion[];
}

interface RemedialFeedbackItem {
  question_id: number;
  question_text: string;
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
  source_page?: number;
}

interface RemedialResultData {
  session_id: number;
  concept_id: number;
  concept_name: string;
  score: number;
  total_questions: number;
  percentage: number;
  mastery_before: number;
  mastery_after: number;
  is_proficient: boolean;
  proficiency_message: string;
  questions_feedback: RemedialFeedbackItem[];
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

  // Exam Generator state (AI Exam Simulator)
  const [showExamModal, setShowExamModal] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [examNumQuestions, setExamNumQuestions] = useState<number>(10);
  const [examDuration, setExamDuration] = useState<number>(30);
  const [examDifficulty, setExamDifficulty] = useState<string>("medium");
  const [examTypes, setExamTypes] = useState<string[]>(["mcq", "true_false", "short_answer"]);
  const [examIsMock, setExamIsMock] = useState<boolean>(false);
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);
  const [examError, setExamError] = useState("");

  // Rename & Delete state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameSubject, setRenameSubject] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Remedial Session state
  const [showRemedialModal, setShowRemedialModal] = useState(false);
  const [remedialLoading, setRemedialLoading] = useState(false);
  const [remedialError, setRemedialError] = useState<string | null>(null);
  const [remedialStep, setRemedialStep] = useState<"lesson" | "questions" | "result">("lesson");
  const [remedialSession, setRemedialSession] = useState<RemedialSessionData | null>(null);
  const [remedialAnswers, setRemedialAnswers] = useState<Record<number, string>>({});
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [isSubmittingRemedial, setIsSubmittingRemedial] = useState(false);
  const [remedialResult, setRemedialResult] = useState<RemedialResultData | null>(null);

  const startRemedialSession = async (conceptId: number) => {
    setShowRemedialModal(true);
    setRemedialLoading(true);
    setRemedialError(null);
    setRemedialStep("lesson");
    setRemedialSession(null);
    setRemedialAnswers({});
    setCurrentQIndex(0);
    setRemedialResult(null);

    try {
      const data = await api.learning.remediate(conceptId);
      setRemedialSession(data);
    } catch (err: any) {
      setRemedialError(err.message || "فشل بدء الجلسة العلاجية.");
    } finally {
      setRemedialLoading(false);
    }
  };

  const handleSelectRemedialOption = (questionId: number, option: string) => {
    setRemedialAnswers(prev => ({
      ...prev,
      [questionId]: option
    }));
  };

  const handleSubmitRemedial = async () => {
    if (!remedialSession) return;
    setIsSubmittingRemedial(true);
    setRemedialError(null);

    try {
      const answersPayload = remedialSession.questions.map(q => ({
        question_id: q.id,
        selected_answer: remedialAnswers[q.id] || ""
      }));

      const res = await api.learning.submitRemedial(remedialSession.session_id, answersPayload);
      setRemedialResult(res);
      setRemedialStep("result");
      loadMaterialData();
    } catch (err: any) {
      setRemedialError(err.message || "فشل تسليم الإجابات.");
    } finally {
      setIsSubmittingRemedial(false);
    }
  };

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

  const handleGenerateExam = async () => {
    if (!docId) return;
    setIsGeneratingExam(true);
    setExamError("");
    try {
      const newExam = await api.exams.generate({
        document_id: docId,
        title: examTitle.trim() || `امتحان ${documentData?.subject || documentData?.title || "المادة"}`,
        num_questions: examNumQuestions,
        difficulty: examDifficulty,
        duration_minutes: examDuration,
        question_types: examTypes.length > 0 ? examTypes : ["mcq", "true_false", "short_answer"],
        is_mock_mode: examIsMock,
      });
      router.push(`/exams/${newExam.id}`);
    } catch (err: any) {
      setExamError(err.message || "فشل توليد الامتحان. حاول مرة أخرى.");
      setIsGeneratingExam(false);
    }
  };

  const toggleExamType = (type: string) => {
    setExamTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
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

      {/* The 5 Core Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* 1. زرار للشات (المدرس الذكي) */}
        <Link
          href={`/study/${docId}`}
          className="group p-5 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              محادثة ذكية 💬
            </span>
          </div>
          <div className="mt-5">
            <h3 className="text-base font-bold">المدرس الذكي</h3>
            <p className="text-xs text-blue-100 mt-1 leading-relaxed">
              اسأل المعلم عن أي جزئية، وحدد مستوى التبسيط، مع مراجع موثقة.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90">
            <span>ابدأ المحادثة</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 2. زرار للـ Quiz */}
        <button
          onClick={() => setShowQuizModal(true)}
          className="group text-right p-5 bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <PlayCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              اختبار فوري 📝
            </span>
          </div>
          <div className="mt-5">
            <h3 className="text-base font-bold">بدء كويز (Quiz)</h3>
            <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
              كويز اختياري فوري من مذكرتك مع تصحيح ذكي وتحديث نقاط القوة.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90 w-full">
            <span>توليد كويز جديد</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>

        {/* 3. زرار محاكي الامتحانات (AI Exam Simulator) */}
        <button
          onClick={() => {
            if (!examTitle && documentData) {
              setExamTitle(`امتحان ${documentData.subject || documentData.title}`);
            }
            setShowExamModal(true);
          }}
          className="group text-right p-5 bg-gradient-to-br from-rose-600 via-pink-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ring-2 ring-rose-300/40"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <Award className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-white/25 px-2.5 py-1 rounded-full backdrop-blur-sm">
              محاكي امتحانات ⏱️
            </span>
          </div>
          <div className="mt-5">
            <h3 className="text-base font-bold">محاكي الامتحانات (Exam)</h3>
            <p className="text-xs text-rose-100 mt-1 leading-relaxed">
              محاكاة امتحان حقيقي بتايمر وتصحيح ذكي شامل وتوصيات علاجية.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90 w-full">
            <span>توليد امتحان رسمي</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>

        {/* 4. زرار بطاقات التكرار المتباعد (Flashcards) */}
        <Link
          href={`/flashcards?document_id=${docId}`}
          className="group p-5 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              تكرار متباعد 🎴
            </span>
          </div>
          <div className="mt-5">
            <h3 className="text-base font-bold">بطاقات الحفظ</h3>
            <p className="text-xs text-amber-100 mt-1 leading-relaxed">
              تثبيت المفاهيم بخوارزمية SM-2 مع مراجعة مضاعفة لنقاط الضعف.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90">
            <span>استعراض البطاقات</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 5. زرار للتلخيص */}
        <button
          onClick={handleOpenSummary}
          className="group text-right p-5 bg-gradient-to-br from-purple-600 to-violet-700 hover:from-purple-700 hover:to-violet-800 text-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
              ملخص المادة 📑
            </span>
          </div>
          <div className="mt-5">
            <h3 className="text-base font-bold">تلخيص شامل</h3>
            <p className="text-xs text-purple-100 mt-1 leading-relaxed">
              الفكرة العامة، أهم المفاهيم والقوانين وملاحظات الامتحان.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white/90 w-full">
            <span>عرض الملخص</span>
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
          <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm flex flex-col">
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
              <div className="p-4 bg-slate-50 rounded-xl text-center flex-1 flex items-center justify-center">
                <p className="text-xs text-slate-500 leading-relaxed">
                  رائع جداً! لا توجد نقاط ضعف مسجلة في هذه المادة حتى الآن.
                </p>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {analytics.weak_concepts.map((c, i) => {
                  const errType = c.primary_error_type || "knowledge_gap";
                  const errLabel = c.primary_error_label || "فجوة معرفية في المفهوم";
                  
                  let badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
                  let badgeIcon = "📖";
                  if (errType === "calculation_mistake") {
                    badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                    badgeIcon = "🔢";
                  } else if (errType === "careless_error") {
                    badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                    badgeIcon = "⚡";
                  } else if (errType === "misconception") {
                    badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                    badgeIcon = "💡";
                  }

                  return (
                    <div
                      key={i}
                      className="p-3 rounded-2xl bg-white border border-rose-100 shadow-[0_2px_8px_rgba(244,63,94,0.06)] hover:border-rose-300 transition-all space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">{c.concept_name}</span>
                        <span className="font-bold text-rose-600 font-mono text-xs bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                          {c.mastery_score}%
                        </span>
                      </div>

                      {/* Error diagnosis badge (Why you're weak) */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${badgeColor}`}>
                          <span>{badgeIcon}</span>
                          <span>{errLabel}</span>
                        </span>
                      </div>

                      {/* Start Remedial Session Button */}
                      <button
                        onClick={() => startRemedialSession(c.concept_id)}
                        className="w-full py-2 px-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm hover:shadow transition-all"
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>بدء جلسة علاجية 🎯</span>
                      </button>
                    </div>
                  );
                })}
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

      {/* Interactive AI Exam Simulator Generator Modal */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-inner">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-1.5">
                    <span>محاكي الامتحانات الذكي</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                      Exam Simulator ⏱️
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    توليد امتحان رسمي موثق من المذكرة مع تايمر حقيقي وتصحيح فوري
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExamModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {examError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{examError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Exam Title */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">عنوان الامتحان</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder={`امتحان ${documentData?.subject || documentData?.title || "المادة"}`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs text-slate-800 font-medium"
                />
              </div>

              {/* Difficulty */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">مستوى الصعوبة</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "easy", label: "سهل ومباشر" },
                    { id: "medium", label: "متوسط المنهج" },
                    { id: "hard", label: "متقدم وتحدي" },
                  ].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setExamDifficulty(lvl.id)}
                      className={`py-2 rounded-xl border font-bold transition-all ${
                        examDifficulty === lvl.id
                          ? "bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of Questions & Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">عدد الأسئلة</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 15, 20].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setExamNumQuestions(num)}
                        className={`py-2 rounded-xl border font-bold text-center transition-all ${
                          examNumQuestions === num
                            ? "bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">مدة الامتحان</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setExamDuration(mins)}
                        className={`py-2 rounded-xl border font-bold text-center transition-all ${
                          examDuration === mins
                            ? "bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        title={`${mins} دقيقة`}
                      >
                        {mins}د
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Question Types */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">أنماط الأسئلة المتضمنة</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "mcq", label: "اختيار من متعدد" },
                    { id: "true_false", label: "صح وخطأ" },
                    { id: "short_answer", label: "مقالي قصير" },
                  ].map((t) => {
                    const isSelected = examTypes.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleExamType(t.id)}
                        className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-rose-50 border-rose-500 text-rose-800 ring-1 ring-rose-500/30"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mock Exam Mode Toggle */}
              <div
                onClick={() => setExamIsMock(!examIsMock)}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  examIsMock
                    ? "bg-amber-50/80 border-amber-300 text-amber-950"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${examIsMock ? "bg-amber-200 text-amber-800" : "bg-white text-slate-400"}`}>
                    <Timer className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs">وضع المحاكاة الرسمية (Mock Exam Mode)</h4>
                    <p className="text-[11px] text-slate-500">تسليم تلقائي حاسم عند انتهاء التايمر وبدون مؤشرات مساعدة</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${examIsMock ? "bg-amber-600 border-amber-600 text-white" : "border-slate-300 bg-white"}`}>
                  {examIsMock && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateExam}
                  disabled={isGeneratingExam}
                  className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingExam ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري صياغة الامتحان من المذكرة...</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>بدء محاكاة الامتحان الآن</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExamModal(false)}
                  disabled={isGeneratingExam}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>

              {/* View all exams link */}
              <div className="text-center pt-1">
                <Link
                  href="/exams"
                  className="text-[11px] font-bold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1"
                >
                  <span>استعراض كافة الامتحانات وسجل المحاولات</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
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

      {/* Interactive Adaptive Remedial Learning Modal */}
      {showRemedialModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shadow-inner">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-900 text-base">جلسة علاجية تكيفية مغلقة</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">
                      Adaptive Loop
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    {remedialSession ? `${remedialSession.concept_name} • ${remedialSession.document_title}` : "تحليل نقطة الضعف وإعداد خطة العلاج"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRemedialModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {remedialLoading && (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">جاري تجهيز جلستك العلاجية الذكية...</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                      يتم الآن تشخيص سبب الخطأ واستخراج الدرس المصغر والأسئلة العلاجية حصراً من نصوص مذكرتك المعتمدة.
                    </p>
                  </div>
                </div>
              )}

              {remedialError && !remedialLoading && (
                <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col items-center justify-center text-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                  <div>
                    <h5 className="font-bold text-rose-900 text-sm">تعذر بدء الجلسة العلاجية</h5>
                    <p className="text-xs text-rose-700 mt-1">{remedialError}</p>
                  </div>
                  <button
                    onClick={() => setShowRemedialModal(false)}
                    className="px-4 py-2 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    إغلاق
                  </button>
                </div>
              )}

              {!remedialLoading && remedialSession && (
                <>
                  {/* STEP 1: Lesson & Diagnosis */}
                  {remedialStep === "lesson" && (
                    <div className="space-y-4">
                      {/* Diagnosis Box (Why you're weak) */}
                      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                            <Lightbulb className="w-4 h-4 text-amber-600" />
                            تشخيص محرك التعلم: لماذا أخطأت في هذا المفهوم؟
                          </span>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            {remedialSession.primary_error_label}
                          </span>
                        </div>
                        <p className="text-xs text-amber-800 leading-relaxed font-medium whitespace-pre-line">
                          {remedialSession.diagnosis}
                        </p>
                      </div>

                      {/* Mini Lesson strictly grounded */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-brand-600" />
                            الدرس العلاجي المركز (مستخلص من مذكرتك حصراً)
                          </span>
                          <span className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-500 px-2.5 py-0.5 rounded-full">
                            محتوى موثق 100%
                          </span>
                        </div>
                        <div className="text-xs leading-relaxed text-slate-700 whitespace-pre-line space-y-2">
                          {remedialSession.mini_lesson}
                        </div>
                      </div>

                      {/* Button to proceed to re-test */}
                      <div className="pt-2">
                        <button
                          onClick={() => setRemedialStep("questions")}
                          className="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                        >
                          <span>استوعبت الدرس! ابدأ الأسئلة العلاجية ({remedialSession.questions.length} أسئلة)</span>
                          <ArrowRight className="w-4 h-4 -rotate-180" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Targeted Re-test Questions */}
                  {remedialStep === "questions" && (
                    <div className="space-y-5">
                      {/* Questions Progress Header */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-700">
                            السؤال {currentQIndex + 1} من {remedialSession.questions.length}
                          </span>
                          <span className="text-brand-600 font-mono">
                            {Math.round(((currentQIndex + 1) / remedialSession.questions.length) * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-500 to-indigo-600 transition-all duration-300 rounded-full"
                            style={{
                              width: `${((currentQIndex + 1) / remedialSession.questions.length) * 100}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Current Question */}
                      {(() => {
                        const q = remedialSession.questions[currentQIndex];
                        const selected = remedialAnswers[q.id];
                        return (
                          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg">
                                سؤال علاجي مستهدف
                              </span>
                              {q.source_page && (
                                <span className="text-[11px] font-medium text-slate-400">
                                  صفحة {q.source_page}
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-slate-900 leading-relaxed">
                              {q.question_text}
                            </h4>

                            {/* Options */}
                            <div className="space-y-2.5 pt-1">
                              {q.options.map((opt, optIdx) => {
                                const isSelected = selected === opt;
                                return (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    onClick={() => handleSelectRemedialOption(q.id, opt)}
                                    className={`w-full text-right p-3.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between gap-3 ${
                                      isSelected
                                        ? "bg-brand-50/80 border-brand-500 text-brand-900 shadow-sm"
                                        : "bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100/70"
                                    }`}
                                  >
                                    <span className="leading-relaxed">{opt}</span>
                                    <div
                                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                        isSelected
                                          ? "bg-brand-600 border-brand-600 text-white"
                                          : "border-slate-300 bg-white"
                                      }`}
                                    >
                                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Navigation and Submit */}
                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                          disabled={currentQIndex === 0}
                          className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5"
                        >
                          <ChevronRight className="w-4 h-4" />
                          <span>السابق</span>
                        </button>

                        {currentQIndex < remedialSession.questions.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setCurrentQIndex((prev) => prev + 1)}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                          >
                            <span>التالي</span>
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSubmitRemedial}
                            disabled={isSubmittingRemedial}
                            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                          >
                            {isSubmittingRemedial ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>جاري التقييم...</span>
                              </>
                            ) : (
                              <>
                                <Target className="w-4 h-4" />
                                <span>تسليم الإجابات وإعادة تقييم الإتقان</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Results & Mastery Before / After */}
                  {remedialStep === "result" && remedialResult && (
                    <div className="space-y-5">
                      {/* Proficiency Status Banner */}
                      <div
                        className={`p-5 rounded-2xl border text-center space-y-2 ${
                          remedialResult.is_proficient
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                            : "bg-amber-50/80 border-amber-200 text-amber-950"
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${
                            remedialResult.is_proficient
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {remedialResult.is_proficient ? (
                            <Award className="w-7 h-7" />
                          ) : (
                            <Zap className="w-7 h-7" />
                          )}
                        </div>
                        <h4 className="font-black text-base">
                          {remedialResult.is_proficient
                            ? "تم إتقان المفهوم بنجاح! 🎯"
                            : "نتيجة مشجعة، اقتربت من الإتقان!"}
                        </h4>
                        <p className="text-xs leading-relaxed max-w-md mx-auto font-medium">
                          {remedialResult.proficiency_message}
                        </p>
                      </div>

                      {/* Mastery Before vs After Metrics */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl text-center">
                          <span className="text-[11px] font-medium text-slate-500 block">الإتقان السابق</span>
                          <span className="text-lg font-black text-rose-600 font-mono mt-1 block">
                            {remedialResult.mastery_before}%
                          </span>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-center shadow-sm">
                          <span className="text-[11px] font-bold text-emerald-800 block">الإتقان الحالي 🚀</span>
                          <span className="text-xl font-black text-emerald-600 font-mono mt-1 block">
                            {remedialResult.mastery_after}%
                          </span>
                        </div>

                        <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl text-center">
                          <span className="text-[11px] font-medium text-slate-500 block">درجة الاختبار العلاجي</span>
                          <span className="text-lg font-black text-slate-900 font-mono mt-1 block">
                            {remedialResult.score}/{remedialResult.total_questions}
                          </span>
                        </div>
                      </div>

                      {/* Question by question feedback */}
                      <div className="space-y-3 pt-2">
                        <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>مراجعة الأسئلة العلاجية وتفسيراتها:</span>
                        </h5>
                        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                          {remedialResult.questions_feedback.map((fb, idx) => (
                            <div
                              key={idx}
                              className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                                fb.is_correct
                                  ? "bg-emerald-50/40 border-emerald-200"
                                  : "bg-rose-50/40 border-rose-200"
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span className="text-slate-900">سؤال {idx + 1}: {fb.question_text}</span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                                    fb.is_correct
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {fb.is_correct ? "إجابة صحيحة ✓" : "إجابة غير صحيحة ✗"}
                                </span>
                              </div>
                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                <strong>تفسير الكتاب:</strong> {fb.explanation}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Finish & update dashboard button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowRemedialModal(false);
                            loadMaterialData();
                          }}
                          className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>إنهاء وتحديث لوحة التحكم 🚀</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
