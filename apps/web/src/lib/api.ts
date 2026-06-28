export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('teacher_token') ?? ''
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
  }
  return res
}
