'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV = [
  { href: '/dashboard',           label: '대시보드' },
  { href: '/dashboard/worksheets', label: '학습지' },
  { href: '/dashboard/textbooks',  label: '교재 · 채점' },
  { href: '/dashboard/manage',     label: '관리' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [teacherName, setTeacherName] = useState('')

  useEffect(() => {
    const name = localStorage.getItem('teacher_name')
    if (!name) { router.replace('/'); return }
    setTeacherName(name)
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('teacher_token')
    localStorage.removeItem('teacher_name')
    router.push('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* 로고 + 네비 */}
          <div className="flex items-center gap-8">
            <span className="text-lg font-black text-indigo-600 tracking-tight">InLevMath</span>
            <nav className="flex gap-1">
              {NAV.map(n => {
                const active = n.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(n.href)
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {n.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* 선생님 정보 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{teacherName}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}
