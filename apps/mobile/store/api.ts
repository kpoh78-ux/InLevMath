import * as SecureStore from 'expo-secure-store'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000'

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await SecureStore.getItemAsync('auth_token')
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  return res
}
