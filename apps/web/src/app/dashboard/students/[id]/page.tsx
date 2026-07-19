'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { MISSION_LABELS, type MissionType } from '@inlevmath/shared'

type Tab = 'history' | 'ability' | 'grading'

const MISSION_COLORS: Record<string, string> = {
  concept_learning: 'bg-blue-100 text-blue-700',
  concept_problem:  'bg-emerald-100 text-emerald-700',
  basic_problem:    'bg-amber-100 text-amber-700',
  advanced_problem: 'bg-orange-100 text-orange-700',
  top_problem:      'bg-rose-100 text-rose-700',
}

const STEP_BADGE: Record<string, string> = {
  '기초':    'bg-sky-50 text-sky-700',
  '기본':    'bg-emerald-50 text-emerald-700',
  '발전':    'bg-amber-50 text-amber-700',
  '최상위':  'bg-rose-50 text-rose-700',
  '최다빈출': 'bg-violet-50 text-violet-700',
  '최다오답': 'bg-orange-50 text-orange-700',
  '서술형':  'bg-pink-50 text-pink-700',
  '모의고사': 'bg-teal-50 text-teal-700',
}

type WsResult = {
  id: string; date: string; title: string
  step: string; unit: string; grade: string
  total: number; correct: number; rate: number; cleared: boolean
}
type TbResult = {
  id: string; date: string; title: string
  grade: string; total: number; correct: number; rate: number
}
type StepStat = {
  step: string; rate: number; count: number; threshold: number
}
type HistoryData = {
  student: {
    id: string; name: string; phone: string; school: string; grade: string
    currentLevel: number; currentMission: string
    comprehension: number; reasoning: number; calculation: number
  }
  worksheetResults: WsResult[]
  textbookResults: TbResult[]
  stepStats: StepStat[]
  recentActivity: { lastDate: string | null; totalSessions: number; clearedCount: number }
}

function rateColor(rate: number) {
  return rate >= 80 ? 'text-emerald-600' : rate >= 65 ? 'text-amber-600' : 'text-red-500'
}

function AbilityBar({ label, value, color, desc }: { label: string; value: number; color: string; desc?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{Math.round(value)}</span>
      </div>
      <div className="bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color.replace('text-', 'bg-')}`}
          style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      {desc && <p className="text-xs text-gray-400">{desc}</p>}
    </div>
  )
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('history')
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/students/${id}/full-history`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setData(d))
      .catch(() => setError('학생 정보를 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
  }, [id])

  const TABS: [Tab, string][] = [
    ['history', '학습내역'],
    ['ability', '능력치 분석'],
    ['grading', '채점 이력'],
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      학습 정보를 불러오는 중...
    </div>
  )

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-gray-400 text-sm">{error || '데이터를 불러올 수 없습니다.'}</p>
      <Link href="/dashboard/manage/students" className="text-indigo-500 text-sm hover:underline">
        ← 학생 목록으로
      </Link>
    </div>
  )

  const { student, worksheetResults, textbookResults, stepStats, recentActivity } = data

  const totalMissionProblems = worksheetResults.reduce((a, r) => a + r.total, 0)
  const avgMissionRate = worksheetResults.length > 0
    ? Math.round(worksheetResults.reduce((a, r) => a + r.rate, 0) / worksheetResults.length)
    : 0
  const totalGradingProblems = textbookResults.reduce((a, r) => a + r.total, 0)
  const avgGradingRate = textbookResults.length > 0
    ? Math.round(textbookResults.reduce((a, r) => a + r.rate, 0) / textbookResults.length)
    : 0

  const missionLabel = MISSION_LABELS[student.currentMission as MissionType] ?? student.currentMission
  const missionColorClass = MISSION_COLORS[student.currentMission] ?? 'bg-gray-100 text-gray-600'

  const formatPhone = (p: string) =>
    p.length === 11 ? p.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : p

  // 학습지 + 교재 결과 합쳐서 날짜 내림차순
  type Row =
    | { kind: 'worksheet'; data: WsResult }
    | { kind: 'textbook'; data: TbResult }

  const combinedRows: Row[] = [
    ...worksheetResults.map(r => ({ kind: 'worksheet' as const, data: r })),
    ...textbookResults.map(r => ({ kind: 'textbook' as const, data: r })),
  ].sort((a, b) => b.data.date.localeCompare(a.data.date))

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/manage/students" className="text-gray-400 hover:text-gray-600 text-sm">
          ← 학생 목록
        </Link>
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{student.name} 학생</h1>
            <p className="text-xs text-gray-400">
              {student.school || '-'} · {student.grade} · {formatPhone(student.phone)}
            </p>
          </div>
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black text-sm shrink-0">
            Lv{student.currentLevel}
          </span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${missionColorClass}`}>
            {missionLabel}
          </span>
          <Link href={`/dashboard/manage/students/${id}`}
            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline shrink-0">
            상태창 →
          </Link>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 학습내역 탭 ── */}
      {tab === 'history' && (
        <div className="flex gap-5">
          {/* 왼쪽 메인 */}
          <div className="flex-1 space-y-4">
            {/* 진도 요약 카드 */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                진도
                <span className="text-xs text-gray-400 font-normal">각 카드를 선택해 필요한 학습내용만 확인할 수 있어요.</span>
              </h2>
              <div className="flex gap-3">
                <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-600 mb-3">미션 학습</p>
                  {worksheetResults.length === 0 ? (
                    <p className="text-xs text-blue-300 text-center py-2">기록 없음</p>
                  ) : (
                    <div className="flex justify-around">
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">총 문제 수</p>
                        <p className="text-xl font-black text-gray-800">{totalMissionProblems}개</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">평균 정답률</p>
                        <p className={`text-xl font-black ${avgMissionRate >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {avgMissionRate}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">클리어</p>
                        <p className="text-xl font-black text-indigo-600">
                          {worksheetResults.filter(r => r.cleared).length}회
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-teal-600 mb-3">교재 채점</p>
                  {textbookResults.length === 0 ? (
                    <p className="text-xs text-teal-300 text-center py-2">기록 없음</p>
                  ) : (
                    <div className="flex justify-around">
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">총 문제 수</p>
                        <p className="text-xl font-black text-gray-800">{totalGradingProblems}개</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">평균 정답률</p>
                        <p className={`text-xl font-black ${avgGradingRate >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {avgGradingRate}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">채점 횟수</p>
                        <p className="text-xl font-black text-teal-600">{textbookResults.length}회</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 학습 이력 테이블 */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-12 text-xs text-gray-400 font-medium">
                <span className="col-span-1">구분</span>
                <span className="col-span-5">내용</span>
                <span className="col-span-2 text-center">채점</span>
                <span className="col-span-2 text-center">정답률</span>
                <span className="col-span-2 text-center">결과</span>
              </div>

              {combinedRows.length === 0 ? (
                <div className="px-5 py-16 text-center text-gray-400">
                  <p className="text-3xl mb-3">📚</p>
                  <p className="text-sm">학습 기록이 없습니다.</p>
                </div>
              ) : combinedRows.map(row => {
                if (row.kind === 'worksheet') {
                  const r = row.data
                  return (
                    <div key={`ws-${r.id}`}
                      className="px-5 py-3.5 border-b border-gray-50 grid grid-cols-12 items-center hover:bg-gray-50 transition-colors">
                      <span className="col-span-1">
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">미션</span>
                      </span>
                      <div className="col-span-5">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STEP_BADGE[r.step] ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.step}
                          </span>
                          <span className="text-[10px] text-gray-400">{r.grade}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{r.unit} · {r.date}</p>
                      </div>
                      <span className="col-span-2 text-center text-sm text-gray-600">{r.total}문제</span>
                      <span className={`col-span-2 text-center text-sm font-bold ${rateColor(r.rate)}`}>{r.rate}%</span>
                      <span className="col-span-2 text-center">
                        {r.cleared
                          ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">클리어</span>
                          : <span className="text-xs text-gray-400">-</span>}
                      </span>
                    </div>
                  )
                } else {
                  const g = row.data
                  return (
                    <div key={`tb-${g.id}`}
                      className="px-5 py-3.5 border-b border-gray-50 grid grid-cols-12 items-center hover:bg-gray-50 transition-colors">
                      <span className="col-span-1">
                        <span className="text-xs font-medium text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">교재</span>
                      </span>
                      <div className="col-span-5">
                        <span className="text-[10px] text-gray-400">{g.grade}</span>
                        <p className="text-sm font-medium text-gray-800 truncate">{g.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{g.date}</p>
                      </div>
                      <span className="col-span-2 text-center text-sm text-gray-600">{g.total}문제</span>
                      <span className={`col-span-2 text-center text-sm font-bold ${rateColor(g.rate)}`}>{g.rate}%</span>
                      <span className="col-span-2 text-center text-xs text-gray-400">-</span>
                    </div>
                  )
                }
              })}
            </div>
          </div>

          {/* 오른쪽 사이드바 */}
          <div className="w-64 space-y-4 shrink-0">
            {/* 현재 레벨/미션 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">현재 진행 상황</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="font-black text-indigo-700 text-sm">Lv{student.currentLevel}</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400">현재 미션</p>
                  <p className={`text-sm font-bold ${missionColorClass.split(' ')[1]}`}>
                    {missionLabel}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <AbilityBar label="이해력" value={student.comprehension} color="text-blue-500" />
                <AbilityBar label="추론력" value={student.reasoning}     color="text-violet-500" />
                <AbilityBar label="계산력" value={student.calculation}   color="text-emerald-500" />
              </div>
            </div>

            {/* 단계별 통계 */}
            {stepStats.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">미션 단계별 정답률</h3>
                <div className="space-y-2.5">
                  {stepStats.map(s => (
                    <div key={s.step}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{s.step}</span>
                        <span className={`font-semibold ${s.rate >= s.threshold ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {s.rate}%
                        </span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${s.rate >= s.threshold ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          style={{ width: `${s.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 최근 활동 요약 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">최근 활동</h3>
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>마지막 학습일</span>
                  <span className="font-medium text-gray-700">{recentActivity.lastDate ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>총 학습 횟수</span>
                  <span className="font-medium text-gray-700">{recentActivity.totalSessions}회</span>
                </div>
                <div className="flex justify-between">
                  <span>미션 클리어</span>
                  <span className="font-medium text-indigo-600">{recentActivity.clearedCount}회</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 능력치 분석 탭 ── */}
      {tab === 'ability' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '이해력', value: student.comprehension, color: 'indigo', desc: '개념 이해 및 문제 파악 능력' },
              { label: '추론력', value: student.reasoning,     color: 'violet', desc: '논리적 사고 및 풀이 과정 능력' },
              { label: '계산력', value: student.calculation,   color: 'emerald', desc: '정확하고 빠른 계산 능력' },
            ].map(a => (
              <div key={a.label} className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <p className="text-sm text-gray-500 mb-2">{a.label}</p>
                <p className={`text-5xl font-black text-${a.color}-600 mb-1`}>{Math.round(a.value)}</p>
                <p className="text-xs text-gray-400 mb-4">{a.desc}</p>
                <div className="bg-gray-100 rounded-full h-3">
                  <div className={`h-3 rounded-full bg-${a.color}-400`} style={{ width: `${Math.min(a.value, 100)}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-2">{Math.round(a.value)} / 100</p>
              </div>
            ))}
          </div>

          {/* 단계별 상세 분석 */}
          {stepStats.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">단계별 학습 성취도</h3>
              <div className="space-y-3">
                {stepStats.map(s => (
                  <div key={s.step}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STEP_BADGE[s.step] ?? 'bg-gray-100 text-gray-600'}`}>
                          {s.step}
                        </span>
                        <span className="text-xs text-gray-400">{s.count}회 채점</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">기준 {s.threshold}%</span>
                        <span className={`font-bold text-sm ${s.rate >= s.threshold ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {s.rate}%
                        </span>
                        {s.rate >= s.threshold && (
                          <span className="text-xs text-emerald-600 font-semibold">✓</span>
                        )}
                      </div>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${s.rate}%`,
                          background: s.rate >= s.threshold ? '#10b981' : '#f59e0b',
                        }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 채점 이력 탭 ── */}
      {tab === 'grading' && (
        <div className="space-y-3">
          {/* 학습지 채점 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
              <h3 className="text-sm font-semibold text-indigo-700">학습지 채점 이력</h3>
            </div>
            {worksheetResults.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">학습지 채점 기록이 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                    <th className="px-5 py-3 text-left font-medium">날짜</th>
                    <th className="px-5 py-3 text-left font-medium">학습지명</th>
                    <th className="px-5 py-3 text-center font-medium">단계</th>
                    <th className="px-5 py-3 text-center font-medium">문제 수</th>
                    <th className="px-5 py-3 text-center font-medium">정답률</th>
                    <th className="px-5 py-3 text-center font-medium">결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {worksheetResults.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-400 text-xs">{r.date}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800 text-xs truncate max-w-48">{r.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{r.unit}</p>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${STEP_BADGE[r.step] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.step}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600">{r.total}문제</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`font-bold text-sm ${rateColor(r.rate)}`}>{r.rate}%</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {r.cleared
                          ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">클리어</span>
                          : <span className="text-xs text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 교재 채점 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-teal-50 border-b border-teal-100">
              <h3 className="text-sm font-semibold text-teal-700">교재 채점 이력</h3>
            </div>
            {textbookResults.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">교재 채점 기록이 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                    <th className="px-5 py-3 text-left font-medium">날짜</th>
                    <th className="px-5 py-3 text-left font-medium">교재명</th>
                    <th className="px-5 py-3 text-center font-medium">문제 수</th>
                    <th className="px-5 py-3 text-center font-medium">정답</th>
                    <th className="px-5 py-3 text-center font-medium">정답률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {textbookResults.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-400 text-xs">{g.date}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800 truncate max-w-64">{g.title}</p>
                        <p className="text-xs text-gray-400">{g.grade}</p>
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-600">{g.total}문제</td>
                      <td className="px-5 py-3.5 text-center text-gray-600">{g.correct}개</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`font-bold text-sm ${rateColor(g.rate)}`}>{g.rate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
