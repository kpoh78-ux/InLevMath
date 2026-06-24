import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { MissionType, MISSION_LABELS, MISSION_LEVEL } from '@inlevmath/shared'
import { Colors } from '../constants/colors'

interface Props {
  missionType: MissionType
  isActive?: boolean
  isCleared?: boolean
  onPress?: () => void
}

export function MissionCard({ missionType, isActive, isCleared, onPress }: Props) {
  const color = Colors.mission[missionType]
  const level = MISSION_LEVEL[missionType]

  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.cardActive, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.info}>
        <Text style={styles.level}>LEVEL {level}</Text>
        <Text style={styles.name}>{MISSION_LABELS[missionType]}</Text>
      </View>
      {isCleared && <Text style={styles.cleared}>✓ 클리어</Text>}
      {isActive && !isCleared && <Text style={[styles.active, { color }]}>진행중</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderLeftWidth: 4,
    opacity: 0.7,
  },
  cardActive: { opacity: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  info: { flex: 1 },
  level: { color: Colors.subtext, fontSize: 11, marginBottom: 2 },
  name: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cleared: { color: Colors.success, fontSize: 12, fontWeight: '700' },
  active: { fontSize: 12, fontWeight: '700' },
})
