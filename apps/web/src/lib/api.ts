export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('teacher_token') ?? ''
}

export class AuthError extends Error {
  constructor() { super('인증이 필요합니다.') }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('teacher_token')
    localStorage.removeItem('teacher_name')
    window.location.href = '/'
    throw new AuthError()
  }
  return res
}
