// apps/mobile/store/useBgm.tsx
//
// 학생 앱 배경음악.
//
// ── 지켜야 할 것 ────────────────────────────────────────────────────────────
// · 기본은 **꺼짐**이다. 학원이나 교실에서 앱을 열었는데 소리가 갑자기 나오면
//   곤란하다. 학생이 한 번 켜면 그 선택을 기억한다.
// · 켠 상태는 SecureStore 가 아니라 AsyncStorage 급의 가벼운 저장이면 충분하지만,
//   이 앱에는 expo-secure-store 만 들어 있어 그것을 쓴다 (값이 하나뿐이라 부담 없음).
// · 앱이 백그라운드로 가면 멈추고 돌아오면 이어서 튼다. 화면을 껐는데 음악이
//   계속 나오면 배터리도 먹고 학부모가 싫어한다.
//
// ── 음악 파일 ───────────────────────────────────────────────────────────────
// 파일 자체는 store/bgmSource.ts 한 곳에서만 가리킨다. Metro 가 require 를
// 번들 시점에 해석하기 때문에 "있으면 쓰고 없으면 넘어가기"를 코드로 할 수 없다
// (자세한 이유는 그 파일에 적어 뒀다).
// 음악을 안 넣은 상태에서는 기능이 조용히 꺼진 채로 앱이 정상 동작한다.

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { BGM_SOURCE } from './bgmSource'

const PREF_KEY = 'bgm_enabled'

type BgmValue = {
  /** 음악 파일이 들어 있는가 */
  available: boolean
  enabled: boolean
  toggle: () => void
}

const BgmContext = createContext<BgmValue>({ available: false, enabled: false, toggle: () => {} })

export function BgmProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const playerRef = useRef<AudioPlayer | null>(null)
  const available = BGM_SOURCE !== null

  // 저장해 둔 선택을 읽는다. 값이 없으면 꺼짐이 기본이다.
  useEffect(() => {
    let alive = true
    SecureStore.getItemAsync(PREF_KEY)
      .then(v => { if (alive) setEnabled(v === '1') })
      .catch(() => { /* 저장소를 못 읽어도 꺼짐으로 시작하면 된다 */ })
      .finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])

  // 재생기 준비 — 음악 파일이 있을 때만 만든다
  useEffect(() => {
    if (!available) return
    let alive = true

    // 무음 스위치를 켜 둔 기기에서도 소리가 나오게 하지 않는다.
    // 학생이 일부러 무음으로 둔 것을 앱이 뒤집으면 안 된다.
    setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false }).catch(() => {})

    const player = createAudioPlayer(BGM_SOURCE!)
    player.loop = true
    player.volume = 0.35 // 공부하는 앱이라 배경으로 깔릴 정도만
    if (alive) playerRef.current = player

    return () => {
      alive = false
      playerRef.current = null
      try { player.remove() } catch { /* 이미 정리됐으면 그만이다 */ }
    }
  }, [available])

  // 켜짐/꺼짐 반영
  useEffect(() => {
    if (!ready) return
    const player = playerRef.current
    if (!player) return
    try {
      if (enabled) player.play()
      else player.pause()
    } catch { /* 재생 실패로 앱을 멈추지 않는다 */ }
  }, [enabled, ready])

  // 앱이 뒤로 가면 멈추고, 돌아오면 켜져 있던 경우에만 다시 튼다
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      const player = playerRef.current
      if (!player) return
      try {
        if (state === 'active') { if (enabled) player.play() }
        else player.pause()
      } catch { /* 무시 */ }
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [enabled])

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      SecureStore.setItemAsync(PREF_KEY, next ? '1' : '0').catch(() => {})
      return next
    })
  }, [])

  return (
    <BgmContext.Provider value={{ available, enabled, toggle }}>
      {children}
    </BgmContext.Provider>
  )
}

export function useBgm() {
  return useContext(BgmContext)
}
