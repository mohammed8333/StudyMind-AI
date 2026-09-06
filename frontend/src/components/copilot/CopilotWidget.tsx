"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  Flame,
  GraduationCap,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquare,
  Play,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import {
  api,
  StudentLearningState,
  WhatToStudyNowResponse,
  DailyBriefingResponse,
  CopilotActionItem,
} from "@/lib/api";

interface CopilotWidgetProps {
  onOpenDrawer?: () => void;
}

export default function CopilotWidget({ onOpenDrawer }: CopilotWidgetProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<DailyBriefingResponse | null>(null);
  const [nextAction, setNextAction] = useState<WhatToStudyNowResponse | null>(null);
  const [state, setState] = useState<StudentLearningState | null>(null);

  // Rebalance loading & message
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [rebalanceMsg, setRebalanceMsg] = useState<string | null>(null);

  useEffect(() => {
    loadCopilotData();
  }, []);

  const loadCopilotData = async () => {
    try {
      setLoading(true);
      const [briefingData, actionData, stateData] = await Promise.all([
        api.copilot.getBriefing(),
        api.copilot.getNextAction(),
        api.copilot.getState(),
      ]);
      setBriefing(briefingData);
      setNextAction(actionData);
      setState(stateData);
    } catch (err) {
      console.error("Error loading copilot widget data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRebalance = async () => {
    setIsRebalancing(true);
    setRebalanceMsg(null);
    try {
      const res = await api.copilot.rebalance();
      setRebalanceMsg(res.message);
      // Reload state after rebalance
      await loadCopilotData();
      setTimeout(() => setRebalanceMsg(null), 4000);
    } catch (err: any) {
      setRebalanceMsg(err.message || "فشل إعادة توزيع المهام.");
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleExecuteAction = (action: CopilotActionItem) => {
    if (action.action_type === "REBALANCE") {
      handleRebalance();
      return;
    }
    router.push(action.action_url);
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-500/20 flex items-center justify-center gap-3 min-h-[160px]">
        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
        <span className="text-xs font-medium text-slate-300">جاري تحليل حالتك الأكاديمية بواسطة الـ Copilot...</span>
      </div>
    );
  }

  const primaryAction = nextAction?.recommendation;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-indigo-500/20 relative overflow-hidden space-y-5">
      {/* Subtle Background Glow Elements */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      {/* 1. Header Bar: Greeting, Date, and AI Copilot Badge */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 shrink-0">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                {briefing?.greeting || "أهلاً بك في StudyMind Copilot!"}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                متصل ببياناتك 🟢
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{briefing?.date_str}</span>
              <span>•</span>
              <span className="text-sky-300 font-medium">{briefing?.focus_headline}</span>
            </p>
          </div>
        </div>

        {/* Action Controls in Header */}
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <Link
            href="/copilot"
            className="px-3.5 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 text-white rounded-xl border border-white/15 transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.02]"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-300" />
            <span>مركز الـ Copilot الكامل</span>
          </Link>
          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="px-3 py-2 text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 rounded-xl border border-sky-500/30 transition-all flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>محادثة فورية</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Overdue / Neglect Alert Banner (if applicable) */}
      {state?.is_neglected && state.overdue_tasks_count > 0 && (
        <div className="relative z-10 bg-amber-500/15 border border-amber-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">
              <strong>تنبيه جدول المذاكرة:</strong> لديك <span className="font-bold underline">{state.overdue_tasks_count} مهام متأخرة</span> عن موعدها المحدد.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRebalance}
            disabled={isRebalancing}
            className="px-3.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 shadow disabled:opacity-50"
          >
            {isRebalancing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري إعادة التوزيع...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة توزيع المهام تلقائياً 🔄</span>
              </>
            )}
          </button>
        </div>
      )}

      {rebalanceMsg && (
        <div className="relative z-10 p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{rebalanceMsg}</span>
        </div>
      )}

      {/* 3. Core Focus & Primary Action: "ماذا تذاكر الآن؟" */}
      {primaryAction && (
        <div className="relative z-10 bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2.5 flex-1">
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                <Target className="w-3 h-3" />
                <span>ماذا تذاكر الآن؟</span>
              </span>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  primaryAction.urgency === "CRITICAL"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                    : primaryAction.urgency === "HIGH"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {primaryAction.badge_label}
              </span>

              {state?.days_until_exam !== null && state?.days_until_exam !== undefined && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>الامتحان بعد {state.days_until_exam} أيام</span>
                </span>
              )}
            </div>

            {/* Title & Description */}
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                {primaryAction.title}
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {primaryAction.description}
              </p>
            </div>

            {/* Rationale Box (Reasoning based on real student data) */}
            <div className="bg-slate-900/70 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-300">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-amber-300 block text-[11px]">
                  لماذا اختار لك الـ Copilot هذه الخطوة بالذات؟
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {primaryAction.rationale}
                </p>
              </div>
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col gap-2.5 lg:w-48">
            <button
              type="button"
              onClick={() => handleExecuteAction(primaryAction)}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-sky-500 to-brand-600 hover:from-sky-400 hover:to-brand-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>ابدأ التنفيذ الآن</span>
            </button>

            <Link
              href="/copilot"
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-[11px] rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>استفسر من الـ Copilot</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* 4. Quick Metrics Strip */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <span className="text-[10px] text-slate-400 font-medium block">الإتقان العام للمنهج</span>
          <span className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-0.5 block">
            {state?.overall_mastery || 0}%
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <span className="text-[10px] text-slate-400 font-medium block">نقاط تحتاج تركيز</span>
          <span className="text-base sm:text-lg font-black text-rose-400 font-mono mt-0.5 block">
            {state?.weak_concepts.length || 0} مفاهيم
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <span className="text-[10px] text-slate-400 font-medium block">مهام اليوم المخططة</span>
          <span className="text-base sm:text-lg font-black text-sky-300 font-mono mt-0.5 block">
            {state?.today_tasks_count || 0} ({state?.today_estimated_minutes || 0}د)
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
          <span className="text-[10px] text-slate-400 font-medium block">بطاقات مستحقة للمراجعة</span>
          <span className="text-base sm:text-lg font-black text-amber-300 font-mono mt-0.5 block">
            {state?.due_flashcards_count || 0} بطاقة
          </span>
        </div>
      </div>
    </div>
  );
}
