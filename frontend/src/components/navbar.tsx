"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

export default function Navbar() {
  const pathname = usePathname() || "";
  const [user, setUser] = useState<{ full_name: string; email: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("studymind_user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    api.auth.logout();
    setUser(null);
    window.location.href = "/";
  };

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.auth.deleteAccount();
      setUser(null);
      setDeleteModalOpen(false);
      window.location.href = "/";
    } catch (err: any) {
      setDeleteError(err.message || "تعذر حذف الحساب والبيانات");
      setIsDeleting(false);
    }
  };

  const navLinks = [
    { href: "/dashboard", label: "لوحة المتابعة", icon: LayoutDashboard },
    { href: "/library", label: "المكتبة والمذكرات", icon: BookOpen },
    { href: "/quizzes", label: "الاختبارات", icon: GraduationCap },
  ];

  const isStudyOrQuizRoom = pathname.startsWith("/study") || pathname.startsWith("/quiz");

  return (
    <>
      <nav className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center gap-2">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
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

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1.5 lg:gap-3">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "bg-brand-50 text-brand-700 border border-brand-200 shadow-xs"
                        : "text-slate-600 hover:text-brand-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Desktop User Section */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                    <User className="w-4 h-4 text-brand-600" />
                    <span className="text-xs font-bold text-slate-700">{user.full_name}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    title="تسجيل الخروج"
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteModalOpen(true)}
                    title="حذف الحساب والبيانات نهائياً"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/"
                  className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all"
                >
                  دخول / تجربة
                </Link>
              )}
            </div>

            {/* Mobile Header Right Controls: User Badge + Hamburger Toggle */}
            <div className="flex md:hidden items-center gap-2">
              {user && (
                <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 max-w-[125px]">
                  <User className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-700 truncate">
                    {user.full_name}
                  </span>
                </div>
              )}

              {/* Hamburger Toggle Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="القائمة الرئيسية"
                className="p-2 text-slate-700 hover:text-brand-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur-md px-4 pt-3 pb-5 space-y-3 shadow-xl animate-in slide-in-from-top-2 duration-200">
            {user ? (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-sm">
                    {user.full_name?.charAt(0) || "ط"}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-900">{user.full_name}</p>
                    <p className="text-[11px] text-slate-400 truncate max-w-[180px]">
                      {user.email}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                  طالب نشط
                </span>
              </div>
            ) : null}

            <div className="space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700 border border-brand-200"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-brand-600" />
                      <span>{link.label}</span>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </Link>
                );
              })}
            </div>

            {user ? (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 p-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج من الحساب</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setDeleteModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-2.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف الحساب والبيانات نهائياً</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 p-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors shadow-sm"
                >
                  <span>تسجيل الدخول / إنشاء حساب</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

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
        </nav>
      )}
    </>
  );
}
