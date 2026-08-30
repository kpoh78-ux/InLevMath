// apps/mobile/store/useSfx.tsx
//
// 상황별 효과음 — 채점 결과·레벨업·경고에 맞춰 한 번씩 울린다.
//
// 배경음악(useBgm)과 다르다. 배경음악은 계속 흐르고 학생이 끄고 켜지만,
// 효과음은 순간이라 기본으로 **켜져 있다**. 다만 배경음악 토글을 끄면
// 효과음도 함께 꺼진다 — "소리 끔"이라고 생각한 학생에게 소리가 나면 안 된다.
//
// ── 소리 파일 ───────────────────────────────────────────────────────────────
// store/sfxSource.ts 한 곳에서만 가리킨다. Metro 가 require 를 번들 시점에
// 해석해서 없는 파일을 가리키면 번들이 통째로 실패하기 때문이다.
// 파일을 안 넣은 단서는 소리 없이 화면만 나온다 (앱은 정상 동작).

import { useCallback, useEffect, useRef } from 'react'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import type { SoundCue } from '@inlevmath/shared'
import { SFX_SOURCES } from './sfxSource'
import { useBgm } from './useBgm'

export function useSfx() {
  const bgm = useBgm()
  // 단서마다 재생기를 만들어 두고 재사용한다. 매번 만들면 첫 소리가 늦게 난다.
  const players = useRef<Partial<Record<SoundCue, AudioPlayer>>>({})

  useEffect(() => {
    const made = players.current
    return () => {
      for (const p of Object.values(made)) {
        try { p?.remove() } catch { /* 이미 정리됐으면 그만이다 */ }
      }
      players.current = {}
    }
  }, [])

  /** 단서 이름으로 한 번 울린다. 파일이 없거나 소리가 꺼져 있으면 아무 일도 없다 */
  const play = useCallback((cue: SoundCue | null | undefined) => {
    if (!cue) return
    // 학생이 소리를 끈 상태면 효과음도 내지 않는다
    if (!bgm.enabled) return

    const src = SFX_SOURCES[cue]
    if (src == null) return

    try {
      let player = players.current[cue]
      if (!player) {
        player = createAudioPlayer(src)
        player.volume = 0.7 // 배경음악(0.35)보다 또렷하게
        players.current[cue] = player
      }
      player.seekTo(0)
      player.play()
    } catch {
      // 소리가 안 나도 화면은 그대로 진행한다
    }
  }, [bgm.enabled])

  return { play, muted: !bgm.enabled }
}
