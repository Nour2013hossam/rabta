import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نَبْتَة | الزراعة الذكية",
  description: "منصتك الذكية لمتابعة الأراضي والمحاصيل وصحة التربة",
  icons: { icon: "/nabta-mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
