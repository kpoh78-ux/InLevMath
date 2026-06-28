import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ToastAndroid, Platform, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAuth } from '../../store/authStore'
import { useEvents } from '../../store/useEvents'
import { AbilityBar } from '../../components/AbilityBar'
import { LevelBadge } from '../../components/LevelBadge'
import { MissionCard } from '../../components/MissionCard'
import { Colors } from '../../constants/colors'
import { MISSION_ORDER, MISSION_LABELS, MissionType, AbilityScore, WorksheetStep } from '@inlevmath/shared'

type DistributedWS = {
  id: string; title: string; step: WorksheetStep
  totalProblems: number; status: 'distributed' | 'submitted' | 'graded'
  correctProblems?: number; distributedAt: string
}

const MOCK_WORKSHEETS: DistributedWS[] = [
  { id: 'dw1', title: '수완하나중 1-1 기말 모의고사_03회', step: '최다빈출', totalProblems: 24, status: 'distributed', distributedAt: '오늘 09:30' },
  { id: 'dw2', title: '정수와 유리수 기초 확인', step: '기초', totalProblems: 15, status: 'graded', correctProblems: 13, distributedAt: '어제' },
]

const STEP_COLOR_MAP: Record<WorksheetStep, string> = {
  '기초': '#74B9FF', '기본': '#55EFC4', '발전': '#FDCB6E', '최상위': '#E17055',
  '최다빈출': '#A29BFE', '최다오답': '#FD79A8', '서술형': '#FF7675',
}

const INITIAL_PROGRESS = {
  currentLevel: 3,
  currentMission: 'basic_problem' as MissionType,
  abilityScore: { comprehension: 72, reasoning: 58, calculation: 45 } as AbilityScore,
  clearedMissions: ['concept_learning', 'concept_problem'] as MissionType[],
}

function showToast(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT)
  else Alert.alert('알림', msg)
}

export default function StudentDashboard() {
  const { user, signOut } = useAuth()
  const [progress, setProgress] = useState(INITIAL_PROGRESS)
  const { currentLevel, currentMission, abilityScore, clearedMissions } = progress

  // SSE 실시간 이벤트 수신 — 레벨업 알림
  const onEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    if (event.type === 'LEVEL_UP') {
      showToast('🎉 미션 클리어! 다음 레벨로 올라갔어요!')
      // TODO: API에서 최신 progress fetch 후 setProgress
      setProgress(prev => ({
        ...prev,
        currentLevel: prev.currentLevel + 1,
      }))
    }
  }, [])

  useEvents(onEvent)

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
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => router.push('/(student)/change-password')}>
              <Text style={styles.pwChange}>비밀번호 변경</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut}>
              <Text style={styles.logout}>로그아웃</Text>
            </TouchableOpacity>
          </View>
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

        {/* 배포된 학습지 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>배포된 학습지</Text>
          {MOCK_WORKSHEETS.length === 0 ? (
            <View style={styles.card}>
              <Text style={{ color: Colors.subtext, fontSize: 13, textAlign: 'center' }}>배포된 학습지가 없습니다</Text>
            </View>
          ) : MOCK_WORKSHEETS.map(ws => {
            const stepColor = STEP_COLOR_MAP[ws.step]
            const isDone = ws.status === 'graded'
            return (
              <TouchableOpacity
                key={ws.id}
                style={[styles.wsCard, isDone && styles.wsCardDone]}
                onPress={() => {
                  if (isDone) return
                  router.push({ pathname: '/(student)/worksheet-grade', params: { id: ws.id, title: ws.title, step: ws.step, total: ws.totalProblems } })
                }}
                activeOpacity={isDone ? 1 : 0.75}
              >
                <View style={styles.wsTop}>
                  <View style={[styles.stepBadge, { backgroundColor: stepColor + '30', borderColor: stepColor }]}>
                    <Text style={[styles.stepText, { color: stepColor }]}>{ws.step}</Text>
                  </View>
                  {isDone ? (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneText}>채점 완료</Text>
                    </View>
                  ) : (
                    <Text style={styles.newBadge}>채점 입력 →</Text>
                  )}
                </View>
                <Text style={[styles.wsTitle, isDone && { color: Colors.subtext }]} numberOfLines={1}>{ws.title}</Text>
                <View style={styles.wsBottom}>
                  <Text style={styles.wsInfo}>{ws.totalProblems}문제</Text>
                  {isDone && ws.correctProblems != null && (
                    <Text style={[styles.wsScore, { color: stepColor }]}>
                      {ws.correctProblems}/{ws.totalProblems} ({Math.round(ws.correctProblems / ws.totalProblems * 100)}%)
                    </Text>
                  )}
                  <Text style={styles.wsDate}>{ws.distributedAt}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
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
  headerRight: { alignItems: 'flex-end', gap: 4 },
  pwChange: { color: Colors.secondary, fontSize: 11 },
  logout: { color: Colors.subtext, fontSize: 13 },
  levelCard: {
    backgroundColor: Colors.card, borderRadius: 16,
    padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 24,
  },
  levelInfo: { flex: 1, marginLeft: 20 },
  levelTitle: { color: Colors.subtext, fontSize: 12, marginBottom: 4 },
  missionName: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  inputBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' },
  inputBtnText: { color: Colors.bg, fontSize: 13, fontWeight: '700' },
  section: { marginBottom: 24 },
  sectionTitle: { color: Colors.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 20 },
  // 학습지 카드
  wsCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  wsCardDone: { opacity: 0.7 },
  wsTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  stepBadge: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8,
  },
  stepText: { fontSize: 11, fontWeight: '700' },
  doneBadge: {
    backgroundColor: Colors.success + '20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
  },
  doneText: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  newBadge: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  wsTitle: { color: Colors.white, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  wsBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wsInfo: { fontSize: 11, color: Colors.subtext },
  wsScore: { fontSize: 12, fontWeight: '700' },
  wsDate: { fontSize: 11, color: Colors.subtext, marginLeft: 'auto' },
})
