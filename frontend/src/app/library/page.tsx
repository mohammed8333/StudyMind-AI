"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  FileUp,
  Filter,
  GraduationCap,
  Loader2,
  MessageSquare,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  X
} from "lucide-react";
import { api } from "@/lib/api";

interface DocumentItem {
  id: number;
  title: string;
  subject?: string;
  filename: string;
  total_pages: number;
  status: string;
  created_at?: string;
}

export default function LibraryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  // Search & Filter state (Proposal 6)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSubject, setUploadSubject] = useState("الفيزياء");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const me = await api.auth.getMe();
      setUser(me);
      const docs = await api.documents.list();
      setDocuments(docs);
    } catch (e) {
      setUser(null);
      router.replace("/");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTitle) return;
    setIsUploading(true);
    try {
      await api.documents.upload(uploadFile, uploadTitle, uploadSubject);
      setShowUpload(false);
      setUploadFile(null);
      setUploadTitle("");
      // Reload documents
      const docs = await api.documents.list();
      setDocuments(docs);
    } catch (err: any) {
      alert(err.message || "فشل رفع الملف");
    } finally {
      setIsUploading(false);
    }
  };

  // Distinct subjects for filter pills
  const subjectsList = useMemo(() => {
    const subs = new Set<string>();
    documents.forEach((d) => {
      if (d.subject) subs.add(d.subject);
    });
    return Array.from(subs);
  }, [documents]);

  // Filtered documents by search query and subject
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.subject && doc.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSubject =
        selectedSubject === "all" || doc.subject === selectedSubject;

      return matchesSearch && matchesSubject;
    });
  }, [documents, searchQuery, selectedSubject]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-xs text-slate-500">جاري تحميل مكتبتك الدراسية والمذكرات...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Upload CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-700 via-sky-600 to-indigo-700 text-white p-7 rounded-3xl shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold mb-2">
            <BookOpen className="w-4 h-4 text-sky-200" />
            <span>مكتبة المذكرات والكتب الرقمية</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">
            مكتبتك الدراسية الذكية 📚
          </h1>
          <p className="text-xs sm:text-sm text-sky-100 mt-1 max-w-xl">
            جميع كتبك ومذكراتك المفهرسة بواسطة الذكاء الاصطناعي في مكان واحد. انقر على أي مادة لفتح لوحة تحكمها وبدء المذاكرة.
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          className="self-start sm:self-center px-5 py-3 bg-white text-brand-700 hover:bg-brand-50 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>رفع كتاب أو ملزمة جديدة</span>
        </button>
      </div>

      {/* Proposal 6: Search & Filter Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن أي كتاب، ملزمة، أو مادة دراسية..."
              className="w-full pr-11 pl-10 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50/50"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-4 top-3.5" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute left-3.5 top-3.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 font-bold self-start md:self-center shrink-0">
            <span>إجمالي المذكرات:</span>
            <span className="bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full font-mono">
              {filteredDocuments.length} من {documents.length}
            </span>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 ml-1">
            <Filter className="w-3.5 h-3.5" />
            المادة:
          </span>

          <button
            onClick={() => setSelectedSubject("all")}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
              selectedSubject === "all"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            الكل ({documents.length})
          </button>

          {subjectsList.map((sub) => {
            const count = documents.filter((d) => d.subject === sub).length;
            return (
              <button
                key={sub}
                onClick={() => setSelectedSubject(sub)}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                  selectedSubject === sub
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {sub} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Materials Cards Grid */}
      {filteredDocuments.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">
            {documents.length === 0
              ? "لم تقم برفع أي مذكرات بعد"
              : "لا توجد مواد تطابق خيارات البحث الحالية"}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {documents.length === 0
              ? "ارفع مذكرتك الأولى (PDF) وسيقوم المدرس الذكي بتحليلها وتجهيز الأسئلة والشرح فوراً."
              : "جرّب تغيير كلمات البحث أو اختيار مادة دراسية أخرى."}
          </p>
          {documents.length === 0 ? (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow"
            >
              رفع أول مذكرة الآن
            </button>
          ) : (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedSubject("all");
              }}
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              إعادة تعيين الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-brand-300 transition-all flex flex-col justify-between group"
            >
              <Link href={`/material/${doc.id}`} className="block">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full">
                    {doc.subject || "مادة عامة"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {doc.total_pages} صفحة
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-base mb-1.5 line-clamp-1 group-hover:text-brand-600 transition-colors">
                  {doc.title}
                </h3>
                <p className="text-xs text-slate-400 mb-5 line-clamp-1">
                  ملف: {doc.filename}
                </p>
              </Link>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                <Link
                  href={`/material/${doc.id}`}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>لوحة المادة</span>
                </Link>

                <Link
                  href={`/study/${doc.id}`}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>شات</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">رفع مادة دراسية جديدة (PDF)</h3>
              <button
                onClick={() => setShowUpload(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              اختر كتاب الوزارة أو ملزمتك، وسيقوم النظام فوراً بفهرسة المحتوى وتجهيز المدرس الذكي والاختبارات.
            </p>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان المادة أو المذكرة</label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="مثال: مذكرة الفيزياء - الفصل الثاني"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">المادة الدراسية</label>
                <select
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="الفيزياء">الفيزياء</option>
                  <option value="الكيمياء">الكيمياء</option>
                  <option value="الأحياء">الأحياء</option>
                  <option value="اللغة العربية">اللغة العربية</option>
                  <option value="الرياضيات">الرياضيات</option>
                  <option value="البرمجة">البرمجة</option>
                  <option value="التاريخ">التاريخ</option>
                  <option value="الجغرافيا">الجغرافيا</option>
                  <option value="اللغة الإنجليزية">اللغة الإنجليزية</option>
                  <option value="أخرى">مادة أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ملف الـ PDF</label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                />
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري المعالجة والفهرسة...</span>
                    </>
                  ) : (
                    <span>بدء المعالجة الذكية</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  disabled={isUploading}
                  className="px-4 py-3 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
