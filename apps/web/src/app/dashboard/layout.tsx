'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, Suspense } from 'react'
import { clearMeCache } from '@/lib/useMe'

const NAV: { href: string; label: string; brand?: true }[] = [
  { href: '/dashboard',              label: 'InLevMath', brand: true },
  { href: '/dashboard/lesson-prep',  label: '수업준비' },
  { href: '/dashboard/worksheets',   label: '학습지' },
  { href: '/dashboard/textbooks',    label: '교재' },
  { href: '/dashboard/manage',       label: '학생관리' },
  { href: '/dashboard/rewards',      label: '보상관리' },
]

type AttendedStudent = {
  id: string; name: string; grade: string
  attended: boolean; checkInTime?: string
}

export type RealtimeNotification = {
  id: string
  type: 'WORKSHEET_SUBMIT' | 'TEXTBOOK_SUBMIT' | 'MISSION_RESULT' | 'LEVEL_UP' | 'CONNECTED'
  title: string
  message: string
  studentName?: string
  studentId?: string
  correctRate?: number
  submittedCount?: number
  totalProblems?: number
  timestamp: number
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

  const navHref = (href: string) =>
    selectedStudent ? `${href}?student=${selectedStudent}` : href

  const DETAIL_ROUTES = ['/dashboard/students/', '/dashboard/manage/students/']
  const detailBase = DETAIL_ROUTES.find(
    base => pathname.startsWith(base) && pathname.slice(base.length).split('/').length === 1
  )
  const detailStudentId = detailBase ? pathname.slice(detailBase.length) : null
  const activeStudentId = selectedStudent ?? detailStudentId

  const studentHref = (id: string) => {
    if (detailBase) return detailBase + id
    return pathname + (selectedStudent === id ? '' : `?student=${id}`)
  }

  const [teacherName, setTeacherName] = useState('')
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({})
  const [sidebarStudents, setSidebarStudents] = useState<AttendedStudent[]>([])
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([])

  const fetchSidebarStudents = useCallback(async () => {
    try {
      const token = localStorage.getItem('teacher_token') ?? ''
      const res = await fetch('/api/students?sidebar=1', { headers: { Authorization: `Bearer ${token}` } })
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
    } catch { /* 무시 */ }
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

  // ─── 실시간 SSE(Server-Sent Events) 리스너 (100ms 내 알림 수신) ─────────────
  useEffect(() => {
    const token = localStorage.getItem('teacher_token')
    if (!token) return

    let isMounted = true
    const abortController = new AbortController()

    async function connectSSE() {
      try {
        const res = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        })
        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (isMounted) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))
                handleRealtimeEvent(event)
              } catch {}
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        // 연결 끊어지면 3초 후 재연결
        if (isMounted) {
          setTimeout(connectSSE, 3000)
        }
      }
    }

    function handleRealtimeEvent(event: any) {
      if (!event || event.type === 'CONNECTED') return

      let notif: RealtimeNotification | null = null
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      if (event.type === 'WORKSHEET_SUBMIT') {
        notif = {
          id,
          type: 'WORKSHEET_SUBMIT',
          title: `📝 [학습지 제출] ${event.studentName} 학생`,
          message: `「${event.worksheetTitle}」 ${event.submittedCount}문항 제출 (정답률 ${event.correctRate}%)`,
          studentName: event.studentName,
          studentId: event.studentId,
          correctRate: event.correctRate,
          submittedCount: event.submittedCount,
          totalProblems: event.totalProblems,
          timestamp: Date.now(),
        }
      } else if (event.type === 'TEXTBOOK_SUBMIT') {
        notif = {
          id,
          type: 'TEXTBOOK_SUBMIT',
          title: `📖 [교재 제출] ${event.studentName} 학생`,
          message: `「${event.textbookTitle}」 ${event.submittedCount}문항 제출 (정답률 ${event.correctRate}%)`,
          studentName: event.studentName,
          studentId: event.studentId,
          correctRate: event.correctRate,
          submittedCount: event.submittedCount,
          totalProblems: event.totalProblems,
          timestamp: Date.now(),
        }
      } else if (event.type === 'MISSION_RESULT') {
        notif = {
          id,
          type: 'MISSION_RESULT',
          title: `🎯 [미션 완료] ${event.studentName} 학생`,
          message: `${event.missionType} 결과 입력 (정답률 ${Math.round(event.correctRate * 100)}%)`,
          studentName: event.studentName,
          studentId: event.studentId,
          correctRate: Math.round(event.correctRate * 100),
          timestamp: Date.now(),
        }
      } else if (event.type === 'LEVEL_UP') {
        notif = {
          id,
          type: 'LEVEL_UP',
          title: `🎉 [레벨업 축하] ${event.studentName} 학생`,
          message: `미션을 클리어하고 다음 단계로 진급했습니다!`,
          studentName: event.studentName,
          studentId: event.studentId,
          timestamp: Date.now(),
        }
      }

      if (notif) {
        setNotifications(prev => [notif!, ...prev.slice(0, 4)]) // 최대 5개 유지
        window.dispatchEvent(new CustomEvent('students-updated'))
        window.dispatchEvent(new CustomEvent('summary-updated'))
      }
    }

    connectSSE()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [])

  // 6초 후 알림 자동 제거
  useEffect(() => {
    if (notifications.length === 0) return
    const timer = setTimeout(() => {
      setNotifications(prev => prev.slice(0, -1))
    }, 6000)
    return () => clearTimeout(timer)
  }, [notifications])

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleLogout = () => {
    localStorage.removeItem('teacher_token')
    localStorage.removeItem('teacher_name')
    clearMeCache()
    router.push('/')
  }

  const showAttendanceSidebar = !pathname.startsWith('/dashboard/manage')
  const gradeGroups = groupByGrade(sidebarStudents)
  const sortedGrades = GRADE_ORDER.filter(g => gradeGroups[g])
  const attendedTotal = sidebarStudents.filter(s => s.attended).length
  const total = sidebarStudents.length

  const toggleGrade = (grade: string) =>
    setExpandedGrades(prev => ({ ...prev, [grade]: !prev[grade] }))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 relative">

      {/* ── 실시간 알림 팝업 토스트 (100ms 내 수신) ── */}
      <div className="fixed top-16 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {notifications.map(n => (
          <div
            key={n.id}
            className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-indigo-100 p-4 transition-all duration-300 transform translate-y-0 hover:scale-[1.02] flex items-start gap-3.5"
            style={{
              boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.2), 0 8px 10px -6px rgba(99, 102, 241, 0.1)',
            }}
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg shrink-0">
              {n.type === 'WORKSHEET_SUBMIT' ? '📝' : n.type === 'TEXTBOOK_SUBMIT' ? '📖' : n.type === 'LEVEL_UP' ? '🏆' : '🎯'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-gray-900 truncate">{n.title}</p>
                <button
                  onClick={() => removeNotification(n.id)}
                  className="text-gray-400 hover:text-gray-600 text-xs px-1 leading-none"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{n.message}</p>
              {n.studentId && (
                <Link
                  href={`/dashboard/manage/students/${n.studentId}`}
                  onClick={() => removeNotification(n.id)}
                  className="inline-block text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline mt-2"
                >
                  학생 상태창 바로가기 →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── 상단 헤더 ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">
          <nav className="flex h-14">
            {NAV.map(n => {
              const active = n.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(n.href)
              return (
                <Link
                  key={n.href}
                  href={navHref(n.href)}
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
        {showAttendanceSidebar && (
          <aside className="w-44 bg-white border-r border-gray-200 shrink-0 flex flex-col h-[calc(100vh-3.5rem)] sticky top-14">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-800">등록 학생</p>
              <p className="text-[11px] text-gray-400 mt-0.5">총 {total}명</p>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {sortedGrades.length === 0 && (
                <p className="text-[11px] text-gray-300 text-center py-6">등록된 학생이 없습니다</p>
              )}
              {sortedGrades.map(grade => {
                const students = gradeGroups[grade]
                const isExpanded = expandedGrades[grade] ?? true

                return (
                  <div key={grade}>
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

                    {isExpanded && (
                      <div className="pb-1">
                        {students.map(s => (
                          <button
                            key={s.id}
                            onClick={() => router.push(studentHref(s.id))}
                            className={`
                              w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors
                              ${activeStudentId === s.id
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
