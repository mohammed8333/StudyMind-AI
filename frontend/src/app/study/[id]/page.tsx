"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { api } from "@/lib/api";

type ExplanationLevel = "very_simple" | "medium" | "textbook" | "advanced";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ page_number: number; chapter?: string; excerpt: string }>;
  suggestedFollowups?: string[];
  level?: ExplanationLevel;
}

export default function StudyRoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const docId = Number(params.id);

  const [documentData, setDocumentData] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedTargetPage, setSelectedTargetPage] = useState<number | null>(null);

  // Tutor state
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>("medium");
  const [inputQuestion, setInputQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "أهلاً بك يا بطل! أنا معلمك الذكي لمادة هذا الكتاب. يمكنك سؤالي عن أي جزئية، أو تحديد صفحة معينة للشرح، أو اختيار مستوى التبسيط الذي تريده.",
      suggestedFollowups: [
        "ما هي أهم النقاط والتعريفات في هذا الدرس؟",
        "اشرحلي الصفحة الأولى بأسلوب بسيط جداً",
        "كيف تأتي الأسئلة على هذا الموضوع في الامتحان؟"
      ]
    }
  ]);

  // Quiz Generation state
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizDifficulty, setQuizDifficulty] = useState("medium");
  const [quizNumQuestions, setQuizNumQuestions] = useState(5);
  const [showQuizModal, setShowQuizModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (docId) {
      loadDocumentDetails();
    }
  }, [docId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadDocumentDetails = async () => {
    try {
      const doc = await api.documents.get(docId);
      setDocumentData(doc);
      const ch = await api.documents.getChunks(docId);
      setChunks(ch);

      // Load persistent chat history for this user and document
      try {
        const hist = await api.tutor.getHistory(docId);
        if (hist.messages && hist.messages.length > 0) {
          const loadedMsgs: Message[] = hist.messages.map((m: any) => ({
            id: m.id.toString(),
            role: m.role,
            content: m.content,
            level: m.explanation_level || "medium",
            sources: m.sources,
            suggestedFollowups: m.suggested_followups
          }));
          setMessages(loadedMsgs);
        }
      } catch (histErr) {
        console.warn("No prior chat history or failed to load:", histErr);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في مسح محادثة هذا الدرس وبدء جلسة جديدة؟")) return;
    try {
      await api.tutor.clearHistory(docId);
      setMessages([
        {
          id: "welcome_cleared",
          role: "assistant",
          content: "تم مسح المحادثة السابقة بنجاح. أنا جاهز للإجابة على أي سؤال جديد في هذا الدرس!",
          suggestedFollowups: [
            "ما هي أهم النقاط والتعريفات في هذا الدرس؟",
            "اشرحلي الصفحة الأولى بأسلوب بسيط جداً",
            "طبق لي مثال عملي على أهم القوانين"
          ]
        }
      ]);
    } catch (err) {
      console.error(err);
      alert("تعذر مسح المحادثة، يرجى المحاولة مرة أخرى.");
    }
  };

  const handleAskTutor = async (questionText?: string) => {
    const q = questionText || inputQuestion;
    if (!q.trim() || isAsking) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: q,
      level: explanationLevel
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInputQuestion("");
    setIsAsking(true);

    try {
      const res = await api.tutor.ask({
        document_id: docId,
        question: q,
        explanation_level: explanationLevel,
        target_page: selectedTargetPage || undefined
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        suggestedFollowups: res.suggested_followups,
        level: res.explanation_level
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "عذراً، حدث خطأ أثناء الاتصال بالمعلم الذكي. يرجى التأكد من اتصال الإنترنت أو إعدادات السيرفر."
        }
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleGenerateQuiz = async () => {
    setIsGeneratingQuiz(true);
    try {
      const qz = await api.quizzes.generate({
        document_id: docId,
        difficulty: quizDifficulty,
        num_questions: quizNumQuestions,
        target_page: selectedTargetPage || undefined
      });
      router.push(`/quiz/${qz.id}`);
    } catch (err: any) {
      alert(err.message || "فشل توليد الاختبار");
      setIsGeneratingQuiz(false);
    }
  };

  // Filter chunks for current page in viewer
  const pageChunks = chunks.filter((c) => c.page_number === currentPage);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-100">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors"
            title="رجوع للوحة التحكم"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{documentData?.title || "جاري التحميل..."}</span>
              {documentData?.subject && (
                <span className="text-[11px] font-normal px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                  {documentData.subject}
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-400">
              إجمالي {documentData?.total_pages || 1} صفحة • محرك RAG العربي الموثق
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowQuizModal(true)}
            className="px-4 py-2 bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
          >
            <GraduationCap className="w-4 h-4" />
            <span>امتحان / كويز ذكي</span>
          </button>
        </div>
      </header>

      {/* Main Split-Screen Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Right Side: Document Content Viewer (5 cols) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col bg-slate-50 border-l border-slate-200 overflow-hidden">
          {/* Viewer Page Controls */}
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-brand-600" />
              محتوى المادة الأصلية
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="font-mono font-bold text-slate-700">
                صفحة {currentPage} من {documentData?.total_pages || 1}
              </span>
              <button
                disabled={currentPage >= (documentData?.total_pages || 1)}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Viewer Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {pageChunks.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-xs">
                لا يوجد نصوص مستخرجة في هذه الصفحة.
              </div>
            ) : (
              pageChunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm leading-relaxed text-sm text-slate-800"
                >
                  {chunk.chapter && (
                    <div className="text-xs font-bold text-brand-700 mb-2 pb-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span>{chunk.chapter}</span>
                      <span className="text-[10px] text-slate-400 font-mono">ص {chunk.page_number}</span>
                    </div>
                  )}
                  <p className="whitespace-pre-line leading-7 text-slate-700 text-[13px]">
                    {chunk.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Left Side: AI Tutor Chat & Multi-Level Explanation (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col bg-white overflow-hidden">
          {/* Explanation Level Selector Bar */}
          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <BrainCircuit className="w-4 h-4 text-accent-600" />
              <span>مستوى الشرح:</span>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
              <button
                onClick={() => setExplanationLevel("very_simple")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  explanationLevel === "very_simple"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-brand-600"
                }`}
                title="شرح مبسط جداً بتقنية فاينمان وتشبيهات يومية"
              >
                بسيط جداً
              </button>

              <button
                onClick={() => setExplanationLevel("medium")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  explanationLevel === "medium"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-brand-600"
                }`}
              >
                متوسط
              </button>

              <button
                onClick={() => setExplanationLevel("textbook")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  explanationLevel === "textbook"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-brand-600"
                }`}
                title="الالتزام بنص الكتاب والمدرسة لورقة الامتحان"
              >
                مستوى الكتاب
              </button>

              <button
                onClick={() => setExplanationLevel("advanced")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  explanationLevel === "advanced"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-brand-600"
                }`}
                title="شرح متقدم وتطبيقات عميقة للمتفوقين"
              >
                متقدم
              </button>
            </div>

            <div className="flex items-center gap-2">
              {selectedTargetPage && (
                <div className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200 text-[11px] font-bold">
                  <span>مقيد بالصفحة {selectedTargetPage}</span>
                  <button
                    onClick={() => setSelectedTargetPage(null)}
                    className="hover:text-amber-900 font-black mr-1"
                  >
                    ×
                  </button>
                </div>
              )}

              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-2.5 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold border border-slate-200 hover:border-red-200 transition-all"
                title="مسح سجل المحادثة لهذا الدرس وبدء جلسة جديدة"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مسح المحادثة</span>
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-right ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white"
                      : "bg-slate-900 text-sky-400"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>

                {/* Message Content */}
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-slate-50 border border-slate-200 text-slate-800 shadow-xs"
                  }`}
                >
                  <p className="whitespace-pre-line text-sm leading-7 text-slate-800">
                    {(() => {
                      let text = msg.content || "";
                      if (text.includes("</think>")) {
                        text = text.split("</think>").pop()?.trim() || text;
                      }
                      // Remove code blocks ```text or ```
                      text = text.replace(/```[a-zA-Z0-9_-]*\n?/g, "");
                      text = text.replace(/```/g, "");
                      // Convert inline backticks `code` to "code"
                      text = text.replace(/`([^`\n]+)`/g, '"$1"');
                      text = text.replace(/`/g, "");
                      // Remove scattered inline citations
                      text = text.replace(/\[(?:المصدر:?\s*)?ص(?:فحة)?\s*\d+\]/gi, "");
                      text = text.replace(/\((?:المصدر:?\s*)?ص(?:فحة)?\s*\d+\)/gi, "");
                      text = text.replace(/\[صفحة\s*\d+\]/gi, "");
                      text = text.replace(/\(صفحة\s*\d+\)/gi, "");
                      // Remove markdown headers hashes and lines
                      text = text.replace(/^#{1,6}\s*/gm, "");
                      text = text.replace(/^\s*[-*_]{3,}\s*$/gm, "");
                      // Remove asterisks
                      text = text.replace(/\*\*(.*?)\*\*/g, "$1");
                      text = text.replace(/\*(.*?)\*/g, "$1");
                      // Clean table separators and convert pipe rows to clean lines
                      text = text.replace(/^\|?[\s\-:|]+\|?$/gm, "");
                      text = text.split("\n").map(l => {
                        let line = l.trim();
                        if (line.startsWith("|") && line.endsWith("|")) {
                          let cells = line.split("|").slice(1, -1).map(c => c.trim()).filter(Boolean);
                          return cells.length > 0 ? "• " + cells.join(" - ") : "";
                        }
                        return line;
                      }).join("\n");
                      return text.trim();
                    })()}
                  </p>

                  {/* Sources / Page Citations Badges */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500">المصادر المعتمدة:</span>
                      {msg.sources.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(src.page_number)}
                          className="px-2 py-0.5 bg-brand-100 hover:bg-brand-200 text-brand-800 rounded-md text-[11px] font-bold font-mono transition-colors flex items-center gap-1"
                          title={`انقر للانتقال الفوري إلى صفحة ${src.page_number}`}
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>ص {src.page_number}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Suggested Followups */}
                  {msg.suggestedFollowups && msg.suggestedFollowups.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-1.5">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                        <span>أسئلة يمكنك طرحها الآن:</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {msg.suggestedFollowups.map((followup, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleAskTutor(followup)}
                            className="text-right text-xs text-brand-700 hover:text-brand-900 bg-white hover:bg-brand-50 p-2 rounded-lg border border-slate-200/70 transition-colors font-medium flex items-center justify-between group"
                          >
                            <span>{followup}</span>
                            <ChevronLeft className="w-3.5 h-3.5 text-slate-400 group-hover:-translate-x-0.5 transition-transform" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isAsking && (
              <div className="flex items-center gap-3 text-slate-400 text-xs py-2">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-sky-400 flex items-center justify-center">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <span>المعلم الذكي يبحث في صفحات كتابك ويصيغ الإجابة...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Field */}
          <div className="p-4 border-t border-slate-200 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskTutor();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                placeholder="اسأل المعلم عن أي قانون أو مسألة أو صفحة معينة..."
                className="flex-1 px-4 py-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!inputQuestion.trim() || isAsking}
                className="px-5 py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span>إرسال</span>
                <Send className="w-4 h-4 rotate-180" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Quiz Modal */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              <span>توليد امتحان ذكي من هذا المحتوى</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              سيقوم محرك الـ AI بقراءة محتوى الكتاب وصياغة أسئلة اختبارية وتصحيحها فورياً.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">مستوى الصعوبة</label>
                <select
                  value={quizDifficulty}
                  onChange={(e) => setQuizDifficulty(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="easy">سهل (تذكر ومفاهيم أساسية)</option>
                  <option value="medium">متوسط (تطبيق وفهم)</option>
                  <option value="hard">صعب (مسائل واستنتاجات)</option>
                  <option value="exam">مستوى امتحان الوزارة النهائي</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">عدد الأسئلة</label>
                <input
                  type="number"
                  min={3}
                  max={15}
                  value={quizNumQuestions}
                  onChange={(e) => setQuizNumQuestions(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleGenerateQuiz}
                  disabled={isGeneratingQuiz}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGeneratingQuiz ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري توليد الأسئلة...</span>
                    </>
                  ) : (
                    <span>بدء الاختبار الآن</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuizModal(false)}
                  disabled={isGeneratingQuiz}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
