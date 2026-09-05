function getApiBaseUrl(): string {
  let url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  url = url.trim().replace(/\/+$/, "");
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
    async register(data: { email: string; password: string; full_name: string; grade_or_level?: string }) {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, "فشل إنشاء الحساب");
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
};
