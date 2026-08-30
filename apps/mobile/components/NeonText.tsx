// apps/mobile/components/NeonText.tsx
//
// LED 네온처럼 빛나는 게임풍 글씨.
//
// ── 어떻게 빛나게 했나 ──────────────────────────────────────────────────────
// React Native 의 Text 는 textShadow 를 **하나만** 받는다. 그림자 하나로는
// 네온의 "속은 하얗고 밖으로 갈수록 색이 번지는" 느낌이 안 난다.
// 그래서 같은 글자를 여러 장 겹쳐 그린다 —
//   맨 뒤: 넓고 흐린 색 번짐 (바깥 후광)
//   가운데: 좁고 진한 색 번짐
//   맨 앞: 흰 글자 + 옅은 흰 번짐 (LED 심지)
//
// ── 글씨체 ──────────────────────────────────────────────────────────────────
// Orbitron 은 영문 전용이라 한글 글리프가 없다. 한글이 섞이면 그 글자만
// 기본 글씨체로 떨어져 들쭉날쭉해진다. 그래서 한글이 있으면 BlackHanSans
// (굵은 한글 고딕)로 통째로 그린다.
// 글씨체를 아직 못 읽었으면 기본 글씨체로 나온다 — 앱은 정상 동작한다.

import React from 'react'
import { View, Text, StyleSheet, type TextStyle, type StyleProp, type ViewStyle } from 'react-native'

const HANGUL = /[ㄱ-ㆎ가-힣]/

/** 글자에 한글이 섞여 있으면 한글 고딕, 아니면 Orbitron */
export function gameFontFor(text: string): string {
  return HANGUL.test(text) ? 'BlackHanSans_400Regular' : 'Orbitron_900Black'
}

export function NeonText({ children, color, size = 30, style, align = 'center' }: {
  children: string
  /** 네온 색. 흰 심지 둘레로 이 색이 번진다 */
  color: string
  size?: number
  style?: StyleProp<ViewStyle>
  align?: TextStyle['textAlign']
}) {
  const fontFamily = gameFontFor(children)
  const base: TextStyle = {
    fontFamily,
    fontSize: size,
    textAlign: align,
    // Orbitron 은 자간이 좁아 게임 로고처럼 보이게 살짝 벌린다.
    // 한글은 벌리면 오히려 흩어져 보여 그대로 둔다.
    letterSpacing: fontFamily.startsWith('Orbitron') ? size * 0.06 : 0,
    // 글꼴 높이가 커서 위아래가 잘리는 것을 막는다
    lineHeight: size * 1.32,
    includeFontPadding: false,
  }

  return (
    <View style={[styles.wrap, style]}>
      {/* 바깥 후광 — 넓게 번진다 */}
      <Text
        style={[base, styles.layer, {
          color,
          textShadowColor: color,
          textShadowRadius: size * 0.75,
        }]}
        numberOfLines={2}
      >
        {children}
      </Text>
      {/* 가운데 — 색이 진해지는 구간 */}
      <Text
        style={[base, styles.layer, {
          color,
          textShadowColor: color,
          textShadowRadius: size * 0.35,
        }]}
        numberOfLines={2}
      >
        {children}
      </Text>
      {/* 심지 — 흰 글자. 이것만 자리를 차지하고 나머지는 겹쳐 그린다 */}
      <Text
        style={[base, {
          color: '#FFFFFF',
          textShadowColor: 'rgba(255,255,255,0.9)',
          textShadowRadius: size * 0.18,
          textShadowOffset: { width: 0, height: 0 },
        }]}
        numberOfLines={2}
      >
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignSelf: 'stretch' },
  // 겹쳐 그리는 층은 자리를 차지하지 않는다
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
})
