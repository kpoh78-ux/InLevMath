'use client'

import { useState } from 'react'
import Link from 'next/link'

type MissionType = 'concept_learning' | 'concept_problem' | 'basic_problem' | 'advanced_problem' | 'top_problem'
type Tab = 'history' | 'ability' | 'grading'

const MISSION_LABELS: Record<MissionType, string> = {
  concept_learning: '개념익히기',
  concept_problem:  '개념확인문제',
  basic_problem:    '기본문제',
  advanced_problem: '발전문제',
  top_problem:      '최상위문제',
}
const MISSION_COLORS: Record<MissionType, string> = {
  concept_learning: 'bg-blue-100 text-blue-700',
  concept_problem:  'bg-emerald-100 text-emerald-700',
  basic_problem:    'bg-amber-100 text-amber-700',
  advanced_problem: 'bg-orange-100 text-orange-700',
  top_problem:      'bg-rose-100 text-rose-700',
}

// ── Mock 학생 데이터 ─────────────────────────────────────────
const MOCK_STUDENT = {
  id: 's1', name: '홍길동', school: '오성중학교', grade: '중2', phone: '01012345678',
  level: 3, currentMission: 'basic_problem' as MissionType,
  comprehension: 72, reasoning: 58, calculation: 45,
}

// 최근 미션 결과
const MOCK_RESULTS = [
  { id: 'r1', date: '2026-06-28', missionType: 'basic_problem' as MissionType,    source: 'manual',   total: 20, correct: 14, rate: 70, cleared: false },
  { id: 'r2', date: '2026-06-27', missionType: 'concept_problem' as MissionType,  source: 'mathflat', total: 20, correct: 16, rate: 80, cleared: true  },
  { id: 'r3', date: '2026-06-25', missionType: 'concept_learning' as MissionType, source: 'manual',   total: 15, correct: 15, rate: 100, cleared: true  },
  { id: 'r4', date: '2026-06-22', missionType: 'concept_problem' as MissionType,  source: 'mathflat', total: 20, correct: 12, rate: 60, cleared: false },
  { id: 'r5', date: '2026-06-20', missionType: 'concept_learning' as MissionType, source: 'manual',   total: 15, correct: 11, rate: 73, cleared: false },
]

// 교재 채점 이력
const MOCK_GRADING = [
  { id: 'g1', date: '2026-06-28', textbook: '일품 - 중등수학1(상)',             problems: 10, correct: 8, rate: 80 },
  { id: 'g2', date: '2026-06-25', textbook: '우공비Q+Q 표준완성 - 중등수학1(하)', problems: 12, correct: 9, rate: 75 },
  { id: 'g3', date: '2026-06-22', textbook: '수완하나중 1-1 기말 모의고사_03회',  problems: 24, correct: 21, rate: 87 },
]

function AbilityGauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{value}</span>
      </div>
      <div className="bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export default function StudentDetailPage() {
  const [tab, setTab] = useState<Tab>('history')
  const s = MOCK_STUDENT

  const totalMissionProblems = MOCK_RESULTS.reduce((a, r) => a + r.total, 0)
  const avgMissionRate = Math.round(MOCK_RESULTS.reduce((a, r) => a + r.rate, 0) / MOCK_RESULTS.length)
  const totalGradingProblems = MOCK_GRADING.reduce((a, g) => a + g.problems, 0)
  const avgGradingRate = Math.round(MOCK_GRADING.reduce((a, g) => a + g.rate, 0) / MOCK_GRADING.length)

  const TABS: [Tab, string][] = [
    ['history', '학습내역'],
    ['ability', '능력치 분석'],
    ['grading', '채점 이력'],
  ]

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/students" className="text-gray-400 hover:text-gray-600 text-sm">← 학생 목록</Link>
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{s.name} 학생</h1>
            <p className="text-xs text-gray-400">{s.school} · {s.grade} · {s.phone}</p>
          </div>
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black text-sm">
            Lv{s.level}
          </span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${MISSION_COLORS[s.currentMission]}`}>
            {MISSION_LABELS[s.currentMission]}
          </span>
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
                        {MOCK_RESULTS.filter(r => r.cleared).length}회
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-teal-600 mb-3">교재 채점</p>
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
                      <p className="text-xl font-black text-teal-600">{MOCK_GRADING.length}회</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 학습 이력 테이블 */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-12 text-xs text-gray-400 font-medium">
                <span className="col-span-1">구분</span>
                <span className="col-span-4">내용</span>
                <span className="col-span-2 text-center">입력방식</span>
                <span className="col-span-2 text-center">채점</span>
                <span className="col-span-2 text-center">정답률</span>
                <span className="col-span-1 text-center">결과</span>
              </div>
              {MOCK_RESULTS.map(r => (
                <div key={r.id} className="px-5 py-3.5 border-b border-gray-50 grid grid-cols-12 items-center hover:bg-gray-50 transition-colors">
                  <span className="col-span-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded w-fit">미션</span>
                  <div className="col-span-4">
                    <p className="text-sm font-medium text-gray-800">{MISSION_LABELS[r.missionType]}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.date}</p>
                  </div>
                  <span className="col-span-2 text-center text-xs text-gray-500">
                    {r.source === 'mathflat' ? '매쓰플랫' : '수동 입력'}
                  </span>
                  <span className="col-span-2 text-center text-sm text-gray-600">{r.total}문제</span>
                  <span className={`col-span-2 text-center text-sm font-bold ${r.rate >= 75 ? 'text-emerald-600' : r.rate >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                    {r.rate}%
                  </span>
                  <span className="col-span-1 text-center">
                    {r.cleared
                      ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">클리어</span>
                      : <span className="text-xs text-gray-400">-</span>}
                  </span>
                </div>
              ))}
              {MOCK_GRADING.map(g => (
                <div key={g.id} className="px-5 py-3.5 border-b border-gray-50 grid grid-cols-12 items-center hover:bg-gray-50 transition-colors">
                  <span className="col-span-1 text-xs font-medium text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded w-fit">교재</span>
                  <div className="col-span-4">
                    <p className="text-sm font-medium text-gray-800">{g.textbook}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{g.date}</p>
                  </div>
                  <span className="col-span-2 text-center text-xs text-gray-500">교재 채점</span>
                  <span className="col-span-2 text-center text-sm text-gray-600">{g.problems}문제</span>
                  <span className={`col-span-2 text-center text-sm font-bold ${g.rate >= 75 ? 'text-emerald-600' : g.rate >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                    {g.rate}%
                  </span>
                  <span className="col-span-1 text-center text-xs text-gray-400">-</span>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽 사이드바 */}
          <div className="w-64 space-y-4 shrink-0">
            {/* 현재 레벨/미션 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">현재 진행 상황</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="font-black text-indigo-700 text-sm">Lv{s.level}</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400">현재 미션</p>
                  <p className={`text-sm font-bold ${MISSION_COLORS[s.currentMission].replace('bg-', 'text-').replace('-100', '-700').split(' ')[0]}`}>
                    {MISSION_LABELS[s.currentMission]}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <AbilityGauge label="이해력" value={s.comprehension} color="text-blue-500" />
                <AbilityGauge label="추론력" value={s.reasoning}     color="text-violet-500" />
                <AbilityGauge label="계산력" value={s.calculation}   color="text-emerald-500" />
              </div>
            </div>

            {/* 난이도별 통계 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">미션 단계별 정답률</h3>
              <div className="space-y-2.5">
                {([
                  ['concept_learning', '개념익히기', 86],
                  ['concept_problem',  '개념확인',  70],
                  ['basic_problem',    '기본문제',  70],
                ] as [MissionType, string, number][]).map(([, label, rate]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">{label}</span>
                      <span className={`font-semibold ${rate >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>{rate}%</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${rate >= 75 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 활동 요약 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">최근 활동</h3>
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>마지막 미션 입력</span>
                  <span className="font-medium text-gray-700">{MOCK_RESULTS[0].date}</span>
                </div>
                <div className="flex justify-between">
                  <span>총 학습 횟수</span>
                  <span className="font-medium text-gray-700">{MOCK_RESULTS.length + MOCK_GRADING.length}회</span>
                </div>
                <div className="flex justify-between">
                  <span>미션 클리어</span>
                  <span className="font-medium text-indigo-600">{MOCK_RESULTS.filter(r => r.cleared).length}회</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 능력치 분석 탭 ── */}
      {tab === 'ability' && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '이해력', value: s.comprehension, color: 'indigo', desc: '개념 이해 및 문제 파악 능력' },
            { label: '추론력', value: s.reasoning,     color: 'violet', desc: '논리적 사고 및 풀이 과정 능력' },
            { label: '계산력', value: s.calculation,   color: 'emerald', desc: '정확하고 빠른 계산 능력' },
          ].map(a => (
            <div key={a.label} className="bg-white border border-gray-200 rounded-xl p-6 text-center">
              <p className="text-sm text-gray-500 mb-2">{a.label}</p>
              <p className={`text-5xl font-black text-${a.color}-600 mb-1`}>{a.value}</p>
              <p className="text-xs text-gray-400 mb-4">{a.desc}</p>
              <div className="bg-gray-100 rounded-full h-3">
                <div className={`h-3 rounded-full bg-${a.color}-400`} style={{ width: `${a.value}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{a.value} / 100</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 채점 이력 탭 ── */}
      {tab === 'grading' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
              {MOCK_GRADING.map(g => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-gray-400 text-xs">{g.date}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-800">{g.textbook}</td>
                  <td className="px-5 py-3.5 text-center text-gray-600">{g.problems}문제</td>
                  <td className="px-5 py-3.5 text-center text-gray-600">{g.correct}개</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`font-bold text-sm ${g.rate >= 80 ? 'text-emerald-600' : g.rate >= 65 ? 'text-amber-600' : 'text-red-500'}`}>
                      {g.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
