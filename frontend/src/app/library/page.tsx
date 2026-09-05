"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Edit3,
  File,
  FileText,
  FileUp,
  Filter,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { api } from "@/lib/api";

interface DocumentItem {
  id: number;
  title: string;
  subject?: string;
  filename: string;
  file_type?: string;
  total_pages: number;
  status: string;
  progress_percentage?: number;
  progress_stage?: string;
  retry_count?: number;
  error_message?: string;
  created_at?: string;
}

export default function LibraryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  // Search & Filter state (Proposal 6)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSubject, setUploadSubject] = useState("الفيزياء");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    setUploadFile(file);
    if (!uploadTitle.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setUploadTitle(baseName);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const getFormatBadge = (fileType?: string, filename?: string) => {
    const ext = (fileType || filename?.split(".").pop() || "pdf").toLowerCase();
    if (ext === "pdf") {
      return { label: "PDF", bg: "bg-red-50 text-red-700 border-red-200/60" };
    } else if (ext === "docx" || ext === "doc") {
      return { label: "DOCX", bg: "bg-blue-50 text-blue-700 border-blue-200/60" };
    } else if (ext === "txt") {
      return { label: "TXT", bg: "bg-slate-100 text-slate-700 border-slate-200" };
    } else if (["jpg", "jpeg", "png", "image"].includes(ext)) {
      return { label: "صورة", bg: "bg-purple-50 text-purple-700 border-purple-200/60" };
    }
    return { label: ext.toUpperCase(), bg: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  // Real-time polling: automatically track documents in background processing states
  useEffect(() => {
    const hasActiveDocs = documents.some((d) => {
      const s = (d.status || "").toUpperCase();
      return ["PENDING", "UPLOADING", "PROCESSING", "OCR", "INDEXING", "EXTRACTING"].includes(s);
    });

    if (!hasActiveDocs) return;

    const interval = setInterval(async () => {
      try {
        const docs = await api.documents.list();
        setDocuments(docs);
      } catch (err) {
        console.error("Polling document update error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [documents]);

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
      const newDoc = await api.documents.upload(uploadFile, uploadTitle, uploadSubject);
      setShowUpload(false);
      setUploadFile(null);
      setUploadTitle("");
      // Add immediately to state in PENDING state; polling will track live progress
      setDocuments((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
    } catch (err: any) {
      alert(err.message || "فشل رفع الملف");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryDocument = async (docId: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setRetryingId(docId);
    try {
      const updatedDoc = await api.documents.retry(docId);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? updatedDoc : d))
      );
    } catch (err: any) {
      alert(err.message || "فشل إعادة تشغيل معالجة الملف");
    } finally {
      setRetryingId(null);
    }
  };

  // Delete modal state
  const [docToDelete, setDocToDelete] = useState<DocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Rename modal state
  const [docToRename, setDocToRename] = useState<DocumentItem | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameSubject, setRenameSubject] = useState("الفيزياء");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const openDeleteModal = (doc: DocumentItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setDocToDelete(doc);
    setDeleteError(null);
  };

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.documents.delete(docToDelete.id);
      // In-place update without reload
      setDocuments((prev) => prev.filter((d) => d.id !== docToDelete.id));
      setDocToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || "فشل حذف المستند");
    } finally {
      setIsDeleting(false);
    }
  };

  const openRenameModal = (doc: DocumentItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setDocToRename(doc);
    setRenameTitle(doc.title);
    setRenameSubject(doc.subject || "الفيزياء");
    setRenameError(null);
  };

  const handleRenameDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docToRename || !renameTitle.trim()) return;
    setIsRenaming(true);
    setRenameError(null);
    try {
      const updated = await api.documents.update(docToRename.id, {
        title: renameTitle.trim(),
        subject: renameSubject.trim(),
      });
      // In-place update without reload
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docToRename.id
            ? { ...d, title: updated.title, subject: updated.subject }
            : d
        )
      );
      setDocToRename(null);
    } catch (err: any) {
      setRenameError(err.message || "فشل تعديل اسم المستند");
    } finally {
      setIsRenaming(false);
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
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-24 space-y-6 sm:space-y-8">
      {/* Top Banner & Upload CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-700 via-sky-600 to-indigo-700 text-white p-5 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold mb-2">
            <BookOpen className="w-4 h-4 text-sky-200" />
            <span>مكتبة المذكرات والكتب الرقمية</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black">
            مكتبتك الدراسية الذكية 📚
          </h1>
          <p className="text-xs sm:text-sm text-sky-100 mt-1 max-w-xl">
            جميع كتبك ومذكراتك المفهرسة بواسطة الذكاء الاصطناعي في مكان واحد. انقر على أي مادة لفتح لوحة تحكمها وبدء المذاكرة.
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          className="w-full sm:w-auto self-stretch sm:self-center px-5 py-3 bg-white text-brand-700 hover:bg-brand-50 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 shrink-0"
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
          {filteredDocuments.map((doc) => {
            const statusUpper = (doc.status || "").toUpperCase();
            const isReady = statusUpper === "READY" || statusUpper === "INDEXED";
            const isFailed = statusUpper === "FAILED" || statusUpper === "ERROR";
            const isProcessing = !isReady && !isFailed;

            const CardContent = (
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full">
                      {doc.subject || "مادة عامة"}
                    </span>
                    {(() => {
                      const badge = getFormatBadge(doc.file_type, doc.filename);
                      return (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                    {isReady ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200/60">
                        جاهز للدراسة ✓
                      </span>
                    ) : statusUpper === "OCR" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200/60 animate-pulse flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        التعرف الضوئي OCR...
                      </span>
                    ) : statusUpper === "INDEXING" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200/60 animate-pulse flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        جاري الفهرسة...
                      </span>
                    ) : statusUpper === "PROCESSING" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200/60 animate-pulse flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        جاري الاستخراج...
                      </span>
                    ) : isFailed ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-red-50 text-red-700 rounded-full border border-red-200/60">
                        فشلت المعالجة ⚠️
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200 animate-pulse">
                        في قائمة الانتظار...
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {doc.total_pages > 0 ? `${doc.total_pages} صفحة` : ""}
                  </span>
                </div>

                <h3 className={`font-bold text-slate-900 text-base mb-1.5 line-clamp-1 ${isReady ? "group-hover:text-brand-600 transition-colors cursor-pointer" : ""}`}>
                  {doc.title}
                </h3>
                <p className="text-xs text-slate-400 mb-2 line-clamp-1">
                  ملف: {doc.filename}
                </p>

                {/* Progress Bar for Active Processing */}
                {isProcessing && (
                  <div className="my-2.5 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5 truncate">
                        <Loader2 className="w-3 h-3 text-brand-600 animate-spin shrink-0" />
                        <span className="truncate">{doc.progress_stage || "جاري المعالجة الذكية..."}</span>
                      </span>
                      <span className="font-bold text-brand-600 font-mono shrink-0 mr-2">
                        {doc.progress_percentage ?? 0}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-brand-600 h-1.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(doc.progress_percentage ?? 0, 5)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Box & Retry Button */}
                {isFailed && (
                  <div className="my-2.5 p-2.5 bg-red-50/80 border border-red-200 rounded-xl space-y-2">
                    <p className="text-[11px] text-red-700 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500 mt-0.5" />
                      <span className="line-clamp-2">{doc.error_message || "حدث خطأ أثناء معالجة وفهرسة المستند."}</span>
                    </p>
                    <button
                      type="button"
                      onClick={(e) => handleRetryDocument(doc.id, e)}
                      disabled={retryingId === doc.id}
                      className="w-full py-1.5 px-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      {retryingId === doc.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري إعادة التشغيل...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>إعادة المحاولة (Retry)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );

            return (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-brand-300 transition-all flex flex-col justify-between group"
              >
                {isReady ? (
                  <Link href={`/material/${doc.id}`} className="block">
                    {CardContent}
                  </Link>
                ) : (
                  <div>{CardContent}</div>
                )}

                <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                  {isReady ? (
                    <>
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
                    </>
                  ) : isProcessing ? (
                    <div className="flex-1 py-2.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
                      <span>قيد المعالجة ({doc.progress_percentage ?? 0}%)</span>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={(e) => openRenameModal(doc, e)}
                    title="تعديل اسم المذكرة"
                    className="p-2.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-colors shrink-0"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => openDeleteModal(doc, e)}
                    title="حذف المذكرة"
                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">رفع ملف دراسي جديد</h3>
              <button
                onClick={() => {
                  setShowUpload(false);
                  setUploadFile(null);
                }}
                disabled={isUploading}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              اختر كتاب الوزارة، ملخص DOCX، نص TXT أو صورة ممسوحة ضوئياً. يدعم النظام الاستخراج الذكي و OCR وتجهيز الكويزات والشرح.
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

              {/* Drag & Drop Upload Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الملف الدراسي</label>
                {!uploadFile ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                      isDragging
                        ? "border-brand-500 bg-brand-50/50 scale-[1.01]"
                        : "border-slate-300 hover:border-brand-400 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="file"
                      required
                      accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 mb-1">
                      اسحب وأفلت الملف هنا أو <span className="text-brand-600 underline">تصفح جهازك</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mb-3">الحد الأقصى لحجم الملف: 50 ميجابايت</p>
                    
                    {/* Supported formats badges */}
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200/50">PDF</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/50">DOCX</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">TXT</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/50">JPG / PNG</span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                        {uploadFile.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(uploadFile.name) ? (
                          <ImageIcon className="w-5 h-5" />
                        ) : /\.(docx?)$/i.test(uploadFile.name) ? (
                          <FileText className="w-5 h-5 text-blue-600" />
                        ) : (
                          <File className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate" dir="ltr">{uploadFile.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB • {uploadFile.name.split(".").pop()?.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => setUploadFile(null)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="إزالة الملف"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {isUploading && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
                      جاري التحقق والمعالجة الذكية...
                    </span>
                    <span className="text-[11px] font-mono text-brand-600">Unified Pipeline</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 pt-1 text-[10px] text-center font-bold">
                    <span className="py-1 px-1 bg-brand-100 text-brand-800 rounded-lg">1. فحص التوقيع</span>
                    <span className="py-1 px-1 bg-brand-100 text-brand-800 rounded-lg">2. استخراج/OCR</span>
                    <span className="py-1 px-1 bg-blue-100 text-blue-800 rounded-lg">3. التقطيع والضبط</span>
                    <span className="py-1 px-1 bg-emerald-100 text-emerald-800 rounded-lg">4. الفهرسة</span>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    يتم استخراج النصوص وتحليلها وتوليد الـ Embeddings تلقائياً لجميع الصيغ المدعومة.
                  </p>
                </div>
              )}

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

      {/* Rename Modal */}
      {docToRename && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">تعديل المذكرة</h3>
                  <p className="text-xs text-slate-400">تحديث عنوان المادة أو التصنيف</p>
                </div>
              </div>
              <button
                onClick={() => setDocToRename(null)}
                disabled={isRenaming}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renameError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{renameError}</span>
              </div>
            )}

            <form onSubmit={handleRenameDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان المذكرة الجديد</label>
                <input
                  type="text"
                  required
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  placeholder="مثال: مذكرة الفيزياء الحديثة"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  disabled={isRenaming}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">المادة الدراسية</label>
                <select
                  value={renameSubject}
                  onChange={(e) => setRenameSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  disabled={isRenaming}
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

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isRenaming || !renameTitle.trim()}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {isRenaming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <span>حفظ التعديلات</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDocToRename(null)}
                  disabled={isRenaming}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">تأكيد حذف المذكرة</h3>
                <p className="text-xs text-slate-500">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                هل أنت متأكد من حذف مذكرة <strong className="text-slate-900 font-bold">"{docToDelete.title}"</strong>؟
              </p>
              <p className="text-[11px] text-red-500 mt-2 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                سيتم حذف كافة الأسئلة، الاختبارات، والمفاهيم المرتبطة بها نهائيًا.
              </p>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، احذف المذكرة</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDocToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 text-xs font-bold rounded-xl transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
