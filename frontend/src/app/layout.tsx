import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/navbar";

export const metadata: Metadata = {
  title: "StudyMind AI | محرك المذاكرة والتعلم الذكي للطلاب العرب",
  description: "حوّل كتبك ومذكراتك إلى مدرس ذكي، اختبارات تفاعلية، وتحليل تكيفي لنقاط ضعفك.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white">
          <p>© {new Date().getFullYear()} StudyMind AI - صُمم خصيصاً للطلاب العرب ومناهج الثانوية والجامعات</p>
        </footer>
      </body>
    </html>
  );
}
