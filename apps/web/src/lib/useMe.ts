'use client'

// 로그인한 선생님 정보 (관리자 여부 포함)
//
// 화면에서 관리자 전용 버튼을 숨기는 용도다. 실제 차단은 API에서 하므로
// 여기서 값이 틀려도 권한이 뚫리지는 않는다.
//
// 캐시는 반드시 토큰과 함께 보관한다. 로그아웃이 클라이언트 이동(router.push)이라
// 모듈이 다시 로드되지 않아서, 토큰을 확인하지 않으면 이전 로그인 사용자의
// 관리자 여부가 다음 사용자에게 그대로 남는다.

import { useEffect, useState } from 'react'
import { apiFetch } from './api'

export type Me = { teacherId: string; name: string; isAdmin: boolean }

const currentToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('teacher_token') : null

let cached: Me | null = null
let cachedToken: string | null = null
let inflight: Promise<Me | null> | null = null
let inflightToken: string | null = null

async function loadMe(): Promise<Me | null> {
  const token = currentToken()

  // 토큰이 그대로일 때만 캐시를 재사용한다
  if (cached && cachedToken === token) return cached

  if (inflight && inflightToken === token) return inflight

  inflightToken = token
  inflight = apiFetch('/api/teacher/me')
    .then(r => (r.ok ? r.json() : null))
    .then((d: Me | null) => {
      cached = d
      cachedToken = token
      return d
    })
    .catch(() => null)
    .finally(() => { inflight = null; inflightToken = null })

  return inflight
}

/** 로그아웃 시 호출 — 다음 사용자에게 이전 권한이 남지 않게 한다 */
export function clearMeCache() {
  cached = null
  cachedToken = null
  inflight = null
  inflightToken = null
}

export function useMe() {
  // 토큰이 바뀌었을 수 있으므로 캐시를 초기값으로 쓰지 않는다
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    loadMe().then(d => {
      if (!alive) return
      setMe(d)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  return { me, isAdmin: me?.isAdmin === true, loading }
}