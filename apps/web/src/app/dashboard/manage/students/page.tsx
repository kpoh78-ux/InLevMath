'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

type Student = {
  id: string
  name: string
  phone: string
  school: string
  grade: string
  parentName: string
  parentPhone: string
  startDate: string
  registeredAt: string
  status: '재원' | '퇴원'
  gradeGroup: '초' | '중' | '고'
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

type FormState = {
  name: string; phone: string; grade: string; school: string
  parentName: string; parentPhone: string; startDate: string; memo: string
}

const EMPTY_FORM: FormState = {
  name: '', phone: '', grade: '', school: '',
  parentName: '', parentPhone: '', startDate: '', memo: '',
}

export default function ManageStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<'' | '초' | '중' | '고'>('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [resetTarget, setResetTarget] = useState<Student | null>(null)
  const [continueAdd, setContinueAdd] = useState(false)

  // 일괄 등록
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{
    successCount: number; failCount: number
    results: { row: number; name: string; status: '성공' | '실패'; reason?: string }[]
  } | null>(null)

  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiFetch('/api/students')
      if (!res.ok) return
      const data = await res.json() as {
        id: string; school: string; grade: string
        parentName: string; parentPhone: string; startDate: string
        user: { id: string; name: string; phone: string; createdAt: string }
      }[]
      setStudents(data.map(s => ({
        id: s.id,
        name: s.user.name,
        phone: s.user.phone,
        school: s.school,
        grade: s.grade,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        startDate: s.startDate,
        registeredAt: s.user.createdAt.slice(0, 10),
        status: '재원',
        gradeGroup: gradeGroup(s.grade),
      })))
    } catch {
      // 인증 오류 등
    } finally {
      setLoadingStudents(false)
    }
  }, [])

  useEffect(() => { fetchStudents() }, [fetchStudents])

  const filtered = students.filter(s =>
    (groupFilter === '' || s.gradeGroup === groupFilter) &&
    (s.name.includes(search) || s.school.includes(search) || s.phone.includes(search))
  )

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.grade) { setError('학년을 선택해주세요.'); return }
    if (!/^\d{11}$/.test(form.phone)) { setError('핸드폰번호는 11자리 숫자를 입력해주세요.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await apiFetch('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name, phone: form.phone, grade: form.grade, school: form.school,
          parentName: form.parentName, parentPhone: form.parentPhone, startDate: form.startDate,
        }),
      })
      const body = await res.json() as {
        id: string; name: string; phone: string; school: string; grade: string
        parentName: string; parentPhone: string; startDate: string; error?: string
      }
      if (!res.ok) { setError(body.error ?? '등록에 실패했습니다.'); return }
      const newStudent: Student = {
        id: body.id, name: body.name, phone: body.phone,
        school: body.school ?? '', grade: body.grade,
        parentName: body.parentName ?? '', parentPhone: body.parentPhone ?? '',
        startDate: body.startDate ?? '',
        registeredAt: new Date().toISOString().slice(0, 10),
        status: '재원', gradeGroup: gradeGroup(body.grade),
      }
      setStudents(prev => [newStudent, ...prev])
      window.dispatchEvent(new Event('students-updated'))
      setForm(EMPTY_FORM)
      if (!continueAdd) setShowModal(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async () => {
    if (!resetTarget) return
    try {
      await apiFetch(`/api/students/${resetTarget.id}/reset-password`, { method: 'POST' })
      alert(`${resetTarget.name} 학생의 비밀번호가 math1234로 초기화되었습니다.`)
    } catch {
      alert('초기화에 실패했습니다.')
    }
    setResetTarget(null)
  }

  const f = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const downloadTemplate = async () => {
    const res = await apiFetch('/api/students/template')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students_template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkUpload = async () => {
    if (!bulkFile) return
    setBulkUploading(true)
    setBulkResult(null)
    try {
      const token = localStorage.getItem('teacher_token') ?? ''
      const fd = new FormData()
      fd.append('file', bulkFile)
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json() as {
        successCount: number; failCount: number; error?: string
        results: { row: number; name: string; status: '성공' | '실패'; reason?: string }[]
      }
      if (!res.ok) { alert(data.error ?? '업로드 실패'); return }
      setBulkResult(data)
      if (data.successCount > 0) {
        fetchStudents()
        window.dispatchEvent(new Event('students-updated'))
      }
    } finally {
      setBulkUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학생 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">재원 학생 {filtered.length}명</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setBulkResult(null); setBulkFile(null); setShowBulkModal(true) }}
            className="flex items-center gap-2 border border-indigo-300 text-indigo-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            학생 일괄 등록
          </button>
          <button
            onClick={() => { setShowModal(true); setError('') }}
            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            학생 개별 등록
          </button>
        </div>
      </div>

      {/* 필터 + 검색 */}
      <div className="flex items-center gap-3">
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
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-medium">
              <th className="px-4 py-3 text-left w-14">학년</th>
              <th className="px-4 py-3 text-left w-16">상태</th>
              <th className="px-4 py-3 text-left">학생 이름</th>
              <th className="px-4 py-3 text-left">학교</th>
              <th className="px-4 py-3 text-left">핸드폰 (로그인 ID)</th>
              <th className="px-4 py-3 text-left">보호자</th>
              <th className="px-4 py-3 text-left">보호자 연락처</th>
              <th className="px-4 py-3 text-left">수업시작일</th>
              <th className="px-4 py-3 text-center">비밀번호</th>
              <th className="px-4 py-3 text-center">학습내역</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingStudents ? (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-gray-400">불러오는 중...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-gray-400">등록된 학생이 없습니다.</td>
              </tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s.grade}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{s.status}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900">{s.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.school || '-'}</td>
                <td className="px-4 py-3 font-mono text-gray-600 text-xs">
                  {s.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{s.parentName || '-'}</td>
                <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                  {s.parentPhone ? s.parentPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : '-'}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{s.startDate || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => setResetTarget(s)}
                    className="text-xs text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-400 px-2 py-1 rounded transition-colors"
                  >
                    초기화
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <Link href={`/dashboard/students/${s.id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded transition-colors">
                    보기
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="text-gray-300 hover:text-red-400 transition-colors" title="삭제">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 py-8">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">학생 개별 등록</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setError('') }}
                className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                ×
              </button>
            </div>

            <form onSubmit={handleAdd} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
                {/* 필수 항목 */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">필수 입력 항목</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        학생 이름 <span className="text-red-500">*</span>
                      </label>
                      <input type="text" required value={form.name} onChange={f('name')}
                        placeholder="이름을 입력해주세요."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        핸드폰번호 (로그인 ID) <span className="text-red-500">*</span>
                      </label>
                      <input type="tel" required value={form.phone}
                        onChange={e => setForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                        placeholder="숫자만 입력 (11자리)" maxLength={11}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono" />
                    </div>
                  </div>

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
                                onClick={() => setForm(prev => ({ ...prev, grade: g.label }))}
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
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">학교명</label>
                        <input type="text" value={form.school} onChange={f('school')}
                          placeholder="학교명을 입력해주세요."
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">수업시작일</label>
                        <input type="date" value={form.startDate} onChange={f('startDate')}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-700" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">보호자 이름</label>
                        <input type="text" value={form.parentName} onChange={f('parentName')}
                          placeholder="보호자 성함"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">보호자 연락처</label>
                        <input type="tel" value={form.parentPhone}
                          onChange={e => setForm(prev => ({ ...prev, parentPhone: e.target.value.replace(/\D/g, '') }))}
                          placeholder="숫자만 입력 (11자리)" maxLength={11}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">비고</label>
                      <input type="text" value={form.memo} onChange={f('memo')}
                        placeholder="메모 (선택)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-indigo-600">
                    초기 비밀번호는 <strong>math1234</strong>로 자동 설정됩니다. 학생이 직접 변경할 수 있습니다.
                  </p>
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>

              <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center justify-between shrink-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={continueAdd} onChange={e => setContinueAdd(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                  <span className="text-sm text-gray-600">계속 학생 등록하기</span>
                </label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setError('') }}
                    className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
                    취소
                  </button>
                  <button type="submit" disabled={submitting || !form.grade || !form.name || !form.phone}
                    className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {submitting ? '등록 중...' : '등록하기'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 학생 일괄 등록 모달 */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">학생 일괄 등록</h2>
              <button onClick={() => setShowBulkModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {!bulkResult ? (
                <>
                  {/* STEP 01 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600 tracking-widest">STEP 01</span>
                    </div>
                    <p className="text-sm text-gray-700">엑셀 템플릿을 다운로드하여 학생 정보를 입력해주세요.</p>
                    <p className="text-xs text-gray-400">
                      필수 항목: 학생이름, 핸드폰번호(11자리), 학년(예: 중2, 고1)<br />
                      선택 항목: 학교명, 보호자이름, 보호자연락처, 수업시작일
                    </p>
                    <button onClick={downloadTemplate}
                      className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      템플릿 파일 다운로드 (.xlsx)
                    </button>
                  </div>

                  <div className="border-t border-gray-100" />

                  {/* STEP 02 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600 tracking-widest">STEP 02</span>
                    </div>
                    <p className="text-sm text-gray-700">작성한 엑셀 파일을 첨부해주세요.</p>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                        <input type="file" accept=".xlsx,.xls" className="hidden"
                          onChange={e => setBulkFile(e.target.files?.[0] ?? null)} />
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <span className={`text-sm truncate ${bulkFile ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                            {bulkFile ? bulkFile.name : '엑셀 파일을 선택하세요'}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                /* 업로드 결과 */
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-600">{bulkResult.successCount}</p>
                      <p className="text-xs text-emerald-500 mt-1">등록 성공</p>
                    </div>
                    <div className="flex-1 bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-red-500">{bulkResult.failCount}</p>
                      <p className="text-xs text-red-400 mt-1">등록 실패</p>
                    </div>
                  </div>

                  {bulkResult.failCount > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-500">실패 항목</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                        {bulkResult.results.filter(r => r.status === '실패').map((r, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                            <span className="text-xs text-gray-400 shrink-0">{r.row}행</span>
                            <span className="text-xs font-medium text-gray-700 shrink-0">{r.name}</span>
                            <span className="text-xs text-red-500">{r.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="px-6 pb-6 flex justify-end gap-3">
              {bulkResult ? (
                <>
                  <button onClick={() => { setBulkResult(null); setBulkFile(null) }}
                    className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
                    다시 업로드
                  </button>
                  <button onClick={() => setShowBulkModal(false)}
                    className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors">
                    완료
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowBulkModal(false)}
                    className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
                    취소
                  </button>
                  <button onClick={handleBulkUpload}
                    disabled={!bulkFile || bulkUploading}
                    className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {bulkUploading ? '등록 중...' : '등록하기'}
                  </button>
                </>
              )}
            </div>
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
