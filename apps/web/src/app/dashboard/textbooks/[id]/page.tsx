'use client'

import { useState } from 'react'
import Link from 'next/link'

type ProblemType = 'multiple' | 'short'

type Problem = {
  id: string; number: number; unit: string
  type: ProblemType; answer: string
}

type Student = { id: string; name: string; grade: string }

type GradingMap = Record<string, Record<string, boolean | null>>
// gradingMap[studentId][problemId] = true(O) | false(X) | null(미채점)

// ── Mock 데이터 ──────────────────────────────────────────────
const MOCK_TEXTBOOK = { id: 't1', title: '일품 - 중등수학1(상)', grade: '중1-1', publisher: '좋은책신사고' }

const MOCK_STUDENTS: Student[] = [
  { id: 's1', name: '홍길동', grade: '중2' },
  { id: 's2', name: '김철수', grade: '중1' },
  { id: 's3', name: '이영희', grade: '중3' },
]

const INITIAL_PROBLEMS: Problem[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i + 1}`, number: i + 1,
  unit: i < 4 ? '소수와 합성수' : i < 7 ? '최대공약수와 최소공배수' : '정수와 유리수',
  type: i % 4 === 3 ? 'short' : 'multiple',
  answer: i % 4 === 3 ? '' : String((i % 5) + 1),
}))

// ── 탭 타입 ──
type Tab = 'answers' | 'grading'

export default function TextbookDetailPage() {
  const [tab, setTab] = useState<Tab>('answers')
  const [problems, setProblems] = useState<Problem[]>(INITIAL_PROBLEMS)
  const [selectedStudent, setSelectedStudent] = useState<string>(MOCK_STUDENTS[0].id)
  const [gradingMap, setGradingMap] = useState<GradingMap>({})
  const [newUnit, setNewUnit] = useState('')

  // 정답 변경
  const setAnswer = (id: string, answer: string) =>
    setProblems(prev => prev.map(p => p.id === id ? { ...p, answer } : p))

  const setType = (id: string, type: ProblemType) =>
    setProblems(prev => prev.map(p => p.id === id ? { ...p, type, answer: '' } : p))

  const addProblem = () => {
    const nextNum = (problems[problems.length - 1]?.number ?? 0) + 1
    setProblems(prev => [...prev, {
      id: `p${Date.now()}`, number: nextNum,
      unit: newUnit || '단원 미지정', type: 'multiple', answer: '',
    }])
  }

  const deleteProblem = (id: string) => setProblems(prev => prev.filter(p => p.id !== id))

  // 채점
  const setGrade = (studentId: string, problemId: string, correct: boolean | null) => {
    setGradingMap(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), [problemId]: correct },
    }))
  }

  const getScore = (studentId: string) => {
    const sg = gradingMap[studentId] ?? {}
    const graded = problems.filter(p => p.answer !== '')
    const correct = graded.filter(p => sg[p.id] === true).length
    const total = graded.length
    return { correct, total, rate: total > 0 ? Math.round((correct / total) * 100) : 0 }
  }

  const answeredCount = problems.filter(p => p.answer !== '').length
  const student = MOCK_STUDENTS.find(s => s.id === selectedStudent)!
  const sg = gradingMap[selectedStudent] ?? {}
  const score = getScore(selectedStudent)

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/textbooks" className="text-gray-400 hover:text-gray-600 text-sm">← 교재 목록</Link>
        <span className="text-gray-300">|</span>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{MOCK_TEXTBOOK.title}</h1>
          <p className="text-xs text-gray-400">{MOCK_TEXTBOOK.grade} · {MOCK_TEXTBOOK.publisher} · 총 {problems.length}문제 (정답 입력: {answeredCount}문제)</p>
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
            객관식: 1~5 중 정답 번호 클릭 / 주관식: 정답 직접 입력 후 Enter
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
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{p.unit}</td>
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

          {/* 문제 추가 */}
          <div className="flex gap-2">
            <input type="text" value={newUnit} onChange={e => setNewUnit(e.target.value)}
              placeholder="단원명 (선택)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={addProblem}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + 문제 추가
            </button>
            <button
              onClick={() => alert('정답이 저장되었습니다.')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors ml-auto">
              정답 저장
            </button>
          </div>
        </div>
      )}

      {/* ── 학생 채점 탭 ── */}
      {tab === 'grading' && (
        <div className="flex gap-4">
          {/* 왼쪽: 문제 채점 패널 */}
          <div className="flex-1 space-y-3">
            {/* 학생 선택 탭 */}
            <div className="flex gap-2 flex-wrap">
              {MOCK_STUDENTS.map(s => (
                <button key={s.id} onClick={() => setSelectedStudent(s.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    selectedStudent === s.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>

            {/* 점수 요약 */}
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-700">{student.name} 학생</span>
                <span className="text-xs text-gray-400">{student.grade}</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-black text-indigo-600">{score.correct}</p>
                  <p className="text-xs text-gray-400">정답</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-red-500">{score.total - score.correct}</p>
                  <p className="text-xs text-gray-400">오답</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-gray-700">{score.rate}%</p>
                  <p className="text-xs text-gray-400">정답률</p>
                </div>
                <button
                  onClick={() => alert(`${student.name} 학생 결과를 미션 결과로 입력하시겠습니까?\n정답률: ${score.rate}%\n(TODO: API 연동)`)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                  미션 결과 입력
                </button>
              </div>
            </div>

            {/* 문제 채점 목록 */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* 단원별 그룹 */}
              {(() => {
                const units = [...new Set(problems.map(p => p.unit))]
                return units.map(unit => {
                  const unitProblems = problems.filter(p => p.unit === unit)
                  return (
                    <div key={unit}>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-500">{unit}</span>
                      </div>
                      {unitProblems.map((p, idx) => {
                        const result = sg[p.id]
                        return (
                          <div key={p.id}
                            className={`flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${result === true ? 'bg-blue-50/50' : result === false ? 'bg-red-50/50' : ''}`}>
                            <div className="w-8 text-sm font-bold text-gray-600">{p.number}</div>
                            <div className="flex-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${p.type === 'multiple' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'}`}>
                                {p.type === 'multiple' ? `객관식 ${p.answer}번` : `주관식: ${p.answer || '?'}`}
                              </span>
                            </div>
                            {/* O/X 버튼 */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => setGrade(selectedStudent, p.id, result === true ? null : true)}
                                className={`w-10 h-10 rounded-full text-lg font-black transition-all border-2 ${
                                  result === true
                                    ? 'bg-blue-500 text-white border-blue-500 scale-105'
                                    : 'border-gray-200 text-gray-300 hover:border-blue-400 hover:text-blue-400'
                                }`}>
                                O
                              </button>
                              <button
                                onClick={() => setGrade(selectedStudent, p.id, result === false ? null : false)}
                                className={`w-10 h-10 rounded-full text-lg font-black transition-all border-2 ${
                                  result === false
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
                })
              })()}
            </div>
          </div>

          {/* 오른쪽: 전체 학생 점수 요약 */}
          <div className="w-56 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">전체 채점 현황</h3>
            {MOCK_STUDENTS.map(s => {
              const sc = getScore(s.id)
              const gradedCount = problems.filter(p => (gradingMap[s.id] ?? {})[p.id] != null).length
              return (
                <button key={s.id} onClick={() => setSelectedStudent(s.id)}
                  className={`w-full text-left bg-white border rounded-xl p-3 transition-colors hover:border-indigo-300 ${selectedStudent === s.id ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-800 text-sm">{s.name}</span>
                    <span className={`text-sm font-black ${sc.rate >= 80 ? 'text-emerald-600' : sc.rate >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                      {gradedCount > 0 ? `${sc.rate}%` : '-'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{gradedCount}/{problems.length} 채점 완료</div>
                  {gradedCount > 0 && (
                    <div className="mt-1.5 bg-gray-100 rounded-full h-1">
                      <div className="bg-indigo-500 h-1 rounded-full transition-all" style={{ width: `${sc.rate}%` }} />
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
