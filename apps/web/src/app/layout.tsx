import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'InLevMath — 선생님 관리',
  description: '오근표 수학학원 InLevMath 선생님 관리 시스템',
  // 태블릿 홈 화면 설치용 — manifest.ts 참고
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'InLevMath',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  // 태블릿에서 표를 확대해 볼 수 있어야 하므로 확대를 막지 않는다
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-gray-50 font-sans antialiased">
        <main className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-6">{children}</main>
      </body>
    </html>
  )
}
