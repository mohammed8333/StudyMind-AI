"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth Form View State
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [authView, setAuthView] = useState<"login" | "register" | "verify_otp" | "forgot_password" | "reset_password">(initialMode);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  // Status & Feedback
  const [authLoading, setAuthLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [authError, setAuthError] = useState("");
  const [authSuccessMsg, setAuthSuccessMsg] = useState("");

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Initial Auth Check & Pending Verification Recovery
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("studymind_token") : null;
    const pendingEmail = typeof window !== "undefined" ? localStorage.getItem("studymind_pending_verify_email") : null;

    if (token) {
      api.auth.getMe()
        .then((user: any) => {
          if (user && user.is_verified === false) {
            localStorage.removeItem("studymind_token");
            localStorage.removeItem("studymind_user");
            window.dispatchEvent(new CustomEvent("studymind_auth_change", { detail: null }));
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
          window.dispatchEvent(new CustomEvent("studymind_auth_change", { detail: null }));
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
        const loginData = await api.auth.login(email.trim(), password);
        if (typeof window !== "undefined") {
          localStorage.removeItem("studymind_pending_verify_email");
          window.dispatchEvent(new CustomEvent("studymind_auth_change", { detail: loginData }));
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
      const verifyData = await api.auth.verifyEmail(email.trim(), otpCode.trim());
      if (typeof window !== "undefined") {
        localStorage.removeItem("studymind_pending_verify_email");
        window.dispatchEvent(new CustomEvent("studymind_auth_change", { detail: verifyData }));
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
          <BrainCircuit className="w-8 h-8" />
        </motion.div>
        <p className="text-xs font-bold text-slate-500">جاري التحقق من الجلسة...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8 sm:py-12 bg-slate-50/50">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* ========================================================================= */}
        {/* RIGHT SIDE: INFORMATION ABOUT THE WEBSITE (معلومات عن الموقع) */}
        {/* ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-7 text-right space-y-6 order-2 lg:order-1"
        >
          {/* Brand pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold">
            <Sparkles className="w-4 h-4 text-brand-600 animate-spin" />
            <span>محرك المذاكرة والتعلم الذكي رقم #1 للطلاب العرب</span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 leading-[1.35] sm:leading-[1.45]">
              <span className="block mb-2">كل ما تحتاجه للمذاكرة والتفوق..</span>
              <span className="block bg-gradient-to-l from-brand-600 via-sky-500 to-indigo-600 bg-clip-text text-transparent pb-1">
                في مكان واحد بدقة الذكاء الاصطناعي
              </span>
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mt-3 max-w-xl">
              منصة <strong>StudyMind AI</strong> مصممة خصيصاً للطلاب؛ تفكك مذكراتك وكتب الوزارة (PDF) بدقة رقمية عالية، وتبني لك خطة مذاكرة واختبارات وتشرح لك كل فقرة برقم صفحتها.
            </p>
          </div>

          {/* Key Features Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-all text-right space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-900">تحليل المذكرات والكتب (PDF)</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                استخراج فوري للنصوص وتطبيع العربية وحفظ رقم الصفحة الفعلي لكل معلومة وقانون.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-all text-right space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <BrainCircuit className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-900">معلم ذكي (أسلوب فاينمان)</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                شرح بأربعة مستويات ذكية من البسيط جداً حتى الصياغة النموذجية للامتحان مع ذكر المصدر.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-all text-right space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-900">امتحانات وتشخيص الضعف</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                توليد كويزات آلية مع تصحيح وتفسير فوري وعلاج المفاهيم التي تخطئ فيها تلقائياً.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-all text-right space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-900">تكرار متباعد وبطاقات ذكية</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                تثبيت المعلومات والمفاهيم في الذاكرة طويلة المدى وفق جدول زمني ذكي قبل الامتحان.
              </p>
            </div>
          </div>

          {/* Quick trust metrics */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-50/70 to-sky-50/70 border border-brand-100 flex items-center justify-around text-center">
            <div>
              <div className="text-base sm:text-lg font-black text-brand-700 font-mono">100%</div>
              <div className="text-[10px] text-slate-500 font-bold">توثيق برقم الصفحة</div>
            </div>
            <div className="w-px h-7 bg-brand-200/60" />
            <div>
              <div className="text-base sm:text-lg font-black text-brand-700 font-mono">10,000+</div>
              <div className="text-[10px] text-slate-500 font-bold">طالب يذاكرون بذكاء</div>
            </div>
            <div className="w-px h-7 bg-brand-200/60" />
            <div>
              <div className="text-base sm:text-lg font-black text-emerald-600 flex items-center justify-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                <span>حماية كاملة</span>
              </div>
              <div className="text-[10px] text-slate-500 font-bold">تحقق أمان فوري</div>
            </div>
          </div>
        </motion.div>

        {/* ========================================================================= */}
        {/* LEFT SIDE: THE AUTHENTICATION CARD (المربع الأحمر) */}
        {/* ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-5 order-1 lg:order-2"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xl shadow-brand-500/10 text-right relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-brand-600 via-sky-500 to-indigo-600" />

            {/* Header */}
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
                  {authView === "reset_password" && "أدخل الرمز المكون من 6 أرقام وكلمة المرور الجديدة"}
                </p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shadow-xs shrink-0">
                {authView === "verify_otp" ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                ) : (
                  <GraduationCap className="w-5 h-5" />
                )}
              </div>
            </div>

            {/* Toggle Tabs (Login vs Register) */}
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
                    authView === "login" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
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
                    authView === "register" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
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
                <span>💡 رمز التحقق السريع:</span>
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

            {/* VIEW 3: OTP VERIFICATION (مع التنبيه البارز لمجلد الرسائل غير المرغوب فيها) */}
            {authView === "verify_otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {/* PROMINENT SPAM ALERT BOX (تنبيه بارز جداً وواضح للجميع) */}
                <div className="p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl text-amber-950 text-xs shadow-md space-y-2 text-right animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 font-black text-amber-900 text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 animate-bounce" />
                    <span>⚠️ تنبيه هام جداً للوصول لرمز التحقق:</span>
                  </div>
                  <p className="leading-relaxed font-bold text-amber-900 text-xs">
                    إذا لم تجد الرسالة في صندوق الوارد (Inbox)، يرجى فحص مجلد <span className="bg-amber-200/90 px-1.5 py-0.5 rounded text-amber-950 font-black">الرسائل غير المرغوب فيها (Spam / Junk)</span> أو تبويب <span className="bg-amber-200/90 px-1.5 py-0.5 rounded text-amber-950 font-black">الرسائل الترويجية (Promotions)</span> فوراً!
                  </p>
                </div>

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
                      <span>جاري إرسال الرمز...</span>
                    </>
                  ) : (
                    <span>إرسال رمز الاستعادة</span>
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
                    className="text-xs text-brand-600 hover:text-brand-800 font-bold"
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
                      <span>جاري حفظ كلمة المرور...</span>
                    </>
                  ) : (
                    <span>تأكيد كلمة المرور الجديدة</span>
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
                    className="text-xs text-brand-600 hover:text-brand-800 font-bold"
                  >
                    إلغاء والعودة لتسجيل الدخول
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
