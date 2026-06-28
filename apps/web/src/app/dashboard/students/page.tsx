'use client'

import { useState } from 'react'
import Link from 'next/link'

type MissionType = 'concept_learning' | 'concept_problem' | 'basic_problem' | 'advanced_problem' | 'top_problem'

const MISSION_LABELS: Record<MissionType, string> = {
  concept_learning: '개념익히기',
  concept_problem:  '개념확인문제',
  basic_problem:    '기본문제',
  advanced_problem: '발전문제',
  top_problem:      '최상위문제',
}

const MISSION_COLORS: Record<MissionType, string> = {
  concept_learning: 'bg-blue-50 text-blue-700',
  concept_problem:  'bg-emerald-50 text-emerald-700',
  basic_problem:    'bg-amber-50 text-amber-700',
  advanced_problem: 'bg-orange-50 text-orange-700',
  top_problem:      'bg-rose-50 text-rose-700',
}

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3']

type Student = {
  id: string; name: string; school: string; grade: string; phone: string
  level: number; currentMission: MissionType; lastActive: string
  comprehension: number; reasoning: number; calculation: number
}

const MOCK_STUDENTS: Student[] = [
  { id: 's1', name: '홍길동', school: '오성중학교', grade: '중2', phone: '01012345678', level: 3, currentMission: 'basic_problem',    lastActive: '오늘',   comprehension: 72, reasoning: 58, calculation: 45 },
  { id: 's2', name: '김철수', school: '한빛중학교', grade: '중1', phone: '01023456789', level: 1, currentMission: 'concept_learning', lastActive: '어제',   comprehension: 40, reasoning: 20, calculation: 15 },
  { id: 's3', name: '이영희', school: '오성중학교', grade: '중3', phone: '01034567890', level: 5, currentMission: 'top_problem',      lastActive: '오늘',   comprehension: 91, reasoning: 88, calculation: 85 },
  { id: 's4', name: '박지민', school: '한빛중학교', grade: '중2', phone: '01045678901', level: 2, currentMission: 'concept_problem',  lastActive: '3일 전', comprehension: 65, reasoning: 40, calculation: 32 },
]

function AbilityBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-7 text-right">{value}</span>
    </div>
  )
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('전체')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)

  // 등록 폼
  const [form, setForm] = useState({ name: '', phone: '', school: '', grade: '' })

  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search) || s.school.includes(search) || s.phone.includes(search)
    const matchGrade = gradeFilter === '전체' || s.grade === gradeFilter
    return matchSearch && matchGrade
  })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{11}$/.test(form.phone)) {
      alert('핸드폰번호는 11자리 숫자로 입력해주세요.')
      return
    }
    if (students.some(s => s.phone === form.phone)) {
      alert('이미 등록된 핸드폰번호입니다.')
      return
    }
    setLoading(true)
    // TODO: 실제 API 연동 — POST /api/students
    await new Promise(r => setTimeout(r, 500))
    setStudents(prev => [...prev, {
      id: `s${Date.now()}`, ...form,
      level: 1, currentMission: 'concept_learning', lastActive: '방금',
      comprehension: 0, reasoning: 0, calculation: 0,
    }])
    setForm({ name: '', phone: '', school: '', grade: '' })
    setShowModal(false)
    setLoading(false)
    alert(`${form.name} 학생 등록 완료\n아이디: ${form.phone}\n초기 비밀번호: math1234`)
  }

  const handleReset = (s: Student) => {
    if (!confirm(`${s.name} 학생의 비밀번호를 math1234로 초기화할까요?`)) return
    // TODO: 실제 API 연동 — POST /api/students/[id]/reset-password
    alert(`${s.name} 학생 비밀번호가 math1234로 초기화되었습니다.`)
  }

  const handleDelete = (s: Student) => {
    if (!confirm(`${s.name} 학생을 목록에서 삭제할까요?`)) return
    setStudents(prev => prev.filter(x => x.id !== s.id))
  }

  return (
    <div className="space-y-4">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학생 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">총 {students.length}명 / 최대 300명</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + 학생 등록
        </button>
      </div>

      {/* 검색 & 필터 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="이름, 학교, 핸드폰번호 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
        />
        <div className="flex gap-1 border-l border-gray-200 pl-3">
          {['전체', ...GRADE_OPTIONS].map(g => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                gradeFilter === g ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* 학생 테이블 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium">이름</th>
              <th className="px-5 py-3 text-left font-medium">학교·학년</th>
              <th className="px-5 py-3 text-left font-medium">핸드폰 (아이디)</th>
              <th className="px-5 py-3 text-left font-medium">레벨</th>
              <th className="px-5 py-3 text-left font-medium">현재 미션</th>
              <th className="px-5 py-3 text-left font-medium w-40">이해력</th>
              <th className="px-5 py-3 text-left font-medium w-40">추론력</th>
              <th className="px-5 py-3 text-left font-medium w-40">계산력</th>
              <th className="px-5 py-3 text-left font-medium">최근 활동</th>
              <th className="px-5 py-3 text-left font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center text-gray-400">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/dashboard/students/${s.id}`} className="font-semibold text-indigo-600 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{s.school} · {s.grade}</td>
                  <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{s.phone}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black text-sm">
                      {s.level}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${MISSION_COLORS[s.currentMission]}`}>
                      {MISSION_LABELS[s.currentMission]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 w-40">
                    <AbilityBar value={s.comprehension} color="bg-blue-400" />
                  </td>
                  <td className="px-5 py-3.5 w-40">
                    <AbilityBar value={s.reasoning} color="bg-violet-400" />
                  </td>
                  <td className="px-5 py-3.5 w-40">
                    <AbilityBar value={s.calculation} color="bg-emerald-400" />
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">{s.lastActive}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReset(s)}
                        className="text-xs text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-400 px-2 py-1 rounded transition-colors"
                      >
                        비번 초기화
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 학생 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">학생 등록</h2>
                <p className="text-xs text-indigo-600 mt-0.5">초기 비밀번호: math1234</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                <input
                  type="text" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="학생 이름"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">핸드폰번호 (아이디) *</label>
                <input
                  type="tel" required maxLength={11}
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                  placeholder="01012345678"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">학교 *</label>
                <input
                  type="text" required
                  value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
                  placeholder="예) 오성중학교"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">학년 *</label>
                <div className="flex flex-wrap gap-2">
                  {GRADE_OPTIONS.map(g => (
                    <button
                      key={g} type="button"
                      onClick={() => setForm(f => ({ ...f, grade: g }))}
                      className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        form.grade === g
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'text-gray-600 border-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {!form.grade && <p className="text-xs text-gray-400 mt-1">학년을 선택해주세요</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading || !form.grade}
                  className="flex-2 flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? '등록 중...' : '등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
