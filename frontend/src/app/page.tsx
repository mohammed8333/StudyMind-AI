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
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Auth Form View State
  type AuthView = "login" | "register" | "verify_otp" | "forgot_password" | "reset_password";
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devOtpCode, setDevOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccessMsg, setAuthSuccessMsg] = useState("");

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // 3D Flip Card states (tracked by index)
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  // Simulator Active Page
  const [activeSimPage, setActiveSimPage] = useState(0);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("studymind_token") : null;
    const pendingEmail = typeof window !== "undefined" ? localStorage.getItem("studymind_pending_verify_email") : null;

    if (token) {
      api.auth.getMe()
        .then((user: any) => {
          if (user && user.is_verified === false) {
            localStorage.removeItem("studymind_token");
            localStorage.removeItem("studymind_user");
            if (user.email) {
              setEmail(user.email);
              localStorage.setItem("studymind_pending_verify_email", user.email);
            }
            setAuthView("verify_otp");
            setAuthError("يرجى تأكيد بريدك الإلكتروني أولاً باستخدام رمز التحقق (OTP) لتفعيل الحساب.");
            setCheckingAuth(false);
          } else {
            router.replace("/dashboard");
          }
        })
        .catch(() => {
          localStorage.removeItem("studymind_token");
          localStorage.removeItem("studymind_user");
          if (pendingEmail) {
            setEmail(pendingEmail);
            setAuthView("verify_otp");
            setAuthError("يرجى تأكيد بريدك الإلكتروني أولاً باستخدام رمز التحقق (OTP).");
          }
          setCheckingAuth(false);
        });
    } else {
      if (pendingEmail) {
        setEmail(pendingEmail);
        setAuthView("verify_otp");
        setAuthSuccessMsg("يرجى إدخال رمز التحقق (OTP) المرسل إلى بريدك الإلكتروني لتفعيل الحساب.");
      }
      setCheckingAuth(false);
    }
  }, [router]);

  const handleToggleFlip = (index: number) => {
    setFlippedCards((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccessMsg("");
    setAuthLoading(true);

    try {
      if (authView === "register") {
        if (!fullName.trim()) {
          throw new Error("يرجى إدخال اسم الطالب");
        }
        const regRes = await api.auth.register({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone_number: phoneNumber.trim() || undefined,
        });
        if (regRes.dev_code) {
          setDevOtpCode(regRes.dev_code);
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("studymind_pending_verify_email", email.trim());
        }
        setAuthView("verify_otp");
        setResendCooldown(60);
        setAuthSuccessMsg("تم إرسال رمز التحقق (OTP) المكون من 6 أرقام إلى بريدك الإلكتروني.");
      } else if (authView === "login") {
        await api.auth.login(email.trim(), password);
        if (typeof window !== "undefined") {
          localStorage.removeItem("studymind_pending_verify_email");
        }
        router.push("/dashboard");
      }
    } catch (err: any) {
      const errMsg = err.message || "";
      if (
        errMsg.includes("تأكيد البريد") ||
        errMsg.includes("رمز التحقق") ||
        errMsg.includes("غير مؤكد") ||
        errMsg.includes("غير موثق")
      ) {
        if (typeof window !== "undefined" && email.trim()) {
          localStorage.setItem("studymind_pending_verify_email", email.trim());
        }
        setAuthView("verify_otp");
        setAuthError(errMsg || "الحساب غير موثق بعد. أدخل رمز التحقق لتفعيله.");
      } else {
        setAuthError(errMsg || "حدث خطأ أثناء المصادقة. يرجى التأكد من البيانات.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (!otpCode.trim() || otpCode.trim().length !== 6) {
        throw new Error("يرجى إدخال رمز التحقق المكون من 6 أرقام.");
      }
      await api.auth.verifyEmail(email.trim(), otpCode.trim());
      if (typeof window !== "undefined") {
        localStorage.removeItem("studymind_pending_verify_email");
      }
      router.push("/dashboard");
    } catch (err: any) {
      setAuthError(err.message || "رمز التحقق غير صحيح أو منتهي الصلاحية.");
      setAuthLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || authLoading) return;
    setAuthError("");
    setAuthSuccessMsg("");
    setAuthLoading(true);
    try {
      const res = await api.auth.resendVerificationCode(email.trim());
      if (res.dev_code) {
        setDevOtpCode(res.dev_code);
      }
      setResendCooldown(60);
      setAuthSuccessMsg("تم إرسال رمز تحقق جديد بنجاح.");
    } catch (err: any) {
      setAuthError(err.message || "فشل إعادة إرسال الرمز. حاول مجدداً لاحقاً.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccessMsg("");
    setAuthLoading(true);
    try {
      if (!email.trim()) {
        throw new Error("يرجى إدخال البريد الإلكتروني.");
      }
      const res = await api.auth.forgotPassword(email.trim());
      if (res.dev_code) {
        setDevOtpCode(res.dev_code);
      }
      setAuthView("reset_password");
      setAuthSuccessMsg("إذا كان البريد مسجلاً، فقد تم إرسال رمز استعادة الحساب.");
    } catch (err: any) {
      setAuthError(err.message || "تعذر إرسال رمز الاستعادة.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccessMsg("");
    setAuthLoading(true);
    try {
      if (!otpCode.trim() || otpCode.trim().length !== 6) {
        throw new Error("يرجى إدخال رمز الاستعادة المكون من 6 أرقام.");
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.");
      }
      await api.auth.resetPassword({
        email: email.trim(),
        code: otpCode.trim(),
        new_password: newPassword,
      });
      setAuthView("login");
      setAuthSuccessMsg("تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.");
    } catch (err: any) {
      setAuthError(err.message || "تعذر تعيين كلمة المرور الجديدة.");
    } finally {
      setAuthLoading(false);
    }
  };

  if (checkingAuth) {
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
          <span>جاري التحقق من الحساب ونقلك للوحة المذاكرة...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pb-24 overflow-x-hidden">
      {/* ========================================================================= */}
      {/* SECTION 1: HERO & AUTH (Entrance Transitions: Right, Left, Top, Bottom) */}
      {/* ========================================================================= */}
      <section className="w-full max-w-6xl mx-auto px-4 pt-10 sm:pt-14 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Right Column (Hero Text): Slides in from Right */}
          <motion.div
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="lg:col-span-7 text-right space-y-6"
          >
            {/* Top Pill: Drops from Top */}
            <motion.div
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-brand-600 animate-spin" />
              <span>الجيل الجديد من محركات المذاكرة الذكية باللغة العربية</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight sm:leading-snug"
            >
              لا تسأل الذكاء الاصطناعي في الفراغ..
              <br />
              <span className="bg-gradient-to-l from-brand-600 via-sky-500 to-indigo-600 bg-clip-text text-transparent">
                حوّل مذكرتك وكتابك إلى مدرس خاص
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7 }}
              className="text-slate-600 text-base leading-relaxed max-w-xl"
            >
              ارفع كتاب الوزارة أو ملزمتك (PDF)، وسيقوم <strong>StudyMind AI</strong> بتحليل المحتوى بالكامل لبناء قاعدة معرفية توفر لك:
              شرحاً متعدد المستويات، امتحانات تفاعلية، وتشخيصاً دقيقاً لنقاط ضعفك برقم الصفحة!
            </motion.p>

            {/* Quick Benefits Pills: Staggered from bottom */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>توثيق الإجابة برقم الصفحة في كتابك</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>تشخيص ذكي لنقاط الضعف والقوة</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>توليد كويزات مع تصحيح وتفسير فوري</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:border-brand-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>تلخيص شامل للمادة بضغطة زر واحدة</span>
              </div>
            </motion.div>

            {/* Jump to How-it-works link */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("how-it-works");
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="inline-flex items-center gap-2 text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors group cursor-pointer"
              >
                <span>شاهد كيف تعمل المنصة خطوة بخطوة بالأسفل</span>
                <ArrowDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
              </button>
            </div>
          </motion.div>

          {/* Left Column (Auth Form): Slides in from Left */}
          <motion.div
            initial={{ opacity: 0, x: -80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="lg:col-span-5"
          >
            <div className="bg-white rounded-3xl p-7 sm:p-8 border border-slate-200 shadow-2xl shadow-brand-500/10 text-right relative overflow-hidden">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-brand-600 via-sky-500 to-indigo-600" />

              {/* Card Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    {authView === "register" && "إنشاء حساب طالب جديد"}
                    {authView === "login" && "تسجيل الدخول للمنصة"}
                    {authView === "verify_otp" && "تأكيد ملكية الحساب (OTP)"}
                    {authView === "forgot_password" && "استعادة كلمة المرور"}
                    {authView === "reset_password" && "تعيين كلمة المرور الجديدة"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {authView === "register" && "سجل حسابك للوصول إلى مذكراتك وتحليلاتك"}
                    {authView === "login" && "سجل الدخول للمتابعة إلى لوحة المذاكرة"}
                    {authView === "verify_otp" && `تم إرسال رمز الأمان إلى: ${email}`}
                    {authView === "forgot_password" && "أدخل بريدك الإلكتروني المسجل لاستلام رمز الاستعادة"}
                    {authView === "reset_password" && "أدخل الرمز المرسل وكلمة المرور الجديدة"}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  {authView === "verify_otp" ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  ) : authView === "forgot_password" || authView === "reset_password" ? (
                    <KeyRound className="w-5 h-5 text-amber-600" />
                  ) : (
                    <GraduationCap className="w-5 h-5" />
                  )}
                </div>
              </div>

              {/* Login / Register Mode Toggle (only in login/register view) */}
              {(authView === "login" || authView === "register") && (
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-6 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthView("login");
                      setAuthError("");
                      setAuthSuccessMsg("");
                    }}
                    className={`py-2 rounded-lg transition-all ${
                      authView === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    تسجيل الدخول
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthView("register");
                      setAuthError("");
                      setAuthSuccessMsg("");
                    }}
                    className={`py-2 rounded-lg transition-all ${
                      authView === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    طالب جديد
                  </button>
                </div>
              )}

              {/* Alerts */}
              {authSuccessMsg && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{authSuccessMsg}</span>
                </div>
              )}

              {devOtpCode && authView === "verify_otp" && (
                <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-xs rounded-xl border border-blue-200 flex items-center justify-between">
                  <span>💡 رمز التحقق التجريبي السريع:</span>
                  <span className="font-black text-sm tracking-widest bg-white px-2 py-0.5 rounded border border-blue-300">{devOtpCode}</span>
                </div>
              )}

              {authError && (
                <div className="mb-4 p-3.5 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 leading-relaxed space-y-2">
                  <div>{authError}</div>
                  {authView === "login" && (
                    <div className="pt-1.5 border-t border-red-200">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthView("register");
                          setAuthError("");
                        }}
                        className="font-bold underline text-brand-700 hover:text-brand-900 cursor-pointer block text-right"
                      >
                        💡 ليس لديك حساب بعد؟ اضغط هنا للتحويل إلى (طالب جديد) والتسجيل أولاً 🚀
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 1 & 2: LOGIN / REGISTER */}
              {(authView === "login" || authView === "register") && (
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authView === "register" && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">الاسم بالكامل</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="مثال: أحمد محمد"
                            className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم الهاتف (اختياري للتحقق)</label>
                        <div className="relative">
                          <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="مثال: 01012345678"
                            className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dir-ltr text-right"
                          />
                          <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">البريد الإلكتروني</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dir-ltr text-right"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">كلمة المرور</label>
                      {authView === "login" && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthView("forgot_password");
                            setAuthError("");
                            setAuthSuccessMsg("");
                          }}
                          className="text-[11px] text-brand-600 hover:text-brand-800 font-bold"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dir-ltr text-right"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full mt-2 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري المعالجة...</span>
                      </>
                    ) : (
                      <>
                        <span>{authView === "register" ? "إنشاء الحساب وبدء التحقق" : "دخول مباشر للوحة المذاكرة"}</span>
                        <ArrowLeft className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* VIEW 3: OTP VERIFICATION */}
              {authView === "verify_otp" && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      أدخل رمز التحقق (6 أرقام)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        maxLength={6}
                        autoFocus
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="------"
                        className="w-full text-center tracking-[12px] text-2xl font-black font-mono py-3 border-2 border-brand-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      تحقق من صندوق الوارد أو الرسائل غير المرغوب فيها (Spam).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading || otpCode.length !== 6}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        <span>تأكيد الحساب والدخول للوحة المذاكرة</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || authLoading}
                      onClick={handleResendOtp}
                      className="text-brand-600 hover:text-brand-800 disabled:text-slate-400 font-bold flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${authLoading ? "animate-spin" : ""}`} />
                      <span>{resendCooldown > 0 ? `إعادة الإرسال بعد (${resendCooldown} ث)` : "إعادة إرسال الرمز"}</span>
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            localStorage.removeItem("studymind_pending_verify_email");
                          }
                          setAuthView("login");
                          setAuthError("");
                          setAuthSuccessMsg("");
                        }}
                        className="text-slate-500 hover:text-slate-700 underline"
                      >
                        تسجيل الدخول
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            localStorage.removeItem("studymind_pending_verify_email");
                          }
                          setAuthView("register");
                          setAuthError("");
                          setAuthSuccessMsg("");
                        }}
                        className="text-slate-500 hover:text-slate-700 underline"
                      >
                        تعديل البريد
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* VIEW 4: FORGOT PASSWORD */}
              {authView === "forgot_password" && (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">البريد الإلكتروني المسجل</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dir-ltr text-right"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>إرسال رمز الاستعادة</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthView("login");
                        setAuthError("");
                        setAuthSuccessMsg("");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      العودة لتسجيل الدخول
                    </button>
                  </div>
                </form>
              )}

              {/* VIEW 5: RESET PASSWORD */}
              {authView === "reset_password" && (
                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">رمز الاستعادة (6 أرقام)</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="w-full text-center tracking-widest text-lg font-mono py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">كلمة المرور الجديدة</label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="•••••••• (8 أحرف على الأقل)"
                        className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dir-ltr text-right"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري التحديث...</span>
                      </>
                    ) : (
                      <>
                        <span>تأكيد كلمة المرور الجديدة والدخول</span>
                        <ArrowLeft className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthView("login");
                        setAuthError("");
                        setAuthSuccessMsg("");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      العودة لتسجيل الدخول
                    </button>
                  </div>
                </form>
              )}

              {/* Bottom footer link */}
              {(authView === "login" || authView === "register") && (
                <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-400">
                    {authView === "register" ? "لديك حساب بالفعل؟" : "ليس لديك حساب بعد؟"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthView(authView === "register" ? "login" : "register");
                        setAuthError("");
                        setAuthSuccessMsg("");
                      }}
                      className="text-brand-600 hover:underline font-bold"
                    >
                      {authView === "register" ? "سجل دخول الآن" : "أنشئ حسابك مجاناً"}
                    </button>
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
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
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="px-8 py-3.5 bg-white text-brand-700 hover:bg-brand-50 font-black text-xs sm:text-sm rounded-xl shadow-lg transition-transform hover:scale-105"
              >
                ابدأ المذاكرة الآن مجاناً 🎓
              </button>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-white/5 pointer-events-none rounded-full blur-3xl" />
        </motion.div>
      </section>
    </div>
  );
}
