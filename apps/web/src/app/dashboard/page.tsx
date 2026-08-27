'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { MISSION_LABELS, MissionType, stepDisplayLabel } from '@inlevmath/shared'

// ── 상수 ────────────────────────────────────────────────────────────────────
const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const STEP_COLOR: Record<string, string> = {
  '기초':'bg-sky-50 text-sky-600 border-sky-200','기본':'bg-emerald-50 text-emerald-600 border-emerald-200',
  '발전':'bg-amber-50 text-amber-600 border-amber-200','최상위':'bg-rose-50 text-rose-600 border-rose-200',
  '최다빈출':'bg-violet-50 text-violet-600 border-violet-200','최다오답':'bg-orange-50 text-orange-600 border-orange-200',
  '서술형':'bg-pink-50 text-pink-600 border-pink-200','모의고사':'bg-teal-50 text-teal-600 border-teal-200',
  '기출문제':'bg-cyan-50 text-cyan-600 border-cyan-200',
}
const MISSION_COLOR: Record<string,string> = {
  concept_learning:'text-sky-600', concept_problem:'text-emerald-600',
  basic_problem:'text-amber-600',  advanced_problem:'text-orange-600', top_problem:'text-rose-600',
}

// ── 타입 ─────────────────────────────────────────────────────────────────────
type ScheduleEntry = { id:string; dayOfWeek:number; startTime:string; endTime:string; subject:string; grade:string; studentNames:string[] }
type Student       = { id:string; name:string; school:string; grade:string; currentLevel:number; currentMission:MissionType; comprehension:number; reasoning:number; calculation:number; lastActivity:string|null }
type Distribution  = { id:string; studentName:string; studentGrade:string; worksheetTitle:string; step:string; examSubType:string|null; problemCount:number; status:'distributed'|'submitted'|'graded'; correctProblems:number|null; distributedAt:string }
type Summary = { studentCount:number; worksheetCount:number; worksheetsWithAnswers:number; distTotal:number; distGraded:number; distPending:number; todaySchedule:ScheduleEntry[]; students:Student[]; recentDistributions:Distribution[] }

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function AbilityMini({ label, value, color }:{ label:string; value:number; color:string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-8 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width:`${Math.min(value,100)}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 w-7 text-right">{Math.round(value)}</span>
    </div>
  )
}

function timeAgo(dateStr:string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff/60000)
  if (m<1) return '방금'; if (m<60) return `${m}분 전`
  const h = Math.floor(m/60)
  if (h<24) return `${h}시간 전`; return `${Math.floor(h/24)}일 전`
}

// ── SVG 차트 컴포넌트 ─────────────────────────────────────────────────────────

function DonutChart({ rate, size = 120, color = '#6366f1' }: { rate: number; size?: number; color?: string }) {
  const cx = size / 2, cy = size / 2, r = size * 0.42
  const circ = 2 * Math.PI * r
  const trackColor = '#f3f4f6'
  const arcColor = rate >= 80 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={size * 0.1} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color !== '#6366f1' ? color : arcColor}
        strokeWidth={size * 0.1}
        strokeDasharray={`${(rate / 100) * circ} ${circ}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.22} fontWeight="800" fill="#111827">{rate}%</text>
      <text x={cx} y={cy + size * 0.17} textAnchor="middle" fontSize={size * 0.1} fill="#9ca3af">정답률</text>
    </svg>
  )
}

function LineChart({ data }: { data: { label: string; correctRate: number | null; problems: number }[] }) {
  const W = 360, H = 120, PAD = { t: 12, r: 16, b: 28, l: 28 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b
  const hasData = data.some(d => d.correctRate !== null)
  const points = data.map((d, i) => ({
    x: PAD.l + (i / (data.length - 1)) * chartW,
    y: d.correctRate !== null ? PAD.t + chartH - (d.correctRate / 100) * chartH : null,
    rate: d.correctRate,
    label: d.label,
    problems: d.problems,
  }))
  const connected = points.filter(p => p.y !== null)
  const pathD = connected.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = connected.length > 1
    ? `${pathD} L ${connected[connected.length - 1].x} ${PAD.t + chartH} L ${connected[0].x} ${PAD.t + chartH} Z`
    : ''

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* 가이드 라인 */}
      {[0, 50, 100].map(v => {
        const y = PAD.t + chartH - (v / 100) * chartH
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#d1d5db">{v}</text>
          </g>
        )
      })}
      {/* 면적 */}
      {hasData && areaD && (
        <path d={areaD} fill="#6366f1" opacity="0.08" />
      )}
      {/* 선 */}
      {hasData && connected.length > 1 && (
        <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* 점 + 레이블 */}
      {points.map((p, i) => (
        <g key={i}>
          {p.y !== null && (
            <>
              <circle cx={p.x} cy={p.y} r="4" fill="#6366f1" />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#4f46e5">{p.rate}%</text>
            </>
          )}
          {p.y === null && (
            <text x={p.x} y={PAD.t + chartH / 2} textAnchor="middle" fontSize="9" fill="#d1d5db">-</text>
          )}
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

const STEP_COLORS: Record<string, string> = {
  '기초': 'bg-sky-400', '기본': 'bg-emerald-400', '발전': 'bg-amber-400',
  '최상위': 'bg-rose-400', '최다빈출': 'bg-violet-400', '최다오답': 'bg-orange-400',
  '서술형': 'bg-pink-400', '모의고사': 'bg-teal-400', '기출문제': 'bg-cyan-400', '교재': 'bg-indigo-400',
}

// ── 학생 통계 뷰 ──────────────────────────────────────────────────────────────

type Stats = {
  student: { id:string; name:string; grade:string; currentLevel:number; currentMission:string; comprehension:number; reasoning:number; calculation:number }
  summary: { totalProblems:number; correctProblems:number; avgCorrectRate:number; worksheetCount:number; textbookCount:number }
  homework: { id:string; title:string; step:string; unit:string; problemCount:number; status:string; distributedAt:string }[]
  weeklyTrend: { label:string; problems:number; correctRate:number|null }[]
  byStep: { step:string; total:number; correct:number; rate:number }[]
}

function StudentStatsView({ studentId }: { studentId: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/students/${studentId}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d) })
      .finally(() => setLoading(false))
  }, [studentId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        학생 학습현황을 불러오는 중...
      </div>
    )
  }
  if (!stats) {
    return <div className="py-20 text-center text-gray-400 text-sm">데이터를 불러올 수 없습니다.</div>
  }

  const { student, summary, weeklyTrend, byStep } = stats
  // 숙제 = 배포했지만 아직 채점 안 한 학습지. 집에서 풀어와 다음 시간에 확인한다.
  const homework = stats.homework ?? []
  const noActivity = summary.totalProblems === 0
  const missionLabel = MISSION_LABELS[student.currentMission as MissionType] ?? student.currentMission

  return (
    <div className="space-y-5">
      {/* 학생 헤더 */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
          <span className="text-sm font-black text-indigo-700">Lv{student.currentLevel}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{student.name}</h1>
            <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded">{student.grade}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">현재 미션: <span className={`font-semibold ${MISSION_COLOR[student.currentMission]??'text-gray-500'}`}>{missionLabel}</span></p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">최근 30일 학습현황</p>
          <p className="text-xs text-indigo-500 mt-0.5">
            학습지 {summary.worksheetCount}회 · 교재 {summary.textbookCount}회 채점
          </p>
        </div>
      </div>

      {/* 숙제 — 다음 시간에 확인할 학습지 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-amber-50/50">
          <span className="text-sm">📌</span>
          <h2 className="text-sm font-bold text-gray-800">숙제 내역</h2>
          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {homework.length}건
          </span>
          <span className="text-[11px] text-gray-400 ml-auto">채점하면 목록에서 빠집니다</span>
        </div>

        {homework.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-gray-300">확인할 숙제가 없습니다</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {homework.map(h => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${STEP_COLOR[h.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {h.step}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{h.title}</p>
                  {h.unit && <p className="text-[11px] text-gray-400 truncate">{h.unit}</p>}
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{h.problemCount}문제</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${
                  h.status === 'submitted'
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {h.status === 'submitted' ? '제출함 · 채점대기' : '풀어와야 함'}
                </span>
                <span className="text-[11px] text-gray-300 shrink-0 w-14 text-right">
                  {new Date(h.distributedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {noActivity ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-gray-400">
          <p className="text-2xl mb-2">📚</p>
          <p className="text-sm">최근 30일간 채점된 학습 기록이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">학습지 또는 교재를 채점하면 통계가 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* 상단 3열 카드 */}
          <div className="grid grid-cols-3 gap-4">
            {/* 원그래프 — 정답률 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold text-gray-500 self-start">평균 정답률</p>
              <DonutChart rate={summary.avgCorrectRate} size={100} />
              <p className="text-xs text-gray-400">
                {summary.correctProblems} / {summary.totalProblems} 문제 정답
              </p>
            </div>

            {/* 영역별 능력치 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500">영역별 능력치</p>
              {([
                ['이해력', student.comprehension, 'bg-sky-400'],
                ['추론력', student.reasoning,     'bg-violet-400'],
                ['계산력', student.calculation,   'bg-amber-400'],
              ] as [string, number, string][]).map(([label, value, color]) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-bold text-gray-700">{value.toFixed(1)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all`}
                      style={{ width: `${Math.min(value, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 풀이 요약 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500">학습 요약</p>
              <div className="space-y-2.5">
                {[
                  { label: '총 풀이 문제', value: `${summary.totalProblems}문제`, color: 'text-gray-800' },
                  { label: '정답 문제',   value: `${summary.correctProblems}문제`, color: 'text-emerald-600' },
                  { label: '오답 문제',   value: `${summary.totalProblems - summary.correctProblems}문제`, color: 'text-rose-500' },
                  { label: '학습지 채점', value: `${summary.worksheetCount}회`, color: 'text-indigo-600' },
                  { label: '교재 채점',   value: `${summary.textbookCount}회`, color: 'text-teal-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className={`font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 꺽은선 그래프 — 주간 추이 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-500 mb-4">주간 정답률 추이</p>
            <LineChart data={weeklyTrend} />
            <div className="flex gap-4 mt-3 flex-wrap">
              {weeklyTrend.map(w => (
                <div key={w.label} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span>{w.label}</span>
                  <span className="font-semibold text-gray-700">{w.correctRate !== null ? `${w.correctRate}%` : '-'}</span>
                  {w.problems > 0 && <span className="text-gray-300">({w.problems}문제)</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 띠그래프 — 단계별 정답률 */}
          {byStep.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 mb-4">단계별 정답률</p>
              <div className="space-y-3">
                {byStep.map(s => (
                  <div key={s.step} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-600">{s.step}</span>
                      <span className="text-gray-400">{s.correct}/{s.total} 문제 · <span className={`font-bold ${s.rate >= 80 ? 'text-emerald-600' : s.rate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{s.rate}%</span></span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full rounded-full transition-all ${STEP_COLORS[s.step] ?? 'bg-indigo-400'}`}
                        style={{ width: `${s.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────
function DashboardPageInner() {
  const searchParams = useSearchParams()
  const selectedStudent = searchParams.get('student')

  // 학생 선택 시 학생 통계 화면
  if (selectedStudent) return <StudentStatsView studentId={selectedStudent} />

  // 이하 일반 대시보드
  return <NormalDashboard />
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageInner />
    </Suspense>
  )
}

function NormalDashboard() {
  const [summary, setSummary]       = useState<Summary|null>(null)
  const [loading, setLoading]       = useState(true)
  const [showStudents, setShowStudents] = useState(false)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/dashboard/summary')
      if (res.ok) setSummary(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  useEffect(() => {
    const handler = () => fetchSummary()
    window.addEventListener('summary-updated', handler)
    return () => window.removeEventListener('summary-updated', handler)
  }, [fetchSummary])

  const today = new Date().toLocaleDateString('ko-KR',{ year:'numeric', month:'long', day:'numeric', weekday:'short' })
  const todayDow = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()

  if (loading || !summary) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">학원 현황을 불러오는 중...</div>
  }

  const { studentCount, worksheetCount, worksheetsWithAnswers, distTotal, distGraded, distPending,
          todaySchedule, students, recentDistributions } = summary

  const statsCards = [
    { label:'등록 학생',  value:studentCount,         unit:'명', sub:`/ 최대 300명`,                              color:'text-indigo-600', bg:'border-indigo-100', dot:'bg-indigo-500', href:'/dashboard/manage/students' },
    { label:'등록 학습지', value:worksheetCount,       unit:'개', sub:`정답 완료 ${worksheetsWithAnswers}개`,       color:'text-teal-600',   bg:'border-teal-100',   dot:'bg-teal-500',   href:'/dashboard/worksheets' },
    { label:'학습지 배포', value:distTotal,            unit:'건', sub:`미채점 ${distPending}건`,                    color:'text-amber-600',  bg:'border-amber-100',  dot:'bg-amber-500',  href:'/dashboard/worksheets/distribute' },
    { label:'채점 완료',   value:distGraded,           unit:'건', sub:`전체의 ${distTotal>0?Math.round(distGraded/distTotal*100):0}%`, color:'text-emerald-600', bg:'border-emerald-100', dot:'bg-emerald-500', href:'/dashboard/worksheets/distribute' },
  ]

  const stepLabel = (d:Distribution) => stepDisplayLabel(d.step, d.examSubType)
  const correctRate = (d:Distribution) => d.correctProblems!=null ? Math.round(d.correctProblems/d.problemCount*100) : null

  return (
    <div className="space-y-6">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학원 현황</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSummary}
            className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors">
            새로고침
          </button>
          <Link href="/dashboard/manage/schedule"
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            📅 주간시간표
          </Link>
        </div>
      </div>

      {/* ── 오늘의 수업 ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
          <div className="flex items-center gap-2">
            <span className="text-base">📚</span>
            <h2 className="font-bold text-gray-900">오늘의 수업</h2>
            <span className="text-xs text-gray-400">{DAYS[todayDow]}요일</span>
            {todaySchedule.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                {todaySchedule.length}교시
              </span>
            )}
          </div>
          <Link href="/dashboard/manage/schedule"
            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
            시간표 편집 →
          </Link>
        </div>

        {todaySchedule.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-gray-400 text-sm mb-2">오늘({DAYS[todayDow]}요일) 등록된 수업이 없습니다.</p>
            <Link href="/dashboard/manage/schedule"
              className="text-xs text-indigo-500 hover:underline">주간시간표에서 추가하기 →</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todaySchedule.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-5 py-3 hover:bg-gray-50/60 transition-colors flex-wrap">
                <span className="shrink-0 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5">
                  {s.startTime}~{s.endTime}
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">{s.grade}</span>
                <span className="shrink-0 text-sm font-semibold text-gray-800">{s.subject}</span>
                <span className="shrink-0 text-gray-200 text-xs">|</span>
                {s.studentNames.length === 0
                  ? <span className="text-xs text-gray-300 italic">학생 미등록</span>
                  : s.studentNames.map((n,i) => (
                      <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-0.5 rounded-full font-medium shadow-sm">{n}</span>
                    ))
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 통계 카드 ── */}
      <div className="grid grid-cols-4 gap-4">
        {statsCards.map(s => (
          <Link key={s.label} href={s.href}
            className={`bg-white rounded-xl border ${s.bg} p-5 hover:shadow-md transition-all block`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <p className="text-xs font-medium text-gray-500">{s.label}</p>
            </div>
            <p className={`text-3xl font-black ${s.color}`}>
              {s.value}<span className="text-base font-bold ml-1 text-gray-400">{s.unit}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── 2단 레이아웃 ── */}
      <div className="grid grid-cols-5 gap-5">

        {/* 학생 현황 */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-200">
          <button
            onClick={() => setShowStudents(v => !v)}
            className="w-full px-5 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showStudents ? 'rotate-90' : 'rotate-0'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h2 className="font-semibold text-gray-800">학생 현황</h2>
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{studentCount}명</span>
            </div>
            <Link href="/dashboard/manage/students"
              onClick={e => e.stopPropagation()}
              className="text-xs text-indigo-500 hover:underline">전체보기 →</Link>
          </button>
          {showStudents && (
            students.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">
                등록된 학생이 없습니다.
                <Link href="/dashboard/manage/students" className="block mt-2 text-indigo-500 hover:underline text-xs">학생 등록하기 →</Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {students.map(s => (
                  <Link key={s.id} href={`/dashboard/manage/students/${s.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-indigo-700">Lv{s.currentLevel}</span>
                    </div>
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">{s.name}</p>
                      <p className="text-[11px] text-gray-400">{s.grade}</p>
                    </div>
                    <div className="w-24 shrink-0">
                      <p className="text-[11px] text-gray-400 mb-0.5">현재 미션</p>
                      <p className={`text-xs font-semibold ${MISSION_COLOR[s.currentMission]??'text-gray-600'}`}>{MISSION_LABELS[s.currentMission]}</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      <AbilityMini label="이해" value={s.comprehension} color="bg-sky-400" />
                      <AbilityMini label="추론" value={s.reasoning}     color="bg-violet-400" />
                      <AbilityMini label="계산" value={s.calculation}   color="bg-amber-400" />
                    </div>
                    <div className="w-14 text-right shrink-0">
                      {s.lastActivity
                        ? <span className="text-[11px] text-gray-400">{timeAgo(s.lastActivity)}</span>
                        : <span className="text-[11px] text-gray-300">활동없음</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>

        {/* 사이드 패널 */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 mb-3">바로가기</p>
            {[
              { href:'/dashboard/worksheets/distribute', label:'학습지 배포', desc:'학생에게 학습지 배포',  color:'text-indigo-600', bg:'bg-indigo-50 hover:bg-indigo-100 border-indigo-100' },
              { href:'/dashboard/worksheets',             label:'학습지 관리', desc:'등록·정답 설정',       color:'text-teal-600',   bg:'bg-teal-50 hover:bg-teal-100 border-teal-100' },
              { href:'/dashboard/textbooks',              label:'교재',        desc:'교재 목록 관리',       color:'text-amber-600',  bg:'bg-amber-50 hover:bg-amber-100 border-amber-100' },
              { href:'/dashboard/manage/students',        label:'학생 관리',   desc:'학생 등록·학습 내역',  color:'text-gray-700',   bg:'bg-gray-50 hover:bg-gray-100 border-gray-200' },
            ].map(m => (
              <Link key={m.href} href={m.href}
                className={`flex items-center justify-between ${m.bg} border rounded-xl px-4 py-3 transition-colors`}>
                <div>
                  <p className={`text-sm font-semibold ${m.color}`}>{m.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{m.desc}</p>
                </div>
                <span className="text-gray-300">→</span>
              </Link>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-500 mb-3">학습지 정답 설정</p>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-2xl font-black text-teal-600">{worksheetsWithAnswers}</span>
              <span className="text-sm text-gray-400 mb-0.5">/ {worksheetCount}개 완료</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-teal-400 h-full rounded-full transition-all"
                style={{ width:`${worksheetCount>0?(worksheetsWithAnswers/worksheetCount)*100:0}%` }} />
            </div>
            <Link href="/dashboard/worksheets" className="block text-xs text-teal-600 hover:underline mt-2.5">
              미설정 {worksheetCount-worksheetsWithAnswers}개 설정하기 →
            </Link>
          </div>
        </div>
      </div>

      {/* ── 최근 배포 현황 ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800">최근 학습지 배포 현황</h2>
            <span className="text-xs text-gray-400">최근 10건</span>
          </div>
          <Link href="/dashboard/worksheets/distribute" className="text-xs text-indigo-500 hover:underline">배포 관리 →</Link>
        </div>
        {recentDistributions.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            배포된 학습지가 없습니다.
            <Link href="/dashboard/worksheets/distribute" className="block mt-2 text-indigo-500 hover:underline text-xs">학습지 배포하기 →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                <th className="px-5 py-2.5 text-left font-medium">학생</th>
                <th className="px-4 py-2.5 text-left font-medium">학습지</th>
                <th className="px-4 py-2.5 text-left font-medium">단계</th>
                <th className="px-4 py-2.5 text-center font-medium">상태</th>
                <th className="px-4 py-2.5 text-center font-medium">결과</th>
                <th className="px-4 py-2.5 text-left font-medium">배포</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentDistributions.map(d => {
                const rate = correctRate(d)
                return (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-gray-800">{d.studentName}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{d.studentGrade}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate">{d.worksheetTitle}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STEP_COLOR[d.step]??'bg-gray-100 text-gray-600 border-gray-200'}`}>{stepLabel(d)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.status==='graded'
                        ? <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">채점완료</span>
                        : <span className="text-xs text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">미채점</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rate!=null
                        ? <span className={`font-bold text-sm ${rate>=80?'text-emerald-600':rate>=70?'text-amber-500':'text-red-500'}`}>{d.correctProblems}/{d.problemCount} <span className="text-xs font-medium">({rate}%)</span></span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(d.distributedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
