import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

// Apple 롤아웃: SF Pro 대체로 Inter를 앱 전체에 로드(가변 웨이트 300/400/600/700). --font-inter로 노출.
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

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
    <html lang="ko" className={`${inter.variable} h-full bg-[#f5f5f7]`}>
      <body className="min-h-full">
        <ServiceWorkerRegistration />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
