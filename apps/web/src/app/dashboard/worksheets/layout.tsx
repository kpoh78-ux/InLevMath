'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const TABS = [
  { href: '/dashboard/worksheets',            label: '학습지 관리' },
  { href: '/dashboard/worksheets/distribute', label: '학습지 배포' },
]

function WorksheetsTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 좌측에서 고른 학생을 탭을 옮겨도 유지한다
  const student = searchParams.get('student')
  const qs = student ? `?student=${student}` : ''

  return (
    <div className="flex border-b border-gray-200 -mt-2">
      {TABS.map(t => {
        const active = t.href === '/dashboard/worksheets'
          ? pathname === '/dashboard/worksheets'
          : pathname.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href + qs}
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
  )
}

export default function WorksheetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="h-11 border-b border-gray-200 -mt-2" />}>
        <WorksheetsTabs />
      </Suspense>
      {children}
    </div>
  )
}