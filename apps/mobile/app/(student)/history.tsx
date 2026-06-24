import { View, Text, FlatList, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { MissionResult, MISSION_LABELS, calcCorrectRate } from '@inlevmath/shared'

// TODO: 실제 데이터는 API에서 가져옴
const MOCK_HISTORY: MissionResult[] = [
  { id: '1', studentId: 'student-1', missionType: 'concept_problem', totalProblems: 20, correctProblems: 16, source: 'manual',   solvedAt: '2026-06-24', createdAt: '2026-06-24' },
  { id: '2', studentId: 'student-1', missionType: 'concept_learning', totalProblems: 15, correctProblems: 15, source: 'mathflat', solvedAt: '2026-06-23', createdAt: '2026-06-23' },
  { id: '3', studentId: 'student-1', missionType: 'basic_problem',    totalProblems: 30, correctProblems: 18, source: 'manual',   solvedAt: '2026-06-22', createdAt: '2026-06-22' },
  { id: '4', studentId: 'student-1', missionType: 'concept_problem',  totalProblems: 20, correctProblems: 12, source: 'mathflat', solvedAt: '2026-06-20', createdAt: '2026-06-20' },
]

function HistoryItem({ item }: { item: MissionResult }) {
  const rate = calcCorrectRate(item.totalProblems, item.correctProblems)
  const color = Colors.mission[item.missionType]
  const isGood = rate >= 70

  return (
    <View style={styles.item}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemMission}>{MISSION_LABELS[item.missionType]}</Text>
        <Text style={styles.itemDate}>
          {item.solvedAt} · {item.source === 'mathflat' ? '매쓰플랫' : '수동입력'}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemRate, { color: isGood ? Colors.success : Colors.gold }]}>
          {rate}%
        </Text>
        <Text style={styles.itemScore}>
          {item.correctProblems}/{item.totalProblems}
        </Text>
      </View>
    </View>
  )
}

export default function HistoryScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.pageTitle}>학습 이력</Text>
      <FlatList
        data={MOCK_HISTORY}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <HistoryItem item={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>아직 입력된 학습 이력이 없습니다.</Text>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pageTitle: { color: Colors.white, fontSize: 22, fontWeight: '800', paddingHorizontal: 20, paddingTop: 20, marginBottom: 16 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  item: {
    backgroundColor: Colors.card, borderRadius: 12,
    padding: 16, flexDirection: 'row',
    alignItems: 'center', marginBottom: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  itemInfo: { flex: 1 },
  itemMission: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  itemDate: { color: Colors.subtext, fontSize: 12, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemRate: { fontSize: 18, fontWeight: '900' },
  itemScore: { color: Colors.subtext, fontSize: 12 },
  empty: { color: Colors.subtext, textAlign: 'center', marginTop: 60 },
})
