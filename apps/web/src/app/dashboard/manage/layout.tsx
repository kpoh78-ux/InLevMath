'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useMe } from '@/lib/useMe'

const SIDE_NAV = [
  {
    label: '학생 관리',
    href: '/dashboard/manage/students',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: '출결 관리',
    href: '/dashboard/manage/attendance',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: '수업 시간표',
    href: '/dashboard/manage/schedule',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: '선생님 관리',
    href: '/dashboard/manage/teachers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    adminOnly: true,
  },
  {
    label: '백업 · 용량',
    href: '/dashboard/manage/backup',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 7v10c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3V7M4 7c0-2 1.5-3 4-3h8c2.5 0 4 1 4 3M4 7h16M9 12h6" />
      </svg>
    ),
    adminOnly: true,
  },
]

function ManageLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 서브메뉴를 옮겨도 선택한 학생이 유지되게 한다
  const student = searchParams.get('student')
  const withStudent = (href: string) => student ? `${href}?student=${student}` : href
  // 선생님 관리는 관리자에게만 열어 준다
  const { isAdmin } = useMe()

  return (
    <div className="flex flex-col md:flex-row gap-0 -mx-4 md:-mx-6 -my-4 md:-my-6 min-h-full">
      {/* 좁은 화면: 가로 탭 줄 · md 이상: 세로 사이드바 */}
      <aside className="md:w-44 lg:w-48 bg-white border-b md:border-b-0 md:border-r border-gray-200 shrink-0 py-2 md:py-5">
        <p className="hidden md:block px-5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">관리</p>
        <nav className="flex md:block md:space-y-0.5 px-2 gap-1 overflow-x-auto no-scrollbar">
          {SIDE_NAV.map(item => {
            const locked = item.adminOnly === true && !isAdmin
            const active = !locked && pathname.startsWith(item.href)
            return locked ? (
              <div key={item.href}
                title="관리자만 사용할 수 있습니다"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed select-none whitespace-nowrap shrink-0">
                {item.icon}
                <span>{item.label}</span>
                <span className="ml-auto hidden md:inline text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">관리자</span>
              </div>
            ) : (
              <Link key={item.href} href={withStudent(item.href)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* 콘텐츠 영역 */}
      {/* min-w-0 이 없으면 표가 flex 항목을 밀어내 가로 스크롤이 먹지 않는다 */}
      <main className="flex-1 min-w-0 px-4 md:px-8 py-4 md:py-6 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>}>
      <ManageLayoutInner>{children}</ManageLayoutInner>
    </Suspense>
  )
}
