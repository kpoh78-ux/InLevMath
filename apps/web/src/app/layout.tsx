import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'InLevMath — 선생님 관리',
  description: '오근표 수학학원 InLevMath 선생님 관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-gray-50 font-sans antialiased">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="text-indigo-600 font-bold text-lg">
                InLevMath
              </Link>
              <nav className="flex items-center gap-4 text-sm text-gray-600">
                <Link href="/dashboard" className="hover:text-indigo-600">
                  대시보드
                </Link>
                <Link href="/admin/backup" className="hover:text-indigo-600">
                  백업
                </Link>
              </nav>
            </div>
            <div className="text-sm text-gray-500">관리자</div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
