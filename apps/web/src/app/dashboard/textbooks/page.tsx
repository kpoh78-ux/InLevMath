'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

type Textbook = {
  id: string; title: string; grade: string; publisher: string
  problemCount: number; createdAt: string
}

const GRADE_OPTIONS = ['중1-1', '중1-2', '중2-1', '중2-2', '중3-1', '중3-2', '고1', '고2', '고3']

function TextbooksPageInner() {
  const searchParams = useSearchParams()
  const selectedStudent = searchParams.get('student')

  const [textbooks, setTextbooks] = useState<Textbook[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', grade: '', publisher: '', problemCount: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const fetchTextbooks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/textbooks')
      if (res.ok) setTextbooks(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTextbooks() }, [fetchTextbooks])

  const filtered = textbooks.filter(t =>
    t.title.includes(search) || t.grade.includes(search) || t.publisher.includes(search)
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.grade) { alert('학년을 선택해주세요.'); return }
    setSaving(true)
    try {
      const res = await apiFetch('/api/textbooks', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title, grade: form.grade,
          publisher: form.publisher || '직접 출제',
          problemCount: parseInt(form.problemCount) || 0,
        }),
      })
      if (res.ok) {
        await fetchTextbooks()
        setForm({ title: '', grade: '', publisher: '', problemCount: '' })
        setShowModal(false)
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '등록 실패')
      }
    } finally { setSaving(false) }
  }

  const handleDelete = async (t: Textbook) => {
    if (!confirm(`"${t.title}"을 삭제할까요?`)) return
    await apiFetch(`/api/textbooks/${t.id}`, { method: 'DELETE' })
    setTextbooks(prev => prev.filter(x => x.id !== t.id))
  }

  const detailHref = (id: string) =>
    selectedStudent ? `/dashboard/textbooks/${id}?student=${selectedStudent}` : `/dashboard/textbooks/${id}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">교재 · 채점</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedStudent
              ? '교재를 선택하면 해당 학생을 바로 채점합니다'
              : '교재별 정답을 입력하고 학생 답안을 채점합니다'}
          </p>
        </div>
        {!selectedStudent && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + 교재 등록
          </button>
        )}
      </div>

      {/* 검색 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text" placeholder="교재명, 학년 검색"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* 교재 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium">교재명</th>
              <th className="px-5 py-3 text-left font-medium">학년</th>
              <th className="px-5 py-3 text-left font-medium">출판사</th>
              <th className="px-5 py-3 text-left font-medium">문제 수</th>
              <th className="px-5 py-3 text-left font-medium">등록일</th>
              <th className="px-5 py-3 text-left font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">등록된 교재가 없습니다.</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={detailHref(t.id)} className="font-semibold text-indigo-600 hover:underline">
                    {t.title}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.grade}</span>
                </td>
                <td className="px-5 py-3.5 text-gray-500">{t.publisher}</td>
                <td className="px-5 py-3.5 text-gray-700 font-medium">{t.problemCount}문제</td>
                <td className="px-5 py-3.5 text-gray-400 text-xs">
                  {new Date(t.createdAt).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-2">
                    <Link
                      href={detailHref(t.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded transition-colors whitespace-nowrap"
                    >
                      {selectedStudent ? '채점하기' : '정답·채점'}
                    </Link>
                    {!selectedStudent && (
                      <button
                        onClick={() => handleDelete(t)}
                        className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 교재 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">교재 등록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">교재명 *</label>
                <input type="text" required value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="예) 일품 - 중등수학1(상)"
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
                <label className="block text-xs font-medium text-gray-600 mb-1">출판사</label>
                <input type="text" value={form.publisher}
                  onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))}
                  placeholder="예) 좋은책신사고 (비워두면 직접 출제)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">총 문제 수 *</label>
                <input type="number" required min={1} max={300} value={form.problemCount}
                  onChange={e => setForm(f => ({ ...f, problemCount: e.target.value }))}
                  placeholder="예) 24"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button type="submit" disabled={saving || !form.grade}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? '등록 중...' : '등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TextbooksPage() {
  return (
    <Suspense>
      <TextbooksPageInner />
    </Suspense>
  )
}
