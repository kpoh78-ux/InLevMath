'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { useMe } from '@/lib/useMe'

type TeacherRow = {
  id: string; userId: string; name: string; phone: string
  isAdmin: boolean; createdAt: string
  worksheetCount: number; textbookCount: number
  isMe: boolean
}

const EMPTY = { name: '', phone: '', password: '', isAdmin: false }

export default function ManageTeachersPage() {
  const { isAdmin, loading: loadingMe } = useMe()

  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // 서버가 관리자가 아니라고 답하면 화면을 잠근다 (useMe 캐시가 어긋나는 경우 대비)
  const [denied, setDenied] = useState(false)

  const fetchTeachers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/teachers')
      if (res.status === 401 || res.status === 403) { setDenied(true); return }
      if (res.ok) setTeachers(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (isAdmin) fetchTeachers() }, [isAdmin, fetchTeachers])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{11}$/.test(form.phone)) { setError('핸드폰번호는 11자리 숫자로 입력하세요.'); return }
    setSubmitting(true); setError('')
    try {
      const res = await apiFetch('/api/admin/teachers', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; initialPassword?: string }
      if (!res.ok) { setError(d.error ?? '등록에 실패했습니다.'); return }
      setCreated({ name: form.name, password: d.initialPassword ?? 'math1234' })
      setForm(EMPTY)
      setShowModal(false)
      await fetchTeachers()
    } finally { setSubmitting(false) }
  }

  const toggleAdmin = async (t: TeacherRow) => {
    const next = !t.isAdmin
    const msg = next
      ? `${t.name} 선생님에게 관리자 권한을 부여할까요?\n선생님 계정 관리와 학생 퇴원 처리를 할 수 있게 됩니다.`
      : `${t.name} 선생님의 관리자 권한을 회수할까요?`
    if (!confirm(msg)) return
    setBusyId(t.id)
    try {
      const res = await apiFetch('/api/admin/teachers', {
        method: 'PATCH',
        body: JSON.stringify({ teacherId: t.id, isAdmin: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error ?? '변경에 실패했습니다.'); return
      }
      await fetchTeachers()
    } finally { setBusyId(null) }
  }

  const removeTeacher = async (t: TeacherRow) => {
    if (!confirm(
      `${t.name} 선생님 계정을 삭제할까요?\n` +
      (t.worksheetCount + t.textbookCount > 0
        ? `이 계정에 연결된 학습지 ${t.worksheetCount}개, 교재 ${t.textbookCount}권도 함께 삭제됩니다.`
        : '계정만 삭제되며 학원 자료는 그대로 유지됩니다.')
    )) return
    setBusyId(t.id)
    try {
      const res = await apiFetch('/api/admin/teachers', {
        method: 'DELETE',
        body: JSON.stringify({ teacherId: t.id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error ?? '삭제에 실패했습니다.'); return
      }
      await fetchTeachers()
    } finally { setBusyId(null) }
  }

  if (loadingMe) {
    return <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
  }

  if (!isAdmin || denied) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-sm font-semibold text-gray-700">관리자만 사용할 수 있는 화면입니다.</p>
        <p className="text-xs text-gray-400 mt-1.5">
          선생님 계정 등록·삭제는 관리자 계정으로 로그인해야 합니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">선생님 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">등록된 선생님 {teachers.length}명</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setError(''); setShowModal(true) }}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          + 선생님 등록
        </button>
      </div>

      {created && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-emerald-800">
            <strong>{created.name}</strong> 선생님이 등록되었습니다. 초기 비밀번호는{' '}
            <strong className="font-mono">{created.password}</strong> 입니다.
          </span>
          <button onClick={() => setCreated(null)}
            className="ml-auto text-xs text-emerald-700 hover:text-emerald-900">닫기</button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 whitespace-nowrap">
              <th className="px-5 py-3 text-left font-medium">이름</th>
              <th className="px-4 py-3 text-left font-medium w-40">핸드폰 (로그인 ID)</th>
              <th className="px-4 py-3 text-center font-medium w-24">권한</th>
              <th className="px-4 py-3 text-left font-medium w-28">등록일</th>
              <th className="px-4 py-3 text-left font-medium w-44">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">불러오는 중...</td></tr>
            ) : teachers.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">등록된 선생님이 없습니다.</td></tr>
            ) : teachers.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-gray-900">
                  {t.name}
                  {t.isMe && <span className="ml-1.5 text-[10px] text-indigo-500">(나)</span>}
                </td>
                <td className="px-4 py-3.5 font-mono text-gray-500 text-xs whitespace-nowrap">
                  {t.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${
                    t.isAdmin ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.isAdmin ? '관리자' : '선생님'}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(t.createdAt).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-2">
                    <button onClick={() => toggleAdmin(t)} disabled={busyId === t.id || t.isMe}
                      title={t.isMe ? '본인 권한은 변경할 수 없습니다' : ''}
                      className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded transition-colors disabled:opacity-40 whitespace-nowrap">
                      {t.isAdmin ? '관리자 해제' : '관리자 지정'}
                    </button>
                    <button onClick={() => removeTeacher(t)} disabled={busyId === t.id || t.isMe}
                      title={t.isMe ? '본인 계정은 삭제할 수 없습니다' : ''}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors disabled:opacity-40 whitespace-nowrap">
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">권한 안내</strong><br />
          · <strong>선생님</strong> — 학생 등록·수정, 비밀번호 초기화, 시간표, 학습지, 교재 등 모든 기능<br />
          · <strong>관리자</strong> — 위 전부 + 선생님 계정 등록·삭제 + 학생 퇴원(복귀) 처리<br />
          · 학생·학습지·교재는 담당제로 나누지 않고 학원 전체가 공유합니다.
          모든 선생님이 전체 학생의 배포·채점·출결을 함께 처리합니다.
        </p>
      </div>

      {/* 선생님 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">선생님 등록</h2>
              <button onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input type="text" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="선생님 성함"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  핸드폰번호 (로그인 ID) <span className="text-red-500">*</span>
                </label>
                <input type="tel" required value={form.phone} maxLength={11}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                  placeholder="숫자만 11자리"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">초기 비밀번호</label>
                <input type="text" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="비워두면 math1234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.isAdmin}
                  onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                <span className="text-sm text-gray-600">관리자 권한 부여</span>
              </label>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {submitting ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}