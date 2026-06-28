'use client'

import { useState } from 'react'
import Link from 'next/link'

type ProblemType = 'multiple' | 'short'
type Tab = 'answers' | 'grading'

type Problem = {
  id: string; number: number; type: ProblemType; answer: string; point: number
}

type Student = { id: string; name: string; grade: string }
type GradingMap = Record<string, Record<string, boolean | null>>

// ── Mock 데이터 ─────────────────────────────────────────────
const MOCK_WORKSHEET = {
  id: 'w1', title: '수완하나중 1-1 기말 모의고사_03회',
  grade: '중1', unit: '정수와 유리수', source: 'mathflat', problemCount: 24,
}

const MOCK_STUDENTS: Student[] = [
  { id: 's1', name: '홍길동', grade: '중1' },
  { id: 's2', name: '김철수', grade: '중1' },
  { id: 's3', name: '이영희', grade: '중1' },
  { id: 's4', name: '박지민', grade: '중1' },
]

const INITIAL_PROBLEMS: Problem[] = [
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `p${i + 1}`, number: i + 1, type: 'multiple' as ProblemType,
    answer: String((i % 5) + 1), point: i >= 17 ? 5 : 4,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `p${i + 21}`, number: i + 21, type: 'short' as ProblemType,
    answer: '', point: 5,
  })),
]

export default function WorksheetDetailPage() {
  const [tab, setTab] = useState<Tab>('answers')
  const [problems, setProblems] = useState<Problem[]>(INITIAL_PROBLEMS)
  const [selectedStudent, setSelectedStudent] = useState<string>(MOCK_STUDENTS[0].id)
  const [gradingMap, setGradingMap] = useState<GradingMap>({})

  const setAnswer = (id: string, answer: string) =>
    setProblems(prev => prev.map(p => p.id === id ? { ...p, answer } : p))

  const setType = (id: string, type: ProblemType) =>
    setProblems(prev => prev.map(p => p.id === id ? { ...p, type, answer: '' } : p))

  const setPoint = (id: string, point: number) =>
    setProblems(prev => prev.map(p => p.id === id ? { ...p, point } : p))

  const setGrade = (studentId: string, problemId: string, val: boolean | null) => {
    setGradingMap(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), [problemId]: val },
    }))
  }

  const getScore = (studentId: string) => {
    const sg = gradingMap[studentId] ?? {}
    const answeredProblems = problems.filter(p => p.answer !== '')
    const correctPoints = answeredProblems.filter(p => sg[p.id] === true).reduce((sum, p) => sum + p.point, 0)
    const totalPoints = answeredProblems.reduce((sum, p) => sum + p.point, 0)
    const correct = answeredProblems.filter(p => sg[p.id] === true).length
    const wrong = answeredProblems.filter(p => sg[p.id] === false).length
    return { correct, wrong, correctPoints, totalPoints, rate: totalPoints > 0 ? Math.round((correctPoints / totalPoints) * 100) : 0 }
  }

  const answeredCount = problems.filter(p => p.answer !== '').length
  const totalPoints = problems.reduce((sum, p) => sum + p.point, 0)
  const student = MOCK_STUDENTS.find(s => s.id === selectedStudent)!
  const sg = gradingMap[selectedStudent] ?? {}
  const score = getScore(selectedStudent)

  const multipleProblems = problems.filter(p => p.type === 'multiple')
  const shortProblems = problems.filter(p => p.type === 'short')

  const TABS: [Tab, string][] = [['answers', '정답 입력'], ['grading', '학생 채점']]

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/worksheets" className="text-gray-400 hover:text-gray-600 text-sm">← 학습지 목록</Link>
        <span className="text-gray-300">|</span>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{MOCK_WORKSHEET.title}</h1>
          <p className="text-xs text-gray-400">
            {MOCK_WORKSHEET.grade} · {MOCK_WORKSHEET.unit} · 총 {problems.length}문제
            ({answeredCount}문제 정답 입력 완료 · 총 {totalPoints}점)
          </p>
        </div>
        {MOCK_WORKSHEET.source === 'mathflat' && (
          <span className="text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">매쓰플랫</span>
        )}
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

      {/* ── 정답 입력 탭 ── */}
      {tab === 'answers' && (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700">
            객관식: 1~5 중 정답 번호 클릭 / 주관식: 정답 직접 입력 · 배점(점)은 우측에서 수정 가능
          </div>

          {/* 객관식 */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              객관식 <span className="text-gray-400 font-normal text-xs">({multipleProblems.length}문제)</span>
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* 그리드 헤더 */}
              <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-medium">
                <span className="col-span-1">번호</span>
                <span className="col-span-8">정답 선택</span>
                <span className="col-span-2 text-center">배점</span>
                <span className="col-span-1" />
              </div>
              {multipleProblems.map(p => (
                <div key={p.id} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <span className="col-span-1 text-sm font-bold text-gray-600">{p.number}</span>
                  <div className="col-span-8 flex gap-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setAnswer(p.id, String(n))}
                        className={`w-9 h-9 rounded-full text-sm font-bold transition-colors border-2 ${
                          p.answer === String(n)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={20} value={p.point}
                        onChange={e => setPoint(p.id, parseInt(e.target.value) || 1)}
                        className="w-12 text-center border border-gray-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      <span className="text-xs text-gray-400">점</span>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => setType(p.id, 'short')}
                      className="text-xs text-gray-300 hover:text-amber-500 transition-colors" title="주관식으로 변경">
                      단↔
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 주관식 */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              주관식 <span className="text-gray-400 font-normal text-xs">({shortProblems.length}문제)</span>
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-medium">
                <span className="col-span-1">번호</span>
                <span className="col-span-8">정답 입력</span>
                <span className="col-span-2 text-center">배점</span>
                <span className="col-span-1" />
              </div>
              {shortProblems.map(p => (
                <div key={p.id} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <span className="col-span-1 text-sm font-bold text-gray-600">{p.number}</span>
                  <div className="col-span-8">
                    <input type="text" value={p.answer}
                      onChange={e => setAnswer(p.id, e.target.value)}
                      placeholder="정답을 입력하세요"
                      className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={20} value={p.point}
                        onChange={e => setPoint(p.id, parseInt(e.target.value) || 1)}
                        className="w-12 text-center border border-gray-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      <span className="text-xs text-gray-400">점</span>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => setType(p.id, 'multiple')}
                      className="text-xs text-gray-300 hover:text-indigo-500 transition-colors" title="객관식으로 변경">
                      단↔
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => alert('정답이 저장되었습니다.')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              정답 저장
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
              <span className="text-sm font-semibold text-gray-700">{student.name} 학생 · {student.grade}</span>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-black text-indigo-600">{score.correctPoints}</p>
                  <p className="text-xs text-gray-400">점수</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-blue-500">{score.correct}</p>
                  <p className="text-xs text-gray-400">정답</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-red-400">{score.wrong}</p>
                  <p className="text-xs text-gray-400">오답</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-gray-700">{score.rate}%</p>
                  <p className="text-xs text-gray-400">정답률</p>
                </div>
                <button
                  onClick={() => alert(`${student.name} 학생의 채점 결과를 미션에 반영하시겠습니까?\n점수: ${score.correctPoints}/${score.totalPoints}점 (${score.rate}%)\n(TODO: API 연동)`)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                  미션 결과 입력
                </button>
              </div>
            </div>

            {/* 객관식 채점 */}
            {multipleProblems.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">객관식 ({multipleProblems.length}문제)</span>
                </div>
                {/* 5열 그리드로 빠른 채점 */}
                <div className="p-4 grid grid-cols-5 gap-2">
                  {multipleProblems.map(p => {
                    const result = sg[p.id]
                    return (
                      <div key={p.id} className={`border rounded-xl p-2.5 text-center transition-colors ${
                        result === true ? 'border-blue-300 bg-blue-50' : result === false ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-gray-600">{p.number}번</span>
                          {p.answer !== '' && (
                            <span className="text-xs text-indigo-600 font-semibold">
                              {p.type === 'multiple' ? `${p.answer}번` : p.answer}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setGrade(selectedStudent, p.id, result === true ? null : true)}
                            className={`flex-1 py-1 rounded-lg text-sm font-black transition-colors ${
                              result === true ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'
                            }`}>O</button>
                          <button
                            onClick={() => setGrade(selectedStudent, p.id, result === false ? null : false)}
                            className={`flex-1 py-1 rounded-lg text-sm font-black transition-colors ${
                              result === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600'
                            }`}>X</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 주관식 채점 */}
            {shortProblems.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">주관식 ({shortProblems.length}문제)</span>
                </div>
                {shortProblems.map(p => {
                  const result = sg[p.id]
                  return (
                    <div key={p.id} className={`flex items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${result === true ? 'bg-blue-50/60' : result === false ? 'bg-red-50/60' : ''}`}>
                      <span className="w-12 text-sm font-bold text-gray-600">{p.number}번</span>
                      <div className="flex-1">
                        <span className="text-sm text-indigo-600 font-semibold">
                          정답: {p.answer || <span className="text-gray-300 font-normal">미입력</span>}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">{p.point}점</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setGrade(selectedStudent, p.id, result === true ? null : true)}
                          className={`w-10 h-10 rounded-full text-lg font-black transition-all border-2 ${
                            result === true ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-200 text-gray-300 hover:border-blue-400 hover:text-blue-400'
                          }`}>O</button>
                        <button
                          onClick={() => setGrade(selectedStudent, p.id, result === false ? null : false)}
                          className={`w-10 h-10 rounded-full text-lg font-black transition-all border-2 ${
                            result === false ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-300 hover:border-red-400 hover:text-red-400'
                          }`}>X</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 오른쪽: 전체 학생 채점 현황 */}
          <div className="w-56 space-y-2 shrink-0">
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
                      {gradedCount > 0 ? `${sc.correctPoints}점` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{gradedCount}/{problems.length} 채점 완료</span>
                    {gradedCount > 0 && <span>{sc.rate}%</span>}
                  </div>
                  {gradedCount > 0 && (
                    <div className="mt-1.5 bg-gray-100 rounded-full h-1">
                      <div className={`h-1 rounded-full transition-all ${sc.rate >= 75 ? 'bg-emerald-400' : sc.rate >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${sc.rate}%` }} />
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
