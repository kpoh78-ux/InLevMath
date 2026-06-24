import React from 'react'
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../../store/authStore'
import { LevelBadge } from '../../components/LevelBadge'
import { Colors } from '../../constants/colors'
import { APP_LIMITS, MISSION_LABELS, MissionType } from '@inlevmath/shared'

// TODO: 실제 데이터는 API에서 가져옴
const MOCK_STUDENTS = [
  { id: 's1', name: '홍길동', level: 3, currentMission: 'basic_problem' as MissionType,    lastActive: '오늘' },
  { id: 's2', name: '김철수', level: 1, currentMission: 'concept_learning' as MissionType, lastActive: '어제' },
  { id: 's3', name: '이영희', level: 5, currentMission: 'top_problem' as MissionType,      lastActive: '오늘' },
  { id: 's4', name: '박지민', level: 2, currentMission: 'concept_problem' as MissionType,  lastActive: '3일 전' },
]

export default function TeacherDashboard() {
  const { user, signOut } = useAuth()
  const studentCount = MOCK_STUDENTS.length

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>선생님 대시보드</Text>
            <Text style={styles.name}>{user?.name} 👨‍🏫</Text>
          </View>
          <TouchableOpacity onPress={signOut}>
            <Text style={styles.logout}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        {/* 통계 요약 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{studentCount}</Text>
            <Text style={styles.statLabel}>등록 학생</Text>
            <Text style={styles.statMax}>/ {APP_LIMITS.maxStudents}명</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {MOCK_STUDENTS.filter(s => s.lastActive === '오늘').length}
            </Text>
            <Text style={styles.statLabel}>오늘 활동</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.gold }]}>
              {MOCK_STUDENTS.filter(s => s.currentMission === 'top_problem').length}
            </Text>
            <Text style={styles.statLabel}>최상위 달성</Text>
          </View>
        </View>

        {/* 학생 목록 요약 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>학생 현황</Text>
            <TouchableOpacity onPress={() => router.push('/(teacher)/students')}>
              <Text style={styles.sectionMore}>전체보기 →</Text>
            </TouchableOpacity>
          </View>
          {MOCK_STUDENTS.slice(0, 3).map((s) => (
            <View key={s.id} style={styles.studentRow}>
              <LevelBadge level={s.level} size="sm" />
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{s.name}</Text>
                <Text style={[styles.studentMission, { color: Colors.mission[s.currentMission] }]}>
                  {MISSION_LABELS[s.currentMission]}
                </Text>
              </View>
              <Text style={styles.lastActive}>{s.lastActive}</Text>
            </View>
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
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: Colors.card,
    borderRadius: 14, padding: 16, alignItems: 'center',
  },
  statValue: { color: Colors.white, fontSize: 28, fontWeight: '900' },
  statLabel: { color: Colors.subtext, fontSize: 11, marginTop: 2 },
  statMax: { color: Colors.border, fontSize: 10, marginTop: 1 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  sectionMore: { color: Colors.secondary, fontSize: 13 },
  studentRow: {
    backgroundColor: Colors.card, borderRadius: 12,
    padding: 14, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8,
  },
  studentInfo: { flex: 1, marginLeft: 12 },
  studentName: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  studentMission: { fontSize: 12, marginTop: 2 },
  lastActive: { color: Colors.subtext, fontSize: 12 },
})
