"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  CopilotMessageItem,
  CopilotActionItem,
  StudentLearningState,
} from "@/lib/api";

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId?: number;
}

export default function CopilotDrawer({ isOpen, onClose, documentId }: CopilotDrawerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<CopilotMessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [state, setState] = useState<StudentLearningState | null>(null);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([
    "ماذا يجب أن أذاكر الآن؟",
    "أعطني الملخص اليومي (Daily Briefing)",
    "اختبرني في أضعف مفهوم لدي",
    "أعد توزيع المهام المتأخرة",
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadInitialData = async () => {
    setInitialLoading(true);
    try {
      const [history, stateData] = await Promise.all([
        api.copilot.getChatHistory(30),
        api.copilot.getState(),
      ]);
      setMessages(history);
      setState(stateData);

      // If history is empty, populate welcome message
      if (history.length === 0) {
        setMessages([
          {
            id: 0,
            role: "copilot",
            content: `أهلاً بك يا بطل! أنا StudyMind Copilot موجهك الأكاديمي الشخصي. 🧠✨\nأنا متصل ببياناتك الفعلية وأفهم مستوى إتقانك (${stateData.overall_mastery}%) وجدول امتحاناتك. كيف يمكنني مساعدتك الآن؟`,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to load Copilot initial data:", err);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSendMessage = async (text?: string) => {
    const msgToSend = (text || inputMessage).trim();
    if (!msgToSend || loading) return;

    setInputMessage("");

    // Optimistically add user message
    const tempUserMsg: CopilotMessageItem = {
      id: Date.now(),
      role: "user",
      content: msgToSend,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await api.copilot.chat(msgToSend, documentId);

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
    } catch (err: any) {
      const errorReply: CopilotMessageItem = {
        id: Date.now() + 1,
        role: "copilot",
        content: `عذراً، حدث خطأ أثناء معالجة رسالتك: ${err.message || "تعذر الاتصال بالسيرفر."}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setLoading(false);
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

  const handleExecuteAction = (action: CopilotActionItem | Record<string, any>) => {
    if (action.action_type === "REBALANCE") {
      handleSendMessage("أعد توزيع المهام المتأخرة على جدولي");
      return;
    }
    if (action.action_url) {
      onClose();
      router.push(action.action_url);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 left-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-md bg-slate-900 text-white shadow-2xl border-r border-indigo-500/30 flex flex-col animate-in slide-in-from-left duration-300">
          {/* 1. Header */}
          <div className="p-4 sm:p-5 border-b border-white/10 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/30">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-white flex items-center gap-1.5">
                  <span>StudyMind Copilot</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    AI Coach 🧠
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {state ? `إتقانك: ${state.overall_mastery}% • ${state.weak_concepts.length} نقاط ضعف` : "موجهك الذكي المخصص"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHistory}
                title="مسح المحادثة"
                className="w-8 h-8 rounded-xl hover:bg-white/10 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2. State Mini Banner */}
          {state && (
            <div className="bg-white/5 border-b border-white/10 px-4 py-2 flex items-center justify-between text-[11px] text-slate-300 shrink-0">
              <span className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>الإتقان: <strong>{state.overall_mastery}%</strong></span>
              </span>

              {state.days_until_exam !== null && state.days_until_exam !== undefined ? (
                <span className="flex items-center gap-1 text-sky-300">
                  <Clock className="w-3.5 h-3.5" />
                  <span>الامتحان بعد {state.days_until_exam} أيام</span>
                </span>
              ) : (
                <span className="text-slate-400">لا يوجد امتحان قريب</span>
              )}

              {state.overdue_tasks_count > 0 && (
                <span className="flex items-center gap-1 text-amber-300 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{state.overdue_tasks_count} متأخرة</span>
                </span>
              )}
            </div>
          )}

          {/* 3. Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {initialLoading && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                <span>جاري تحميل سجل التوجيه...</span>
              </div>
            )}

            {!initialLoading &&
              messages.map((msg, idx) => {
                const isUser = msg.role === "user";
                const actionData = msg.action_payload;

                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-2`}
                  >
                    {/* Bubble */}
                    <div
                      className={`max-w-[88%] p-3.5 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-brand-600 text-white rounded-br-xs shadow-md"
                          : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-xs shadow-md"
                      }`}
                    >
                      {msg.content}
                    </div>

                    {/* Citations (if any) */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[88%]">
                        {msg.citations.map((c, cIdx) => (
                          <span
                            key={cIdx}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 flex items-center gap-1"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>صفحة {c.page_number}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Interactive Action Card (if any) */}
                    {actionData && (
                      <div className="max-w-[90%] w-full bg-gradient-to-br from-indigo-950/80 to-slate-800 border border-indigo-500/30 rounded-2xl p-3.5 shadow-lg space-y-2.5 mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {actionData.badge_label || "توصية تنفيذية 🎯"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {actionData.urgency === "CRITICAL" ? "عاجل جداً" : "أولوية موصى بها"}
                          </span>
                        </div>

                        <div>
                          <h4 className="font-bold text-white text-xs">
                            {actionData.title}
                          </h4>
                          {actionData.description && (
                            <p className="text-[11px] text-slate-300 mt-0.5">
                              {actionData.description}
                            </p>
                          )}
                        </div>

                        {actionData.rationale && (
                          <div className="bg-slate-900/80 border border-white/5 p-2 rounded-xl text-[10px] text-slate-300 flex items-start gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>{actionData.rationale}</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleExecuteAction(actionData)}
                          className="w-full py-2 bg-gradient-to-r from-sky-500 to-brand-600 hover:from-sky-400 hover:to-brand-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>تنفيذ التوصية الآن</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            {loading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs bg-slate-800 p-3 rounded-2xl rounded-bl-xs border border-slate-700 w-fit">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>الـ Copilot يفكر ويحلل بياناتك...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 4. Quick Prompts Strip */}
          <div className="px-3 pt-2 pb-1 border-t border-white/10 bg-slate-900/90 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {quickPrompts.map((p, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => handleSendMessage(p)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 shrink-0 transition-colors disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          {/* 5. Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-white/10 bg-slate-950 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="اسأل الـ Copilot عن خطتك، أخطائك، أو أي مفهوم..."
              disabled={loading}
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-sky-500 to-brand-600 hover:from-sky-400 hover:to-brand-500 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none shadow"
            >
              <Send className="w-4 h-4 -rotate-90" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
