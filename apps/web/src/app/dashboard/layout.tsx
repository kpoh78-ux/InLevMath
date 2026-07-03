'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, Suspense } from 'react'

const NAV: { href: string; label: string; brand?: true }[] = [
  { href: '/dashboard',              label: 'InLevMath', brand: true },
  { href: '/dashboard/lesson-prep',  label: '수업준비' },
  { href: '/dashboard/worksheets',   label: '학습지' },
  { href: '/dashboard/textbooks',    label: '교재' },
  { href: '/dashboard/manage',       label: '학생관리' },
]

type AttendedStudent = {
  id: string; name: string; grade: string
  attended: boolean; checkInTime?: string
}

const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']

function groupByGrade(students: AttendedStudent[]) {
  const groups: Record<string, AttendedStudent[]> = {}
  students.forEach(s => {
    if (!groups[s.grade]) groups[s.grade] = []
    groups[s.grade].push(s)
  })
  return groups
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedStudent = searchParams.get('student')
  const [teacherName, setTeacherName] = useState('')
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({})
  const [sidebarStudents, setSidebarStudents] = useState<AttendedStudent[]>([])

  const fetchSidebarStudents = useCallback(async () => {
    try {
      const token = localStorage.getItem('teacher_token') ?? ''
      const res = await fetch('/api/students', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json() as { id: string; grade: string; user: { name: string } }[]
      const students: AttendedStudent[] = data.map(s => ({
        id: s.id, name: s.user.name, grade: s.grade, attended: false,
      }))
      setSidebarStudents(students)
      setExpandedGrades(prev => {
        const grades = [...new Set(students.map(s => s.grade))]
        const next = { ...prev }
        grades.forEach(g => { if (next[g] === undefined) next[g] = true })
        return next
      })
    } catch { /* 인증 오류 등 무시 */ }
  }, [])

  useEffect(() => {
    const name = localStorage.getItem('teacher_name')
    if (!name) { router.replace('/'); return }
    setTeacherName(name)
    fetchSidebarStudents()
  }, [router, fetchSidebarStudents])

  useEffect(() => {
    const handler = () => fetchSidebarStudents()
    window.addEventListener('students-updated', handler)
    return () => window.removeEventListener('students-updated', handler)
  }, [fetchSidebarStudents])

  const handleLogout = () => {
    localStorage.removeItem('teacher_token')
    localStorage.removeItem('teacher_name')
    router.push('/')
  }

  // 관리 페이지는 자체 사이드바 사용 → 출결 사이드바 숨김
  const showAttendanceSidebar = !pathname.startsWith('/dashboard/manage')

  const gradeGroups = groupByGrade(sidebarStudents)
  const sortedGrades = GRADE_ORDER.filter(g => gradeGroups[g])

  const attendedTotal = sidebarStudents.filter(s => s.attended).length
  const total         = sidebarStudents.length

  const toggleGrade = (grade: string) =>
    setExpandedGrades(prev => ({ ...prev, [grade]: !prev[grade] }))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── 상단 헤더 ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">

          {/* 네비 */}
          <nav className="flex h-14">
            {NAV.map(n => {
              const active = n.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(n.href)
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`
                    relative flex items-center h-full border-b-2 transition-all duration-150
                    ${n.brand
                      ? `w-[160px] pl-6 text-[18px] font-black tracking-tight
                          ${active
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/60'
                            : 'border-transparent text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400'}`
                      : `px-6 text-[15px] font-medium
                          ${active
                            ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60'
                            : 'border-transparent text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400'}`
                    }
                  `}
                >
                  {n.label}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-indigo-600 rounded-full" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* 선생님 정보 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                {teacherName.slice(0, 1)}
              </span>
              <span>{teacherName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200
                hover:border-gray-400 rounded px-2 py-1 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* ── 바디 (사이드바 + 메인) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 출결 사이드바 */}
        {showAttendanceSidebar && (
          <aside className="w-44 bg-white border-r border-gray-200 shrink-0 flex flex-col h-[calc(100vh-3.5rem)] sticky top-14">

            {/* 사이드바 헤더 */}
            <div className="px-4 py-2.5 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-800">등록 학생</p>
              <p className="text-[11px] text-gray-400 mt-0.5">총 {total}명</p>
            </div>

            {/* 학생 목록 (학년별 접기/펼치기) */}
            <div className="flex-1 overflow-y-auto py-1">
              {sortedGrades.length === 0 && (
                <p className="text-[11px] text-gray-300 text-center py-6">등록된 학생이 없습니다</p>
              )}
              {sortedGrades.map(grade => {
                const students = gradeGroups[grade]
                const isExpanded = expandedGrades[grade] ?? true

                return (
                  <div key={grade}>
                    {/* 학년 헤더 */}
                    <button
                      onClick={() => toggleGrade(grade)}
                      className="w-full flex items-center justify-between px-3 py-1.5
                        hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-bold text-gray-500">{grade}</span>
                        <span className="text-[11px] text-gray-300">/{students.length}</span>
                      </div>
                      <svg
                        className={`w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-transform duration-150
                          ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* 학생 행 */}
                    {isExpanded && (
                      <div className="pb-1">
                        {students.map(s => (
                          <button
                            key={s.id}
                            onClick={() => router.push(pathname + (selectedStudent === s.id ? '' : `?student=${s.id}`))}
                            className={`
                              w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors
                              ${selectedStudent === s.id
                                ? 'bg-indigo-50 border-r-2 border-indigo-500'
                                : 'hover:bg-gray-50 border-r-2 border-transparent'}
                            `}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-200" />
                            <span className="text-[11px] flex-1 truncate text-gray-700">
                              {s.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 하단 요약 */}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">전체</span>
                <span className="text-[11px] font-bold text-indigo-600">{total}명</span>
              </div>
              <div className="mt-2 bg-gray-200 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-indigo-400 h-1 rounded-full"
                  style={{ width: total > 0 ? `${Math.min((attendedTotal / total) * 100, 100)}%` : '0%' }}
                />
              </div>
            </div>
          </aside>
        )}

        {/* 메인 컨텐츠 */}
        <main className="flex-1 overflow-auto px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  )
}
