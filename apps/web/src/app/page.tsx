'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\d{11}$/.test(phone)) {
      setError('핸드폰번호는 숫자 11자리로 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      // TODO: 실제 API 연동 — POST /api/auth/login
      await new Promise(r => setTimeout(r, 600))
      // Mock: 01011111111 → 선생님 로그인
      if (phone === '01011111111') {
        localStorage.setItem('teacher_token', 'mock-token')
        localStorage.setItem('teacher_name', '오근표 선생님')
        router.push('/dashboard/students')
      } else {
        setError('선생님 계정을 찾을 수 없습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-indigo-600 tracking-tight">InLevMath</h1>
          <p className="text-gray-500 text-sm mt-1">선생님 관리 시스템</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-bold text-gray-800 mb-6">선생님 로그인</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                핸드폰번호 (아이디)
              </label>
              <input
                type="tel"
                maxLength={11}
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="01012345678"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          오근표 수학학원 · InLevMath v0.1
        </p>
      </div>
    </div>
  )
}
