"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  Cpu,
  FileCheck,
  FileText,
  FileUp,
  Flame,
  GraduationCap,
  HelpCircle,
  KeyRound,
  Layers,
  Lightbulb,
  Loader2,
  Lock,
  Mail,
  Phone,
  PlayCircle,
  RefreshCw,
  Repeat,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";

// Steps Data for 3D Flipping Cards
const HOW_IT_WORKS_STEPS = [
  {
    stepNumber: "01",
    title: "رفع الكتاب أو المذكرة (PDF)",
    icon: FileUp,
    color: "from-blue-600 to-sky-500",
    bgColor: "bg-sky-50",
    textColor: "text-sky-600",
    borderColor: "border-sky-200",
    frontDescription:
      "ارفع أي ملف PDF لمذكرتك أو كتاب الوزارة، وسيبدأ النظام فوراً بتحليل النص وتفكيكه رقمياً.",
    backTitle: "ماذا يحدث بالداخل؟ ⚙️",
    backDetails: [
      "استخراج النص صفحة بصفحة بدقة رقمية عالية.",
      "تطبيع اللغة العربية وحذف التشكيل والزوائد لضمان دقة البحث.",
      "حفظ رقم الصفحة الفعلي لكل فقرة لربط الإجابات بها لاحقاً.",
    ],
    techTag: "PyMuPDF + Arabic Normalizer",
  },
  {
    stepNumber: "02",
    title: "فهرسة وبناء شجرة المفاهيم",
    icon: BrainCircuit,
    color: "from-purple-600 to-indigo-500",
    bgColor: "bg-purple-50",
    textColor: "text-purple-600",
    borderColor: "border-purple-200",
    frontDescription:
      "الذكاء الاصطناعي لا يقرأ فقط؛ بل يفهم بنية المنهج، ويستخرج الأبواب والفصول والقوانين والمصطلحات الأساسية.",
    backTitle: "هندسة المعرفة (RAG):",
    backDetails: [
      "فهرسة دلالية فائقة الدقة باستخدام خوارزمية BM25 المعززة.",
      "استخراج مصطلحات ومفاهيم كل درس وتخزينها في قاعدة بيانات تفاعلية.",
      "تجهيز مصفوفات التقييم المسبقة لكل مادة على حدة.",
    ],
    techTag: "Smart Semantic BM25 Indexing",
  },
  {
    stepNumber: "03",
    title: "مذاكرة تفاعلية مع المعلم الذكي",
    icon: Sparkles,
    color: "from-brand-600 to-blue-500",
    bgColor: "bg-brand-50",
    textColor: "text-brand-600",
    borderColor: "border-brand-200",
    frontDescription:
      "اسأل عن أي نقطة غامضة، وسيشرحها لك المعلم بنص نقي ومباشر بدون تعقيد، وموثق برقم الصفحة في كتابك.",
    backTitle: "مستويات الشرح الأربعة:",
    backDetails: [
      "بسيط جداً (تقنية فاينمان بالتشبيهات الواقعية).",
      "شرح متزن خطوة بخطوة للدروس الصعبة.",
      "مستوى كتاب الوزارة للحفظ والصياغة الامتحانية الدقيقة.",
      "توثيق المصدر دائماً: [المصدر: ص 37 - قانون الحركة].",
    ],
    techTag: "Strict Grounded Arabic LLM",
  },
  {
    stepNumber: "04",
    title: "امتحانات وتشخيص نقاط الضعف",
    icon: Target,
    color: "from-emerald-600 to-teal-500",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-600",
    borderColor: "border-emerald-200",
    frontDescription:
      "توليد اختبارات ذاتية تلقائياً من المنهج، وتصحيح فوري يرصد المفاهيم التي تخطئ فيها ويعالجها فوراً.",
    backTitle: "المحرك التكيفي (Adaptive Engine):",
    backDetails: [
      "تتبع نسبة إتقان كل مفهوم بشكل منفصل (0% إلى 100%).",
      "تصنيف نقاط القوة ونقاط الضعف تلقائياً في لوحة المادة.",
      "اقتراح أسئلة علاجية تركز تحديداً على أخطائك السابقة حتى تتقنها.",
    ],
    techTag: "Adaptive Mastery Algorithm",
  },
];

// Interactive Simulator Pages Data
const SIMULATOR_PAGES = [
  {
    id: "page1",
    tabTitle: "1. صفحة المذكرة الأصلية",
    badge: "كتاب الوزارة - ص 14",
    title: "قانون نيوتن الثاني في الحركة",
    content:
      "ينص قانون نيوتن الثاني على أن: «تسارع أي جسم يتناسب طردياً مع القوة المحصلة المؤثرة عليه، وعكسياً مع كتلته»، وتُعبر عنه المعادلة الرياضية الشهيرة: F = m × a. وتُقاس القوة بوحدة النيوتن (Newton) في النظام الدولي للوحدات.",
    extraNote: "تم استخراج هذا المقطع وحفظه برقم الصفحة 14 بدقة 100%.",
    color: "border-blue-300 bg-blue-50/40 text-blue-900",
  },
  {
    id: "page2",
    tabTitle: "2. فك وفهرسة المفاهيم",
    badge: "فهرسة الذكاء الاصطناعي",
    title: "المفاهيم المستخرجة من الصفحة 14",
    content:
      "• مفهوم رئيسي: قانون نيوتن الثاني (Force & Acceleration)\n• القانون الرياضي: F = m × a (القوة = الكتلة × التسارع)\n• وحدة القياس: النيوتن (كجم.م/ث²)\n• العلاقة: طردية مع القوة، عكسية مع الكتلة",
    extraNote: "تم إنشاء بطاقة مفهوم مرتبطة باختبارات وتقييمات الطالب التلقائية.",
    color: "border-purple-300 bg-purple-50/40 text-purple-900",
  },
  {
    id: "page3",
    tabTitle: "3. رد المعلم الذكي وتوثيقه",
    badge: "شات المدرس الذكي (أسلوب فاينمان)",
    title: "سؤال الطالب: كيف أفهم قانون نيوتن الثاني ببساطة؟",
    content:
      "تخيّل أنك تدفع عربة تسوق فارغة وعربة أخرى ممتلئة بالبضائع؛ إذا دفعت الاثنين بنفس القوة، العربة الخفيفة ستنطلق بسرعة أكبر بكثير لأن كتلتها صغيرة! هذا هو بالضبط قانون نيوتن الثاني: القوة تجعل الأجسام تتسارع، والكتلة الكبيرة تقاوم ذلك.\n\nالمصدر: [ص 14 - قانون نيوتن الثاني]",
    extraNote: "الرد بنص عربي نقي، بدون ماركداون معقد، مع توثيق الصفحة في السطر الأخير.",
    color: "border-emerald-300 bg-emerald-50/40 text-emerald-900",
  },
  {
    id: "page4",
    tabTitle: "4. كويز وتصحيح تكيفي",
    badge: "اختبار امتحاني ذكي",
    title: "سؤال كويز تم توليده تلقائياً من الصفحة 14",
    content:
      "س: إذا تضاعفت القوة المؤثرة على جسم مع ثبوت كتلته، فإن تسارعه:\n1) يقل للنصف\n2) يتضاعف (الإجابة الصحيحة ✅)\n3) يظل ثابتاً\n\nالتفسير: التسارع يتناسب طردياً مع القوة طبقاً لـ (F = m × a). المصدر: ص 14.",
    extraNote: "تم رفع نسبة إتقانك لمفهوم 'قوانين الحركة' إلى 95% تلقائياً!",
    color: "border-amber-300 bg-amber-50/40 text-amber-900",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // 3D Flip Card states (tracked by index)
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  // Simulator Active Page
  const [activeSimPage, setActiveSimPage] = useState(0);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("studymind_token") : null;
    if (token) {
      setIsRedirecting(true);
      api.auth
        .getMe()
        .then((user: any) => {
          if (user && user.is_verified !== false) {
            router.replace("/dashboard");
          } else {
            setIsRedirecting(false);
          }
        })
        .catch(() => {
          setIsRedirecting(false);
        });
    }
  }, [router]);

  const handleToggleFlip = (index: number) => {
    setFlippedCards((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  if (isRedirecting) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shadow-xl shadow-brand-500/10"
        >
          <BrainCircuit className="w-9 h-9" />
        </motion.div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
          <span>جاري نقلك للوحة المذاكرة...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pb-24 overflow-x-hidden">
      {/* ========================================================================= */}
      {/* SECTION 1: HERO (With Hero CTA to /login) */}
      {/* ========================================================================= */}
      <section className="w-full max-w-4xl mx-auto px-4 pt-10 sm:pt-16 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center flex flex-col items-center space-y-6"
        >
          {/* Top Pill: Drops from Top */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-brand-600 animate-spin" />
            <span>الجيل الجديد من محركات المذاكرة الذكية باللغة العربية</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.35] sm:leading-[1.4] lg:leading-[1.45] max-w-4xl"
          >
            <span className="block mb-2.5 sm:mb-3.5">لا تسأل الذكاء الاصطناعي في الفراغ..</span>
            <span className="block bg-gradient-to-l from-brand-600 via-sky-500 to-indigo-600 bg-clip-text text-transparent pb-1">
              حوّل مذكرتك وكتابك إلى مدرس خاص
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7 }}
            className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-2xl"
          >
            ارفع كتاب الوزارة أو ملزمتك (PDF)، وسيقوم <strong>StudyMind AI</strong> بتحليل المحتوى بالكامل لبناء قاعدة معرفية توفر لك:
            شرحاً متعدد المستويات، امتحانات تفاعلية، وتشخيصاً دقيقاً لنقاط ضعفك برقم الصفحة!
          </motion.p>

          {/* Quick Benefits Pills: Centered Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-right pt-2"
          >
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>توثيق الإجابة برقم الصفحة في كتابك</span>
            </div>
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>تشخيص ذكي لنقاط الضعف والقوة</span>
            </div>
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>توليد كويزات مع تصحيح وتفسير فوري</span>
            </div>
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>تلخيص شامل للمادة بضغطة زر واحدة</span>
            </div>
          </motion.div>

          {/* CTA Buttons: Centered */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-emerald-600/25 hover:shadow-emerald-600/35 hover:scale-105 active:scale-95 transition-all group cursor-pointer text-center"
            >
              <span>ابدأ المذاكرة الآن مجاناً 🚀</span>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </Link>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("how-it-works");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors group cursor-pointer text-center"
            >
              <span>شاهد كيف تعمل المنصة</span>
              <ArrowDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform text-brand-600" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: HOW IT WORKS (3D Flipping Cards & Step-by-Step Explanation) */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="w-full max-w-6xl mx-auto px-4 py-16 border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold mb-3"
          >
            <Cpu className="w-4 h-4 text-brand-600" />
            <span>كيف تعمل المنصة بالذكاء الاصطناعي؟</span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl sm:text-4xl font-black text-slate-900 mb-3"
          >
            4 خطوات سحرية تحول مذكرتك إلى معلم شخصي
          </motion.h2>
          <p className="text-slate-500 text-xs sm:text-sm">
            انقر على أي بطاقة لتتشقلب وتكتشف الكواليس والتقنيات الذكية التي تعمل خلف الكواليس! 🔄
          </p>
        </div>

        {/* 4 Interactive 3D Flipping Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const isFlipped = !!flippedCards[index];
            const StepIcon = step.icon;
            // Alternate entrance: Even from right, Odd from left
            const initialX = index % 2 === 0 ? 60 : -60;

            return (
              <motion.div
                key={step.stepNumber}
                initial={{ opacity: 0, x: initialX, y: 30 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="perspective-1000 min-h-[360px] cursor-pointer group"
                onClick={() => handleToggleFlip(index)}
              >
                <div
                  className={`w-full h-full relative transform-style-3d transition-transform duration-700 rounded-3xl ${
                    isFlipped ? "rotate-y-180" : ""
                  }`}
                >
                  {/* FRONT SIDE OF CARD */}
                  <div className="w-full h-full backface-hidden absolute inset-0 bg-white p-6 rounded-3xl border border-slate-200 shadow-md hover:shadow-xl hover:border-brand-300 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-2xl font-black text-slate-200 group-hover:text-brand-200 transition-colors font-mono">
                          {step.stepNumber}
                        </span>
                        <div className={`w-12 h-12 rounded-2xl ${step.bgColor} ${step.textColor} flex items-center justify-center shadow-xs`}>
                          <StepIcon className="w-6 h-6" />
                        </div>
                      </div>

                      <h3 className="text-lg font-black text-slate-900 mb-2">
                        {step.title}
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {step.frontDescription}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-brand-600 flex items-center gap-1">
                        <RotateCw className="w-3.5 h-3.5 animate-spin group-hover:block" />
                        <span>اقلب لرؤية الكواليس</span>
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono">
                        3D Flip
                      </span>
                    </div>
                  </div>

                  {/* BACK SIDE OF CARD (Rotated 180 deg) */}
                  <div className="w-full h-full backface-hidden absolute inset-0 rotate-y-180 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-amber-300 font-mono">
                          الخطوة {step.stepNumber} - الكواليس
                        </span>
                        <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full text-slate-300 font-mono">
                          {step.techTag}
                        </span>
                      </div>

                      <h4 className="text-sm font-black text-white mb-2">
                        {step.backTitle}
                      </h4>

                      <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                        {step.backDetails.map((item, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-brand-400 font-bold">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1">
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>انقر للعودة</span>
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold">جاهز ومفعل ✅</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: INTERACTIVE PAGE FLIP SIMULATOR (شقلبة الصفحات التفاعلية) */}
      {/* ========================================================================= */}
      <section className="w-full max-w-6xl mx-auto px-4 py-16 border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold mb-3">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>محاكي شقلبة الصفحات الحي</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
            شاهد كيف تنتقل المعلومة من صفحة الكتاب إلى ذهنك!
          </h2>
          <p className="text-slate-500 text-xs">
            بدّل بين المراحل الأربعة بالضغط على الأزرار وشاهد تأثير الشقلبة الحي لكل صفحة:
          </p>
        </div>

        {/* Simulator Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-3xl mx-auto mb-4 no-scrollbar">
          {SIMULATOR_PAGES.map((page, idx) => (
            <button
              key={page.id}
              onClick={() => setActiveSimPage(idx)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeSimPage === idx
                  ? "bg-brand-600 text-white shadow-lg shadow-brand-500/25 scale-105"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>{page.tabTitle}</span>
            </button>
          ))}
        </div>

        {/* Flipping Page Showcase */}
        <div className="max-w-3xl mx-auto mt-4 perspective-1000">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSimPage}
              initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              exit={{ rotateY: -90, opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`p-7 sm:p-9 rounded-3xl border shadow-xl ${SIMULATOR_PAGES[activeSimPage].color} relative overflow-hidden`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black px-3 py-1 bg-white/80 rounded-full shadow-xs border border-slate-200">
                  {SIMULATOR_PAGES[activeSimPage].badge}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  صفحة {activeSimPage + 1} من 4
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-black mb-3">
                {SIMULATOR_PAGES[activeSimPage].title}
              </h3>

              <div className="p-4 bg-white/90 rounded-2xl border border-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line text-slate-800 font-medium shadow-xs mb-4">
                {SIMULATOR_PAGES[activeSimPage].content}
              </div>

              <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-200/60">
                <span className="font-bold text-slate-600">
                  💡 {SIMULATOR_PAGES[activeSimPage].extraNote}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={activeSimPage === 0}
                    onClick={() => setActiveSimPage((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-30 border border-slate-200"
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </button>
                  <button
                    disabled={activeSimPage === SIMULATOR_PAGES.length - 1}
                    onClick={() => setActiveSimPage((p) => Math.min(SIMULATOR_PAGES.length - 1, p + 1))}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-30 border border-slate-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: CALL TO ACTION BOTTOM BANNER */}
      {/* ========================================================================= */}
      <section className="w-full max-w-5xl mx-auto px-4 pt-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-r from-brand-700 via-sky-600 to-indigo-700 text-white p-8 sm:p-12 rounded-3xl shadow-xl text-center relative overflow-hidden"
        >
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black">
              جاهز لتجربة أذكى طريقة للمذاكرة في العالم العربي؟ 🚀
            </h2>
            <p className="text-xs sm:text-sm text-sky-100 leading-relaxed">
              ارفع مذكرتك الأولى الآن مجاناً، ودع المعلم الذكي يتولى تلخيصها وصياغة أسئلتها وتدريبك حتى التفوق الكامل.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="px-8 py-3.5 bg-white text-brand-700 hover:bg-brand-50 font-black text-xs sm:text-sm rounded-xl shadow-lg transition-transform hover:scale-105 inline-block cursor-pointer"
              >
                ابدأ المذاكرة الآن مجاناً 🚀
              </Link>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-white/5 pointer-events-none rounded-full blur-3xl" />
        </motion.div>
      </section>
    </div>
  );
}
