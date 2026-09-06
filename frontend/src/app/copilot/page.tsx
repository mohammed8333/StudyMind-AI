"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  GraduationCap,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquare,
  Play,
  PlayCircle,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from "lucide-react";
import {
  api,
  StudentLearningState,
  WhatToStudyNowResponse,
  DailyBriefingResponse,
  CopilotMessageItem,
  CopilotActionItem,
} from "@/lib/api";

export default function CopilotPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<StudentLearningState | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefingResponse | null>(null);
  const [nextAction, setNextAction] = useState<WhatToStudyNowResponse | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | undefined>(undefined);

  // Chat states
  const [messages, setMessages] = useState<CopilotMessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([
    "ماذا يجب أن أذاكر الآن؟",
    "أعطني الملخص اليومي (Daily Briefing)",
    "اقترح كويز لأضعف مفاهيمي",
    "أعد توزيع المهام المتأخرة على باقي الأيام",
    "ما هي أكثر الأخطاء تكراراً لدي؟",
  ]);

  // Rebalance state
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [rebalanceMsg, setRebalanceMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [stateData, briefingData, actionData, historyData, docsData] =
        await Promise.all([
          api.copilot.getState().catch(() => null),
          api.copilot.getBriefing().catch(() => null),
          api.copilot.getNextAction().catch(() => null),
          api.copilot.getChatHistory(40).catch(() => []),
          api.documents.list().catch(() => []),
        ]);

      setState(stateData);
      setBriefing(briefingData);
      setNextAction(actionData);
      setDocuments(docsData);

      if (historyData && historyData.length > 0) {
        setMessages(historyData);
      } else {
        setMessages([
          {
            id: 0,
            role: "copilot",
            content: `أهلاً بك في غرفة قيادة StudyMind Copilot! 🧠✨\nأنا موجهك الأكاديمي الشخصي، متصل مباشرة ببيانات مذاكرتك الفعلية، كويزاتك، جدول امتحاناتك، ومستوى إتقانك لكل مفهوم.\n\nيمكنك سؤالي عما يجب مذاكرته، طلب تلخيص يومي، أو حل أي تساؤل دراسي من مذكراتك بدقة ودون أي تخمين.`,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to load Copilot data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (text?: string) => {
    const msgToSend = (text || inputMessage).trim();
    if (!msgToSend || chatLoading) return;

    setInputMessage("");

    // Optimistic user message
    const tempUserMsg: CopilotMessageItem = {
      id: Date.now(),
      role: "user",
      content: msgToSend,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setChatLoading(true);

    try {
      const res = await api.copilot.chat(msgToSend, selectedDocId);

      const copilotReply: CopilotMessageItem = {
        id: Date.now() + 1,
        role: "copilot",
        content: res.reply,
        action_type: res.suggested_action?.action_type || null,
        action_payload: res.suggested_action || null,
        citations: res.citations || null,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, copilotReply]);
      if (res.quick_prompts && res.quick_prompts.length > 0) {
        setQuickPrompts(res.quick_prompts);
      }

      // If action was a rebalance or modified state, refresh state in background
      if (res.suggested_action?.action_type === "REBALANCE") {
        api.copilot.getState().then((s) => setState(s));
      }
    } catch (err: any) {
      const errorReply: CopilotMessageItem = {
        id: Date.now() + 1,
        role: "copilot",
        content: `عذراً، حدث خطأ أثناء معالجة رسالتك: ${err.message || "تعذر الاتصال بالسيرفر."}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.copilot.clearChatHistory();
      setMessages([
        {
          id: Date.now(),
          role: "copilot",
          content: "تم مسح سجل المحادثات بنجاح. أنا جاهز لأي استفسار جديد!",
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRebalance = async () => {
    setIsRebalancing(true);
    setRebalanceMsg(null);
    try {
      const res = await api.copilot.rebalance();
      setRebalanceMsg(res.message);
      const [updatedState, updatedAction, updatedBriefing] = await Promise.all([
        api.copilot.getState(),
        api.copilot.getNextAction(),
        api.copilot.getBriefing(),
      ]);
      setState(updatedState);
      setNextAction(updatedAction);
      setBriefing(updatedBriefing);
      setTimeout(() => setRebalanceMsg(null), 5000);
    } catch (err: any) {
      setRebalanceMsg(err.message || "تعذر إعادة توزيع المهام.");
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleExecuteAction = (action: CopilotActionItem | Record<string, any>) => {
    if (action.action_type === "REBALANCE") {
      handleRebalance();
      return;
    }
    if (action.action_url) {
      router.push(action.action_url);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-9 h-9 text-brand-600 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">
          جاري إعداد مركز التوجيه الأكاديمي الذكي (StudyMind Copilot)...
        </p>
      </div>
    );
  }

  const primaryAction = nextAction?.recommendation;

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 pb-20 space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-7 rounded-3xl shadow-xl border border-indigo-500/20 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-sky-300">
            <BrainCircuit className="w-4 h-4 text-sky-400" />
            <span>AI Learning Copilot • موجهك الدراسي الشخصي</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">
            {briefing?.greeting || "غرفة قيادة المذاكرة والتفوق"} 🚀
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-2">
            <span>{briefing?.date_str}</span>
            <span>•</span>
            <span className="text-sky-300 font-bold">{briefing?.focus_headline}</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">قرارات مبنية على بياناتك الحقيقية 100%</span>
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <Link
            href="/planner"
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/15 transition-all flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            <span>جدول المذاكرة</span>
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <span>لوحة المتابعة</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        <div className="absolute left-0 bottom-0 top-0 w-1/3 bg-gradient-to-r from-transparent to-brand-500/10 pointer-events-none" />
      </div>

      {/* 2. Overdue Alert (if neglected) */}
      {state?.is_neglected && state.overdue_tasks_count > 0 && (
        <div className="bg-amber-500/15 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-amber-950">
                تنبيه: تم اكتشاف {state.overdue_tasks_count} مهام متأخرة في جدولك
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                يمكن للـ Copilot إعادة توزيع هذه المهام بذكاء على الأيام المتبقية قبل الامتحان دون زيادة الحمل اليومي.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRebalance}
            disabled={isRebalancing}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            {isRebalancing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري إعادة التوزيع...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>إعادة توزيع المهام بضغطة واحدة 🔄</span>
              </>
            )}
          </button>
        </div>
      )}

      {rebalanceMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{rebalanceMsg}</span>
        </div>
      )}

      {/* 3. Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Main Column: AI Copilot Chat Console (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 text-white rounded-3xl border border-indigo-500/25 shadow-xl flex flex-col h-[750px] overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 sm:p-5 border-b border-white/10 bg-slate-950/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/30">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black flex items-center gap-2">
                  <span>محادثة المعلم والـ Copilot الذكي</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    نشط ومتصل 🟢
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  حلل أداءك، اطلب تدريباً مخصصاً، أو اسأل في أي درس
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Document Context Selector */}
              {documents.length > 0 && (
                <select
                  value={selectedDocId || ""}
                  onChange={(e) =>
                    setSelectedDocId(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  className="text-[11px] bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-sky-500 max-w-[140px] truncate"
                  title="تخصيص مستند معين للمحادثة"
                >
                  <option value="">كل المذكرات (تلقائي)</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={handleClearHistory}
                title="مسح سجل المحادثة"
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const actionData = msg.action_payload;

              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-2`}
                >
                  {/* Message Bubble */}
                  <div
                    className={`max-w-[88%] p-4 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? "bg-brand-600 text-white rounded-br-xs shadow-md"
                        : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-xs shadow-md"
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Document Citations Badge */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap max-w-[88%]">
                      {msg.citations.map((c, cIdx) => (
                        <span
                          key={cIdx}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 flex items-center gap-1.5 shadow-xs"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>مرجع: صفحة {c.page_number}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Suggestion Card inside chat */}
                  {actionData && (
                    <div className="max-w-[90%] w-full bg-gradient-to-br from-indigo-950/90 to-slate-800 border border-indigo-500/40 rounded-2xl p-4 shadow-xl space-y-3 mt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          {actionData.badge_label || "توصية تنفيذية 🎯"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {actionData.urgency === "CRITICAL"
                            ? "أولوية قصوى"
                            : "أولوية موصى بها"}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-bold text-white text-sm">
                          {actionData.title}
                        </h4>
                        {actionData.description && (
                          <p className="text-xs text-slate-300 mt-1">
                            {actionData.description}
                          </p>
                        )}
                      </div>

                      {actionData.rationale && (
                        <div className="bg-slate-900/80 border border-white/5 p-2.5 rounded-xl text-[11px] text-slate-300 flex items-start gap-2">
                          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span>{actionData.rationale}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleExecuteAction(actionData)}
                        className="w-full py-2.5 bg-gradient-to-r from-sky-500 to-brand-600 hover:from-sky-400 hover:to-brand-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>تنفيذ التوصية الآن</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex items-center gap-2.5 text-slate-400 text-xs bg-slate-800/80 p-3.5 rounded-2xl rounded-bl-xs border border-slate-700 w-fit">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>الـ Copilot يحلل حالتك ويصيغ الإجابة...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="px-4 py-2 border-t border-white/10 bg-slate-950/70 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            {quickPrompts.map((p, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => handleSendMessage(p)}
                disabled={chatLoading}
                className="text-[11px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 shrink-0 transition-colors disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3.5 border-t border-white/10 bg-slate-950 flex items-center gap-2.5 shrink-0"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="اكتب استفسارك للـ Copilot (عن جدولك، أخطائك، أو أي درس)..."
              disabled={chatLoading}
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatLoading || !inputMessage.trim()}
              className="w-11 h-11 rounded-xl bg-gradient-to-r from-sky-500 to-brand-600 hover:from-sky-400 hover:to-brand-500 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none shadow-md shrink-0"
            >
              <Send className="w-4 h-4 -rotate-90" />
            </button>
          </form>
        </div>

        {/* Right Column: Student State & Data-Driven Insights (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Primary Action Card: "ماذا تذاكر الآن؟" */}
          {primaryAction && (
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white rounded-3xl p-5 sm:p-6 border border-indigo-500/30 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  <span>الخطوة المقترحة الآن</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    primaryAction.urgency === "CRITICAL"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  }`}
                >
                  {primaryAction.badge_label}
                </span>
              </div>

              <div>
                <h3 className="text-base font-black text-white">
                  {primaryAction.title}
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {primaryAction.description}
                </p>
              </div>

              {/* Rationale explanation */}
              <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 text-xs text-slate-300 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-300 block text-[11px] mb-0.5">
                    لماذا اختار الـ Copilot هذا الإجراء؟
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {primaryAction.rationale}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleExecuteAction(primaryAction)}
                className="w-full py-3 bg-gradient-to-r from-sky-500 to-brand-600 hover:from-sky-400 hover:to-brand-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>ابدأ المذاكرة الآن</span>
              </button>
            </div>
          )}

          {/* Academic Overview Stats */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-black text-slate-900 text-sm flex items-center justify-between">
              <span>الحالة الأكاديمية الحالية</span>
              <span className="text-xs font-bold text-slate-400">
                محدثة آنياً ⚡
              </span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Mastery */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100">
                <span className="text-[11px] font-bold text-emerald-800 block">
                  معدل الإتقان العام
                </span>
                <span className="text-2xl font-black text-emerald-700 font-mono mt-0.5 block">
                  {state?.overall_mastery || 0}%
                </span>
                <span className="text-[10px] text-emerald-600 mt-1 block">
                  {state && state.overall_mastery >= 75
                    ? "مستوى ممتاز ومتقدم"
                    : "يحتاج تعزيزاً في نقاط الضعف"}
                </span>
              </div>

              {/* Exam Countdown */}
              <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100">
                <span className="text-[11px] font-bold text-indigo-800 block">
                  العد التنازلي للامتحان
                </span>
                <span className="text-2xl font-black text-indigo-700 font-mono mt-0.5 block">
                  {state?.days_until_exam !== null && state?.days_until_exam !== undefined
                    ? `${state.days_until_exam} أيام`
                    : "—"}
                </span>
                <span className="text-[10px] text-indigo-600 mt-1 block truncate">
                  {state?.exam_target_subjects && state.exam_target_subjects.length > 0
                    ? `مادة: ${state.exam_target_subjects.join("، ")}`
                    : state?.current_focus_subject
                    ? `مادة: ${state.current_focus_subject}`
                    : "لا يوجد موعد محدد"}
                </span>
              </div>

              {/* Today's tasks */}
              <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-100">
                <span className="text-[11px] font-bold text-sky-800 block">
                  مهام جدول اليوم
                </span>
                <span className="text-2xl font-black text-sky-700 font-mono mt-0.5 block">
                  {state?.today_tasks_count || 0} مهام
                </span>
                <span className="text-[10px] text-sky-600 mt-1 block">
                  الوقت المقدر: {state?.today_estimated_minutes || 0} دقيقة
                </span>
              </div>

              {/* Due Flashcards */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-100">
                <span className="text-[11px] font-bold text-amber-800 block">
                  بطاقات مستحقة اليوم
                </span>
                <span className="text-2xl font-black text-amber-700 font-mono mt-0.5 block">
                  {state?.due_flashcards_count || 0}
                </span>
                <Link
                  href="/flashcards"
                  className="text-[10px] font-bold text-amber-700 underline mt-1 block"
                >
                  مراجعة البطاقات الآن ←
                </Link>
              </div>
            </div>
          </div>

          {/* Weak Concepts Focus Area */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span>المفاهيم التي تحتاج تركيزاً (نقاط الضعف)</span>
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    {state?.weak_concepts.length || 0}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  مستخلصة من أخطائك في الكويزات والامتحانات
                </p>
              </div>
            </div>

            {state?.weak_concepts && state.weak_concepts.length > 0 ? (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {state.weak_concepts.map((concept, cIdx) => (
                  <div
                    key={cIdx}
                    className="p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-brand-200 transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <span className="font-bold text-slate-900 block">
                        {concept.concept_name}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        {concept.subject && (
                          <span className="bg-slate-200/80 px-1.5 py-0.5 rounded">
                            {concept.subject}
                          </span>
                        )}
                        <span>الأخطاء: {concept.total_attempts - concept.correct_attempts}</span>
                        {(concept.primary_error_label || concept.primary_error_type) && (
                          <span className="text-amber-700">
                            • {concept.primary_error_label || concept.primary_error_type}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-left">
                        <span className="text-xs font-black text-rose-600 font-mono block">
                          {concept.mastery_score}%
                        </span>
                        <span className="text-[9px] text-slate-400">إتقان</span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleSendMessage(
                            `أريد جلسة تدريب وشرح سريع لمفهوم: "${concept.concept_name}"`
                          )
                        }
                        className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-[11px] font-bold transition-colors"
                      >
                        تدرب عليه
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl">
                ممتاز! لا توجد مفاهيم مسجلة بنسبة ضعف حالياً. واصل التفوق! 🎉
              </div>
            )}
          </div>

          {/* Spaced Repetition & Exam Simulator Quick Links */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Link
              href="/exams"
              className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 hover:border-indigo-300 transition-all group flex flex-col justify-between"
            >
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-2">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors block">
                  محاكي الامتحانات
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  اختبر جاهزيتك بوقت وتصحيح ذكي
                </span>
              </div>
            </Link>

            <Link
              href="/flashcards"
              className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 hover:border-amber-300 transition-all group flex flex-col justify-between"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 group-hover:text-amber-700 transition-colors block">
                  البطاقات الذكية
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  تكرار متباعد لتثبيت الحفظ
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
