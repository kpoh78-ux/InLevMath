import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

interface Props {
  label: string
  value: number   // 0~100
  color: string
}

export function AbilityBar({ label, value, color }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color }]}>{value}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: Colors.subtext, fontSize: 13 },
  value: { fontSize: 13, fontWeight: '700' },
  track: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
})
