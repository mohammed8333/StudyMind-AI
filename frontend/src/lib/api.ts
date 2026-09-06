function getApiBaseUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000/api/v1";

  url = url.trim().replace(/\/+$/, "");

  // Production: automatically add HTTPS if a hostname was provided
  // without a protocol.
  if (
    !url.startsWith("http://") &&
    !url.startsWith("https://")
  ) {
    url = `https://${url}`;
  }

  if (!url.endsWith("/api/v1")) {
    url = `${url}/api/v1`;
  }

  return url;
}

const API_BASE_URL = getApiBaseUrl();

function getAuthHeader(): Record<string, string> {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("studymind_token");
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

const nativeFetch =
  typeof globalThis !== "undefined" && globalThis.fetch
    ? globalThis.fetch.bind(globalThis)
    : ((...args: any[]) => Promise.reject(new Error("Fetch is unavailable")));

async function fetchWithNetworkErrorHandling(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await nativeFetch(input, init);
  } catch (err: any) {
    if (err.name === "TypeError" || (err.message && err.message.toLowerCase().includes("fetch"))) {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as any)?.url || "";
      const isLocalhost = urlStr.includes("localhost") || urlStr.includes("127.0.0.1");
      if (isLocalhost && typeof window !== "undefined" && window.location.hostname !== "localhost") {
        throw new Error(
          `تعذر الاتصال بالخادم: التطبيق يحاول الاتصال بـ (${urlStr}). يرجى إضافة متغير NEXT_PUBLIC_API_URL في إعدادات Vercel برابط Railway (مثال: https://your-backend.up.railway.app/api/v1).`
        );
      }
      throw new Error(
        `تعذر الاتصال بسيرفر الباك إند (${urlStr}). تأكد من تشغيل خدمة Railway وأن السيرفر نشط ومتاح.`
      );
    }
    throw err;
  }
}

const fetch = fetchWithNetworkErrorHandling;

async function parseResponseError(res: Response, defaultMsg: string): Promise<string> {
  try {
    const err = await res.json();
    return err.detail || defaultMsg;
  } catch {
    return `${defaultMsg} (رمز ${res.status}): تعذر الاتصال بالباك إند، تأكد من تشغيل السيرفر وصحة الرابط`;
  }
}

export const api = {
  auth: {
    async register(data: { email: string; password: string; full_name: string; grade_or_level?: string; phone_number?: string }) {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إنشاء الحساب");
        throw new Error(msg);
      }
      const devOtp = res.headers.get("X-Dev-Otp");
      const result = await res.json();
      if (devOtp) {
        result.dev_code = devOtp;
      }
      return result;
    },

    async verifyEmail(email: string, code: string) {
      const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل التحقق من البريد الإلكتروني");
        throw new Error(msg);
      }
      const data = await res.json();
      if (typeof window !== "undefined") {
        localStorage.setItem("studymind_token", data.access_token);
        localStorage.setItem("studymind_user", JSON.stringify(data));
      }
      return data;
    },

    async resendVerificationCode(email: string) {
      const res = await fetch(`${API_BASE_URL}/auth/resend-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إعادة إرسال رمز التحقق");
        throw new Error(msg);
      }
      const devOtp = res.headers.get("X-Dev-Otp");
      const data = await res.json();
      if (devOtp) data.dev_code = devOtp;
      return data;
    },

    async forgotPassword(email: string) {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إرسال رمز استعادة الحساب");
        throw new Error(msg);
      }
      const devOtp = res.headers.get("X-Dev-Otp");
      const data = await res.json();
      if (devOtp) data.dev_code = devOtp;
      return data;
    },

    async resetPassword(data: { email: string; code: string; new_password: string }) {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إعادة تعيين كلمة المرور");
        throw new Error(msg);
      }
      return res.json();
    },

    async login(email: string, password: string) {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "بيانات الدخول غير صحيحة");
        throw new Error(msg);
      }
      const data = await res.json();
      if (typeof window !== "undefined") {
        localStorage.setItem("studymind_token", data.access_token);
        localStorage.setItem("studymind_user", JSON.stringify(data));
      }
      return data;
    },

    async getMe() {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("تعذر جلب بيانات المستخدم");
      return res.json();
    },

    async deleteAccount() {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل حذف الحساب");
        throw new Error(msg);
      }
      this.logout();
      return res.json();
    },

    logout() {
      if (typeof window !== "undefined") {
        localStorage.removeItem("studymind_token");
        localStorage.removeItem("studymind_user");
      }
    },
  },

  documents: {
    async upload(file: File, title: string, subject?: string) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      if (subject) formData.append("subject", subject);

      const res = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: "POST",
        headers: { ...getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "فشل رفع ومعالجة المستند");
      }
      return res.json();
    },

    async list() {
      const res = await fetch(`${API_BASE_URL}/documents/`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب المستندات");
      return res.json();
    },

    async get(id: number) {
      const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("المستند غير موجود");
      return res.json();
    },

    async getChunks(id: number, page?: number) {
      const url = new URL(`${API_BASE_URL}/documents/${id}/chunks`);
      if (page) url.searchParams.append("page", page.toString());
      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب أجزاء المستند");
      return res.json();
    },

    async update(id: number, data: { title?: string; subject?: string }) {
      const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل تعديل المستند");
        throw new Error(msg);
      }
      return res.json();
    },

    async delete(id: number) {
      const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل حذف المستند");
        throw new Error(msg);
      }
      return res.json();
    },

    async getStatus(id: number) {
      const res = await fetch(`${API_BASE_URL}/documents/${id}/status`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل جلب حالة المستند");
        throw new Error(msg);
      }
      return res.json();
    },

    async retry(id: number) {
      const res = await fetch(`${API_BASE_URL}/documents/${id}/retry`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إعادة محاولة معالجة المستند");
        throw new Error(msg);
      }
      return res.json();
    },
  },

  tutor: {
    async ask(params: {
      document_id: number;
      question: string;
      target_page?: number;
      explanation_level?: "very_simple" | "medium" | "textbook" | "advanced";
    }) {
      const res = await fetch(`${API_BASE_URL}/tutor/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "حدث خطأ أثناء التواصل مع المعلم الذكي");
      }
      return res.json();
    },

    async getHistory(document_id: number) {
      const res = await fetch(`${API_BASE_URL}/tutor/history/${document_id}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب سجل المحادثة");
      return res.json();
    },

    async clearHistory(document_id: number) {
      const res = await fetch(`${API_BASE_URL}/tutor/history/${document_id}`, {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل مسح سجل المحادثة");
      return res.json();
    },

    async summarize(document_id: number) {
      const res = await fetch(`${API_BASE_URL}/tutor/summary/${document_id}`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل توليد ملخص المادة");
      return res.json();
    },
  },

  quizzes: {
    async generate(params: {
      document_id: number;
      chapter?: string;
      target_page?: number;
      difficulty?: string;
      num_questions?: number;
      question_type?: string;
    }) {
      const res = await fetch(`${API_BASE_URL}/quizzes/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "فشل توليد الاختبار");
      }
      return res.json();
    },

    async get(id: number) {
      const res = await fetch(`${API_BASE_URL}/quizzes/${id}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("الاختبار غير موجود");
      return res.json();
    },

    async submit(quizId: number, answers: { question_id: number; selected_answer: string }[], timeTakenSeconds: number = 0) {
      const res = await fetch(`${API_BASE_URL}/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          time_taken_seconds: timeTakenSeconds,
          answers,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "فشل إرسال وتصحيح الاختبار");
      }
      return res.json();
    },

    async getMyHistory() {
      const res = await fetch(`${API_BASE_URL}/quizzes/history/my`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب سجل الاختبارات");
      return res.json();
    },

    async getDailyChallenge() {
      const res = await fetch(`${API_BASE_URL}/quizzes/challenge/quick`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) return null;
      return res.json();
    },
  },

  analytics: {
    async getDashboard() {
      const res = await fetch(`${API_BASE_URL}/analytics/dashboard`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب بيانات التحليلات");
      return res.json();
    },

    async getDocument(document_id: number) {
      const res = await fetch(`${API_BASE_URL}/analytics/document/${document_id}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب تحليلات المادة");
      return res.json();
    },
  },

  learning: {
    async remediate(conceptId: number) {
      const res = await fetch(`${API_BASE_URL}/learning/remediate/${conceptId}`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل بدء الجلسة العلاجية");
        throw new Error(msg);
      }
      return res.json();
    },

    async submitRemedial(sessionId: number, answers: { question_id: number; selected_answer: string }[]) {
      const res = await fetch(`${API_BASE_URL}/learning/remediate/${sessionId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل تسليم إجابات الجلسة العلاجية");
        throw new Error(msg);
      }
      return res.json();
    },

    async getWeakConcepts(documentId?: number) {
      const url = new URL(`${API_BASE_URL}/learning/weak-concepts`);
      if (documentId) url.searchParams.append("document_id", documentId.toString());
      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب المفاهيم الضعيفة");
      return res.json();
    },
  },

  planner: {
    async generate(data: {
      exam_date: string;
      subjects?: string[];
      available_study_time?: number;
      preferred_days?: string[];
      daily_time_limit?: number;
      priority?: string;
      title?: string;
    }): Promise<StudyPlan> {
      const res = await fetch(`${API_BASE_URL}/planner/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إنشاء الخطة الدراسية");
        throw new Error(msg);
      }
      return res.json();
    },

    async getActive(): Promise<StudyPlan | null> {
      const res = await fetch(`${API_BASE_URL}/planner/active`, {
        headers: { ...getAuthHeader() },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("فشل جلب الخطة الدراسية الحالية");
      return res.json();
    },

    async getToday(): Promise<TodayPlanResponse> {
      const res = await fetch(`${API_BASE_URL}/planner/today`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب مهام خطة اليوم");
      return res.json();
    },

    async getCalendar(startDate?: string, endDate?: string): Promise<CalendarDayTasks[]> {
      const url = new URL(`${API_BASE_URL}/planner/calendar`);
      if (startDate) url.searchParams.append("start_date", startDate);
      if (endDate) url.searchParams.append("end_date", endDate);
      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب تقويم الخطة الدراسية");
      return res.json();
    },

    async updateTask(
      taskId: number,
      data: {
        status?: "PENDING" | "COMPLETED" | "SKIPPED";
        scheduled_date?: string;
        duration_minutes?: number;
        notes?: string;
      }
    ): Promise<StudyPlanTask> {
      const res = await fetch(`${API_BASE_URL}/planner/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل تحديث حالة المهمة");
        throw new Error(msg);
      }
      return res.json();
    },

    async rescheduleOverdue(): Promise<{ rescheduled_count: number; message: string }> {
      const res = await fetch(`${API_BASE_URL}/planner/reschedule-overdue`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إعادة جدولة المهام المتأخرة");
        throw new Error(msg);
      }
      return res.json();
    },

    async sync(): Promise<{ updated: boolean; modified_tasks: number; injected_remedial_tasks: number; message: string }> {
      const res = await fetch(`${API_BASE_URL}/planner/sync`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل المزامنة التكيفية للخطة");
        throw new Error(msg);
      }
      return res.json();
    },
  },

  flashcards: {
    async generate(data: {
      document_id: number;
      count?: number;
      card_types?: string[];
      concept_id?: number;
    }): Promise<Flashcard[]> {
      const res = await fetch(`${API_BASE_URL}/flashcards/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل توليد البطاقات التعليمية");
        throw new Error(msg);
      }
      return res.json();
    },

    async getDashboard(): Promise<FlashcardsDashboardMetrics> {
      const res = await fetch(`${API_BASE_URL}/flashcards/dashboard`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب إحصائيات البطاقات التعليمية");
      return res.json();
    },

    async getDue(limit = 50, documentId?: number): Promise<Flashcard[]> {
      const url = new URL(`${API_BASE_URL}/flashcards/due`);
      url.searchParams.append("limit", limit.toString());
      if (documentId) url.searchParams.append("document_id", documentId.toString());
      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب البطاقات المستحقة للمراجعة");
      return res.json();
    },

    async list(params: {
      document_id?: number;
      card_type?: string;
      review_state?: string;
      is_favorite?: boolean;
      is_suspended?: boolean;
      search?: string;
      page?: number;
      page_size?: number;
    } = {}): Promise<FlashcardListResponse> {
      const url = new URL(`${API_BASE_URL}/flashcards`);
      if (params.document_id) url.searchParams.append("document_id", params.document_id.toString());
      if (params.card_type) url.searchParams.append("card_type", params.card_type);
      if (params.review_state) url.searchParams.append("review_state", params.review_state);
      if (params.is_favorite !== undefined) url.searchParams.append("is_favorite", params.is_favorite.toString());
      if (params.is_suspended !== undefined) url.searchParams.append("is_suspended", params.is_suspended.toString());
      if (params.search) url.searchParams.append("search", params.search);
      if (params.page) url.searchParams.append("page", params.page.toString());
      if (params.page_size) url.searchParams.append("page_size", params.page_size.toString());

      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب قائمة البطاقات");
      return res.json();
    },

    async create(data: {
      document_id: number;
      front: string;
      back: string;
      card_type?: string;
      difficulty?: string;
      source_page?: number;
      source_section?: string;
      concept_id?: number;
      concept_name?: string;
    }): Promise<Flashcard> {
      const res = await fetch(`${API_BASE_URL}/flashcards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إنشاء البطاقة");
        throw new Error(msg);
      }
      return res.json();
    },

    async get(cardId: number): Promise<Flashcard> {
      const res = await fetch(`${API_BASE_URL}/flashcards/${cardId}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("البطاقة غير موجودة");
      return res.json();
    },

    async update(cardId: number, data: Partial<Flashcard>): Promise<Flashcard> {
      const res = await fetch(`${API_BASE_URL}/flashcards/${cardId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل تعديل البطاقة");
        throw new Error(msg);
      }
      return res.json();
    },

    async delete(cardId: number): Promise<{ success: boolean; message: string }> {
      const res = await fetch(`${API_BASE_URL}/flashcards/${cardId}`, {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل حذف البطاقة");
        throw new Error(msg);
      }
      return res.json();
    },

    async review(cardId: number, rating: "again" | "hard" | "good" | "easy"): Promise<FlashcardReviewResponse> {
      const res = await fetch(`${API_BASE_URL}/flashcards/${cardId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل تسجيل تقييم البطاقة");
        throw new Error(msg);
      }
      return res.json();
    },

    async toggleFavorite(cardId: number): Promise<Flashcard> {
      const res = await fetch(`${API_BASE_URL}/flashcards/${cardId}/favorite`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل تبديل حالة المفضلة");
      return res.json();
    },

    async toggleSuspend(cardId: number): Promise<Flashcard> {
      const res = await fetch(`${API_BASE_URL}/flashcards/${cardId}/suspend`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل تبديل حالة التعليق");
      return res.json();
    },
  },

  exams: {
    async generate(data: {
      document_id: number;
      title?: string;
      subject?: string;
      chapters?: string[];
      num_questions?: number;
      difficulty?: string;
      duration_minutes?: number;
      question_types?: string[];
      is_mock_mode?: boolean;
    }): Promise<Exam> {
      const res = await fetch(`${API_BASE_URL}/exams/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إنشاء الامتحان");
        throw new Error(msg);
      }
      return res.json();
    },

    async list(documentId?: number): Promise<Exam[]> {
      const url = new URL(`${API_BASE_URL}/exams/`);
      if (documentId) url.searchParams.append("document_id", documentId.toString());
      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب قائمة الامتحانات");
      return res.json();
    },

    async get(examId: number): Promise<Exam> {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("الامتحان غير موجود");
      return res.json();
    },

    async start(examId: number): Promise<ExamAttemptStartResponse> {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/start`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل بدء الامتحان");
        throw new Error(msg);
      }
      return res.json();
    },

    async submit(
      examId: number,
      attemptId: number,
      data: {
        answers: { question_id: number; student_answer: string; time_spent_seconds?: number }[];
        total_time_taken_seconds?: number;
      }
    ): Promise<ExamResultResponse> {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل تسليم الامتحان");
        throw new Error(msg);
      }
      return res.json();
    },

    async getAttemptResult(examId: number, attemptId: number): Promise<ExamResultResponse> {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/attempts/${attemptId}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب تفاصيل نتيجة المحاولة");
      return res.json();
    },

    async getMyHistory(): Promise<ExamHistoryItem[]> {
      const res = await fetch(`${API_BASE_URL}/exams/history/my`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب سجل الامتحانات");
      return res.json();
    },
  },

  copilot: {
    async getState(): Promise<StudentLearningState> {
      const res = await fetch(`${API_BASE_URL}/copilot/state`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل جلب حالة التعلم للمساعد الذكي");
      return res.json();
    },

    async getNextAction(): Promise<WhatToStudyNowResponse> {
      const res = await fetch(`${API_BASE_URL}/copilot/next-action`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل تحديد خطوة المذاكرة التالية");
      return res.json();
    },

    async getBriefing(): Promise<DailyBriefingResponse> {
      const res = await fetch(`${API_BASE_URL}/copilot/briefing`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل إعداد الخلاصة اليومية للمساعد الذكي");
      return res.json();
    },

    async chat(message: string, documentId?: number): Promise<CopilotChatResponse> {
      const res = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ message, document_id: documentId }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل التواصل مع المساعد الذكي");
        throw new Error(msg);
      }
      return res.json();
    },

    async getChatHistory(limit = 30): Promise<CopilotMessageItem[]> {
      const res = await fetch(`${API_BASE_URL}/copilot/chat/history?limit=${limit}`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل استرجاع سجل محادثات المساعد الذكي");
      return res.json();
    },

    async clearChatHistory(): Promise<{ success: boolean; message: string }> {
      const res = await fetch(`${API_BASE_URL}/copilot/chat/clear`, {
        method: "DELETE",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("فشل مسح سجل المحادثات");
      return res.json();
    },

    async rebalance(): Promise<CopilotRebalanceResponse> {
      const res = await fetch(`${API_BASE_URL}/copilot/rebalance`, {
        method: "POST",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إعادة توزيع المهام");
        throw new Error(msg);
      }
      return res.json();
    },
  },
};

export interface Flashcard {
  id: number;
  user_id: number;
  document_id: number;
  document_title?: string | null;
  concept_id?: number | null;
  concept_name?: string | null;
  front: string;
  back: string;
  card_type: "definition" | "concept" | "formula" | "fact" | "qa";
  card_type_label: string;
  difficulty: "easy" | "medium" | "hard";
  source_page?: number | null;
  source_section?: string | null;
  is_suspended: boolean;
  is_favorite: boolean;
  repetition_count: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string;
  last_reviewed_at?: string | null;
  review_state: "new" | "learning" | "review" | "mastered";
  is_due: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlashcardListResponse {
  items: Flashcard[];
  total: number;
  page: number;
  page_size: number;
}

export interface FlashcardsDashboardMetrics {
  due_today: number;
  new_cards: number;
  learning: number;
  mastered: number;
  total_cards: number;
  favorites_count: number;
  suspended_count: number;
  retention_rate: number;
}

export interface FlashcardReviewResponse {
  card: Flashcard;
  rating: "again" | "hard" | "good" | "easy";
  next_review_at: string;
  interval_days: number;
  ease_factor: number;
  review_state: string;
  concept_mastery_updated: boolean;
  new_mastery_score?: number | null;
  message: string;
}

export interface StudyPlanTask {
  id: number;
  plan_id: number;
  scheduled_date: string;
  day_number: number;
  subject: string;
  document_id?: number | null;
  document_title?: string | null;
  chapter?: string | null;
  concept_id?: number | null;
  concept_name?: string | null;
  activity_type: "Study" | "Review" | "Remedial" | "Quiz" | "Mock Exam";
  activity_label: string;
  duration_minutes: number;
  recommended_questions_count: number;
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  completed_at?: string | null;
  notes?: string | null;
  order_index: number;
}

export interface StudyPlan {
  id: number;
  student_id: number;
  title: string;
  exam_date: string;
  days_until_exam: number;
  subjects: string[];
  available_study_time: number;
  preferred_days: string[];
  daily_time_limit: number;
  priority: "weak_points_first" | "balanced" | "exam_readiness";
  is_active: boolean;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  tasks: StudyPlanTask[];
}

export interface TodayPlanResponse {
  date: string;
  day_name: string;
  total_tasks_today: number;
  completed_tasks_today: number;
  today_progress_percentage: number;
  estimated_total_minutes: number;
  tasks: StudyPlanTask[];
}

export interface CalendarDayTasks {
  date: string;
  day_name: string;
  tasks_count: number;
  completed_count: number;
  is_overdue: boolean;
  tasks: StudyPlanTask[];
}

export interface ExamQuestion {
  id: number;
  question_type: "mcq" | "true_false" | "short_answer";
  question_text: string;
  options?: string[] | null;
  marks: number;
  source_page?: number | null;
  order_index: number;
}

export interface Exam {
  id: number;
  title: string;
  document_id: number;
  document_title?: string | null;
  subject?: string | null;
  chapters: string[];
  difficulty: string;
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  passing_score_pct: number;
  is_mock_mode: boolean;
  created_at: string;
  questions: ExamQuestion[];
}

export interface ExamAttemptStartResponse {
  attempt_id: number;
  exam_id: number;
  exam_title: string;
  attempt_number: number;
  started_at: string;
  expires_at: string;
  remaining_seconds: number;
  is_mock_mode: boolean;
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  questions: ExamQuestion[];
}

export interface ExamQuestionResultItem {
  question_id: number;
  question_type: string;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  score_awarded: number;
  max_marks: number;
  time_spent_seconds: number;
  explanation: string;
  source_page?: number | null;
  concept_name?: string | null;
  error_type?: string | null;
  error_reason?: string | null;
  ai_feedback?: string | null;
}

export interface WeakConceptItem {
  concept_name: string;
  questions_missed: number;
  source_page?: number | null;
}

export interface RemedialRecommendationItem {
  title: string;
  concept_name: string;
  source_page?: number | null;
  recommended_action: string;
  priority: "high" | "medium" | "low";
}

export interface ExamResultResponse {
  attempt_id: number;
  exam_id: number;
  exam_title: string;
  attempt_number: number;
  status: "SUBMITTED" | "TIMED_OUT";
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  time_taken_seconds: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  avg_time_per_question_seconds: number;
  weak_concepts: WeakConceptItem[];
  remedial_recommendations: RemedialRecommendationItem[];
  summary_feedback: string;
  questions_feedback: ExamQuestionResultItem[];
}

export interface ExamHistoryItem {
  attempt_id: number;
  exam_id: number;
  exam_title: string;
  document_id: number;
  document_title: string;
  subject?: string | null;
  attempt_number: number;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  time_taken_seconds: number;
  status: string;
  is_mock_mode: boolean;
  submitted_at: string;
}

export interface ConceptWeaknessItem {
  concept_id: number;
  concept_name: string;
  subject?: string | null;
  chapter?: string | null;
  document_id?: number | null;
  mastery_score: number;
  total_attempts: number;
  correct_attempts: number;
  primary_error_type?: string | null;
  primary_error_label?: string | null;
  error_summary?: string | null;
}

export interface StudentLearningState {
  overall_mastery: number;
  total_documents: number;
  total_quizzes_taken: number;
  total_exams_taken: number;
  weak_concepts: ConceptWeaknessItem[];
  strong_concepts: string[];
  nearest_exam_date?: string | null;
  days_until_exam?: number | null;
  exam_target_subjects: string[];
  exam_readiness_score: number;
  active_plan_id?: number | null;
  active_plan_progress: number;
  today_tasks_count: number;
  today_estimated_minutes: number;
  overdue_tasks_count: number;
  is_neglected: boolean;
  due_flashcards_count: number;
  current_focus_subject?: string | null;
}

export interface CopilotActionItem {
  action_type: "REMEDIATE" | "STUDY" | "QUIZ" | "REVIEW_FLASHCARDS" | "REBALANCE" | "MOCK_EXAM";
  title: string;
  description: string;
  rationale: string;
  urgency: "CRITICAL" | "HIGH" | "NORMAL";
  badge_label: string;
  action_url: string;
  payload: Record<string, any>;
}

export interface WhatToStudyNowResponse {
  recommendation: CopilotActionItem;
  alternative_actions: CopilotActionItem[];
  student_headline: string;
  state_summary: Record<string, any>;
}

export interface DailyBriefingResponse {
  greeting: string;
  date_str: string;
  day_name_arabic: string;
  exam_countdown_text?: string | null;
  days_until_exam?: number | null;
  neglect_alert?: string | null;
  focus_headline: string;
  today_tasks_summary: string;
  primary_action: CopilotActionItem;
  quick_tips: string[];
}

export interface CopilotChatResponse {
  reply: string;
  suggested_action?: CopilotActionItem | null;
  citations: Array<{ page_number: number; document_id: number; snippet: string }>;
  quick_prompts: string[];
}

export interface CopilotMessageItem {
  id: number;
  role: "user" | "copilot" | "system";
  content: string;
  action_type?: string | null;
  action_payload?: Record<string, any> | null;
  citations?: Array<{ page_number: number; document_id: number; snippet: string }> | null;
  created_at: string;
}

export interface CopilotRebalanceResponse {
  success: boolean;
  message: string;
  rescheduled_count: number;
  new_target_date?: string | null;
}



