// apps/mobile/components/fx.tsx
//
// 게임풍 시각 효과 모음 — 팝업뿐 아니라 앞으로 만드는 화면에서도 그대로 쓴다.
//
// ── 원칙 ────────────────────────────────────────────────────────────────────
// · **의존성을 늘리지 않는다.** react-native 내장 Animated 만 쓴다.
//   reanimated·lottie 를 넣으면 APK 빌드 준비가 그만큼 복잡해진다.
// · **네이티브 드라이버로만 돌린다.** opacity 와 transform 만 움직이고
//   색·크기(width/height)는 건드리지 않는다. 저가 태블릿에서도 끊기지 않아야 한다.
// · **접근성 설정을 존중한다.** 기기에서 '애니메이션 줄이기'를 켠 학생에게는
//   효과를 끄고 결과 상태만 보여 준다. 어지럼증을 느끼는 사람이 있다.
//
// ── 쓰는 법 ─────────────────────────────────────────────────────────────────
//   const fx = useEntrance(visible)              // 등장(확대+페이드)
//   <Animated.View style={fx.panelStyle}> … </Animated.View>
//
//   const glow = usePulse()                      // 테두리 발광 맥박
//   <Animated.View style={{ opacity: glow }} />
//
//   <Sweep play={visible} accent="#00CEC9" />    // 한 번 스쳐 지나가는 빛줄기

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated, Easing, AccessibilityInfo, StyleSheet, View,
  type ViewStyle, type StyleProp,
} from 'react-native'

/** 기기에서 '애니메이션 줄이기'를 켰는지 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduce(v) })
      .catch(() => { /* 못 읽으면 효과를 켠 채로 둔다 */ })

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => { alive = false; sub.remove() }
  }, [])

  return reduce
}

// ── 등장 ────────────────────────────────────────────────────────────────────

export type Entrance = {
  /** 배경 어둡게 깔리는 정도 */
  backdropStyle: { opacity: Animated.Value }
  /** 창 본체 — 살짝 커졌다가 제자리로 (게임 창이 '펼쳐지는' 느낌) */
  panelStyle: { opacity: Animated.Value; transform: { scale: Animated.Value }[] }
  /** 나갈 때 재생하고 끝나면 done() 을 부른다 */
  playOut: (done: () => void) => void
  /** 등장이 끝났는가 — 뒤따르는 효과의 시작 신호로 쓴다 */
  entered: boolean
}

export function useEntrance(visible: boolean): Entrance {
  const reduce = useReduceMotion()
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.9)).current
  const backdrop = useRef(new Animated.Value(0)).current
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!visible) {
      setEntered(false)
      return
    }

    if (reduce) {
      // 효과 없이 결과 상태로 바로 놓는다
      opacity.setValue(1); scale.setValue(1); backdrop.setValue(1)
      setEntered(true)
      return
    }

    opacity.setValue(0); scale.setValue(0.9); backdrop.setValue(0)
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      // 살짝 넘겼다가 돌아오는 탄성 — 창이 '탁' 하고 열리는 느낌을 만든다
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.03, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => { if (finished) setEntered(true) })
  }, [visible, reduce, opacity, scale, backdrop])

  const playOut = (done: () => void) => {
    if (reduce) { done(); return }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.95, duration: 120, useNativeDriver: true }),
    ]).start(() => done())
  }

  return {
    backdropStyle: { opacity: backdrop },
    panelStyle: { opacity, transform: [{ scale }] },
    playOut,
    entered,
  }
}

// ── 맥박 (테두리 발광) ──────────────────────────────────────────────────────

/**
 * 0.45 ↔ 1 사이를 천천히 오간다. 발광 테두리의 opacity 에 물려 쓴다.
 * 눈에 띄게 깜빡이면 글을 읽는 데 방해가 되므로 폭을 좁게 잡았다.
 */
export function usePulse(enabled = true, period = 2200): Animated.Value {
  const reduce = useReduceMotion()
  const v = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!enabled || reduce) {
      v.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 0.45, duration: period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 1, duration: period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [enabled, reduce, period, v])

  return v
}

// ── 빛줄기 ──────────────────────────────────────────────────────────────────

/**
 * 창이 열릴 때 한 번 스쳐 지나가는 사선 빛.
 *
 * 부모에 `overflow: 'hidden'` 이 있어야 창 밖으로 새지 않는다.
 * 터치를 먹지 않도록 pointerEvents 를 꺼 둔다.
 */
export function Sweep({ play, accent, width = 420, delay = 120 }: {
  play: boolean
  accent: string
  /** 창 너비. 이동 거리를 정하는 데 쓴다 */
  width?: number
  delay?: number
}) {
  const reduce = useReduceMotion()
  const x = useRef(new Animated.Value(-1)).current

  useEffect(() => {
    if (!play || reduce) return
    x.setValue(-1)
    const anim = Animated.timing(x, {
      toValue: 1, duration: 620, delay, easing: Easing.out(Easing.quad), useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [play, reduce, delay, x])

  if (reduce) return null

  const translateX = x.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width * 0.9, width * 0.9],
  })
  // 가장자리에서는 보이지 않다가 가운데서 밝아진다
  const opacity = x.interpolate({
    inputRange: [-1, -0.4, 0.4, 1],
    outputRange: [0, 0.5, 0.5, 0],
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sweep,
        { backgroundColor: accent, opacity, transform: [{ translateX }, { rotate: '18deg' }] },
      ]}
    />
  )
}


// ── 번쩍임 ──────────────────────────────────────────────────────────────────

/**
 * 축하·경고를 알리는 화면 번쩍임.
 *
 * ⚠️ **깜빡임 속도를 3Hz 아래로 유지한다.** 빠른 명멸은 광과민성 발작을
 * 일으킬 수 있다. 여기서는 한 번 밝아졌다 어두워지는 데 1.4초를 써
 * 0.7Hz 정도로 돌린다. 이 값을 함부로 낮추지 말 것.
 * '애니메이션 줄이기'를 켠 기기에서는 아예 번쩍이지 않고 은은한 색만 깐다.
 *
 * seconds 가 지나면 저절로 멈춘다. stop() 으로 일찍 멈출 수도 있다
 * (화면을 두 번 두드리면 멈추게 하려고 둔 손잡이다).
 */
export function useFlash(active: boolean, seconds = 15) {
  const reduce = useReduceMotion()
  const v = useRef(new Animated.Value(0)).current
  const [running, setRunning] = useState(false)
  const loopRef = useRef<Animated.CompositeAnimation | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    loopRef.current?.stop()
    loopRef.current = null
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    Animated.timing(v, { toValue: 0, duration: 260, useNativeDriver: true }).start()
    setRunning(false)
  }, [v])

  useEffect(() => {
    if (!active) { stop(); return }

    if (reduce) {
      // 번쩍이지 않고 은은하게 깔아만 둔다
      v.setValue(0.18)
      setRunning(false)
      return
    }

    setRunning(true)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.42, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.05, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loopRef.current = loop
    loop.start()

    timerRef.current = setTimeout(stop, seconds * 1000)
    return () => {
      loop.stop()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [active, reduce, seconds, v, stop])

  return { opacity: v, running, stop }
}

/**
 * 두 번 두드림을 잡는다. 번쩍임을 멈추는 데 쓴다.
 * 한 번 두드림에는 반응하지 않아, 실수로 눌러 꺼지는 일이 없다.
 */
export function useDoubleTap(onDoubleTap: () => void, windowMs = 320) {
  const last = useRef(0)
  return useCallback(() => {
    const now = Date.now()
    if (now - last.current < windowMs) {
      last.current = 0
      onDoubleTap()
    } else {
      last.current = now
    }
  }, [onDoubleTap, windowMs])
}

// ── 등장할 때 한 번 번쩍이는 강조 ───────────────────────────────────────────

/**
 * 자식을 감싸면 나타날 때 한 번 밝게 번쩍인다.
 * 모서리 꺾쇠·제목처럼 "시스템 창이 켜졌다"를 알리는 요소에 쓴다.
 */
export function Flare({ play, children, style }: {
  play: boolean
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const reduce = useReduceMotion()
  const v = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!play || reduce) { v.setValue(1); return }
    v.setValue(0)
    const anim = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.55, duration: 160, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 240, useNativeDriver: true }),
    ])
    anim.start()
    return () => anim.stop()
  }, [play, reduce, v])

  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>
}

// ── 숫자가 올라가는 연출 ────────────────────────────────────────────────────

/**
 * from → to 로 세어 올라가는 값을 돌려준다. 레벨업·능력치 상승에 쓴다.
 * Animated 로는 Text 안의 숫자를 못 바꾸므로 state 로 굴린다 —
 * 짧게 끝나는 연출이라 리렌더 비용이 문제되지 않는다.
 */
export function useCountUp(from: number, to: number, play: boolean, duration = 700): number {
  const reduce = useReduceMotion()
  const [value, setValue] = useState(from)

  useEffect(() => {
    if (!play) { setValue(from); return }
    if (reduce || from === to) { setValue(to); return }

    const start = Date.now()
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration)
      // 끝으로 갈수록 느려진다
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(from + (to - from) * eased))
      if (t >= 1) clearInterval(timer)
    }, 40)
    return () => clearInterval(timer)
  }, [from, to, play, reduce, duration])

  return value
}

// ── 배경 입자 ───────────────────────────────────────────────────────────────

/**
 * 위로 천천히 떠오르는 작은 점들. 레벨업처럼 축하하는 자리에 깐다.
 * 개수를 적게(기본 12) 두는 이유 — 저가 기기에서 프레임이 떨어진다.
 */
export function Motes({ play, accent, count = 12, height = 260 }: {
  play: boolean
  accent: string
  count?: number
  height?: number
}) {
  const reduce = useReduceMotion()
  // 위치·속도를 한 번만 뽑아 두고 재사용한다. 매 렌더마다 새로 뽑으면 튄다.
  const seeds = useRef(
    Array.from({ length: count }, (_, i) => ({
      left: (i * 37) % 100,          // 고르게 흩뿌리기 위한 결정적 배치
      size: 2 + (i % 3),
      delay: (i % 6) * 260,
      duration: 2600 + (i % 4) * 700,
    }))
  ).current
  const v = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!play || reduce) return
    v.setValue(0)
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [play, reduce, v])

  if (!play || reduce) return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {seeds.map((s, i) => {
        const translateY = v.interpolate({
          inputRange: [0, 1],
          outputRange: [height, -20],
        })
        const opacity = v.interpolate({
          inputRange: [0, 0.15, 0.75, 1],
          outputRange: [0, 0.8, 0.5, 0],
        })
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              backgroundColor: accent,
              opacity,
              transform: [{ translateY }],
            }}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  sweep: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 46,
    alignSelf: 'center',
  },
})
