'use client'

// apps/web/src/components/lesson/ObservationInput.tsx
//
// 학습 관찰 입력 — 선생님이 수업 중 본 것을 그대로 적는다.
//
// ── 왜 선생님이 넣나 ────────────────────────────────────────────────────────
// 예전에는 학생 앱에서 스스로 넣었다. 그런데 문제 수와 맞은 개수를 학생이 직접
// 적으면 확인할 방법이 없다. 학습지·교재는 정답이 저장돼 있어 자동 채점되지만,
// 그 밖의 학습(개념 설명 뒤 확인문제, 구두 문답, 오답 다시 풀기 같은 것)은
// 선생님이 옆에서 본 것을 적는 수밖에 없다.
//
// 여기서 넣은 결과는 학생의 능력치(이해력·추론력·계산력)를 올리고,
// 기준 정답률을 넘으면 다음 미션이 열린다.

import { useState } from 'react'
import { apiFetch } from '@/lib/api'
import {
  MISSION_ORDER, MISSION_LABELS, MISSION_CLEAR_THRESHOLD,
  type MissionType,
} from '@inlevmath/shared'

/** 어디서 푼 문제인가 — MissionResult.source 와 같은 값 */
const SOURCES = [
  { value: 'textbook', label: '교재' },
  { value: 'worksheet', label: '학습지' },
  { value: 'manual', label: '직접 출제' },
] as const

type Props = {
  studentId: string
  studentName: string
  /** 지금 진행 중인 미션 — 기본 선택값으로 쓴다 */
  currentMission?: MissionType
  /** 저장 후 상위 화면을 새로고침한다 */
  onSaved?: () => void
}

export function ObservationInput({ studentId, studentName, currentMission, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [mission, setMission] = useState<MissionType>(currentMission ?? MISSION_ORDER[0])
  const [source, setSource] = useState<string>('manual')
  const [total, setTotal] = useState('')
  const [correct, setCorrect] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ rate: number; cleared: boolean } | null>(null)

  const t = Number(total)
  const c = Number(correct)
  const valid =
    Number.isInteger(t) && t > 0 && t <= 200 &&
    Number.isInteger(c) && c >= 0 && c <= t
  // 입력하는 동안 결과를 미리 보여 준다 — 잘못 적었을 때 저장 전에 알아챈다
  const rate = valid ? Math.round((c / t) * 100) : null
  const threshold = MISSION_CLEAR_THRESHOLD[mission]

  const reset = () => {
    setTotal(''); setCorrect(''); setError(''); setDone(null)
  }

  const save = async () => {
    if (!valid) {
      setError('총 문제 수와 맞은 개수를 확인하세요. (맞은 개수는 총 문제 수를 넘을 수 없습니다)')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch('/api/missions/results', {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          missionType: mission,
          totalProblems: t,
          correctProblems: c,
          source,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d?.error ?? '저장에 실패했습니다.')
        return
      }
      setDone({ rate: d.correctRate ?? rate ?? 0, cleared: Boolean(d.missionCleared) })
      setTotal(''); setCorrect('')
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="px-5 pb-4">
        <button
          onClick={() => { setOpen(true); reset() }}
          className="w-full border-2 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50
                     rounded-xl py-2.5 text-sm font-semibold transition-colors"
        >
          + 학습 관찰 입력
          <span className="ml-1.5 text-xs font-normal text-violet-400">
            수업 중 푼 문제를 기록합니다
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 pb-4">
      <div className="border border-violet-200 bg-violet-50/50 rounded-xl px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-violet-900">
            학습 관찰 입력
            <span className="ml-1.5 text-xs font-normal text-violet-500">{studentName}</span>
          </p>
          <button onClick={() => setOpen(false)}
            className="text-violet-400 hover:text-violet-700 text-lg leading-none">×</button>
        </div>

        {/* 미션 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">미션 단계</label>
          <div className="flex flex-wrap gap-1.5">
            {MISSION_ORDER.map(m => (
              <button key={m} type="button" onClick={() => setMission(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap
                  ${mission === m
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-violet-300'}`}>
                {MISSION_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* 어디서 푼 문제인가 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">문제 출처</label>
          <div className="flex gap-1.5">
            {SOURCES.map(s => (
              <button key={s.value} type="button" onClick={() => setSource(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                  ${source === s.value
                    ? 'bg-gray-800 border-gray-800 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 문제 수 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">총 문제 수</label>
            <input type="number" min={1} max={200} inputMode="numeric" value={total}
              onChange={e => { setTotal(e.target.value); setDone(null) }}
              placeholder="예) 20"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">맞은 개수</label>
            <input type="number" min={0} max={200} inputMode="numeric" value={correct}
              onChange={e => { setCorrect(e.target.value); setDone(null) }}
              placeholder="예) 17"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>

        {/* 저장 전 미리보기 — 잘못 적었으면 여기서 알아챈다 */}
        {rate != null && (
          <div className={`rounded-lg px-3 py-2 text-xs font-semibold border ${
            rate >= threshold
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            정답률 {rate}% · 클리어 기준 {threshold}%
            {rate >= threshold ? ' — 저장하면 다음 미션이 열립니다' : ' — 아직 기준에 못 미칩니다'}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        {done && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            저장했습니다 — 정답률 {done.rate}%
            {done.cleared ? ' · 미션을 클리어해 다음 단계가 열렸습니다.' : ''}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={() => setOpen(false)}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium
                       hover:bg-white transition-colors">
            닫기
          </button>
          <button onClick={save} disabled={saving || !valid}
            className="flex-1 bg-violet-600 text-white rounded-lg py-2.5 text-sm font-semibold
                       hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
