'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard/lesson-prep',           label: '수업 현황' },
  { href: '/dashboard/lesson-prep/distribute', label: '학습지 배포' },
]

export default function LessonPrepLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-4">
      {/* 서브탭 */}
      <div className="flex border-b border-gray-200 -mt-2">
        {TABS.map(t => {
          const active = t.href === '/dashboard/lesson-prep'
            ? pathname === '/dashboard/lesson-prep'
            : pathname.startsWith(t.href)
          return (
            <Link key={t.href} href={t.href}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
