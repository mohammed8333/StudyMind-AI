"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Award,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

export default function Navbar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [user, setUser] = useState<{ full_name: string; email: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const syncUser = () => {
      if (typeof window === "undefined") return;
      const storedUser = localStorage.getItem("studymind_user");
      const token = localStorage.getItem("studymind_token");
      if (storedUser && token) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    syncUser();

    const handleAuthEvent = (e: any) => {
      if (e?.detail) {
        setUser(e.detail);
      } else {
        syncUser();
      }
    };

    window.addEventListener("studymind_auth_change", handleAuthEvent);
    window.addEventListener("storage", syncUser);

    return () => {
      window.removeEventListener("studymind_auth_change", handleAuthEvent);
      window.removeEventListener("storage", syncUser);
    };
  }, [pathname]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    api.auth.logout();
    setUser(null);
    setMobileMenuOpen(false);
    router.push("/");
  };

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.auth.deleteAccount();
      setUser(null);
      setDeleteModalOpen(false);
      setMobileMenuOpen(false);
      router.push("/");
    } catch (err: any) {
      setDeleteError(err.message || "تعذر حذف الحساب والبيانات");
      setIsDeleting(false);
    }
  };

  const navLinks = [
    { href: "/dashboard", label: "لوحة المتابعة", icon: LayoutDashboard },
    { href: "/copilot", label: "المساعد الذكي", icon: Sparkles },
    { href: "/planner", label: "جدول المذاكرة الذكي", icon: CalendarDays },
    { href: "/exams", label: "محاكي الامتحانات", icon: Award },
    { href: "/flashcards", label: "البطاقات الذكية", icon: Layers },
    { href: "/library", label: "المكتبة والمذكرات", icon: BookOpen },
    { href: "/quizzes", label: "الاختبارات", icon: GraduationCap },
  ];

  const isStudyOrQuizRoom = pathname.startsWith("/study") || pathname.startsWith("/quiz") || Boolean(pathname.match(/^\/exams\/\d+/));

  return (
    <>
      <nav className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center gap-2">
            {/* Right Group (In RTL): Mobile Hamburger Button + Brand Logo */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Hamburger Toggle Button - Placed on the right! */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="القائمة الجانبية"
                className="lg:hidden p-2 text-slate-700 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                <Menu className="w-6 h-6" />
              </button>

              {/* Brand Logo */}
              <Link href="/" className="flex items-center gap-2 sm:gap-2.5 group shrink-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <BrainCircuit className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="leading-tight">
                  <span className="text-base sm:text-xl font-black bg-gradient-to-l from-brand-700 to-sky-600 bg-clip-text text-transparent block">
                    StudyMind AI
                  </span>
                  <span className="hidden sm:block text-[10px] text-slate-400 font-medium -mt-0.5">
                    محرك المذاكرة والتعلم الذكي
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links (Center) */}
            <div className="hidden lg:flex items-center gap-1 xl:gap-2 shrink-0">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? "bg-brand-50 text-brand-700 border border-brand-200 shadow-xs"
                        : "text-slate-600 hover:text-brand-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Left Group (In RTL): Desktop User Section & Mobile User Badge / Login */}
            <div className="flex items-center gap-2.5 xl:gap-3 shrink-0">
              {/* Desktop User Section */}
              <div className="hidden lg:flex items-center gap-2.5 xl:gap-3 shrink-0">
                {user ? (
                  <Link
                    href="/profile"
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shadow-2xs hover:shadow-xs group whitespace-nowrap shrink-0 ${
                      pathname === "/profile"
                        ? "bg-brand-50 border-brand-300 text-brand-700 ring-2 ring-brand-100"
                        : "bg-slate-50 hover:bg-white border-slate-200 text-slate-700 hover:border-brand-200"
                    }`}
                    title="الملف الشخصي والحساب"
                  >
                    <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center font-black text-xs shadow-2xs shrink-0">
                      {user.full_name?.charAt(0) || "ط"}
                    </div>
                    <span className="text-xs font-bold group-hover:text-brand-700 transition-colors whitespace-nowrap">
                      {user.full_name}
                    </span>
                    <span className="text-[10px] font-bold text-brand-700 bg-brand-100/70 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                      حسابي
                    </span>
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all whitespace-nowrap shrink-0"
                  >
                    دخول / تجربة
                  </Link>
                )}
              </div>

              {/* Mobile Header Left Controls: User Badge or Login Button */}
              <div className="flex lg:hidden items-center">
                {user ? (
                  <Link
                    href="/profile"
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border max-w-[130px] sm:max-w-[160px] transition-all whitespace-nowrap ${
                      pathname === "/profile"
                        ? "bg-brand-50 border-brand-300 text-brand-700 ring-1 ring-brand-200"
                        : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                    }`}
                    title="الملف الشخصي والحساب"
                  >
                    <div className="w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                      {user.full_name?.charAt(0) || "ط"}
                    </div>
                    <span className="text-[11px] font-bold truncate">
                      {user.full_name}
                    </span>
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0"
                  >
                    دخول
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ========================================================================= */}
      {/* MOBILE SIDE DRAWER (قائمة جانبية احترافية تنزلق من اليمين) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            {/* Backdrop overlay (Fades in) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs cursor-pointer"
            />

            {/* Side Drawer Panel (Slides in from the right in RTL) */}
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="absolute top-0 right-0 bottom-0 w-[290px] sm:w-[320px] bg-white shadow-2xl z-10 flex flex-col justify-between overflow-y-auto text-right"
              dir="rtl"
            >
              {/* Drawer Top & Navigation */}
              <div className="p-4 space-y-4">
                {/* Header with Logo & Close button */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-sm">
                      <BrainCircuit className="w-5 h-5" />
                    </div>
                    <span className="text-base font-black bg-gradient-to-l from-brand-700 to-sky-600 bg-clip-text text-transparent">
                      StudyMind AI
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    aria-label="إغلاق القائمة"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* User Profile Card in Drawer */}
                {user ? (
                  <Link
                    href="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-50 to-brand-50/40 rounded-2xl border border-slate-200/80 hover:border-brand-300 transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
                        {user.full_name?.charAt(0) || "ط"}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900 group-hover:text-brand-700 transition-colors">
                          {user.full_name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:-translate-x-0.5 transition-all" />
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-500 hover:to-sky-500 rounded-xl transition-all shadow-md shadow-brand-500/20"
                  >
                    <User className="w-4 h-4" />
                    <span>تسجيل الدخول / إنشاء حساب</span>
                  </Link>
                )}

                {/* Navigation Links */}
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-bold text-slate-400 px-3 pb-1">أقسام المنصة</p>
                  {navLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all ${
                          isActive
                            ? "bg-brand-50 text-brand-700 border border-brand-200 shadow-2xs font-black"
                            : "text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span>{link.label}</span>
                        </div>
                        <ChevronLeft className={`w-4 h-4 ${isActive ? "text-brand-600" : "text-slate-400"}`} />
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Bottom: Logout or Extra Actions */}
              <div className="p-4 border-t border-slate-100 space-y-2 bg-slate-50/50">
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج</span>
                  </button>
                )}
                <p className="text-[10px] text-slate-400 text-center">StudyMind AI © 2026</p>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Account Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 text-right rtl">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900">
                حذف الحساب والبيانات نهائياً؟
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                تنبيه هام: سيتم مسح حسابك بشكل كامل، بما في ذلك جميع المذكرات والملفات المرفوعة، والأسئلة، ونتائج الكويزات، وسجل الشات من قاعدة البيانات نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-xs font-bold transition-colors shadow-sm shadow-rose-200"
              >
                {isDeleting ? "جارٍ الحذف..." : "نعم، احذف نهائياً"}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalOpen(false)}
                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (App-style navigation for mobile) */}
      {user && !isStudyOrQuizRoom && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 py-2 px-6 flex justify-around items-center shadow-lg">
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/dashboard"
                ? "text-brand-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${pathname === "/dashboard" ? "stroke-[2.5]" : ""}`} />
            <span className="text-[10px]">الرئيسية</span>
          </Link>

          <Link
            href="/copilot"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/copilot"
                ? "text-brand-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Sparkles className={`w-5 h-5 ${pathname === "/copilot" ? "stroke-[2.5]" : ""}`} />
            <span className="text-[10px]">الـ Copilot</span>
          </Link>

          <Link
            href="/library"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/library"
                ? "text-brand-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <BookOpen className={`w-5 h-5 ${pathname === "/library" ? "stroke-[2.5]" : ""}`} />
            <span className="text-[10px]">المكتبة</span>
          </Link>

          <Link
            href="/quizzes"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/quizzes"
                ? "text-brand-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <GraduationCap className={`w-5 h-5 ${pathname === "/quizzes" ? "stroke-[2.5]" : ""}`} />
            <span className="text-[10px]">الاختبارات</span>
          </Link>

          <Link
            href="/profile"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/profile"
                ? "text-brand-600 font-black"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <User className={`w-5 h-5 ${pathname === "/profile" ? "stroke-[2.5]" : ""}`} />
            <span className="text-[10px]">حسابي</span>
          </Link>
        </nav>
      )}
    </>
  );
}
