'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, Suspense } from 'react'
import { clearMeCache } from '@/lib/useMe'

import { AttendanceSidebarItem } from '@/components/attendance/AttendanceSidebarItem'

const NAV: { href: string; label: string; brand?: true; badge?: string }[] = [
  { href: '/dashboard',              label: 'InLevMath', brand: true },
  { href: '/dashboard/lesson-prep',  label: '수업준비' },
  { href: '/dashboard/worksheets',   label: '학습지' },
  { href: '/dashboard/alimtalk',     label: '알림톡', badge: 'NEW' },
  { href: '/dashboard/manage',       label: '학원관리' },
  { href: '/dashboard/rewards',      label: '보상관리' },
]

type AttendedStudent = {
  id: string; name: string; grade: string
  attended: boolean; checkInTime?: string; checkOutTime?: string
  status?: string; attendancePin?: string
}

export type RealtimeNotification = {
  id: string
  type: 'WORKSHEET_SUBMIT' | 'MISSION_RESULT' | 'LEVEL_UP' | 'ATTENDANCE_UPDATE' | 'CONNECTED'
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

/** ISO 문자열/Date → "HH:mm" (24시간, input[type=time] 호환) */
function toHHmm(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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
  // 좁은 화면(태블릿 세로 이하)에서 출결 사이드바를 서랍으로 여닫는다
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const fetchSidebarStudents = useCallback(async () => {
    try {
      const token = localStorage.getItem('teacher_token') ?? ''
      const res = await fetch('/api/students?sidebar=1', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json() as {
        id: string; grade: string; attendancePin?: string; user: { name: string; phone?: string }
        attendanceLogs?: Array<{ type: string; status: string; checkInTime?: string; checkOutTime?: string }>
      }[]
      const students: AttendedStudent[] = data.map(s => {
        const todayLog = s.attendanceLogs && s.attendanceLogs.length > 0 ? s.attendanceLogs[0] : null
        const isAttended = Boolean(todayLog?.checkInTime)
        // toLocaleTimeString(hour12:false)은 자정을 "24:05"로 내놓을 수 있어 input[type=time]이 거부한다
        const checkInTimeStr = todayLog?.checkInTime ? toHHmm(todayLog.checkInTime) : undefined
        const checkOutTimeStr = todayLog?.checkOutTime ? toHHmm(todayLog.checkOutTime) : undefined

        return {
          id: s.id,
          name: s.user.name,
          grade: s.grade,
          attended: isAttended,
          checkInTime: checkInTimeStr,
          checkOutTime: checkOutTimeStr,
          status: todayLog?.status,
          attendancePin: s.attendancePin,
        }
      })
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
      } else if (event.type === 'ATTENDANCE_UPDATE') {
        const isCheckIn = event.subType === 'CHECK_IN'
        notif = {
          id,
          type: 'ATTENDANCE_UPDATE',
          title: isCheckIn
            ? `🔔 [등원 알림] ${event.studentName} (${event.grade || ''})`
            : `🔔 [하원 알림] ${event.studentName} (${event.grade || ''})`,
          message: isCheckIn
            ? `${event.checkInTime || '지금'}에 안전하게 등원하였습니다. (학부모 알림톡 자동 발송)`
            : `${event.checkOutTime || '지금'}에 하원하였습니다. (학부모 알림톡 자동 발송)`,
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
              {n.type === 'WORKSHEET_SUBMIT' ? '📝' : n.type === 'LEVEL_UP' ? '🏆' : '🎯'}
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
        <div className="px-2 md:px-4 h-14 flex items-center justify-between gap-2">
          {/* 좁은 화면에서는 탭이 잘리는 대신 가로로 밀린다 */}
          <nav className="flex h-14 overflow-x-auto no-scrollbar">
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
                      ? `w-[104px] lg:w-[160px] pl-3 lg:pl-6 text-[16px] lg:text-[18px] font-black tracking-tight shrink-0
                          ${active
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/60'
                            : 'border-transparent text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400'}`
                      : `px-3 lg:px-6 text-[14px] lg:text-[15px] font-medium shrink-0 whitespace-nowrap
                          ${active
                            ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60'
                            : 'border-transparent text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400'}`
                    }
                  `}
                >
                  <span className="flex items-center gap-1.5">
                    <span>{n.label}</span>
                    {n.badge && (
                      <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-900 shadow-xs">
                        {n.badge}
                      </span>
                    )}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-indigo-600 rounded-full" />
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* 출결 사이드바는 좁은 화면에서 서랍으로 연다 */}
            {showAttendanceSidebar && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-xs font-semibold text-indigo-600 border border-indigo-200
                  hover:bg-indigo-50 rounded-lg px-2.5 py-1.5 transition-colors"
                aria-label="학생 출결 목록 열기"
              >
                출결
              </button>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                {teacherName.slice(0, 1)}
              </span>
              <span className="hidden md:inline">{teacherName}</span>
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
        {showAttendanceSidebar && sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 top-14 bg-black/40 z-30"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {showAttendanceSidebar && (
          <aside
            className={`
              w-56 lg:w-48 bg-white border-r border-gray-200 shrink-0 flex flex-col
              h-[calc(100vh-3.5rem)] top-14
              fixed left-0 z-40 shadow-xl transition-transform duration-200
              lg:sticky lg:z-auto lg:shadow-none lg:translate-x-0
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
          >
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">등록 학생</p>
                <p className="text-[11px] text-gray-400 mt-0.5">총 {total}명 (등원 {attendedTotal}명)</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                  실시간
                </span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden text-gray-400 hover:text-gray-700 text-xl leading-none px-1.5"
                  aria-label="학생 목록 닫기"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
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
                      <div className="pb-1 space-y-0.5">
                        {students.map(s => (
                          <AttendanceSidebarItem
                            key={s.id}
                            student={s}
                            isActive={activeStudentId === s.id}
                            onSelect={() => router.push(studentHref(s.id))}
                            onStatusChanged={fetchSidebarStudents}
                          />
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

        <main className="flex-1 min-w-0 overflow-auto px-4 md:px-6 py-4 md:py-6">
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
