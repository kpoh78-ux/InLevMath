import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../../store/authStore'
import { AbilityBar } from '../../components/AbilityBar'
import { LevelBadge } from '../../components/LevelBadge'
import { MissionCard } from '../../components/MissionCard'
import { Colors } from '../../constants/colors'
import { MISSION_ORDER, MISSION_LABELS, MissionType, AbilityScore } from '@inlevmath/shared'

// TODO: 실제 데이터는 API에서 가져옴 — 임시 Mock 데이터
const MOCK_PROGRESS = {
  currentLevel: 3,
  currentMission: 'basic_problem' as MissionType,
  abilityScore: { comprehension: 72, reasoning: 58, calculation: 45 } as AbilityScore,
  clearedMissions: ['concept_learning', 'concept_problem'] as MissionType[],
}

export default function StudentDashboard() {
  const { user, signOut } = useAuth()
  const { currentLevel, currentMission, abilityScore, clearedMissions } = MOCK_PROGRESS

  const currentMissionColor = Colors.mission[currentMission]

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>안녕하세요,</Text>
            <Text style={styles.name}>{user?.name} 학생 🎮</Text>
          </View>
          <TouchableOpacity onPress={signOut}>
            <Text style={styles.logout}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        {/* 레벨 카드 */}
        <View style={styles.levelCard}>
          <LevelBadge level={currentLevel} size="lg" />
          <View style={styles.levelInfo}>
            <Text style={styles.levelTitle}>현재 미션</Text>
            <Text style={[styles.missionName, { color: currentMissionColor }]}>
              {MISSION_LABELS[currentMission]}
            </Text>
            <TouchableOpacity
              style={[styles.inputBtn, { backgroundColor: currentMissionColor }]}
              onPress={() => router.push('/(student)/mission')}
            >
              <Text style={styles.inputBtnText}>결과 입력하기 →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 능력치 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>나의 능력치</Text>
          <View style={styles.card}>
            <AbilityBar label="이해력" value={abilityScore.comprehension} color={Colors.ability.comprehension} />
            <AbilityBar label="추론력" value={abilityScore.reasoning}     color={Colors.ability.reasoning} />
            <AbilityBar label="계산력" value={abilityScore.calculation}   color={Colors.ability.calculation} />
          </View>
        </View>

        {/* 미션 로드맵 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>미션 로드맵</Text>
          {MISSION_ORDER.map((m) => (
            <MissionCard
              key={m}
              missionType={m}
              isActive={m === currentMission}
              isCleared={clearedMissions.includes(m)}
            />
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingTop: 20, marginBottom: 24,
  },
  greeting: { color: Colors.subtext, fontSize: 14 },
  name: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  logout: { color: Colors.subtext, fontSize: 13 },
  levelCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  levelInfo: { flex: 1, marginLeft: 20 },
  levelTitle: { color: Colors.subtext, fontSize: 12, marginBottom: 4 },
  missionName: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  inputBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  inputBtnText: { color: Colors.bg, fontSize: 13, fontWeight: '700' },
  section: { marginBottom: 24 },
  sectionTitle: { color: Colors.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 20 },
})
