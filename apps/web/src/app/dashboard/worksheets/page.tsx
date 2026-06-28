'use client'

import { useState } from 'react'
import Link from 'next/link'

type Worksheet = {
  id: string; title: string; grade: string; unit: string
  problemCount: number; createdAt: string; source: 'mathflat' | 'manual'
}

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3']

const MOCK_WORKSHEETS: Worksheet[] = [
  { id: 'w1', title: '수완하나중 1-1 기말 모의고사_03회', grade: '중1', unit: '정수와 유리수', problemCount: 24, createdAt: '2026-06-27', source: 'mathflat' },
  { id: 'w2', title: '수완하나중 1-1 기말 모의고사_04회', grade: '중1', unit: '문자와 식',     problemCount: 24, createdAt: '2026-06-25', source: 'mathflat' },
  { id: 'w3', title: '소수·합성수 개념 확인',               grade: '중1', unit: '소수와 합성수', problemCount: 15, createdAt: '2026-06-22', source: 'manual'   },
  { id: 'w4', title: '최대공약수·최소공배수 연습',           grade: '중2', unit: '인수분해',     problemCount: 20, createdAt: '2026-06-20', source: 'manual'   },
]

export default function WorksheetsPage() {
  const [worksheets, setWorksheets] = useState<Worksheet[]>(MOCK_WORKSHEETS)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', grade: '', unit: '', problemCount: '', source: 'manual' as 'mathflat' | 'manual' })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')

  const filtered = worksheets.filter(w =>
    (gradeFilter === '' || w.grade === gradeFilter) &&
    (w.title.includes(search) || w.unit.includes(search))
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.grade) { alert('학년을 선택해주세요.'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 400))
    setWorksheets(prev => [...prev, {
      id: `w${Date.now()}`,
      title: form.title, grade: form.grade, unit: form.unit || '미분류',
      problemCount: parseInt(form.problemCount) || 0,
      createdAt: new Date().toISOString().slice(0, 10),
      source: form.source,
    }])
    setForm({ title: '', grade: '', unit: '', problemCount: '', source: 'manual' })
    setShowModal(false)
    setLoading(false)
  }

  const handleDelete = (w: Worksheet) => {
    if (!confirm(`"${w.title}"을 삭제할까요?`)) return
    setWorksheets(prev => prev.filter(x => x.id !== w.id))
  }

  return (
    <div className="space-y-4">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학습지</h1>
          <p className="text-sm text-gray-500 mt-0.5">학습지별 정답을 입력하고 학생 채점 결과를 기록합니다</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + 학습지 등록
        </button>
      </div>

      {/* 검색 + 학년 필터 */}
      <div className="flex gap-3">
        <div className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" placeholder="학습지명, 단원 검색"
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setGradeFilter('')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${gradeFilter === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-500 hover:border-indigo-400'}`}
          >
            전체
          </button>
          {GRADE_OPTIONS.map(g => (
            <button key={g}
              onClick={() => setGradeFilter(g === gradeFilter ? '' : g)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-500 hover:border-indigo-400'}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* 학습지 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium">학습지명</th>
              <th className="px-5 py-3 text-left font-medium">학년</th>
              <th className="px-5 py-3 text-left font-medium">단원</th>
              <th className="px-5 py-3 text-left font-medium">출처</th>
              <th className="px-5 py-3 text-left font-medium">문제 수</th>
              <th className="px-5 py-3 text-left font-medium">등록일</th>
              <th className="px-5 py-3 text-left font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  등록된 학습지가 없습니다.
                </td>
              </tr>
            ) : filtered.map(w => (
              <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/worksheets/${w.id}`} className="font-semibold text-indigo-600 hover:underline">
                    {w.title}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{w.grade}</span>
                </td>
                <td className="px-5 py-3.5 text-gray-500 text-xs">{w.unit}</td>
                <td className="px-5 py-3.5">
                  {w.source === 'mathflat'
                    ? <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">매쓰플랫</span>
                    : <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">직접 제작</span>}
                </td>
                <td className="px-5 py-3.5 text-gray-700 font-medium">{w.problemCount}문제</td>
                <td className="px-5 py-3.5 text-gray-400 text-xs">{w.createdAt}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/worksheets/${w.id}`}
                      className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded transition-colors"
                    >
                      정답·채점
                    </Link>
                    <button
                      onClick={() => handleDelete(w)}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">학습지 등록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* 출처 선택 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">출처 *</label>
                <div className="flex gap-2">
                  {([['manual', '직접 제작'], ['mathflat', '매쓰플랫']] as const).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setForm(f => ({ ...f, source: val }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.source === val ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">학습지명 *</label>
                <input type="text" required value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={form.source === 'mathflat' ? '예) 수완하나중 1-1 기말 모의고사_03회' : '예) 소수·합성수 개념 확인'}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">단원명</label>
                <input type="text" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="예) 정수와 유리수"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">총 문제 수 *</label>
                <input type="number" required min={1} max={200} value={form.problemCount}
                  onChange={e => setForm(f => ({ ...f, problemCount: e.target.value }))}
                  placeholder="예) 24"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button type="submit" disabled={loading || !form.grade}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
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
