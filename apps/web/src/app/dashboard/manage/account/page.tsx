'use client'

// apps/web/src/app/dashboard/manage/account/page.tsx
//
// 내 계정 — 로그인한 선생님(교육실장 포함) 본인의 비밀번호 변경.
//
// 관리자가 남의 비밀번호를 초기화하는 것은 선생님 관리 화면에서 한다.
// 여기는 현재 비밀번호를 아는 본인만 쓰는 문이라 현재 비밀번호를 반드시 묻는다.

import { useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useMe } from '@/lib/useMe'

const MIN_LENGTH = 6

export default function MyAccountPage() {
  const { me, loading } = useMe()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setDone(false)

    if (next.length < MIN_LENGTH) {
      setError(`새 비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`)
      return
    }
    if (next !== confirm) {
      setError('새 비밀번호가 서로 다릅니다.')
      return
    }
    if (next === current) {
      setError('지금 쓰는 비밀번호와 같습니다.')
      return
    }

    setSaving(true)
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        setError(d.error ?? '비밀번호를 바꾸지 못했습니다.')
        return
      }
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-gray-900">내 계정</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {loading ? '불러오는 중...' : (
            <>
              <strong className="text-gray-700">{me?.name ?? ''}</strong>
              {me?.isAdmin ? ' (관리자)' : ''} 계정의 비밀번호를 바꿉니다.
            </>
          )}
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            현재 비밀번호 <span className="text-red-500">*</span>
          </label>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            새 비밀번호 <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal"> ({MIN_LENGTH}자 이상)</span>
          </label>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={next}
            onChange={e => setNext(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            새 비밀번호 확인 <span className="text-red-500">*</span>
          </label>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className={inputClass}
          />
          {confirm !== '' && next !== confirm && (
            <p className="text-[11px] text-rose-500 mt-1">두 값이 다릅니다.</p>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={show}
            onChange={e => setShow(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-xs text-gray-500">비밀번호 표시</span>
        </label>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}
        {done && !error && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '바꾸는 중...' : '비밀번호 변경'}
        </button>
      </form>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">비밀번호를 잊었다면</strong><br />
          관리자 선생님에게 요청하세요. 선생님 관리 화면에서 초기 비밀번호
          <strong className="font-mono"> math1234</strong>로 되돌려 줍니다.
          되돌린 뒤에는 이 화면에서 바로 바꾸는 것이 좋습니다.
        </p>
      </div>
    </div>
  )
}
