import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "CBAM Local",
  description: "국내 중소·중견기업을 위한 로컬 우선 CBAM 내재배출량 산정 도구",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full bg-gray-100">
      <body className="h-full">
        <ServiceWorkerRegistration />
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
