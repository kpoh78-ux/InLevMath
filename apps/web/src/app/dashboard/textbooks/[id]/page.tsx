'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

type ProblemType = 'multiple' | 'short'

type Problem = {
  id: string; number: number; unit: string; type: ProblemType; answer: string
}

type Student = { id: string; name: string; grade: string }

type TextbookResult = {
  studentId: string; studentName: string
  wrongProblemsJson: string; submittedAt: string
}

type TextbookData = {
  id: string; title: string; grade: string; publisher: string
  problems: Problem[]
  results: TextbookResult[]
  students: Student[]
}

type Tab = 'answers' | 'grading'

function TextbookDetailPageInner() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const preselectedStudent = searchParams.get('student')

  const [data, setData] = useState<TextbookData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(preselectedStudent ? 'grading' : 'answers')

  const [problems, setProblems] = useState<Problem[]>([])
  const [savingProblems, setSavingProblems] = useState(false)
  const [newUnit, setNewUnit] = useState('')

  const [selectedStudentId, setSelectedStudentId] = useState<string>(preselectedStudent ?? '')
  const [wrongSet, setWrongSet] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [gradedResult, setGradedResult] = useState<{
    correctRate: number
    newAbility: { comprehension: number; reasoning: number; calculation: number }
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/textbooks/${id}`)
      if (res.ok) {
        const d: TextbookData = await res.json()
        setData(d)
        setProblems(d.problems)
        // 선택된 학생의 기존 채점 결과 불러오기
        const initStudentId = preselectedStudent ?? (d.students[0]?.id ?? '')
        setSelectedStudentId(initStudentId)
        loadStudentResult(d, initStudentId)
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  function loadStudentResult(d: TextbookData, studentId: string) {
    const existing = d.results.find(r => r.studentId === studentId)
    if (existing) {
      try {
        const wrong: number[] = JSON.parse(existing.wrongProblemsJson)
        setWrongSet(new Set(wrong))
      } catch { setWrongSet(new Set()) }
    } else {
      setWrongSet(new Set())
    }
    setGradedResult(null)
  }

  const selectStudent = (studentId: string) => {
    setSelectedStudentId(studentId)
    if (data) loadStudentResult(data, studentId)
  }

  // ── 정답 입력 탭 ─────────────────────────────────────────────

  const setAnswer = (problemId: string, answer: string) =>
    setProblems(prev => prev.map(p => p.id === problemId ? { ...p, answer } : p))

  const setType = (problemId: string, type: ProblemType) =>
    setProblems(prev => prev.map(p => p.id === problemId ? { ...p, type, answer: '' } : p))

  const setUnit = (problemId: string, unit: string) =>
    setProblems(prev => prev.map(p => p.id === problemId ? { ...p, unit } : p))

  const addProblem = () => {
    const nextNum = (problems[problems.length - 1]?.number ?? 0) + 1
    setProblems(prev => [...prev, {
      id: `new_${Date.now()}`, number: nextNum,
      unit: newUnit || '', type: 'multiple', answer: '',
    }])
  }

  const deleteProblem = (problemId: string) =>
    setProblems(prev => prev.filter(p => p.id !== problemId).map((p, i) => ({ ...p, number: i + 1 })))

  const saveProblems = async () => {
    setSavingProblems(true)
    try {
      const res = await apiFetch(`/api/textbooks/${id}/problems`, {
        method: 'PUT',
        body: JSON.stringify({ problems }),
      })
      if (res.ok) {
        await fetchData()
        alert('정답이 저장되었습니다.')
      } else {
        alert('저장 실패')
      }
    } finally { setSavingProblems(false) }
  }

  // ── 채점 탭 ──────────────────────────────────────────────────

  const toggleProblem = (num: number) => {
    setWrongSet(prev => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  const submitGrade = async () => {
    if (!selectedStudentId) { alert('학생을 선택해주세요.'); return }
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/teacher/grade/textbook/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudentId,
          wrongProblems: Array.from(wrongSet),
        }),
      })
      if (res.ok) {
        const result = await res.json()
        setGradedResult(result)
        await fetchData()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '채점 저장 실패')
      }
    } finally { setSubmitting(false) }
  }

  const getStudentResult = (studentId: string) => {
    if (!data) return null
    return data.results.find(r => r.studentId === studentId) ?? null
  }

  const getCorrectRate = (result: TextbookResult | null) => {
    if (!result || !problems.length) return null
    try {
      const wrong: number[] = JSON.parse(result.wrongProblemsJson)
      return Math.round(((problems.length - wrong.length) / problems.length) * 100)
    } catch { return null }
  }

  const answeredCount = problems.filter(p => p.answer !== '').length
  const selectedStudent = data?.students.find(s => s.id === selectedStudentId)
  const units = [...new Set(problems.map(p => p.unit || '단원 미지정'))]

  if (loading) {
    return <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
  }
  if (!data) {
    return <div className="py-20 text-center text-gray-400 text-sm">교재를 찾을 수 없습니다.</div>
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href={preselectedStudent ? `/dashboard/textbooks?student=${preselectedStudent}` : '/dashboard/textbooks'}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← 교재 목록
        </Link>
        <span className="text-gray-300">|</span>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{data.title}</h1>
          <p className="text-xs text-gray-400">
            {data.grade} · {data.publisher} · 총 {problems.length}문제
            {tab === 'answers' && ` (정답 입력: ${answeredCount}문제)`}
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {([['answers', '정답 입력'], ['grading', '학생 채점']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 정답 입력 탭 ── */}
      {tab === 'answers' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700">
            객관식: 1~5 중 정답 번호 클릭 / 주관식: 정답 직접 입력
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium w-12">번호</th>
                  <th className="px-4 py-3 text-left font-medium">단원</th>
                  <th className="px-4 py-3 text-left font-medium w-28">유형</th>
                  <th className="px-4 py-3 text-left font-medium">정답</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {problems.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-gray-700">{p.number}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text" value={p.unit}
                        onChange={e => setUnit(p.id, e.target.value)}
                        placeholder="단원명"
                        className="text-xs text-gray-500 bg-transparent outline-none w-full border-b border-transparent focus:border-gray-300 pb-0.5"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => setType(p.id, 'multiple')}
                          className={`text-xs px-2 py-1 rounded transition-colors ${p.type === 'multiple' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          객관식
                        </button>
                        <button onClick={() => setType(p.id, 'short')}
                          className={`text-xs px-2 py-1 rounded transition-colors ${p.type === 'short' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          주관식
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {p.type === 'multiple' ? (
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => setAnswer(p.id, String(n))}
                              className={`w-8 h-8 rounded-full text-sm font-bold transition-colors border ${
                                p.answer === String(n)
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                              }`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input type="text" value={p.answer}
                          onChange={e => setAnswer(p.id, e.target.value)}
                          placeholder="정답 입력"
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deleteProblem(p.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <input type="text" value={newUnit} onChange={e => setNewUnit(e.target.value)}
              placeholder="단원명 (선택)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={addProblem}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + 문제 추가
            </button>
            <button onClick={saveProblems} disabled={savingProblems}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors ml-auto disabled:opacity-50">
              {savingProblems ? '저장 중...' : '정답 저장'}
            </button>
          </div>
        </div>
      )}

      {/* ── 학생 채점 탭 ── */}
      {tab === 'grading' && (
        <div className="flex gap-4">
          {/* 왼쪽: 채점 패널 */}
          <div className="flex-1 space-y-3">
            {/* 학생 선택 */}
            {data.students.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">
                등록된 재원 학생이 없습니다.
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {data.students.map(s => (
                    <button key={s.id} onClick={() => selectStudent(s.id)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                        selectedStudentId === s.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>

                {/* 현재 학생 점수 요약 */}
                {selectedStudent && (
                  <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                        {selectedStudent.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{selectedStudent.name}</p>
                        <p className="text-xs text-gray-400">{selectedStudent.grade}</p>
                      </div>
                    </div>
                    {gradedResult ? (
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className={`text-2xl font-black ${gradedResult.correctRate >= 80 ? 'text-emerald-600' : gradedResult.correctRate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                            {gradedResult.correctRate}%
                          </p>
                          <p className="text-xs text-gray-400">정답률</p>
                        </div>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <p>이해력 <span className="font-bold text-indigo-600">{gradedResult.newAbility.comprehension.toFixed(1)}</span></p>
                          <p>추론력 <span className="font-bold text-indigo-600">{gradedResult.newAbility.reasoning.toFixed(1)}</span></p>
                          <p>계산력 <span className="font-bold text-indigo-600">{gradedResult.newAbility.calculation.toFixed(1)}</span></p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>
                          틀린 문제:
                          <span className="font-bold text-rose-500 ml-1">{wrongSet.size}개</span>
                        </span>
                        <span>
                          맞은 문제:
                          <span className="font-bold text-emerald-600 ml-1">{problems.length - wrongSet.size}개</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 문제 O/X 채점 목록 */}
                {problems.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">
                    먼저 "정답 입력" 탭에서 문제를 등록하세요.
                  </div>
                ) : (
                  <>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {units.map(unit => {
                        const unitProblems = problems.filter(p => (p.unit || '단원 미지정') === unit)
                        return (
                          <div key={unit}>
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                              <span className="text-xs font-semibold text-gray-500">{unit}</span>
                            </div>
                            {unitProblems.map(p => {
                              const isWrong = wrongSet.has(p.number)
                              return (
                                <div key={p.id}
                                  className={`flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                                    isWrong ? 'bg-red-50/50' : wrongSet.size > 0 || gradedResult ? 'bg-blue-50/30' : ''
                                  }`}>
                                  <div className="w-8 text-sm font-bold text-gray-600">{p.number}</div>
                                  <div className="flex-1">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      p.type === 'multiple' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'
                                    }`}>
                                      {p.type === 'multiple'
                                        ? `객관식${p.answer ? ` ${p.answer}번` : ''}`
                                        : `주관식${p.answer ? `: ${p.answer}` : ''}`}
                                    </span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => { if (!isWrong) return; toggleProblem(p.number) }}
                                      className={`w-10 h-10 rounded-full text-lg font-black transition-all border-2 ${
                                        !isWrong
                                          ? 'bg-blue-500 text-white border-blue-500 scale-105'
                                          : 'border-gray-200 text-gray-300 hover:border-blue-400 hover:text-blue-400'
                                      }`}>
                                      O
                                    </button>
                                    <button
                                      onClick={() => { if (isWrong) return; toggleProblem(p.number) }}
                                      className={`w-10 h-10 rounded-full text-lg font-black transition-all border-2 ${
                                        isWrong
                                          ? 'bg-red-500 text-white border-red-500 scale-105'
                                          : 'border-gray-200 text-gray-300 hover:border-red-400 hover:text-red-400'
                                      }`}>
                                      X
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex justify-end">
                      <button onClick={submitGrade} disabled={submitting}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                        {submitting ? '저장 중...' : '채점 완료'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* 오른쪽: 전체 학생 채점 현황 */}
          <div className="w-52 space-y-2 shrink-0">
            <h3 className="text-sm font-semibold text-gray-700">전체 채점 현황</h3>
            {data.students.length === 0 && (
              <p className="text-xs text-gray-400">학생이 없습니다.</p>
            )}
            {data.students.map(s => {
              const result = getStudentResult(s.id)
              const rate = getCorrectRate(result)
              return (
                <button key={s.id} onClick={() => selectStudent(s.id)}
                  className={`w-full text-left bg-white border rounded-xl p-3 transition-colors hover:border-indigo-300 ${selectedStudentId === s.id ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-800 text-sm">{s.name}</span>
                    <span className={`text-sm font-black ${
                      rate === null ? 'text-gray-300'
                      : rate >= 80 ? 'text-emerald-600'
                      : rate >= 60 ? 'text-amber-600'
                      : 'text-red-500'}`}>
                      {rate !== null ? `${rate}%` : '-'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {result ? `채점 완료` : '미채점'}
                  </div>
                  {rate !== null && (
                    <div className="mt-1.5 bg-gray-100 rounded-full h-1">
                      <div className="bg-indigo-500 h-1 rounded-full transition-all" style={{ width: `${rate}%` }} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TextbookDetailPage() {
  return (
    <Suspense>
      <TextbookDetailPageInner />
    </Suspense>
  )
}
