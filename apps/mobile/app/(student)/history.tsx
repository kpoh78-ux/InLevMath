import { useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { apiFetch } from '../../store/api'
import { Colors } from '../../constants/colors'
import { MissionResult, MISSION_LABELS, calcCorrectRate } from '@inlevmath/shared'

/** ISO 날짜/시각 → "2026-08-27" */
function toDateLabel(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
          {toDateLabel(item.solvedAt)} · {item.source === 'mathflat' ? '매쓰플랫' : '수동입력'}
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
  const [results, setResults] = useState<MissionResult[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await apiFetch('/api/missions/results')
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '학습 이력을 불러오지 못했습니다.')
        return
      }
      setResults(await res.json())
      setError(null)
    } catch {
      setError('인터넷 연결을 확인해주세요.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // 미션 결과를 입력하고 돌아오면 목록이 바로 갱신되도록 화면에 들어올 때마다 읽는다
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.pageTitle}>학습 이력</Text>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <HistoryItem item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ?? '아직 입력된 학습 이력이 없습니다.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pageTitle: { color: Colors.white, fontSize: 22, fontWeight: '800', paddingHorizontal: 20, paddingTop: 20, marginBottom: 16 },
  loader: { marginTop: 60 },
  list: { paddingHorizontal: 20, paddingBottom: 32, flexGrow: 1 },
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
  empty: { color: Colors.subtext, textAlign: 'center', marginTop: 60, lineHeight: 22 },
})
