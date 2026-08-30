// apps/mobile/components/GameModals.tsx
//
// 미션 안내 · 레벨업 축하 창.
//
// 참고한 게임 화면의 구성을 그대로 옮겼다.
//   미션 창  — 클리어 조건 체크리스트 + 얻는 것 + 금색 "시작하기" 버튼
//   레벨업   — 숫자가 올라가는 연출 + 배경 입자
//
// 창틀과 등장 효과는 SystemModal 이 맡는다. 여기서는 안에 들어갈 내용만 만든다 —
// 앞으로 다른 창을 추가할 때도 같은 방식으로 SystemModal 안을 채우면 된다.

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  MISSION_LABELS, MISSION_CLEAR_THRESHOLD,
  type MissionType, type AbilityScore,
} from '@inlevmath/shared'
import { Colors } from '../constants/colors'
import { SystemModal, SystemLine } from './SystemModal'
import { useCountUp } from './fx'

/** 능력치 이름 — 홈 화면의 AbilityBar 와 같은 말을 쓴다 */
const ABILITY_LABELS: Record<keyof AbilityScore, string> = {
  comprehension: '이해력',
  reasoning: '추론력',
  calculation: '계산력',
}

// ── 미션 안내 ───────────────────────────────────────────────────────────────

/** 조건 한 줄 — 달성 여부를 앞의 표식으로 보여 준다 */
function Requirement({ text, done, color }: { text: string; done?: boolean; color: string }) {
  return (
    <View style={styles.reqRow}>
      <Text style={[styles.reqMark, { color: done ? Colors.success : color }]}>
        {done ? '✓' : '◆'}
      </Text>
      <Text style={[styles.reqText, done && styles.reqTextDone]}>{text}</Text>
    </View>
  )
}

export function MissionModal({
  visible, missionType, isActive, isCleared, onStart, onClose,
}: {
  visible: boolean
  missionType: MissionType | null
  /** 지금 진행 중인 미션인가 */
  isActive: boolean
  isCleared: boolean
  onStart: () => void
  onClose: () => void
}) {
  if (!missionType) return null

  const color = Colors.mission[missionType]
  const threshold = MISSION_CLEAR_THRESHOLD[missionType]

  // 아직 열리지 않은 미션은 시작할 수 없다 — 앞 미션부터 순서대로 푼다
  const locked = !isActive && !isCleared

  return (
    <SystemModal
      visible={visible}
      onClose={onClose}
      accent={color}
      eyebrow="MISSION"
      title={MISSION_LABELS[missionType]}
      confirmLabel={isCleared ? '확인' : locked ? '확인' : '시작하기'}
      onConfirm={isCleared || locked ? undefined : onStart}
      celebrate={isCleared}
    >
      <SystemLine center color={Colors.subtext}>
        {isCleared ? '이미 클리어한 미션입니다.'
          : locked ? '앞 미션을 먼저 클리어해야 열립니다.'
          : '문제를 풀고 결과를 입력하면 능력치가 오릅니다.'}
      </SystemLine>

      <View style={[styles.block, { borderColor: color + '44' }]}>
        <Text style={[styles.blockTitle, { color }]}>클리어 조건</Text>
        <Requirement color={color} done={isCleared} text={`정답률 ${threshold}% 이상`} />
        <Requirement color={color} done={isCleared} text="미션 결과를 앱에 입력" />
      </View>

      <View style={[styles.block, { borderColor: color + '44' }]}>
        <Text style={[styles.blockTitle, { color }]}>얻는 것</Text>
        <Requirement color={color} text="이해력 · 추론력 · 계산력 상승" />
        <Requirement color={color} text="클리어하면 다음 미션 개방" />
      </View>
    </SystemModal>
  )
}

// ── 레벨업 ──────────────────────────────────────────────────────────────────

export function LevelUpModal({
  visible, from, to, ability, onClose,
}: {
  visible: boolean
  from: number
  to: number
  ability: AbilityScore
  onClose: () => void
}) {
  // 숫자가 세어 올라가는 연출. '애니메이션 줄이기'를 켠 기기에서는 바로 결과가 나온다
  const level = useCountUp(from, to, visible)

  return (
    <SystemModal
      visible={visible}
      onClose={onClose}
      accent={Colors.gold}
      eyebrow="LEVEL UP"
      title="레벨이 올랐습니다"
      confirmLabel="확인"
      celebrate
      dismissOnBackdrop={false}
    >
      <View style={styles.levelRow}>
        <Text style={styles.levelFrom}>Lv.{from}</Text>
        <Text style={styles.levelArrow}>▶</Text>
        <Text style={styles.levelTo}>Lv.{level}</Text>
      </View>

      <View style={[styles.block, { borderColor: Colors.gold + '44' }]}>
        <Text style={[styles.blockTitle, { color: Colors.gold }]}>현재 능력치</Text>
        {(Object.keys(ability) as (keyof AbilityScore)[]).map(key => (
          <View key={key} style={styles.abilityRow}>
            <Text style={[styles.abilityName, { color: Colors.ability[key] }]}>
              {ABILITY_LABELS[key]}
            </Text>
            <Text style={styles.abilityValue}>{ability[key]}</Text>
          </View>
        ))}
      </View>

      <SystemLine center color={Colors.subtext}>
        다음 미션이 열렸습니다. 계속 올라가 봅시다.
      </SystemLine>
    </SystemModal>
  )
}

const styles = StyleSheet.create({
  block: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', gap: 6,
  },
  blockTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },

  reqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reqMark: { fontSize: 12, lineHeight: 20, width: 14 },
  reqText: { flex: 1, color: Colors.white, fontSize: 13, lineHeight: 20 },
  reqTextDone: { color: Colors.subtext, textDecorationLine: 'line-through' },

  levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  levelFrom: { color: Colors.subtext, fontSize: 20, fontWeight: '700' },
  levelArrow: { color: Colors.gold, fontSize: 14 },
  levelTo: {
    color: Colors.gold, fontSize: 34, fontWeight: '800',
    textShadowColor: 'rgba(253,203,110,0.8)', textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },

  abilityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  abilityName: { fontSize: 13, fontWeight: '700' },
  abilityValue: { color: Colors.white, fontSize: 14, fontWeight: '800' },
})
