import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'InLevMath — 선생님 관리',
  description: '오근표 수학학원 InLevMath 선생님 관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-gray-50 font-sans antialiased">
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
