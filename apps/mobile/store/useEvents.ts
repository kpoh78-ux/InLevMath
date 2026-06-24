import { useEffect, useRef, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

type SseEvent = {
  type: 'CONNECTED' | 'MISSION_RESULT' | 'LEVEL_UP'
  [key: string]: unknown
}

type EventHandler = (event: SseEvent) => void

// React Native에서 SSE는 fetch + ReadableStream 또는 EventSource polyfill 사용
// 여기서는 fetch streaming 방식으로 구현
export function useEvents(onEvent: EventHandler) {
  const abortRef = useRef<AbortController | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(async () => {
    const token = await SecureStore.getItemAsync('auth_token')
    if (!token) return

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`${API_BASE}/api/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SseEvent = JSON.parse(line.slice(6))
              onEvent(event)
            } catch {}
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return
      // 연결 끊어지면 3초 후 재연결
      retryRef.current = setTimeout(connect, 3000)
    }
  }, [onEvent])

  useEffect(() => {
    connect()
    return () => {
      abortRef.current?.abort()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [connect])
}
