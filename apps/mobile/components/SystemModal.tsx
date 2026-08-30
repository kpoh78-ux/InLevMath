// apps/mobile/components/SystemModal.tsx
//
// 게임 '시스템 창' 스타일 팝업 — 숙제·학습미션·클리닉·레벨업 안내에 공통으로 쓴다.
//
// 학생이 게임처럼 느끼게 만드는 것이 이 앱의 목적이라, 알림도 OS 기본 Alert 대신
// 이 창을 쓴다. 참고한 화면의 요소를 그대로 옮겼다.
//   · 청록 발광 이중 테두리와 네 모서리 꺾쇠
//   · 가운데 빛점이 있는 제목 구분선
//   · 안쪽 어두운 본문 패널 (모서리 꺾쇠)
//   · 아래 금색 입체 버튼
//
// 시각 효과는 components/fx.tsx 가 맡는다. **이 창을 쓰면 효과가 따라온다** —
// 앞으로 만드는 팝업도 SystemModal 만 쓰면 같은 연출을 그대로 얻는다.
//   등장(확대+페이드) · 발광 맥박 · 빛줄기 한 번 · 모서리 번쩍임
//
// expo-linear-gradient·react-native-svg 를 쓰지 않고 View 겹치기로만 만들었다.
// 의존성을 늘리면 APK 빌드 준비가 그만큼 복잡해진다.

import React, { useEffect, useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity, ScrollView, Animated,
  StyleSheet, useWindowDimensions,
} from 'react-native'
import { Colors } from '../constants/colors'
import { useEntrance, usePulse, Sweep, Flare, Motes } from './fx'

type Props = {
  visible: boolean
  /** 창의 강조색. 종류마다 다르게 준다 (숙제=금색, 오답클리닉=빨강 …) */
  accent?: string
  /** 제목 위 작은 말머리. 예: "긴급 퀘스트" */
  eyebrow?: string
  title: string
  children: React.ReactNode
  confirmLabel?: string
  onConfirm?: () => void
  /** 배경을 눌러 닫을 수 있게 할지. 중요한 안내는 false 로 둔다 */
  dismissOnBackdrop?: boolean
  /** 오른쪽 위 X 닫기 버튼 */
  showClose?: boolean
  /** 축하하는 자리(레벨업 등)에 배경 입자를 띄운다 */
  celebrate?: boolean
  onClose: () => void
}

/** 모서리 꺾쇠 — 네 귀퉁이에 하나씩 */
function Corner({ pos, color, size = 16 }: {
  pos: 'tl' | 'tr' | 'bl' | 'br'
  color: string
  size?: number
}) {
  const isTop = pos === 'tl' || pos === 'tr'
  const isLeft = pos === 'tl' || pos === 'bl'
  return (
    <View
      pointerEvents="none"
      style={[
        styles.corner,
        { width: size, height: size, borderColor: color },
        isTop ? { top: -1, borderTopWidth: 2 } : { bottom: -1, borderBottomWidth: 2 },
        isLeft ? { left: -1, borderLeftWidth: 2 } : { right: -1, borderRightWidth: 2 },
      ]}
    />
  )
}

export function SystemModal({
  visible,
  accent = Colors.secondary,
  eyebrow,
  title,
  children,
  confirmLabel = '확인',
  onConfirm,
  dismissOnBackdrop = true,
  showClose = true,
  celebrate = false,
  onClose,
}: Props) {
  const { width } = useWindowDimensions()
  // 태블릿에서 창이 좌우로 늘어지지 않게 묶어 둔다
  const panelWidth = Math.min(width - 40, 420)

  // 닫힐 때도 연출을 보여 주려면 곧바로 언마운트하면 안 된다.
  // visible 이 꺼져도 나가는 애니메이션이 끝날 때까지 붙잡아 둔다.
  const [mounted, setMounted] = useState(visible)
  const fx = useEntrance(mounted && visible)
  const glow = usePulse(mounted)

  useEffect(() => {
    if (visible) setMounted(true)
  }, [visible])

  useEffect(() => {
    if (visible || !mounted) return
    fx.playOut(() => setMounted(false))
    // fx 는 매 렌더 새 객체지만 애니메이션 값은 ref 라 안정적이다.
    // 여기서 fx 를 의존성에 넣으면 나가는 연출이 매번 다시 시작된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted])

  const close = () => {
    // 부모의 visible 을 내리면 위 효과가 나가는 연출을 재생하고 언마운트한다
    onClose()
  }

  const confirm = () => {
    onConfirm?.()
    close()
  }

  if (!mounted) return null

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[styles.backdropFill, fx.backdropStyle]} />
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={dismissOnBackdrop ? close : undefined}
      >
        {/* 창 자체를 누르면 닫히지 않게 이벤트를 막는다 */}
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <Animated.View style={fx.panelStyle}>
            <View style={{ width: panelWidth }}>
              {/* 발광은 패널 **뒤에 깔리는 별도 층**이다.
                  패널을 감싸면 맥박이 내용물까지 흐리게 만든다 (뒤 화면이 비쳤다). */}
              <Animated.View
                pointerEvents="none"
                style={[styles.glowOuter, { borderColor: accent + '33', opacity: glow }]}
              />
              <Animated.View
                pointerEvents="none"
                style={[styles.glowInner, { borderColor: accent + '55', opacity: glow }]}
              />
              <View style={[styles.panel, { borderColor: accent }]}>
                  {/* 빛줄기·입자가 창 밖으로 새지 않게 잘라 내는 층 */}
                  <View pointerEvents="none" style={styles.fxClip}>
                    <Sweep play={visible} accent={accent} width={panelWidth} />
                    <Motes play={celebrate && visible} accent={accent} />
                  </View>

                  <Flare play={visible} style={styles.cornerLayer}>
                    <Corner pos="tl" color={accent} />
                    <Corner pos="tr" color={accent} />
                    <Corner pos="bl" color={accent} />
                    <Corner pos="br" color={accent} />
                  </Flare>

                  {showClose && (
                    <TouchableOpacity
                      style={styles.closeBtn}
                      onPress={close}
                      activeOpacity={0.7}
                      // 아이콘이 작아도 손가락이 닿는 범위를 넓혀 둔다
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Text style={styles.closeText}>✕</Text>
                    </TouchableOpacity>
                  )}

                  {/* 제목 */}
                  <View style={styles.header}>
                    {eyebrow ? (
                      <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
                    ) : null}
                    <Text style={styles.title}>{title}</Text>
                  </View>

                  {/* 구분선 — 가운데 빛점 */}
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: accent + '44' }]} />
                    <Animated.View
                      style={[
                        styles.dividerGem,
                        { backgroundColor: accent, shadowColor: accent, opacity: glow },
                      ]}
                    />
                    <View style={[styles.dividerLine, { backgroundColor: accent + '44' }]} />
                  </View>

                  {/* 본문 */}
                  <View style={[styles.body, { borderColor: accent + '33' }]}>
                    <Corner pos="tl" color={accent + '99'} size={10} />
                    <Corner pos="tr" color={accent + '99'} size={10} />
                    <Corner pos="bl" color={accent + '99'} size={10} />
                    <Corner pos="br" color={accent + '99'} size={10} />
                    <ScrollView
                      style={{ maxHeight: 320 }}
                      contentContainerStyle={styles.bodyInner}
                      showsVerticalScrollIndicator={false}
                    >
                      {children}
                    </ScrollView>
                  </View>

                  {/* 버튼 */}
                  <View style={[styles.footerLine, { backgroundColor: accent + '33' }]} />
                  <TouchableOpacity style={styles.button} onPress={confirm} activeOpacity={0.85}>
                    <View style={styles.buttonBevel}>
                      <Text style={styles.buttonText}>{confirmLabel}</Text>
                    </View>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

/** 본문 한 줄 — 색을 주어 강조할 수 있다 */
export function SystemLine({ children, color, bold, center }: {
  children: React.ReactNode
  color?: string
  bold?: boolean
  center?: boolean
}) {
  return (
    <Text
      style={[
        styles.line,
        color ? { color } : null,
        bold ? { fontWeight: '800' } : null,
        center ? { textAlign: 'center' } : null,
      ]}
    >
      {children}
    </Text>
  )
}

/** 퀘스트 한 줄 — 아이콘 · 이름 · 개수 */
export function SystemQuestRow({ icon, label, count, color, hint }: {
  icon: string
  label: string
  count: number
  color: string
  hint?: string
}) {
  return (
    <View style={[styles.questRow, { borderColor: color + '44' }]}>
      <Text style={styles.questIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.questLabel, { color }]}>{label}</Text>
        {hint ? <Text style={styles.questHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.questCount, { backgroundColor: color }]}>
        <Text style={styles.questCountText}>{count}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // 배경을 별도 층으로 둬서 창과 따로 페이드시킨다
  backdropFill: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(6,8,20,0.86)',
  },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  glowOuter: {
    position: 'absolute', top: -7, right: -7, bottom: -7, left: -7,
    borderWidth: 3, borderRadius: 11,
  },
  glowInner: {
    position: 'absolute', top: -3, right: -3, bottom: -3, left: -3,
    borderWidth: 1, borderRadius: 7,
  },
  panel: {
    borderWidth: 2,
    borderRadius: 5,
    backgroundColor: '#0E1430',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  fxClip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  cornerLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  corner: { position: 'absolute' },

  closeBtn: {
    position: 'absolute', top: 6, right: 8, zIndex: 2,
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: Colors.subtext, fontSize: 17, fontWeight: '700' },

  header: { alignItems: 'center', paddingHorizontal: 26 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  title: {
    color: Colors.white, fontSize: 19, fontWeight: '800', letterSpacing: 1,
    textShadowColor: 'rgba(120,200,255,0.7)', textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1 },
  dividerGem: {
    width: 7, height: 7, marginHorizontal: 6,
    transform: [{ rotate: '45deg' }],
    shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  body: { borderWidth: 1, borderRadius: 3, backgroundColor: 'rgba(10,16,40,0.75)' },
  bodyInner: { paddingHorizontal: 14, paddingVertical: 16, gap: 10 },
  line: { color: Colors.white, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  questRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  questIcon: { fontSize: 18 },
  questLabel: { fontSize: 14, fontWeight: '700' },
  questHint: { fontSize: 11, color: Colors.subtext, marginTop: 2 },
  questCount: {
    minWidth: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7,
  },
  questCountText: { color: '#0E1430', fontSize: 13, fontWeight: '800' },

  footerLine: { height: 1, marginTop: 16, marginBottom: 14 },
  // 터치 대상 최소 44dp (CLAUDE.md 제약)
  button: { alignSelf: 'center', minWidth: 160, minHeight: 46 },
  buttonBevel: {
    backgroundColor: Colors.gold,
    borderRadius: 4,
    borderTopWidth: 2, borderTopColor: '#FFE9A8',
    borderBottomWidth: 3, borderBottomColor: '#B98B25',
    borderLeftWidth: 1, borderLeftColor: '#F2CE72',
    borderRightWidth: 1, borderRightColor: '#C9992F',
    paddingVertical: 11, paddingHorizontal: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { color: '#3A2A05', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
})
