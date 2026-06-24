import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { APP_LIMITS, MISSION_LABELS, MissionType } from '@inlevmath/shared'
import { LevelBadge } from '../../components/LevelBadge'

// TODO: 실제 데이터는 API에서 가져옴
const MOCK_STUDENTS = [
  { id: 's1', name: '홍길동', level: 3, currentMission: 'basic_problem' as MissionType,    lastActive: '오늘',   comprehension: 72, reasoning: 58, calculation: 45 },
  { id: 's2', name: '김철수', level: 1, currentMission: 'concept_learning' as MissionType, lastActive: '어제',   comprehension: 40, reasoning: 20, calculation: 15 },
  { id: 's3', name: '이영희', level: 5, currentMission: 'top_problem' as MissionType,      lastActive: '오늘',   comprehension: 91, reasoning: 88, calculation: 85 },
  { id: 's4', name: '박지민', level: 2, currentMission: 'concept_problem' as MissionType,  lastActive: '3일 전', comprehension: 65, reasoning: 40, calculation: 32 },
]

export default function StudentsScreen() {
  const [search, setSearch] = useState('')
  const registrationCode = 'OMATH-2026'  // TODO: 선생님별 고유 코드를 서버에서 발급

  const filtered = MOCK_STUDENTS.filter(s =>
    s.name.includes(search) || MISSION_LABELS[s.currentMission].includes(search)
  )

  const showCode = () => {
    Alert.alert(
      '학원 등록 코드',
      `학생에게 아래 코드를 전달해주세요:\n\n${registrationCode}\n\n학생 등록 현황: ${MOCK_STUDENTS.length}/${APP_LIMITS.maxStudents}명`,
      [{ text: '확인' }]
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>학생 관리</Text>
        <TouchableOpacity style={styles.codeBtn} onPress={showCode}>
          <Text style={styles.codeBtnText}>등록 코드</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          총 {MOCK_STUDENTS.length}명
          <Text style={styles.countMax}> / {APP_LIMITS.maxStudents}명</Text>
        </Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="학생 이름 또는 미션 검색"
        placeholderTextColor={Colors.subtext}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <LevelBadge level={item.level} size="sm" />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={[styles.cardMission, { color: Colors.mission[item.currentMission] }]}>
                  {MISSION_LABELS[item.currentMission]}
                </Text>
              </View>
              <Text style={styles.lastActive}>{item.lastActive}</Text>
            </View>
            <View style={styles.abilityRow}>
              {[
                { label: '이해력', value: item.comprehension, color: Colors.ability.comprehension },
                { label: '추론력', value: item.reasoning,     color: Colors.ability.reasoning },
                { label: '계산력', value: item.calculation,   color: Colors.ability.calculation },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.abilityStat}>
                  <Text style={[styles.abilityValue, { color }]}>{value}</Text>
                  <Text style={styles.abilityLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>검색 결과가 없습니다.</Text>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, marginBottom: 4,
  },
  pageTitle: { color: Colors.white, fontSize: 22, fontWeight: '800' },
  codeBtn: {
    backgroundColor: Colors.secondary, borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  codeBtnText: { color: Colors.bg, fontSize: 13, fontWeight: '700' },
  countRow: { paddingHorizontal: 20, marginBottom: 12 },
  countText: { color: Colors.subtext, fontSize: 13 },
  countMax: { color: Colors.border },
  search: {
    backgroundColor: Colors.card, color: Colors.white,
    borderRadius: 10, padding: 12, marginHorizontal: 20,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cardMission: { fontSize: 12, marginTop: 2 },
  lastActive: { color: Colors.subtext, fontSize: 12 },
  abilityRow: { flexDirection: 'row', justifyContent: 'space-around' },
  abilityStat: { alignItems: 'center' },
  abilityValue: { fontSize: 20, fontWeight: '900' },
  abilityLabel: { color: Colors.subtext, fontSize: 11, marginTop: 2 },
  empty: { color: Colors.subtext, textAlign: 'center', marginTop: 40 },
})
