'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']

type Student   = { id: string; name: string; grade: string }
type Worksheet = { id: string; title: string; grade: string; unit: string; step: string; problemCount: number }
type Textbook  = { id: string; title: string; grade: string; publisher: string; problemCount: number }

type SessionItem = {
  key: string; type: 'worksheet' | 'textbook'; id: string
  title: string; grade: string; unit?: string; step?: string; problemCount: number
  assignedIds: string[]; distributing: boolean; distributed: boolean
}

type RecentSession = {
  type: 'worksheet' | 'textbook'
  title: string; grade: string; step?: string; unit?: string
  totalProblems: number; correctProblems: number; correctRate: number
  gradedAt: string
}

type MonthlyPoint = { label: string; problems: number; correctRate: number | null }

type LessonHistory = {
  student: {
    id: string; name: string; grade: string; currentLevel: number
    comprehension: number; reasoning: number; calculation: number
  }
  recentSessions: RecentSession[]
  monthlyTrend: MonthlyPoint[]
}

const STEP_BADGE: Record<string, string> = {
  '기초': 'bg-sky-50 text-sky-600 border-sky-200',
  '기본': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  '발전': 'bg-amber-50 text-amber-600 border-amber-200',
  '최상위': 'bg-rose-50 text-rose-600 border-rose-200',
  '최다빈출': 'bg-violet-50 text-violet-600 border-violet-200',
  '최다오답': 'bg-orange-50 text-orange-600 border-orange-200',
  '서술형': 'bg-pink-50 text-pink-600 border-pink-200',
  '모의고사': 'bg-teal-50 text-teal-600 border-teal-200',
}

// ── 3개월 꺽은선 그래프 ─────────────────────────────────────────
function MonthlyLineChart({ data }: { data: MonthlyPoint[] }) {
  const W = 320, H = 110, PAD = { t: 18, r: 16, b: 28, l: 32 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b
  const connected = data.filter(d => d.correctRate !== null)
  const points = data.map((d, i) => ({
    x: PAD.l + (i / Math.max(data.length - 1, 1)) * chartW,
    y: d.correctRate !== null ? PAD.t + chartH - (d.correctRate / 100) * chartH : null,
    rate: d.correctRate,
    label: d.label,
    problems: d.problems,
  }))
  const connectedPts = points.filter(p => p.y !== null)
  const pathD = connectedPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = connectedPts.length > 1
    ? `${pathD} L ${connectedPts[connectedPts.length-1].x} ${PAD.t+chartH} L ${connectedPts[0].x} ${PAD.t+chartH} Z`
    : ''

  const hasData = connected.length > 0
  const avg = hasData
    ? Math.round(connected.reduce((s, d) => s + (d.correctRate ?? 0), 0) / connected.length)
    : null
  const trend = connectedPts.length >= 2
    ? (connectedPts[connectedPts.length-1].y! < connectedPts[0].y! ? 'up' : 'down')
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-600">3개월 정답률 추이</span>
        <div className="flex items-center gap-2">
          {avg !== null && (
            <span className={`text-xs font-bold ${avg >= 80 ? 'text-emerald-600' : avg >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
              평균 {avg}%
            </span>
          )}
          {trend && (
            <span className={`text-xs font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-rose-500'}`}>
              {trend === 'up' ? '▲ 향상' : '▼ 하락'}
            </span>
          )}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {[0, 50, 100].map(v => {
          const y = PAD.t + chartH - (v / 100) * chartH
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#f3f4f6" strokeWidth="1"/>
              <text x={PAD.l-4} y={y+4} textAnchor="end" fontSize="9" fill="#d1d5db">{v}</text>
            </g>
          )
        })}
        {hasData && areaD && <path d={areaD} fill="#6366f1" opacity="0.1"/>}
        {hasData && connectedPts.length > 1 && (
          <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        )}
        {points.map((p, i) => (
          <g key={i}>
            {p.y !== null && (
              <>
                <circle cx={p.x} cy={p.y} r="5" fill="#6366f1" stroke="white" strokeWidth="2"/>
                <text x={p.x} y={p.y-10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#4f46e5">{p.rate}%</text>
              </>
            )}
            {p.y === null && (
              <text x={p.x} y={PAD.t+chartH/2} textAnchor="middle" fontSize="10" fill="#d1d5db">-</text>
            )}
            <text x={p.x} y={H-4} textAnchor="middle" fontSize="10" fill="#9ca3af">{p.label}</text>
          </g>
        ))}
      </svg>
      {!hasData && (
        <p className="text-xs text-center text-gray-300 -mt-4">3개월 내 채점 기록이 없습니다</p>
      )}
    </div>
  )
}

// ── 학생 학습 내역 패널 ─────────────────────────────────────────
function StudentHistoryPanel({ studentId, studentName, onClose }: {
  studentId: string; studentName: string; onClose: () => void
}) {
  const [data, setData] = useState<LessonHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/students/${studentId}/lesson-history`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [studentId])

  const rateColor = (r: number) =>
    r >= 80 ? 'text-emerald-600' : r >= 60 ? 'text-amber-500' : 'text-rose-500'

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })

  return (
    <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-lg">
      {/* 패널 헤더 */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-indigo-50 border-b border-indigo-100">
        <div className="flex items-center gap-3">
          {data && (
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-white">Lv{data.student.currentLevel}</span>
            </div>
          )}
          <div>
            <span className="text-sm font-bold text-gray-900">{studentName}</span>
            {data && <span className="ml-2 text-xs text-gray-500">{data.student.grade}</span>}
          </div>
          <Link href={`/dashboard/manage/students/${studentId}`}
            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline ml-1">
            상태창 보기 →
          </Link>
        </div>
        <button onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-gray-400 text-sm">학습 내역 불러오는 중...</div>
      ) : !data ? (
        <div className="px-5 py-10 text-center text-gray-400 text-sm">데이터를 불러올 수 없습니다.</div>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-gray-100">

          {/* 왼쪽: 최근 3회 수업 기록 */}
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-gray-500 mb-3">최근 수업 내역 (3회)</p>
            {data.recentSessions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-2">📚</p>
                <p className="text-xs text-gray-300">채점된 학습 기록이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.recentSessions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3.5 py-3 border border-gray-100">
                    <div className="shrink-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black
                        ${s.type === 'worksheet' ? 'bg-teal-100 text-teal-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {i + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0
                          ${s.type === 'worksheet' ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                          {s.type === 'worksheet' ? '학습지' : '교재'}
                        </span>
                        {s.step && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${STEP_BADGE[s.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {s.step}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-800 truncate">{s.title}</p>
                      {s.unit && <p className="text-[10px] text-gray-400 mt-0.5">{s.unit}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-base font-black ${rateColor(s.correctRate)}`}>{s.correctRate}%</p>
                      <p className="text-[10px] text-gray-400">{s.correctProblems}/{s.totalProblems}</p>
                      <p className="text-[10px] text-gray-300 mt-0.5">{formatDate(s.gradedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 능력치 미니 */}
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
              {([
                ['계산력', data.student.calculation, 'bg-amber-400'],
                ['이해력', data.student.comprehension, 'bg-sky-400'],
                ['추론력', data.student.reasoning, 'bg-violet-400'],
              ] as [string, number, string][]).map(([label, val, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-10 shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(val, 100)}%` }}/>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 w-7 text-right">{Math.round(val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 3개월 꺽은선 그래프 */}
          <div className="px-5 py-4">
            <MonthlyLineChart data={data.monthlyTrend} />

            {/* 월별 상세 */}
            <div className="mt-4 space-y-2">
              {data.monthlyTrend.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-medium w-8">{m.label}</span>
                  <div className="flex-1 mx-3 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    {m.correctRate !== null && (
                      <div
                        className={`h-full rounded-full transition-all ${m.correctRate >= 80 ? 'bg-emerald-400' : m.correctRate >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                        style={{ width: `${m.correctRate}%` }}
                      />
                    )}
                  </div>
                  <span className={`font-bold w-10 text-right ${m.correctRate !== null ? (m.correctRate >= 80 ? 'text-emerald-600' : m.correctRate >= 60 ? 'text-amber-500' : 'text-rose-500') : 'text-gray-300'}`}>
                    {m.correctRate !== null ? `${m.correctRate}%` : '없음'}
                  </span>
                  {m.problems > 0 && (
                    <span className="text-[10px] text-gray-300 ml-2 w-12 text-right">{m.problems}문제</span>
                  )}
                </div>
              ))}
            </div>

            {/* 학생 관리 바로가기 */}
            <div className="mt-5 pt-3 border-t border-gray-100">
              <Link href={`/dashboard/manage/students/${studentId}`}
                className="flex items-center justify-center gap-2 w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold py-2.5 rounded-xl border border-indigo-100 transition-colors">
                학습 전체 내역 보기 →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 학습지 선택 모달 ──────────────────────────────────────────────
function WorksheetPicker({
  worksheets, existing, onPick, onClose,
}: {
  worksheets: Worksheet[]; existing: Set<string>
  onPick: (w: Worksheet) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')

  const filtered = worksheets.filter(w =>
    (gradeFilter === '' || w.grade === gradeFilter) &&
    (w.title.includes(search) || w.unit.includes(search))
  )
  const grades = [...new Set(worksheets.map(w => w.grade))].sort(
    (a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b)
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">학습지 선택</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-3 border-b border-gray-100 space-y-2">
          <input type="text" placeholder="학습지명, 단원 검색" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
          <div className="flex gap-1.5 flex-wrap">
            {['', ...grades].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
                {g || '전체'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">검색 결과가 없습니다.</p>
          ) : filtered.map(w => {
            const added = existing.has(w.id)
            return (
              <button key={w.id} onClick={() => !added && onPick(w)} disabled={added}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                  ${added ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{w.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{w.grade} · {w.unit} · {w.problemCount}문제</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${STEP_BADGE[w.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {w.step}
                </span>
                {added && <span className="text-[11px] text-gray-400 shrink-0">추가됨</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 교재 선택 모달 ────────────────────────────────────────────────
function TextbookPicker({
  textbooks, existing, onPick, onClose,
}: {
  textbooks: Textbook[]; existing: Set<string>
  onPick: (t: Textbook) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')

  const filtered = textbooks.filter(t =>
    (gradeFilter === '' || t.grade === gradeFilter) &&
    (t.title.includes(search) || t.publisher.includes(search))
  )
  const grades = [...new Set(textbooks.map(t => t.grade))].sort(
    (a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b)
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">교재 선택</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-3 border-b border-gray-100 space-y-2">
          <input type="text" placeholder="교재명, 출판사 검색" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
          <div className="flex gap-1.5 flex-wrap">
            {['', ...grades].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
                {g || '전체'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">검색 결과가 없습니다.</p>
          ) : filtered.map(t => {
            const added = existing.has(t.id)
            return (
              <button key={t.id} onClick={() => !added && onPick(t)} disabled={added}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                  ${added ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.grade} · {t.publisher} · {t.problemCount}문제</p>
                </div>
                {added && <span className="text-[11px] text-gray-400 shrink-0">추가됨</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────
export default function LessonPrepPage() {
  const [students, setStudents]     = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [textbooks, setTextbooks]   = useState<Textbook[]>([])
  const [items, setItems]           = useState<SessionItem[]>([])
  const [showWSPicker, setShowWSPicker] = useState(false)
  const [showTBPicker, setShowTBPicker] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAll = useCallback(async () => {
    const [sRes, wRes, tRes] = await Promise.all([
      apiFetch('/api/students'),
      apiFetch('/api/worksheets'),
      apiFetch('/api/textbooks'),
    ])
    if (sRes.ok) {
      const data = await sRes.json() as { id: string; grade: string; user: { name: string } }[]
      const sorted = [...data].sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade))
      setStudents(sorted.map(s => ({ id: s.id, name: s.user.name, grade: s.grade })))
    }
    if (wRes.ok) setWorksheets(await wRes.json())
    if (tRes.ok) setTextbooks(await tRes.json())
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addWorksheet = (w: Worksheet) => {
    setItems(prev => [...prev, {
      key: `ws-${w.id}-${Date.now()}`, type: 'worksheet',
      id: w.id, title: w.title, grade: w.grade, unit: w.unit, step: w.step,
      problemCount: w.problemCount, assignedIds: [], distributing: false, distributed: false,
    }])
    setShowWSPicker(false)
  }

  const addTextbook = (t: Textbook) => {
    setItems(prev => [...prev, {
      key: `tb-${t.id}-${Date.now()}`, type: 'textbook',
      id: t.id, title: t.title, grade: t.grade,
      problemCount: t.problemCount, assignedIds: [], distributing: false, distributed: false,
    }])
    setShowTBPicker(false)
  }

  const toggleStudent = (key: string, studentId: string) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item
      const already = item.assignedIds.includes(studentId)
      return { ...item, assignedIds: already ? item.assignedIds.filter(id => id !== studentId) : [...item.assignedIds, studentId] }
    }))
  }

  const toggleAll = (key: string) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item
      const allSelected = item.assignedIds.length === students.length
      return { ...item, assignedIds: allSelected ? [] : students.map(s => s.id) }
    }))
  }

  const distribute = async (key: string) => {
    const item = items.find(i => i.key === key)
    if (!item || item.assignedIds.length === 0) {
      showToast('배정할 학생을 먼저 선택하세요.', false)
      return
    }
    setItems(prev => prev.map(i => i.key === key ? { ...i, distributing: true } : i))
    try {
      if (item.type === 'worksheet') {
        const res = await apiFetch('/api/worksheets/distribute', {
          method: 'POST',
          body: JSON.stringify({ worksheetId: item.id, studentIds: item.assignedIds }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          showToast(d.error ?? '배포 실패', false)
          return
        }
      }
      showToast(`"${item.title}" — ${item.assignedIds.length}명에게 ${item.type === 'worksheet' ? '배포' : '배정'} 완료!`)
      setItems(prev => prev.map(i => i.key === key ? { ...i, distributed: true } : i))
    } finally {
      setItems(prev => prev.map(i => i.key === key ? { ...i, distributing: false } : i))
    }
  }

  const redist = (key: string) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, distributed: false, assignedIds: [] } : i))
  }

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  const handleStudentClick = (s: Student) => {
    setSelectedStudent(prev => prev?.id === s.id ? null : s)
  }

  const existingWSIds = new Set(items.filter(i => i.type === 'worksheet').map(i => i.id))
  const existingTBIds = new Set(items.filter(i => i.type === 'textbook').map(i => i.id))

  return (
    <div className="space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">수업 준비</h1>
          <p className="text-sm text-gray-500 mt-0.5">학습지·교재를 추가하고 학생에게 배포하세요</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowWSPicker(true)}
            className="flex items-center gap-1.5 text-sm text-teal-600 border border-teal-200 hover:bg-teal-50 px-3 py-2 rounded-lg transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            학습지 추가
          </button>
          <button onClick={() => setShowTBPicker(true)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            교재 추가
          </button>
        </div>
      </div>

      {/* 등록 학생 현황 — 클릭 시 학습 내역 패널 표시 */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-700 shrink-0">등록 학생</span>
          {students.length === 0 ? (
            <span className="text-xs text-gray-300">학생을 불러오는 중...</span>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {students.map(s => {
                const isSelected = selectedStudent?.id === s.id
                return (
                  <button key={s.id} onClick={() => handleStudentClick(s)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                        : 'text-indigo-700 bg-indigo-50 border-indigo-100 hover:border-indigo-400 hover:bg-indigo-100'
                    }`}>
                    {s.name} <span className={`font-normal ${isSelected ? 'text-indigo-200' : 'text-indigo-300'}`}>{s.grade}</span>
                  </button>
                )
              })}
            </div>
          )}
          {selectedStudent && (
            <span className="text-xs text-gray-400 ml-auto shrink-0">클릭하면 패널이 닫힙니다</span>
          )}
        </div>
      </div>

      {/* 학생 학습 내역 패널 */}
      {selectedStudent && (
        <StudentHistoryPanel
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* 아이템 목록 */}
      {items.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-20 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-400 text-sm font-medium">오늘 준비된 학습지·교재가 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">상단 버튼으로 추가하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center px-5 py-3.5 border-b border-gray-100">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded mr-3 shrink-0 ${
                  item.type === 'worksheet' ? 'bg-teal-50 text-teal-600' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {item.type === 'worksheet' ? '학습지' : '교재'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-800">{item.title}</span>
                  <span className="ml-2 text-xs text-gray-400">{item.grade}</span>
                  {item.unit && <span className="ml-1 text-xs text-gray-400">· {item.unit}</span>}
                  <span className="ml-1 text-xs text-gray-400">· {item.problemCount}문제</span>
                  {item.step && (
                    <span className={`ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded border ${STEP_BADGE[item.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {item.step}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {item.distributed ? (
                    <>
                      <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded font-medium">
                        배포완료 {item.assignedIds.length}명
                      </span>
                      <button onClick={() => redist(item.key)}
                        className="text-xs text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1 rounded transition-colors font-medium">
                        재배포
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400">
                        {item.assignedIds.length > 0 ? `${item.assignedIds.length}명 선택` : '미배정'}
                      </span>
                      <button onClick={() => distribute(item.key)}
                        disabled={item.distributing || item.assignedIds.length === 0}
                        className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors font-semibold">
                        {item.distributing ? '배포중...' : '배포'}
                      </button>
                    </>
                  )}
                  <button onClick={() => removeItem(item.key)}
                    className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {!item.distributed && (
                <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleAll(item.key)}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700 border border-indigo-100 hover:border-indigo-300 px-2 py-1 rounded transition-colors mr-1">
                    {item.assignedIds.length === students.length ? '전체 해제' : '전체 선택'}
                  </button>
                  {students.map(s => {
                    const assigned = item.assignedIds.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => toggleStudent(item.key, s.id)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                          assigned
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                        }`}>
                        {assigned && (
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                        {s.name}
                        <span className={`text-[10px] ${assigned ? 'text-indigo-200' : 'text-gray-300'}`}>{s.grade}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {item.distributed && (
                <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
                  {students.filter(s => item.assignedIds.includes(s.id)).map(s => (
                    <span key={s.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white font-medium">
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2
          ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>
          {toast.ok
            ? <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          }
          {toast.msg}
        </div>
      )}

      {showWSPicker && (
        <WorksheetPicker worksheets={worksheets} existing={existingWSIds} onPick={addWorksheet} onClose={() => setShowWSPicker(false)}/>
      )}
      {showTBPicker && (
        <TextbookPicker textbooks={textbooks} existing={existingTBIds} onPick={addTextbook} onClose={() => setShowTBPicker(false)}/>
      )}
    </div>
  )
}
