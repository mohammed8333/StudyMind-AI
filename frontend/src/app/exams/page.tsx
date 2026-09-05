"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileQuestion,
  FileText,
  Filter,
  Flame,
  GraduationCap,
  History,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Timer,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { api, Exam, ExamHistoryItem } from "@/lib/api";

const DIFFICULTY_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  easy: { label: "مستوى سهل", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  medium: { label: "مستوى متوسط", bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
  hard: { label: "مستوى متقدم", bg: "bg-purple-50 border-purple-200", text: "text-purple-700" },
  mock_exam: { label: "محاكاة وزارية رسمية", bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
};

export default function ExamsHubPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [history, setHistory] = useState<ExamHistoryItem[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"exams" | "history">("exams");

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  // Generator Modal State
  const [showModal, setShowModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [formDocId, setFormDocId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formNumQuestions, setFormNumQuestions] = useState<number>(10);
  const [formDifficulty, setFormDifficulty] = useState<string>("medium");
  const [formDuration, setFormDuration] = useState<number>(30);
  const [formTypes, setFormTypes] = useState<string[]>(["mcq", "true_false", "short_answer"]);
  const [formIsMock, setFormIsMock] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [examsList, historyList, docsList] = await Promise.all([
        api.exams.list(),
        api.exams.getMyHistory(),
        api.documents.list(),
      ]);
      setExams(examsList);
      setHistory(historyList);
      setDocuments(docsList);
      if (docsList.length > 0 && !formDocId) {
        setFormDocId(docsList[0].id);
        setFormTitle(`امتحان ${docsList[0].subject || docsList[0].title}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDocId) return;
    setIsGenerating(true);
    setGenError(null);

    try {
      const newExam = await api.exams.generate({
        document_id: formDocId,
        title: formTitle.trim() || undefined,
        num_questions: formNumQuestions,
        difficulty: formDifficulty,
        duration_minutes: formDuration,
        question_types: formTypes.length > 0 ? formTypes : ["mcq"],
        is_mock_mode: formIsMock,
      });

      setShowModal(false);
      // Navigate straight to the new exam runner
      router.push(`/exams/${newExam.id}`);
    } catch (err: any) {
      setGenError(err.message || "تعذر إنشاء الامتحان، يرجى المحاولة مرة أخرى.");
      setIsGenerating(false);
    }
  };

  const toggleType = (t: string) => {
    if (formTypes.includes(t)) {
      if (formTypes.length > 1) {
        setFormTypes(formTypes.filter((item) => item !== t));
      }
    } else {
      setFormTypes([...formTypes, t]);
    }
  };

  // Metrics
  const totalAttempts = history.length;
  const passedAttempts = history.filter((h) => h.passed).length;
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;
  const avgScore =
    totalAttempts > 0
      ? Math.round(history.reduce((acc, h) => acc + h.percentage, 0) / totalAttempts)
      : 0;

  // Subjects for Filter
  const availableSubjects = useMemo(() => {
    const subs = new Set<string>();
    exams.forEach((ex) => {
      if (ex.subject) subs.add(ex.subject);
    });
    return Array.from(subs);
  }, [exams]);

  // Filtered Exams
  const filteredExams = useMemo(() => {
    return exams.filter((ex) => {
      const matchSearch =
        ex.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ex.subject && ex.subject.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchSub = selectedSubject === "all" || ex.subject === selectedSubject;
      return matchSearch && matchSub;
    });
  }, [exams, searchQuery, selectedSubject]);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 shrink-0">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900">محاكي الامتحانات الذكي</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                  AI Exam Simulator
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                محاكاة حقيقية لبيئة الامتحانات الرسمية مع مؤقت زمني صارم وتصحيح فوري وتحليل تفصيلي لنقاط الضعف.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white shadow-md shadow-orange-600/20 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء امتحان جديد</span>
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">إجمالي الامتحانات المنشأة</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{exams.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileQuestion className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">المحاولات المكتملة</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{totalAttempts}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">متوسط الدرجات العام</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{avgScore}%</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">نسبة اجتياز الامتحانات</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{passRate}%</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 gap-4">
          <button
            onClick={() => setActiveTab("exams")}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "exams"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>الامتحانات المتاحة ({exams.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "history"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل المحاولات والنتائج ({history.length})</span>
          </button>
        </div>

        {/* Tab 1: Available Exams */}
        {activeTab === "exams" && (
          <div className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث عن امتحان أو مادة..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {availableSubjects.length > 0 && (
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  <option value="all">كافة المواد الدراسية</option>
                  {availableSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loading ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto" />
                <p className="text-sm text-slate-500 mt-3 font-medium">جاري تحميل قائمة الامتحانات...</p>
              </div>
            ) : filteredExams.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                <div className="w-16 h-16 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto mb-4">
                  <FileQuestion className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">لا توجد امتحانات حتى الآن</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  قم بإنشاء أول امتحان بمحاكي الامتحانات الذكي من مذكراتك لاختبار فهمك وتحديد نقاط ضعفك.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-5 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md shadow-orange-600/20 transition-all"
                >
                  إنشاء امتحان الآن
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredExams.map((exam) => {
                  const diff = DIFFICULTY_LABELS[exam.difficulty] || DIFFICULTY_LABELS["medium"];
                  return (
                    <div
                      key={exam.id}
                      className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${diff.bg} ${diff.text}`}>
                            {diff.label}
                          </span>
                          {exam.is_mock_mode && (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              <span>Mock Exam</span>
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-slate-900 mt-4 leading-snug">{exam.title}</h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{exam.document_title || exam.subject || "مذكرة دراسية"}</span>
                        </p>

                        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span>{exam.duration_minutes} دقيقة</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FileQuestion className="w-4 h-4 text-slate-400" />
                            <span>{exam.total_questions} سؤال</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-slate-400" />
                            <span>{exam.total_marks} درجة كلية</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-slate-400" />
                            <span>النجاح من {exam.passing_score_pct}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2">
                        <Link
                          href={`/exams/${exam.id}`}
                          className="flex-1 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-orange-600/20 transition-all"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>بدء الامتحان الآن</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Exam History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                <History className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">لا يوجد سجل محاولات سابقة</h3>
                <p className="text-xs text-slate-500 mt-1">
                  عند إكمال أي امتحان، سيتم تسجيل نتيجته وتحليلاته التفصيلية وتوصياته العلاجية هنا.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-4">الامتحان والمادة</th>
                        <th className="py-3.5 px-4">رقم المحاولة</th>
                        <th className="py-3.5 px-4">الدرجة</th>
                        <th className="py-3.5 px-4">النسبة المئوية</th>
                        <th className="py-3.5 px-4">الحالة</th>
                        <th className="py-3.5 px-4">الوقت المستغرق</th>
                        <th className="py-3.5 px-4">تاريخ التسليم</th>
                        <th className="py-3.5 px-4 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item) => {
                        const mins = Math.floor(item.time_taken_seconds / 60);
                        const secs = item.time_taken_seconds % 60;
                        const timeStr = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
                        return (
                          <tr key={item.attempt_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-4 font-bold text-slate-900">
                              <div>{item.exam_title}</div>
                              <div className="text-xs font-normal text-slate-500">{item.document_title}</div>
                            </td>
                            <td className="py-4 px-4 text-slate-600">محاولة #{item.attempt_number}</td>
                            <td className="py-4 px-4 font-bold text-slate-900">
                              {item.score} / {item.total_marks}
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                                  item.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                                }`}
                              >
                                {item.percentage}%
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  item.status === "TIMED_OUT"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {item.status === "TIMED_OUT" ? "انتهى الوقت" : "مكتمل"}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-slate-600">{timeStr} دقيقة</td>
                            <td className="py-4 px-4 text-xs text-slate-500">
                              {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("ar-EG") : "—"}
                            </td>
                            <td className="py-4 px-4 text-center">
                              <Link
                                href={`/exams/${item.exam_id}?attempt=${item.attempt_id}`}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-orange-700 rounded-lg text-xs font-bold transition-colors inline-block"
                              >
                                عرض النتيجة
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create Exam Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">إنشاء محاكاة امتحان بالذكاء الاصطناعي</h3>
                    <p className="text-xs text-slate-500">توليد امتحان دقيق وموثق من نصوص مذكراتك</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {genError && (
                <div className="mt-4 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{genError}</span>
                </div>
              )}

              <form onSubmit={handleCreateExam} className="mt-5 space-y-4">
                {/* Select Document */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">المذكرة أو الكتاب الدراسي</label>
                  <select
                    value={formDocId || ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setFormDocId(id);
                      const d = documents.find((doc) => doc.id === id);
                      if (d) setFormTitle(`امتحان ${d.subject || d.title}`);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                    required
                  >
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.subject || "عام"}) - {d.total_pages} صفحة
                      </option>
                    ))}
                  </select>
                </div>

                {/* Exam Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان الامتحان</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="مثلاً: امتحان الكيمياء الشامل - الباب الثاني"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                    required
                  />
                </div>

                {/* Number of Questions & Duration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">عدد الأسئلة</label>
                    <select
                      value={formNumQuestions}
                      onChange={(e) => setFormNumQuestions(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:bg-white"
                    >
                      <option value={5}>5 أسئلة (سريع)</option>
                      <option value={10}>10 أسئلة (قياسي)</option>
                      <option value={15}>15 سؤال (شامل)</option>
                      <option value={20}>20 سؤال (مكثف)</option>
                      <option value={30}>30 سؤال (امتحان نهائي)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">مدة الامتحان</label>
                    <select
                      value={formDuration}
                      onChange={(e) => setFormDuration(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:bg-white"
                    >
                      <option value={15}>15 دقيقة</option>
                      <option value={30}>30 دقيقة</option>
                      <option value={45}>45 دقيقة</option>
                      <option value={60}>60 دقيقة (ساعة)</option>
                      <option value={90}>90 دقيقة (ساعة ونصف)</option>
                      <option value={120}>120 دقيقة (ساعتان)</option>
                    </select>
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">مستوى الصعوبة</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "easy", label: "سهل" },
                      { id: "medium", label: "متوسط" },
                      { id: "hard", label: "متقدم" },
                      { id: "mock_exam", label: "امتحان وزاري" },
                    ].map((d) => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setFormDifficulty(d.id)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          formDifficulty === d.id
                            ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question Types */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">أنواع الأسئلة المراد تضمينها</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "mcq", label: "اختيار من متعدد" },
                      { id: "true_false", label: "صح أو خطأ" },
                      { id: "short_answer", label: "مقالي قصير" },
                    ].map((qt) => {
                      const isSelected = formTypes.includes(qt.id);
                      return (
                        <button
                          type="button"
                          key={qt.id}
                          onClick={() => toggleType(qt.id)}
                          className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                            isSelected
                              ? "bg-amber-50 border-amber-400 text-amber-900"
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          {qt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mock Mode Toggle */}
                <div className="p-3.5 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-orange-950">وضع المحاكاة الرسمية (Mock Mode)</p>
                      <p className="text-[11px] text-orange-700">تسليم إجباري عند انتهاء الوقت وحظر التلميحات أثناء الحل.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsMock}
                    onChange={(e) => setFormIsMock(e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded border-orange-300 focus:ring-orange-500 cursor-pointer"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري صياغة الامتحان بالذكاء الاصطناعي...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>توليد وبدء الامتحان</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
