import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'CBAM Local',
  description: '국내 중소·중견기업을 위한 로컬 우선 CBAM 내재배출량 산정 도구',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full bg-[#F6F8F7]">
      <body className="min-h-full">
        <ServiceWorkerRegistration />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
