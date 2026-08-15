'use client'

// 로그인한 선생님 정보 (관리자 여부 포함)
//
// 화면에서 관리자 전용 버튼을 숨기는 용도다. 실제 차단은 API에서 하므로
// 여기서 값이 틀려도 권한이 뚫리지는 않는다.

import { useEffect, useState } from 'react'
import { apiFetch } from './api'

export type Me = { teacherId: string; name: string; isAdmin: boolean }

// 화면을 옮길 때마다 다시 부르지 않도록 한 번 받아 온 값을 들고 있는다
let cached: Me | null = null
let inflight: Promise<Me | null> | null = null

async function loadMe(): Promise<Me | null> {
  if (cached) return cached
  if (!inflight) {
    inflight = apiFetch('/api/teacher/me')
      .then(r => (r.ok ? r.json() : null))
      .then((d: Me | null) => { cached = d; return d })
      .catch(() => null)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** 로그아웃 등으로 계정이 바뀌면 캐시를 비운다 */
export function clearMeCache() { cached = null }

export function useMe() {
  const [me, setMe] = useState<Me | null>(cached)
  const [loading, setLoading] = useState(cached === null)

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