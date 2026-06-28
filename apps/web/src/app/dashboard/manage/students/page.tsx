'use client'

import { useState } from 'react'
import Link from 'next/link'

type Student = {
  id: string; name: string; school: string; grade: string
  gradeGroup: '초' | '중' | '고'
  phone: string; registeredAt: string; status: '재원' | '퇴원'
}

const GRADE_OPTIONS: { group: '초' | '중' | '고'; label: string }[] = [
  { group: '초', label: '초1' }, { group: '초', label: '초2' }, { group: '초', label: '초3' },
  { group: '초', label: '초4' }, { group: '초', label: '초5' }, { group: '초', label: '초6' },
  { group: '중', label: '중1' }, { group: '중', label: '중2' }, { group: '중', label: '중3' },
  { group: '고', label: '고1' }, { group: '고', label: '고2' }, { group: '고', label: '고3' },
]

function gradeGroup(grade: string): '초' | '중' | '고' {
  if (grade.startsWith('초')) return '초'
  if (grade.startsWith('중')) return '중'
  return '고'
}

const MOCK_STUDENTS: Student[] = [
  { id: 's1', name: '홍길동', school: '오성중학교',   grade: '중2', gradeGroup: '중', phone: '01012345678', registeredAt: '2026-03-02', status: '재원' },
  { id: 's2', name: '김철수', school: '한빛중학교',   grade: '중1', gradeGroup: '중', phone: '01098765432', registeredAt: '2026-03-05', status: '재원' },
  { id: 's3', name: '이영희', school: '오성중학교',   grade: '중3', gradeGroup: '중', phone: '01011112222', registeredAt: '2026-02-15', status: '재원' },
  { id: 's4', name: '박지민', school: '한빛고등학교', grade: '고1', gradeGroup: '고', phone: '01033334444', registeredAt: '2026-03-10', status: '재원' },
]

type FormState = {
  name: string; grade: string; school: string; phone: string; memo: string
}

const EMPTY_FORM: FormState = { name: '', grade: '', school: '', phone: '', memo: '' }

export default function ManageStudentsPage() {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<'' | '초' | '중' | '고'>('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [resetTarget, setResetTarget] = useState<Student | null>(null)
  const [continueAdd, setContinueAdd] = useState(false)

  const filtered = students.filter(s =>
    (groupFilter === '' || s.gradeGroup === groupFilter) &&
    (s.name.includes(search) || s.school.includes(search) || s.phone.includes(search))
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.grade) { alert('학년을 선택해주세요.'); return }
    if (!/^\d{11}$/.test(form.phone)) { alert('핸드폰번호는 11자리 숫자를 입력해주세요.'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 400))
    const newStudent: Student = {
      id: `s${Date.now()}`,
      name: form.name, school: form.school || '-', grade: form.grade,
      gradeGroup: gradeGroup(form.grade), phone: form.phone,
      registeredAt: new Date().toISOString().slice(0, 10), status: '재원',
    }
    setStudents(prev => [newStudent, ...prev])
    if (continueAdd) {
      setForm(EMPTY_FORM)
    } else {
      setForm(EMPTY_FORM)
      setShowModal(false)
    }
    setLoading(false)
  }

  const handleReset = async () => {
    if (!resetTarget) return
    await new Promise(r => setTimeout(r, 300))
    alert(`${resetTarget.name} 학생의 비밀번호가 math1234로 초기화되었습니다.`)
    setResetTarget(null)
  }

  const handleDelete = (s: Student) => {
    if (!confirm(`"${s.name}" 학생을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return
    setStudents(prev => prev.filter(x => x.id !== s.id))
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학생 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">재원 학생 {filtered.length}명</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          학생 등록
        </button>
      </div>

      {/* 필터 + 검색 */}
      <div className="flex items-center gap-3">
        {/* 학교급 필터 */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {([['', '전체'], ['초', '초'], ['중', '중'], ['고', '고']] as const).map(([val, label]) => (
            <button key={val}
              onClick={() => setGroupFilter(val)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-r border-gray-200 last:border-0 ${
                groupFilter === val ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2 max-w-64">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="학생 이름 검색"
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400" />
        </div>
      </div>

      {/* 학생 목록 테이블 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-medium">
              <th className="px-5 py-3 text-left w-16">학년</th>
              <th className="px-5 py-3 text-left w-24">상태</th>
              <th className="px-5 py-3 text-left">학생 이름</th>
              <th className="px-5 py-3 text-left">학교</th>
              <th className="px-5 py-3 text-left">핸드폰번호 (로그인 ID)</th>
              <th className="px-5 py-3 text-left">등록일</th>
              <th className="px-5 py-3 text-center">비밀번호</th>
              <th className="px-5 py-3 text-center">학습내역</th>
              <th className="px-5 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-gray-400">
                  등록된 학생이 없습니다.
                </td>
              </tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s.grade}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.status === '재원' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>{s.status}</span>
                </td>
                <td className="px-5 py-3.5 font-semibold text-gray-900">{s.name}</td>
                <td className="px-5 py-3.5 text-gray-500">{s.school}</td>
                <td className="px-5 py-3.5 font-mono text-gray-600 text-xs">
                  {s.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                </td>
                <td className="px-5 py-3.5 text-gray-400 text-xs">{s.registeredAt}</td>
                <td className="px-5 py-3.5 text-center">
                  <button
                    onClick={() => setResetTarget(s)}
                    className="text-xs text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-400 px-2 py-1 rounded transition-colors whitespace-nowrap"
                  >
                    초기화
                  </button>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <Link href={`/dashboard/students/${s.id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded transition-colors">
                    보기
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <button
                    onClick={() => handleDelete(s)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                    title="삭제"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 학생 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">학생 개별 등록</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                ×
              </button>
            </div>

            <form onSubmit={handleAdd}>
              <div className="px-6 py-5 space-y-5">
                {/* 필수 항목 */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">필수 입력 항목</p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* 학생 이름 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        학생 이름 <span className="text-red-500">*</span>
                      </label>
                      <input type="text" required value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="이름을 입력해주세요."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>

                    {/* 핸드폰번호 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        핸드폰번호 (로그인 ID) <span className="text-red-500">*</span>
                      </label>
                      <input type="tel" required value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                        placeholder="숫자만 입력 (11자리)"
                        maxLength={11}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono" />
                    </div>
                  </div>

                  {/* 학년 선택 */}
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      학년 <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {(['초', '중', '고'] as const).map(group => (
                        <div key={group} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4">{group}</span>
                          <div className="flex gap-1.5 flex-wrap">
                            {GRADE_OPTIONS.filter(g => g.group === group).map(g => (
                              <button key={g.label} type="button"
                                onClick={() => setForm(f => ({ ...f, grade: g.label }))}
                                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                                  form.grade === g.label
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'border-gray-200 text-gray-600 hover:border-indigo-400'
                                }`}>
                                {g.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 선택 항목 */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">선택 입력 항목</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">학교명</label>
                      <input type="text" value={form.school}
                        onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
                        placeholder="학교명을 입력해주세요."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">비고</label>
                      <input type="text" value={form.memo}
                        onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                        placeholder="메모 (선택)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                  </div>
                </div>

                {/* 초기 비밀번호 안내 */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-indigo-600">
                    초기 비밀번호는 <strong>math1234</strong>로 자동 설정됩니다. 학생이 직접 변경할 수 있습니다.
                  </p>
                </div>
              </div>

              {/* 모달 하단 */}
              <div className="px-6 pb-6 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={continueAdd}
                    onChange={e => setContinueAdd(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                  <span className="text-sm text-gray-600">계속 학생 등록하기</span>
                </label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                    className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
                    취소
                  </button>
                  <button type="submit" disabled={loading || !form.grade || !form.name || !form.phone}
                    className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {loading ? '등록 중...' : '등록하기'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 비밀번호 초기화 확인 모달 */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">비밀번호 초기화</h3>
                <p className="text-xs text-gray-500 mt-0.5">{resetTarget.name} 학생</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              비밀번호를 <strong className="text-gray-900">math1234</strong>로 초기화합니다.<br />
              학생에게 변경 안내를 해주세요.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={handleReset}
                className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-amber-600 transition-colors">
                초기화 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
