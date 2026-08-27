'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  UNIT_STEPS, EXAM_STEPS, STEP_SUB_TYPES, stepNeedsSubType, stepDisplayLabel,
  type WorksheetStep,
} from '@inlevmath/shared'
import { apiFetch } from '@/lib/api'
import { IMAGE_ANSWER_MARKER, isImageAnswer } from '@/lib/answers'
import {
  AnswerLightbox, AnswerThumb, SnapshotHint, SymbolPalette,
  AttachImageButton, RemoveImageButton, useSymbolPalette, useImageAttach, ChoicePalette,
} from '@/components/AnswerInput'
import { WorksheetUploadModal } from '@/components/WorksheetUploadModal'
import { WorksheetAiAnswersModal } from '@/components/WorksheetAiAnswersModal'
import { compareWorksheets, WS_GRADE_ORDER } from '@/lib/worksheetSort'
import type { WorksheetFile } from '@/lib/worksheetFiles'

type WorksheetCategory = '단원별' | '내신대비'

type Worksheet = {
  id: string; title: string; grade: string; unit: string
  problemCount: number; createdAt: string; source: string
  category: WorksheetCategory; step: string
  examSubType?: string | null
  answersJson?: string | null
}

type Distribution = {
  id: string
  status: string
  distributedAt: string
  worksheet: {
    id: string; title: string; grade: string; unit: string
    step: string; problemCount: number; answersJson?: string | null
  }
  result: {
    correctProblems: number
    wrongProblemsJson: string
    gradedBy: string
    submittedAt: string
    studentAnswersJson?: string
    pendingProblemsJson?: string
    submittedCount?: number
  } | null
}

type StudentInfo = { id: string; name: string; grade: string }

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3']

const STEP_BADGE: Record<string, string> = {
  '기초': 'bg-sky-50 text-sky-600 border-sky-200',
  '기본': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  '발전': 'bg-amber-50 text-amber-600 border-amber-200',
  '최상위': 'bg-rose-50 text-rose-600 border-rose-200',
  '최다빈출': 'bg-violet-50 text-violet-600 border-violet-200',
  '최다오답': 'bg-orange-50 text-orange-600 border-orange-200',
  '서술형': 'bg-pink-50 text-pink-600 border-pink-200',
  '모의고사': 'bg-teal-50 text-teal-600 border-teal-200',
  '기출문제': 'bg-cyan-50 text-cyan-600 border-cyan-200',
}

const STATUS_LABEL: Record<string, string> = {
  distributed: '미채점',
  submitted: '제출됨',
  graded: '채점완료',
}
const STATUS_BADGE: Record<string, string> = {
  distributed: 'bg-gray-100 text-gray-500',
  submitted: 'bg-amber-50 text-amber-600',
  graded: 'bg-emerald-50 text-emerald-600',
}

const hasAnswers = (w: Worksheet) => {
  if (!w.answersJson) return false
  try {
    const arr: string[] = JSON.parse(w.answersJson)
    return arr.some(a => a.trim() !== '')
  } catch { return false }
}


// 정렬 규칙은 lib/worksheetSort.ts 에 모아 배포·수업준비 화면과 공유한다

// ── 학생 모드: 학생 배포 학습지 목록 + 채점 ─────────────────────────────────

function StudentWorksheetView({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [loading, setLoading] = useState(true)

  // 채점 모달
  const [gradingDist, setGradingDist] = useState<Distribution | null>(null)
  // 채점 상태는 세 가지다: 미채점 / O(맞음) / X(틀림)
  //   marked  — 선생님이 판정을 내린 문제
  //   wrongSet— 그중 틀린 문제
  // 예전엔 wrongSet 하나뿐이라 '미채점'을 나타낼 수 없었고,
  // 그래서 '전체 취소'가 '전체 정답'과 똑같이 동작했다.
  const [wrongSet, setWrongSet] = useState<Set<number>>(new Set())
  const [markedSet, setMarkedSet] = useState<Set<number>>(new Set())
  // 학생이 낸 답 (1번부터). 선생님이 정답과 대조해 O/X를 고칠 때 쓴다
  const [studentAnswers, setStudentAnswers] = useState<string[]>([])
  // 자동 채점이 판정하지 못해 선생님 판단이 필요한 문항
  const [pendingSet, setPendingSet] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [gradedResult, setGradedResult] = useState<{ correctRate: number; newAbility: { comprehension: number; reasoning: number; calculation: number } } | null>(null)
  const [answerImages, setAnswerImages] = useState<Record<number, string>>({})
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  const fetchStudentWorksheets = useCallback(async () => {
    setLoading(true)
    // 학생을 바꾸는 즉시 이전 학생의 화면이 남아있지 않도록 비운다
    setStudent(null)
    setDistributions([])
    try {
      const res = await apiFetch(`/api/students/${studentId}/worksheets`)
      if (res.ok) {
        const data = await res.json()
        setStudent(data.student)
        setDistributions(data.distributions)
      } else {
        console.error('[StudentWorksheetView] 학습지 조회 실패', res.status)
      }
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { fetchStudentWorksheets() }, [fetchStudentWorksheets])

  const openGrading = async (dist: Distribution) => {
    const existing: number[] = dist.result ? JSON.parse(dist.result.wrongProblemsJson) : []
    setWrongSet(new Set(existing))
    const parse = <T,>(json: string | undefined, fallback: T): T => {
      if (!json) return fallback
      try { return JSON.parse(json) as T } catch { return fallback }
    }
    const stuAnswers = parse<string[]>(dist.result?.studentAnswersJson, [])
    const pending = parse<number[]>(dist.result?.pendingProblemsJson, [])
    setStudentAnswers(stuAnswers)
    setPendingSet(new Set(pending))

    // 이미 채점된 학습지는 판정이 끝난 문항만 표시한다.
    // 보류 문항과 학생이 아직 안 낸 문항은 '미채점'으로 두어 선생님이 직접 정하게 한다
    const pendingNos = new Set(pending)
    setMarkedSet(dist.result
      ? new Set(
          Array.from({ length: dist.worksheet.problemCount }, (_, i) => i + 1)
            .filter(no => {
              if (pendingNos.has(no)) return false
              // 학생 답안이 있는 건이면 안 낸 문항은 판정 대상이 아니다
              if (stuAnswers.length > 0) return (stuAnswers[no - 1] ?? '') !== ''
              return true
            })
        )
      : new Set())
    setGradedResult(null)
    setAnswerImages({})
    setGradingDist(dist)

    // 서술형 이미지 정답은 별도 저장이라 따로 불러온다
    const res = await apiFetch(`/api/worksheets/${dist.worksheet.id}/answers`)
    if (res.ok) {
      const data = await res.json()
      setAnswerImages(data.images ?? {})
    }
  }

  /** 미채점 → O(맞음) → X(틀림) → 미채점 순으로 돈다 */
  const toggleProblem = (num: number) => {
    const marked = markedSet.has(num)
    const wrong = wrongSet.has(num)

    if (!marked) {                     // 미채점 → O
      setMarkedSet(prev => new Set(prev).add(num))
      setWrongSet(prev => { const n = new Set(prev); n.delete(num); return n })
    } else if (!wrong) {               // O → X
      setWrongSet(prev => new Set(prev).add(num))
    } else {                           // X → 미채점
      setMarkedSet(prev => { const n = new Set(prev); n.delete(num); return n })
      setWrongSet(prev => { const n = new Set(prev); n.delete(num); return n })
    }
  }

  const allNums = () =>
    new Set(Array.from({ length: gradingDist?.worksheet.problemCount ?? 0 }, (_, i) => i + 1))

  const allCorrect = () => { setMarkedSet(allNums()); setWrongSet(new Set()) }
  const allWrong = () => { setMarkedSet(allNums()); setWrongSet(allNums()) }

  /** 전체 취소 — 판정을 모두 지워 미채점으로 되돌린다 */
  const resetGrading = () => { setMarkedSet(new Set()); setWrongSet(new Set()) }

  const submitGrade = async () => {
    if (!gradingDist) return

    // 미채점이 남아 있으면 맞은 것으로 처리된다. 모르고 넘어가지 않게 확인받는다
    const unmarked = gradingDist.worksheet.problemCount - markedSet.size
    if (unmarked > 0 && !confirm(
      `아직 채점하지 않은 문제가 ${unmarked}개 있습니다.
맞은 것으로 처리하고 저장할까요?`
    )) return

    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/teacher/grade/${gradingDist.id}`, {
        method: 'POST',
        body: JSON.stringify({
          wrongProblems: Array.from(wrongSet),
          markedProblems: Array.from(markedSet),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setGradedResult(data)
        await fetchStudentWorksheets()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '채점 저장 실패')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const answers: string[] = gradingDist?.worksheet.answersJson
    ? (() => { try { return JSON.parse(gradingDist.worksheet.answersJson!) } catch { return [] } })()
    : []

  if (loading) {
    return <div className="py-16 text-center text-gray-400 text-sm">불러오는 중...</div>
  }

  return (
    <div className="space-y-4">
      {/* 학생 필터 해제 — 좌측 사이드바에서 학생을 고르면 이 필터가 탭을 옮겨도 유지되므로,
          전체 학습지 목록(업로드/등록)으로 돌아갈 수 있는 명시적인 출구가 필요하다 */}
      <Link href="/dashboard/worksheets"
        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
        ← 전체 학습지 목록으로
      </Link>

      {/* 학생 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
          {student?.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{student?.name} 학생 학습지</h1>
          <p className="text-sm text-gray-500">{student?.grade} · 배포된 학습지 {distributions.length}개</p>
        </div>
      </div>

      {/* 배포 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 whitespace-nowrap">
              <th className="px-5 py-3 text-left font-medium">학습지명</th>
              <th className="px-4 py-3 text-left font-medium w-28">단계</th>
              <th className="px-4 py-3 text-center font-medium w-20">문제 수</th>
              <th className="px-4 py-3 text-center font-medium w-24">상태</th>
              <th className="px-4 py-3 text-center font-medium w-20">정답률</th>
              <th className="px-4 py-3 text-left font-medium w-28">배포일</th>
              <th className="px-4 py-3 text-left font-medium w-28">채점</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {distributions.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                배포된 학습지가 없습니다.
              </td></tr>
            ) : distributions.map(d => {
              const rate = d.result
                ? Math.round((d.result.correctProblems / d.worksheet.problemCount) * 100)
                : null
              return (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-gray-800">{d.worksheet.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{d.worksheet.grade} · {d.worksheet.unit}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded border ${STEP_BADGE[d.worksheet.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {d.worksheet.step}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-700 font-medium">{d.worksheet.problemCount}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-block whitespace-nowrap text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {rate !== null ? (
                      <span className={`text-sm font-bold ${rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {rate}%
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(d.distributedAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => openGrading(d)}
                      className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors whitespace-nowrap
                        ${d.status === 'graded'
                          ? 'text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                          : 'text-white bg-indigo-600 border-indigo-600 hover:bg-indigo-700'}`}
                    >
                      {d.status === 'graded' ? '재채점' : 'O/X 채점'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── O/X 채점 모달 ── */}
      {gradingDist && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">O/X 채점</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{gradingDist.worksheet.title}</span>
                  <span className="mx-1.5 text-gray-300">·</span>
                  {student?.name} · 총 {gradingDist.worksheet.problemCount}문제
                </p>
                {pendingSet.size > 0 && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    자동 채점이 판정하지 못한 {pendingSet.size}문제가 있습니다 — 노란 칸을 확인해주세요
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  누를 때마다 <span className="text-gray-400 font-medium">미채점</span> →
                  <span className="text-emerald-600 font-medium"> O</span> →
                  <span className="text-rose-500 font-medium"> X</span> 순으로 바뀝니다
                </p>
              </div>
              <button onClick={() => { setGradingDist(null); setGradedResult(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
            </div>

            {!gradedResult && (
              <div className="flex gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50/70">
                <button onClick={resetGrading}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">
                  전체 취소
                </button>
                <button onClick={allCorrect}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                  전체 정답
                </button>
                <button onClick={allWrong}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-rose-300 text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors">
                  전체 오답
                </button>
              </div>
            )}

            {gradedResult ? (
              /* 채점 완료 결과 화면 */
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                <div className={`text-5xl font-black ${gradedResult.correctRate >= 80 ? 'text-emerald-500' : gradedResult.correctRate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                  {gradedResult.correctRate}%
                </div>
                <p className="text-gray-600 text-sm">
                  {gradingDist.worksheet.problemCount}문제 중&nbsp;
                  <span className="font-bold text-gray-800">{Math.round(gradedResult.correctRate / 100 * gradingDist.worksheet.problemCount)}</span>개 정답
                </p>
                <div className="w-full bg-gray-100 rounded-xl p-4 mt-2 grid grid-cols-3 gap-3 text-center">
                  {([
                    ['이해력', gradedResult.newAbility.comprehension],
                    ['추론력', gradedResult.newAbility.reasoning],
                    ['계산력', gradedResult.newAbility.calculation],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="bg-white rounded-lg p-2.5 border border-gray-100">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="text-sm font-bold text-indigo-600 mt-0.5">{val.toFixed(1)}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setGradingDist(null); setGradedResult(null) }}
                  className="mt-4 bg-indigo-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
                  확인
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: gradingDist.worksheet.problemCount }, (_, i) => {
                      const num = i + 1
                      const isMarked = markedSet.has(num)
                      const isWrong = isMarked && wrongSet.has(num)
                      const isPending = pendingSet.has(num)
                      const stuAnswer = studentAnswers[i] ?? ''
                      const hasStudentAnswers = studentAnswers.length > 0
                      const answer = answers[i] ?? ''
                      const img = isImageAnswer(answer) ? answerImages[num] : undefined
                      return (
                        <div
                          key={num}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProblem(num)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProblem(num) }
                          }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-all cursor-pointer min-h-[46px]
                            ${!isMarked
                              ? (isPending ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white')
                              : isWrong
                                ? 'border-rose-400 bg-rose-50'
                                : 'border-emerald-300 bg-emerald-50'}`}
                        >
                          <span className={`text-lg font-black w-6 text-center leading-none shrink-0
                            ${!isMarked ? 'text-gray-300' : isWrong ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {!isMarked ? '·' : isWrong ? 'X' : 'O'}
                          </span>
                          <span className="text-xs font-semibold text-gray-500 w-8 tabular-nums shrink-0">{num}번</span>
                          {/* 학생 답 — 있을 때만. 없으면 기존처럼 정답만 보여준다 */}
                          {hasStudentAnswers && (
                            <span className="text-xs shrink-0 min-w-0 max-w-[42%] truncate text-left">
                              <span className="text-gray-400">학생 </span>
                              {stuAnswer ? (
                                <span className="font-semibold text-gray-800">{stuAnswer}</span>
                              ) : (
                                <span className="text-gray-300">미제출</span>
                              )}
                            </span>
                          )}
                          {img ? (
                            <AnswerThumb src={img} onZoom={setZoomSrc} />
                          ) : isImageAnswer(answer) ? (
                            <span className="text-xs text-gray-300 flex-1 text-left">이미지 정답</span>
                          ) : answer ? (
                            <span className="text-xs text-gray-400 truncate flex-1 text-left">정답: {answer}</span>
                          ) : (
                            <span className="text-xs text-gray-300 flex-1 text-left">정답 미등록</span>
                          )}
                          {isPending && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                              확인 필요
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="p-5 pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">맞은 문제</span>
                    <span className="font-bold text-emerald-600">
                      {markedSet.size - wrongSet.size}개
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">틀린 문제</span>
                    <span className="font-bold text-rose-500">{wrongSet.size}개</span>
                  </div>
                  {gradingDist.worksheet.problemCount - markedSet.size > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">미채점</span>
                      <span className="font-bold text-gray-400">
                        {gradingDist.worksheet.problemCount - markedSet.size}개
                      </span>
                    </div>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => { setGradingDist(null); setGradedResult(null) }}
                      className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                      취소
                    </button>
                    <button onClick={submitGrade} disabled={submitting}
                      className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                      {submitting ? '저장 중...' : '채점 완료'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <AnswerLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}

// ── 전체 학습지 관리 (기존 뷰) ───────────────────────────────────────────────


function AllWorksheetsView() {
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  // null이면 신규 등록, 값이 있으면 그 학습지 수정
  const [editingWs, setEditingWs] = useState<Worksheet | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  // AI 정답 추출 대상 파일. 검수를 마치면 정답이 pendingAnswers로 넘어온다
  const [aiFile, setAiFile] = useState<WorksheetFile | null>(null)
  const [pendingAnswers, setPendingAnswers] = useState<string[] | null>(null)
  const [form, setForm] = useState({
    title: '', grade: '', unit: '', problemCount: '',
    source: 'manual' as string,
    category: '단원별' as WorksheetCategory,
    step: '기초' as string,
    examSubType: '' as string,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({})

  const [answerWs, setAnswerWs] = useState<Worksheet | null>(null)
  const [answerInputs, setAnswerInputs] = useState<string[]>([])
  const [loadingAnswers, setLoadingAnswers] = useState(false)
  const [savingAnswers, setSavingAnswers] = useState(false)

  // 정답 이미지 (키: 1-based 문제 번호)
  const [answerImages, setAnswerImages] = useState<Record<number, string>>({})
  const [newImageNos, setNewImageNos] = useState<Set<number>>(new Set())
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  const fetchWorksheets = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await apiFetch('/api/worksheets')
      if (res.ok) setWorksheets(await res.json())
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { fetchWorksheets() }, [fetchWorksheets])

  const filtered = worksheets.filter(w =>
    (gradeFilter === '' || w.grade === gradeFilter) &&
    (w.title.toLowerCase().includes(search.toLowerCase()) || w.unit.includes(search))
  )

  const resetForm = () =>
    setForm({ title: '', grade: '', unit: '', problemCount: '', source: 'manual', category: '단원별', step: '기초', examSubType: '' })

  const closeWsModal = () => {
    setShowAddModal(false)
    setEditingWs(null)
    setSaveError('')
    setPendingAnswers(null)
    resetForm()
  }

  /** 수정 버튼 — 기존 값을 폼에 채우고 같은 모달을 연다 */
  const openEdit = (w: Worksheet) => {
    setEditingWs(w)
    setSaveError('')
    setForm({
      title: w.title, grade: w.grade, unit: w.unit === '종합' ? '' : w.unit,
      problemCount: String(w.problemCount), source: w.source,
      category: w.category, step: w.step, examSubType: w.examSubType ?? '',
    })
    setShowAddModal(true)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.grade) { alert('학년을 선택해주세요.'); return }
    const needsSub = stepNeedsSubType(form.step)
    if (needsSub && !form.examSubType) { alert(`${form.step} 유형을 선택해주세요.`); return }

    const payload = {
      title: form.title, category: form.category, step: form.step,
      examSubType: needsSub ? form.examSubType : null,
      grade: form.grade, unit: form.unit || '종합',
      problemCount: parseInt(form.problemCount), source: form.source,
    }

    // 문제 수를 줄이면 그 뒤 정답이 사라지므로 확인받는다
    if (editingWs && payload.problemCount < editingWs.problemCount && hasAnswers(editingWs)) {
      const ok = confirm(
        `문제 수를 ${editingWs.problemCount}개에서 ${payload.problemCount}개로 줄입니다.
` +
        `${payload.problemCount + 1}번 이후에 입력된 정답은 삭제됩니다. 계속할까요?`
      )
      if (!ok) return
    }

    setSaving(true); setSaveError('')
    try {
      const res = await apiFetch(
        editingWs ? `/api/worksheets/${editingWs.id}` : '/api/worksheets',
        { method: editingWs ? 'PATCH' : 'POST', body: JSON.stringify(payload) }
      )
      let data: { id?: string; error?: string } = {}
      try { data = await res.json() } catch { /* empty */ }
      if (!res.ok) { setSaveError(data.error || (editingWs ? '수정 실패' : '등록 실패')); return }

      // AI로 읽은 정답이 있으면 이어서 저장한다 (문제 수에 맞춰 자르거나 채움)
      if (pendingAnswers && data.id) {
        const fitted = Array.from({ length: payload.problemCount }, (_, i) => pendingAnswers[i] ?? '')
        const ansRes = await apiFetch(`/api/worksheets/${data.id}/answers`, {
          method: 'PUT',
          body: JSON.stringify({ answers: fitted }),
        })
        if (!ansRes.ok) {
          const d = await ansRes.json().catch(() => ({})) as { error?: string }
          alert(`학습지는 등록됐지만 정답 저장에 실패했습니다.\n${d.error || ''}\n정답 설정에서 다시 입력해주세요.`)
        }
      }

      await fetchWorksheets()
      closeWsModal()
    } finally { setSaving(false) }
  }

  const handleDelete = async (w: Worksheet) => {
    if (!confirm(`"${w.title}"을 삭제할까요?`)) return
    await apiFetch(`/api/worksheets/${w.id}`, { method: 'DELETE' })
    setWorksheets(prev => prev.filter(x => x.id !== w.id))
  }

  const setAnswerAt = useCallback((i: number, v: string) =>
    setAnswerInputs(prev => { const n = [...prev]; n[i] = v; return n }), [])

  const palette = useSymbolPalette<number>(setAnswerAt)

  const onImageAttached = useCallback((i: number, dataUrl: string) => {
    setAnswerImages(prev => ({ ...prev, [i + 1]: dataUrl }))
    setNewImageNos(prev => new Set(prev).add(i + 1))
    setAnswerAt(i, IMAGE_ANSWER_MARKER)
    // 입력칸이 사라지므로 기호 팔레트 대상에서 제외
    palette.release(i)
  }, [setAnswerAt, palette])

  const attach = useImageAttach<number>(onImageAttached)

  const closeAnswers = () => {
    setAnswerWs(null)
    setAnswerImages({})
    setNewImageNos(new Set())
    palette.setFocusedKey(null)
  }

  const openAnswers = async (w: Worksheet) => {
    setAnswerWs(w)
    setAnswerImages({})
    setNewImageNos(new Set())
    palette.setFocusedKey(null)
    setLoadingAnswers(true)
    try {
      const res = await apiFetch(`/api/worksheets/${w.id}/answers`)
      if (res.ok) {
        const data = await res.json()
        const arr: string[] = data.answers ?? []
        setAnswerInputs(Array(w.problemCount).fill('').map((_, i) => arr[i] ?? ''))
        setAnswerImages(data.images ?? {})
      }
    } finally { setLoadingAnswers(false) }
  }

  const removeAnswerImage = (i: number) => {
    setAnswerImages(prev => { const n = { ...prev }; delete n[i + 1]; return n })
    setNewImageNos(prev => { const n = new Set(prev); n.delete(i + 1); return n })
    setAnswerAt(i, '')
  }

  const saveAnswers = async () => {
    if (!answerWs) return
    setSavingAnswers(true)
    try {
      // 새로 첨부한 이미지만 data URL로 올리고, 기존 이미지는 마커로 유지
      const payload = answerInputs.map((v, i) => {
        if (!isImageAnswer(v)) return v
        const no = i + 1
        return newImageNos.has(no) ? (answerImages[no] ?? '') : IMAGE_ANSWER_MARKER
      })

      const res = await apiFetch(`/api/worksheets/${answerWs.id}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ answers: payload }),
      })
      if (res.ok) {
        const data = await res.json() as { answers: string[] }
        setWorksheets(prev => prev.map(w =>
          w.id === answerWs.id ? { ...w, answersJson: JSON.stringify(data.answers) } : w))
        closeAnswers()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '저장 실패')
      }
    } finally { setSavingAnswers(false) }
  }

  const stepLabel = (w: Worksheet) => stepDisplayLabel(w.step, w.examSubType)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학습지 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">정답 설정 후 수업준비 → 학습지 배포에서 학생에게 배포하세요</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors mr-2 whitespace-nowrap">
          학습지 업로드
        </button>
        <button onClick={() => { setEditingWs(null); resetForm(); setSaveError(''); setShowAddModal(true) }}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
          <span className="text-base leading-none">+</span> 학습지 등록
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="학습지명, 단원 검색" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['', ...GRADE_OPTIONS].map(g => (
            <button key={g} onClick={() => setGradeFilter(g)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-500 hover:border-indigo-400'}`}>
              {g || '전체'}
            </button>
          ))}
        </div>
      </div>

      {/* 학년별 아코디언 */}
      {loadingList ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center text-gray-400 text-sm">
          {worksheets.length === 0
            ? '등록된 학습지가 없습니다. 오른쪽 상단 "+ 학습지 등록"을 눌러 추가하세요.'
            : '검색 결과가 없습니다.'}
        </div>
      ) : (() => {
        // 학년별 그룹 (단원 오름차순 정렬)
        const groups: Record<string, Worksheet[]> = {}
        filtered.forEach(w => {
          if (!groups[w.grade]) groups[w.grade] = []
          groups[w.grade].push(w)
        })
        Object.keys(groups).forEach(g => {
          groups[g].sort(compareWorksheets)
        })
        const sortedGrades = WS_GRADE_ORDER.filter(g => groups[g])

        return (
          <div className="space-y-2">
            {sortedGrades.map(grade => {
              const isOpen = expandedGrades[grade] ?? false
              const list = groups[grade]
              return (
                <div key={grade} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* 학년 헤더 */}
                  <button
                    onClick={() => setExpandedGrades(prev => ({ ...prev, [grade]: !isOpen }))}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : 'rotate-0'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-bold text-gray-700">{grade}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{list.length}개</span>
                    {list.some(w => !hasAnswers(w)) && (
                      <span className="text-[11px] text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        정답 미입력 {list.filter(w => !hasAnswers(w)).length}개
                      </span>
                    )}
                  </button>

                  {/* 학습지 목록 테이블 */}
                  {isOpen && (
                    <table className="w-full text-sm border-t border-gray-100">
                      <thead>
                        {/* 배지·날짜 칸은 줄바꿈 없이 한 줄로 나오도록 너비를 고정하고,
                            남는 폭은 학습지명이 가져간다 */}
                        <tr className="bg-gray-50 text-xs text-gray-400 whitespace-nowrap">
                          <th className="px-5 py-2.5 text-left font-medium">학습지명</th>
                          <th className="px-4 py-2.5 text-left font-medium w-40">단원</th>
                          <th className="px-4 py-2.5 text-left font-medium w-28">단계</th>
                          <th className="px-4 py-2.5 text-center font-medium w-20">문제 수</th>
                          <th className="px-4 py-2.5 text-center font-medium w-20">정답</th>
                          <th className="px-4 py-2.5 text-left font-medium w-28">등록일</th>
                          <th className="px-4 py-2.5 text-left font-medium w-36">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {list.map(w => (
                          <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="font-semibold text-gray-800 text-sm">{w.title}</div>
                              {w.source === 'mathflat' && (
                                <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">매쓰플랫</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{w.unit}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded border ${STEP_BADGE[w.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {stepLabel(w)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700 font-medium text-sm">{w.problemCount}</td>
                            <td className="px-4 py-3 text-center">
                              {hasAnswers(w)
                                ? <span className="inline-block whitespace-nowrap text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">입력됨</span>
                                : <span className="inline-block whitespace-nowrap text-[11px] text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">미입력</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(w.createdAt).toLocaleDateString('ko-KR')}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => openAnswers(w)}
                                  className="text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-400 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded transition-colors font-medium whitespace-nowrap">
                                  정답 설정
                                </button>
                                <button onClick={() => openEdit(w)}
                                  className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded transition-colors whitespace-nowrap">
                                  수정
                                </button>
                                <button onClick={() => handleDelete(w)}
                                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors whitespace-nowrap">
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* 학습지 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editingWs ? '학습지 수정' : '학습지 등록'}</h2>
              <button onClick={closeWsModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {pendingAnswers && (
              <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800 leading-relaxed">
                AI로 읽은 정답 <strong>{pendingAnswers.length}문항</strong>이 등록과 함께 저장됩니다.<br />
                학년·단원·단계를 고르고 등록해주세요.
              </div>
            )}
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">출처 *</label>
                <div className="flex gap-2">
                  {(['manual', 'mathflat'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, source: v }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.source === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {v === 'manual' ? '직접 제작' : '매쓰플랫'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">학습지명 *</label>
                <input type="text" required value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="예) 정수와 유리수 기초 확인"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">학년 *</label>
                <div className="flex flex-wrap gap-2">
                  {GRADE_OPTIONS.map(g => (
                    <button key={g} type="button" onClick={() => setForm(f => ({ ...f, grade: g }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.grade === g ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  단원명 <span className="text-gray-400 font-normal">(비워두면 &apos;종합&apos;)</span>
                </label>
                <input type="text" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="예) 정수와 유리수  (비워두면 '종합')"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">카테고리 *</label>
                <div className="flex gap-2">
                  {(['단원별', '내신대비'] as const).map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setForm(f => ({ ...f, category: cat, step: cat === '단원별' ? '기초' : '최다빈출', examSubType: '' }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.category === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">단계 *</label>
                <div className="flex flex-wrap gap-2">
                  {(form.category === '단원별' ? UNIT_STEPS : EXAM_STEPS).map(step => (
                    <button key={step} type="button"
                      onClick={() => setForm(f => ({ ...f, step, examSubType: '' }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.step === step ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {step}
                    </button>
                  ))}
                </div>
              </div>
              {/* 세부 유형이 있는 단계(모의고사·기출문제)만 유형 선택을 보여준다 */}
              {STEP_SUB_TYPES[form.step as WorksheetStep] && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">{form.step} 유형 *</label>
                  <div className="flex flex-wrap gap-2">
                    {STEP_SUB_TYPES[form.step as WorksheetStep]!.map(t => (
                      <button key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, examSubType: t }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.examSubType === t ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-300 text-gray-600 hover:border-teal-400'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">총 문제 수 *</label>
                <input type="number" required min={1} max={200} value={form.problemCount}
                  onChange={e => setForm(f => ({ ...f, problemCount: e.target.value }))}
                  placeholder="예) 24"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeWsModal}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button type="submit" disabled={saving || !form.grade}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? (editingWs ? '저장 중...' : '등록 중...') : (editingWs ? '수정 저장' : '등록 완료')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 정답 설정 모달 */}
      {answerWs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">정답 설정</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{answerWs.title}</span>
                  <span className="mx-1.5 text-gray-300">·</span>
                  총 {answerWs.problemCount}문제
                </p>
              </div>
              <button onClick={closeAnswers} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
            </div>

            {!loadingAnswers && (
              <>
                <div className="px-6 pt-4">
                  <p className="text-xs text-gray-400">
                    각 문제의 정답을 입력하세요
                    <span className="ml-2 text-gray-300">예: ①  15  2x+3  정삼각형</span>
                  </p>
                  <div className="mt-1"><SnapshotHint /></div>
                </div>

                {/* 객관식 빠른 입력 — 원문자 ①~⑤ (복수정답 지원) */}
                <div className="px-6 pt-3">
                  <ChoicePalette
                    value={palette.focusedKey !== null ? (answerInputs[palette.focusedKey] ?? '') : ''}
                    onChange={v => { if (palette.focusedKey !== null) setAnswerAt(palette.focusedKey, v) }}
                    disabled={palette.focusedKey === null}
                    hint={palette.focusedKey !== null ? `${palette.focusedKey + 1}번 칸` : undefined}
                  />
                </div>

                {/* 수식 기호 팔레트 — 마지막으로 클릭한 입력칸에 삽입 */}
                <div className="px-6 pt-3">
                  <SymbolPalette
                    onInsert={palette.insert}
                    disabled={palette.focusedKey === null}
                    hint={palette.focusedKey !== null ? `선택된 칸: ${palette.focusedKey + 1}번` : undefined}
                  />
                </div>
              </>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingAnswers ? (
                <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {answerInputs.map((ans, i) => {
                    const img = isImageAnswer(ans) ? answerImages[i + 1] : undefined
                    const busy = attach.busyKey === i
                    return (
                      <div
                        key={i}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => attach.handleDrop(i, e)}
                        className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 focus-within:border-indigo-400 focus-within:bg-indigo-50/30 transition-colors min-h-[46px]"
                      >
                        <span className="text-xs font-bold text-gray-400 w-8 shrink-0 tabular-nums">{i + 1}번</span>

                        {busy ? (
                          <span className="flex-1 text-xs text-gray-400">이미지 처리 중...</span>
                        ) : img ? (
                          <>
                            <AnswerThumb src={img} onZoom={setZoomSrc} className="flex-1" />
                            <RemoveImageButton onClick={() => removeAnswerImage(i)} />
                          </>
                        ) : (
                          <>
                            <input
                              ref={palette.registerRef(i)}
                              type="text"
                              value={ans}
                              onChange={e => setAnswerAt(i, e.target.value)}
                              onFocus={() => palette.setFocusedKey(i)}
                              onPaste={e => attach.handlePaste(i, e)}
                              placeholder="정답"
                              className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-300 min-w-0"
                            />
                            <AttachImageButton onClick={() => attach.openFilePicker(i)} />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 📷 버튼 공용 파일 선택기 */}
            <attach.FileInput />

            <div className="flex gap-3 p-6 pt-4 border-t border-gray-100">
              <button onClick={closeAnswers}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={saveAnswers} disabled={savingAnswers || loadingAnswers || attach.busyKey !== null}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {savingAnswers ? '저장 중...' : '정답 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <WorksheetUploadModal
          onClose={() => setShowUpload(false)}
          onPick={(f: WorksheetFile) => { setShowUpload(false); setAiFile(f) }}
        />
      )}

      {aiFile && (
        <WorksheetAiAnswersModal
          file={aiFile}
          onClose={() => setAiFile(null)}
          onConfirm={({ title, answers, majorUnit, middleUnit, minorUnit, section }) => {
            // 검수를 마친 정답 및 AI 자동 추출 단원/유형 메타데이터를 학습지 등록 폼에 자동 채움
            setAiFile(null)
            setPendingAnswers(answers)
            setEditingWs(null)
            setSaveError('')
            setForm({
              title, 
              grade: '', 
              unit: minorUnit || middleUnit || majorUnit || '', 
              problemCount: String(answers.length),
              source: 'manual', 
              category: '단원별', 
              step: section && ['기초', '기본', '발전', '최상위'].includes(section) ? (section as any) : '기본', 
              examSubType: '',
            })
            setShowAddModal(true)
          }}
        />
      )}

      <AnswerLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}

// ── 라우팅 진입점 ─────────────────────────────────────────────────────────────

function WorksheetsPageInner() {
  const searchParams = useSearchParams()
  const studentId = searchParams.get('student')

  // key로 studentId를 넘겨 학생을 바꿀 때마다 완전히 새로 마운트한다 —
  // props만 바뀌는 경우 이전 학생의 state가 잠깐이라도 남아 보일 여지를 원천 차단
  if (studentId) return <StudentWorksheetView key={studentId} studentId={studentId} />
  return <AllWorksheetsView />
}

export default function WorksheetsPage() {
  return (
    <Suspense>
      <WorksheetsPageInner />
    </Suspense>
  )
}
