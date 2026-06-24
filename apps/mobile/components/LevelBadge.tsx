import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

interface Props {
  level: number
  size?: 'sm' | 'lg'
}

export function LevelBadge({ level, size = 'lg' }: Props) {
  const isLg = size === 'lg'
  return (
    <View style={[styles.badge, isLg ? styles.badgeLg : styles.badgeSm]}>
      <Text style={styles.lv}>LV</Text>
      <Text style={[styles.number, isLg ? styles.numberLg : styles.numberSm]}>{level}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.gold,
  },
  badgeLg: { width: 80, height: 80 },
  badgeSm: { width: 44, height: 44 },
  lv: { color: Colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  number: { color: Colors.white, fontWeight: '900' },
  numberLg: { fontSize: 28 },
  numberSm: { fontSize: 16 },
})
