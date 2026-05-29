import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "CBAM Platform",
  description: "Local-first CBAM Emission Calculation for SME Steel Companies",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-gray-100">
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
