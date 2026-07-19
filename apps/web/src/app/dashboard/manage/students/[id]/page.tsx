'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { MISSION_LABELS, MissionType } from '@inlevmath/shared'

// ── 레벨별 칭호 ──────────────────────────────────────────────────
function getTitle(level: number): string {
  if (level <= 1)  return '수학 입문자'
  if (level <= 3)  return '수학 탐험가'
  if (level <= 5)  return '수학 전사'
  if (level <= 7)  return '수학 마법사'
  if (level <= 10) return '수학 영웅'
  if (level <= 15) return '수학 마스터'
  return '수학 전설'
}

function getLevelColor(level: number): string {
  if (level <= 3)  return '#6ee7b7'
  if (level <= 5)  return '#60a5fa'
  if (level <= 7)  return '#c084fc'
  if (level <= 10) return '#f97316'
  return '#fbbf24'
}

const MISSION_COLOR: Record<string, string> = {
  concept_learning: '#6ee7b7',
  concept_problem:  '#34d399',
  basic_problem:    '#fbbf24',
  advanced_problem: '#fb923c',
  top_problem:      '#f87171',
}

type Stats = {
  student: {
    id: string; name: string; grade: string
    currentLevel: number; currentMission: string
    comprehension: number; reasoning: number; calculation: number
  }
  summary: {
    totalProblems: number; correctProblems: number
    avgCorrectRate: number; worksheetCount: number; textbookCount: number
  }
  weeklyTrend: { label: string; problems: number; correctRate: number | null }[]
  byStep: { step: string; total: number; correct: number; rate: number }[]
}

type RewardItem = {
  id: string; name: string; emoji: string
  rarity: string; type: string; pointValue: number; description: string
}

type InventoryEntry = {
  id: string; quantity: number; status: string; reason: string; grantedAt: string
  item: RewardItem
}

type PointTx = {
  id: string; amount: number; reason: string; type: string; createdAt: string
}

type Inventory = {
  name: string; rewardPoints: number
  rewards: InventoryEntry[]; pointHistory: PointTx[]
}

const RARITY_STYLE: Record<string, { border: string; glow: string; label: string; labelColor: string }> = {
  common:    { border: '#6b7280', glow: 'none', label: '일반', labelColor: '#9ca3af' },
  rare:      { border: '#3b82f6', glow: '0 0 10px rgba(59,130,246,0.5)', label: '레어', labelColor: '#60a5fa' },
  epic:      { border: '#a855f7', glow: '0 0 10px rgba(168,85,247,0.5)', label: '에픽', labelColor: '#c084fc' },
  legendary: { border: '#c9aa71', glow: '0 0 12px rgba(201,170,113,0.6)', label: '전설', labelColor: '#fbbf24' },
}

// ── 능력치 바 ────────────────────────────────────────────────────
function StatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </div>
  )
}

// ── 주간 추이 차트 ───────────────────────────────────────────────
function LineChart({ data }: { data: { label: string; correctRate: number | null; problems: number }[] }) {
  const W = 360, H = 100, PAD = { t: 14, r: 16, b: 28, l: 28 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b
  const points = data.map((d, i) => ({
    x: PAD.l + (i / Math.max(data.length - 1, 1)) * chartW,
    y: d.correctRate !== null ? PAD.t + chartH - (d.correctRate / 100) * chartH : null,
    rate: d.correctRate, label: d.label, problems: d.problems,
  }))
  const connected = points.filter(p => p.y !== null)
  const pathD = connected.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = connected.length > 1
    ? `${pathD} L ${connected[connected.length-1].x} ${PAD.t+chartH} L ${connected[0].x} ${PAD.t+chartH} Z`
    : ''
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {[0, 50, 100].map(v => {
        const y = PAD.t + chartH - (v / 100) * chartH
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)">{v}</text>
          </g>
        )
      })}
      {areaD && <path d={areaD} fill="#6366f1" opacity="0.15" />}
      {connected.length > 1 && <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <g key={i}>
          {p.y !== null && (
            <>
              <circle cx={p.x} cy={p.y} r="4" fill="#6366f1" stroke="#c7d2fe" strokeWidth="1.5" />
              <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="9" fontWeight="700" fill="#a5b4fc">{p.rate}%</text>
            </>
          )}
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────
export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const fetchInventory = useCallback(() =>
    apiFetch(`/api/rewards/students/${id}/inventory`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setInventory(d))
      .catch(() => {}),
  [id])

  useEffect(() => {
    apiFetch(`/api/students/${id}/stats`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setStats(d))
      .catch(() => setError('학생 정보를 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
    fetchInventory()
  }, [id, fetchInventory])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      상태창을 불러오는 중...
    </div>
  )
  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-gray-400 text-sm">{error || '데이터를 불러올 수 없습니다.'}</p>
      <Link href="/dashboard/manage/students" className="text-indigo-500 text-sm hover:underline">← 학생 목록으로</Link>
    </div>
  )

  const { student, summary, weeklyTrend, byStep } = stats

  // 파생 능력치
  const 응용력  = Math.round((student.comprehension + student.reasoning) / 2)
  const 종합수학능력 = Math.round((student.comprehension + student.reasoning + student.calculation) / 3)
  const xpRate  = Math.min(종합수학능력, 100)
  const missionLabel = MISSION_LABELS[student.currentMission as MissionType] ?? student.currentMission
  const missionColor = MISSION_COLOR[student.currentMission] ?? '#94a3b8'
  const levelColor   = getLevelColor(student.currentLevel)
  const title        = getTitle(student.currentLevel)
  const noActivity   = summary.totalProblems === 0

  // 분배가능 포인트 = 레벨업마다 3포인트씩 누적 (임시 규칙)
  const assignablePoints = student.currentLevel * 3

  const abilities = [
    { label: '계산력',    value: student.calculation,    color: '#fbbf24', sub: 'Calculation' },
    { label: '이해력',    value: student.comprehension,  color: '#60a5fa', sub: 'Comprehension' },
    { label: '추론력',    value: student.reasoning,      color: '#c084fc', sub: 'Reasoning' },
    { label: '응용력',    value: 응용력,                  color: '#34d399', sub: 'Application' },
    { label: '종합 수학능력', value: 종합수학능력,        color: '#f97316', sub: 'Math Ability' },
  ]

  return (
    <div className="space-y-5">

      {/* 뒤로가기 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/manage/students"
          className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
          ← 학생 목록
        </Link>
      </div>

      {/* ══════════════ 상태창 ══════════════ */}
      <div className="relative mx-auto max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0d1b3e 0%, #0a1628 100%)',
          boxShadow: '0 0 40px rgba(99,102,241,0.3), 0 0 80px rgba(99,102,241,0.1)',
          border: '2px solid #c9aa71',
        }}>

        {/* 상단 장식선 */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #c9aa71, transparent)' }} />

        {/* 타이틀 */}
        <div className="pt-5 pb-3 text-center relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c9aa71] text-lg select-none">❖</div>
          <h2 className="text-xl font-black tracking-widest"
            style={{ color: '#ffd700', textShadow: '0 0 12px rgba(255,215,0,0.6)' }}>
            상 태 창
          </h2>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#c9aa71] text-lg select-none">❖</div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #c9aa71 30%, #c9aa71 70%, transparent)' }} />

        {/* 기본 정보 */}
        <div className="px-7 py-4 grid grid-cols-2 gap-y-2.5 text-sm">
          <div className="flex gap-2">
            <span style={{ color: '#a0c4e8' }}>이름 :</span>
            <span className="font-bold text-white">{student.name}</span>
          </div>
          <div className="flex gap-2 justify-end">
            <span style={{ color: '#a0c4e8' }}>레벨 :</span>
            <span className="font-black" style={{ color: levelColor, textShadow: `0 0 8px ${levelColor}` }}>
              {student.currentLevel}
            </span>
          </div>
          <div className="flex gap-2">
            <span style={{ color: '#a0c4e8' }}>학년 :</span>
            <span className="font-bold text-white">{student.grade}</span>
          </div>
          <div className="flex gap-2 justify-end">
            <span style={{ color: '#a0c4e8' }}>피로도 :</span>
            <span className="font-bold" style={{ color: '#6ee7b7' }}>0</span>
          </div>
          <div className="col-span-2 flex gap-2">
            <span style={{ color: '#a0c4e8' }}>칭호 :</span>
            <span className="font-bold" style={{ color: '#fbbf24' }}>「{title}」</span>
          </div>
          <div className="col-span-2 flex gap-2">
            <span style={{ color: '#a0c4e8' }}>현재 미션 :</span>
            <span className="font-bold" style={{ color: missionColor }}>{missionLabel}</span>
          </div>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-2 px-5">
          <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.4)' }} />
          <span style={{ color: '#c9aa71' }}>◆</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.4)' }} />
        </div>

        {/* 경험치 바 */}
        <div className="px-7 py-4 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span style={{ color: '#a0c4e8' }}>학습 경험치 (XP)</span>
            <span style={{ color: '#6ee7b7' }}>{xpRate} / 100</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(201,170,113,0.3)' }}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${xpRate}%`,
                background: 'linear-gradient(90deg, #4ade80, #22d3ee)',
                boxShadow: '0 0 8px rgba(74,222,128,0.5)',
              }} />
          </div>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-2 px-5">
          <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.4)' }} />
          <span style={{ color: '#c9aa71' }}>◆</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.4)' }} />
        </div>

        {/* 능력치 */}
        <div className="px-7 py-4 space-y-3">
          {abilities.map(a => (
            <div key={a.label} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <span className="text-sm" style={{ color: '#a0c4e8' }}>{a.label}</span>
              </div>
              <span className="w-10 text-right font-black text-base shrink-0"
                style={{ color: a.color, textShadow: `0 0 6px ${a.color}` }}>
                {a.value}
              </span>
              <StatBar value={a.value} color={a.color} />
              <span className="text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {a.sub}
              </span>
            </div>
          ))}
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-2 px-5">
          <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.4)' }} />
          <span style={{ color: '#c9aa71' }}>◆</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.4)' }} />
        </div>

        {/* 분배가능 포인트 */}
        <div className="px-7 py-4 flex justify-between items-center">
          <span className="text-sm" style={{ color: '#a0c4e8' }}>분배가능 포인트</span>
          <span className="font-black text-xl"
            style={{ color: '#ffd700', textShadow: '0 0 8px rgba(255,215,0,0.6)' }}>
            {assignablePoints}
          </span>
        </div>

        {/* 하단 장식선 */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #c9aa71 30%, #c9aa71 70%, transparent)' }} />
        <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #c9aa71, transparent)', marginTop: 1 }} />
      </div>

      {/* ── 학습 통계 ─────────────────────────────────────────── */}
      {!noActivity && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-500 flex items-center gap-2">
            <span className="w-1 h-4 rounded bg-indigo-500 inline-block" />
            최근 30일 학습 분석
          </h3>

          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '총 문제',    value: summary.totalProblems,    unit: '문제', color: 'text-gray-800' },
              { label: '정답',       value: summary.correctProblems,  unit: '문제', color: 'text-emerald-600' },
              { label: '평균 정답률', value: summary.avgCorrectRate,   unit: '%',   color: summary.avgCorrectRate >= 80 ? 'text-emerald-600' : summary.avgCorrectRate >= 60 ? 'text-amber-500' : 'text-rose-500' },
              { label: '채점 횟수',  value: summary.worksheetCount + summary.textbookCount, unit: '회', color: 'text-indigo-600' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                <p className={`text-2xl font-black ${c.color}`}>
                  {c.value}<span className="text-sm font-bold text-gray-400 ml-0.5">{c.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* 주간 추이 */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, #0d1b3e 0%, #0a1628 100%)', border: '1px solid rgba(201,170,113,0.3)' }}>
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold" style={{ color: '#a0c4e8' }}>주간 정답률 추이</p>
            </div>
            <div className="px-5 pb-5">
              <LineChart data={weeklyTrend} />
              <div className="flex gap-4 mt-2 flex-wrap">
                {weeklyTrend.map(w => (
                  <div key={w.label} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <span>{w.label}</span>
                    <span className="font-semibold" style={{ color: '#a5b4fc' }}>
                      {w.correctRate !== null ? `${w.correctRate}%` : '-'}
                    </span>
                    {w.problems > 0 && <span>({w.problems}문제)</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 단계별 정답률 */}
          {byStep.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 mb-4">단계별 정답률</p>
              <div className="space-y-3">
                {byStep.map(s => (
                  <div key={s.step}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium text-gray-600">{s.step}</span>
                      <span className="text-gray-400">
                        {s.correct}/{s.total} 문제 ·{' '}
                        <span className={`font-bold ${s.rate >= 80 ? 'text-emerald-600' : s.rate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                          {s.rate}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${s.rate}%`, background: s.rate >= 80 ? '#10b981' : s.rate >= 60 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {noActivity && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-gray-400">
          <p className="text-3xl mb-3">📚</p>
          <p className="text-sm">최근 30일간 채점된 학습 기록이 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">학습지 또는 교재를 채점하면 통계가 표시됩니다.</p>
        </div>
      )}

      {/* ══════════════ 보관창고 ══════════════ */}
      {inventory && (
        <div className="space-y-3">
          {/* 헤더 */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(180deg, #0d1b3e 0%, #0a1628 100%)', border: '2px solid #c9aa71' }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #c9aa71, transparent)' }} />
            <div className="px-7 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[#c9aa71] text-xl">🎒</span>
                <h3 className="text-lg font-black tracking-widest"
                  style={{ color: '#ffd700', textShadow: '0 0 10px rgba(255,215,0,0.5)' }}>
                  보 관 창 고
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#a0c4e8' }}>보유 포인트</span>
                <span className="font-black text-xl" style={{ color: '#ffd700', textShadow: '0 0 8px rgba(255,215,0,0.6)' }}>
                  {inventory.rewardPoints}P
                </span>
              </div>
            </div>
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #c9aa71 30%, #c9aa71 70%, transparent)' }} />

            {/* 아이템 그리드 */}
            <div className="px-7 py-5">
              {inventory.rewards.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  아직 보유한 아이템이 없습니다
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {inventory.rewards.map(entry => {
                    const rs = RARITY_STYLE[entry.item.rarity] ?? RARITY_STYLE.common
                    return (
                      <div key={entry.id} className="relative rounded-xl p-3 text-center"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: `2px solid ${rs.border}`,
                          boxShadow: rs.glow,
                          opacity: entry.status === 'redeemed' ? 0.5 : 1,
                        }}>
                        {entry.quantity > 1 && (
                          <span className="absolute top-1 right-2 text-[10px] font-bold"
                            style={{ color: '#fbbf24' }}>×{entry.quantity}</span>
                        )}
                        {entry.status === 'redeemed' && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold rounded-xl"
                            style={{ background: 'rgba(0,0,0,0.5)', color: '#9ca3af' }}>수령완료</span>
                        )}
                        <div className="text-2xl mb-1">{entry.item.emoji}</div>
                        <div className="text-[11px] font-bold leading-tight" style={{ color: '#e2e8f0' }}>
                          {entry.item.name}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: rs.labelColor }}>{rs.label}</div>
                        {entry.item.type === 'physical' && entry.status === 'owned' && (
                          <div className="text-[9px] mt-1" style={{ color: '#fb923c' }}>실물보상</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 포인트 내역 토글 */}
            {inventory.pointHistory.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-5">
                  <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.3)' }} />
                  <button onClick={() => setShowHistory(v => !v)}
                    className="text-xs px-3 py-1 rounded-full transition-colors"
                    style={{ color: '#c9aa71', border: '1px solid rgba(201,170,113,0.4)', background: 'rgba(201,170,113,0.05)' }}>
                    포인트 내역 {showHistory ? '▲' : '▼'}
                  </button>
                  <div style={{ flex: 1, height: 1, background: 'rgba(201,170,113,0.3)' }} />
                </div>
                {showHistory && (
                  <div className="px-7 py-4 space-y-2">
                    {inventory.pointHistory.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between text-xs">
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{tx.reason}</span>
                        <span className="font-bold" style={{ color: tx.amount > 0 ? '#4ade80' : '#f87171' }}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}P
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #c9aa71, transparent)' }} />
          </div>
        </div>
      )}
    </div>
  )
}
