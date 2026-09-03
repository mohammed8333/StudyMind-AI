"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, BrainCircuit, GraduationCap, LayoutDashboard, LogOut, User } from "lucide-react";
import { api } from "@/lib/api";

export default function Navbar() {
  const [user, setUser] = useState<{ full_name: string; email: string } | null>(null);

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

  const handleLogout = () => {
    api.auth.logout();
    setUser(null);
    window.location.href = "/";
  };

  return (
    <nav className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-l from-brand-700 to-sky-600 bg-clip-text text-transparent">
                StudyMind AI
              </span>
              <span className="block text-[10px] text-slate-400 font-medium -mt-1">
                محرك المذاكرة والتعلم الذكي
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-600 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              لوحة المتابعة
            </Link>
            <Link
              href="/library"
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-600 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              المكتبة والمذكرات
            </Link>
            <Link
              href="/quizzes"
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-600 transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              الاختبارات
            </Link>
          </div>

          {/* User Section */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                  <User className="w-4 h-4 text-brand-600" />
                  <span className="text-xs font-bold text-slate-700">{user.full_name}</span>
                </div>
                <button
                  onClick={handleLogout}
                  title="تسجيل الخروج"
                  className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/dashboard"
                className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-all"
              >
                دخول / تجربة
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
