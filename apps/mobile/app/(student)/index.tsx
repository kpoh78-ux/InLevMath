import { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ToastAndroid, Platform, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAuth } from '../../store/authStore'
import { useBgm } from '../../store/useBgm'
import { useEvents } from '../../store/useEvents'
import { apiFetch } from '../../store/api'
import { AbilityBar } from '../../components/AbilityBar'
import { LevelBadge } from '../../components/LevelBadge'
import { MissionCard } from '../../components/MissionCard'
import { SystemModal, SystemLine, SystemQuestRow } from '../../components/SystemModal'
import { MissionModal, LevelUpModal } from '../../components/GameModals'
import { Colors } from '../../constants/colors'
import { MISSION_ORDER, MISSION_LABELS, MissionType, AbilityScore, stepDisplayLabel } from '@inlevmath/shared'

type TextbookItem = {
  textbookId: string; title: string; grade: string; publisher: string
  totalProblems: number; submittedCount: number
  correctRate: number | null; completed: boolean
}

type DistributedWS = {
  distributionId: string
  worksheetId: string
  title: string
  step: string
  examSubType?: string | null
  totalProblems: number
  status: 'distributed' | 'submitted' | 'graded'
  correctProblems?: number | null
  distributedAt: string
  /** 숙제로 지정된 시각. null 이면 수업 중 푸는 일반 배포 */
  homeworkAt?: string | null
  /** 아직 안 낸 숙제인가 — 채점을 마치면 false 가 된다 */
  isHomework?: boolean
}

// 클리닉 — 틀린 문제로 다시 만든 학습지. 일반 배포와 성격이 다르므로 따로 센다.
//   취약유형: 자주 틀리는 유형을 모아 다시 낸 것 (유형 단위)
//   오답유형: 실제로 틀린 문항을 다시 낸 것 (문항 단위)
const CLINIC_STEPS = ['취약유형', '오답유형'] as const

const STEP_COLOR_MAP: Record<string, string> = {
  '기초': '#74B9FF', '기본': '#55EFC4', '발전': '#FDCB6E', '최상위': '#E17055',
  '취약유형': '#D980FA', '오답유형': '#FF6B6B', '단원평가': '#7C83FD',
  '최다빈출': '#A29BFE', '최다오답': '#FD79A8', '서술형': '#FF7675', '모의고사': '#00B894', '기출문제': '#00CEC9',
}

type Progress = {
  currentLevel: number
  currentMission: MissionType
  abilityScore: AbilityScore
  clearedMissions: MissionType[]
}

// 서버에서 읽어오기 전 화면이 깨지지 않게 두는 최소값.
// 예전에는 여기에 Lv3 / 능력치 72·58·45가 박혀 있어 모든 학생이 같은 값을 봤다.
const EMPTY_PROGRESS: Progress = {
  currentLevel: 1,
  currentMission: 'concept_learning',
  abilityScore: { comprehension: 0, reasoning: 0, calculation: 0 },
  clearedMissions: [],
}

function showToast(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT)
  else Alert.alert('알림', msg)
}

export default function StudentDashboard() {
  const { user, signOut } = useAuth()
  const bgm = useBgm()
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS)
  const [worksheets, setWorksheets] = useState<DistributedWS[]>([])
  // 퀘스트 안내 창. 앱을 열 때 한 번만 뜨고, 새 학습지가 오면 다시 뜬다.
  // 매번 뜨면 잔소리가 되므로 화면을 다시 그릴 때는 뜨지 않는다.
  const [questOpen, setQuestOpen] = useState(false)
  const questShown = useRef(false)
  // 미션 카드를 누르면 열리는 안내 창
  const [missionOpen, setMissionOpen] = useState<MissionType | null>(null)
  // 레벨업 축하 창. 올라가기 전 레벨을 알아야 숫자 연출을 만들 수 있다
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null)
  const levelBefore = useRef<number | null>(null)
  // 지금 레벨을 ref 로도 들고 있는다 — SSE 콜백이 useCallback 이라
  // progress 를 직접 읽으면 이벤트 구독이 매번 다시 걸린다
  const levelNow = useRef(0)
  const [textbooks, setTextbooks] = useState<TextbookItem[]>([])
  const [loadingWS, setLoadingWS] = useState(true)
  const { currentLevel, currentMission, abilityScore, clearedMissions } = progress

  // 레벨·능력치·미션 진행 상황 fetch
  const fetchProgress = useCallback(async () => {
    try {
      const res = await apiFetch('/api/student/progress')
      if (!res.ok) return
      const data = await res.json()
      setProgress({
        currentLevel: data.currentLevel,
        currentMission: data.currentMission,
        abilityScore: data.abilityScore,
        clearedMissions: data.clearedMissions ?? [],
      })
    } catch { /* 무시 — 다음 진입에서 다시 읽는다 */ }
  }, [])

  // 배정된 교재 fetch
  const fetchTextbooks = useCallback(async () => {
    try {
      const res = await apiFetch('/api/student/textbooks')
      if (res.ok) setTextbooks(await res.json())
    } catch { /* 무시 */ }
  }, [])

  // 배포된 학습지 fetch
  const fetchWorksheets = useCallback(async () => {
    setLoadingWS(true)
    try {
      const res = await apiFetch('/api/student/worksheets')
      if (res.ok) setWorksheets(await res.json())
    } finally {
      setLoadingWS(false)
    }
  }, [])

  const onEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    if (event.type === 'LEVEL_UP') {
      // 새 값을 받기 전에 지금 레벨을 붙잡아 둔다. 받은 뒤에는 알 수 없다.
      levelBefore.current = levelNow.current
      fetchProgress()
    } else if (event.type === 'NEW_MISSION') {
      showToast('📝 새로운 학습지 미션이 도착했어요!')
      // 새로 온 것은 다시 알린다
      questShown.current = false
      fetchWorksheets()
    }
  }, [fetchWorksheets, fetchProgress])
  useEvents(onEvent)

  // 숙제는 집에서 풀어와 다음 시간에 확인하는 것이라 따로 보여 준다.
  // 수업 중 푸는 학습지와 섞여 있으면 무엇을 집에 가져가야 하는지 알 수 없다.
  // 채점을 마치면 숙제 목록에서 빠진다 — 이미 낸 것을 계속 재촉하지 않는다.
  const homework = worksheets.filter(ws => ws.isHomework)
  const normal = worksheets.filter(ws => !ws.isHomework)

  // 아직 안 낸 것만 퀘스트로 센다 — 이미 채점된 것을 계속 알리면 잔소리가 된다
  const pending = worksheets.filter(ws => ws.status !== 'graded')
  const weakSpot = pending.filter(ws => ws.step === '취약유형')
  const wrongNote = pending.filter(ws => ws.step === '오답유형')
  const questCount = homework.length + weakSpot.length + wrongNote.length

  useEffect(() => {
    fetchProgress(); fetchWorksheets(); fetchTextbooks()
  }, [fetchProgress, fetchWorksheets, fetchTextbooks])

  // 레벨이 올랐으면 축하 창을 띄운다.
  // LEVEL_UP 이벤트가 잡아 둔 '올라가기 전 레벨'과 새 값을 견준다.
  useEffect(() => {
    const before = levelBefore.current
    levelNow.current = progress.currentLevel
    if (before != null && progress.currentLevel > before) {
      levelBefore.current = null
      setLevelUp({ from: before, to: progress.currentLevel })
    }
  }, [progress.currentLevel])

  // 불러오기가 끝난 뒤 할 일이 있으면 퀘스트 창을 띄운다
  useEffect(() => {
    if (loadingWS || questShown.current) return
    if (homework.length + weakSpot.length + wrongNote.length === 0) return
    questShown.current = true
    setQuestOpen(true)
  }, [loadingWS, homework.length, weakSpot.length, wrongNote.length])

  const currentMissionColor = Colors.mission[currentMission]

  const wsLabel = (ws: DistributedWS) =>
    stepDisplayLabel(ws.step, ws.examSubType)

  const renderWsCard = (ws: DistributedWS, opts: { homework?: boolean } = {}) => {
    const stepColor = STEP_COLOR_MAP[ws.step] ?? '#74B9FF'
    const isDone = ws.status === 'graded'
    return (
      <TouchableOpacity
        key={ws.distributionId}
        style={[styles.wsCard, isDone && styles.wsCardDone, opts.homework && styles.wsCardHomework]}
        onPress={() => {
          if (isDone) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(router.push as any)({
            // 답안(OMR) 입력 화면. 제출하면 서버가 정답과 맞춰 채점한다
            pathname: '/(student)/worksheet-omr',
            params: { distributionId: ws.distributionId },
          })
        }}
        activeOpacity={isDone ? 1 : 0.75}
      >
        <View style={styles.wsTop}>
          <View style={[styles.stepBadge, { backgroundColor: stepColor + '30', borderColor: stepColor }]}>
            <Text style={[styles.stepText, { color: stepColor }]}>{wsLabel(ws)}</Text>
          </View>
          {opts.homework && (
            <View style={styles.hwBadge}>
              <Text style={styles.hwBadgeText}>숙제</Text>
            </View>
          )}
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
          <Text style={styles.wsDate}>
            {new Date(opts.homework && ws.homeworkAt ? ws.homeworkAt : ws.distributedAt)
              .toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

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
            {/* 음악 파일이 없으면 버튼 자체를 감춘다 — 눌러도 아무 일이 없으면 고장으로 보인다 */}
            {bgm.available && (
              <TouchableOpacity
                onPress={bgm.toggle}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.bgmBtn, bgm.enabled && styles.bgmBtnOn]}>
                  {bgm.enabled ? '🔊' : '🔇'}
                </Text>
              </TouchableOpacity>
            )}
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
            {/* 결과 입력은 선생님이 한다. 학생에게는 미션 안내만 연다 */}
            <TouchableOpacity
              style={[styles.inputBtn, { backgroundColor: currentMissionColor }]}
              onPress={() => setMissionOpen(currentMission)}
            >
              <Text style={styles.inputBtnText}>미션 확인하기 →</Text>
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
              onPress={() => setMissionOpen(m)}
            />
          ))}
        </View>

        {/* 오늘의 퀘스트 — 눌러서 안내 창을 다시 연다 */}
        {questCount > 0 && (
          <TouchableOpacity
            style={styles.questBanner}
            activeOpacity={0.8}
            onPress={() => setQuestOpen(true)}
          >
            <Text style={styles.questBannerIcon}>⚔️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.questBannerTitle}>오늘의 퀘스트 {questCount}건</Text>
              <Text style={styles.questBannerHint}>눌러서 확인하기</Text>
            </View>
            <Text style={styles.questBannerArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 집에서 풀어올 숙제 — 수업 중 푸는 학습지와 갈라 맨 위에 둔다 */}
        {homework.length > 0 && (
          <View style={styles.section}>
            <View style={styles.hwHeader}>
              <Text style={styles.hwTitle}>🏠 집에서 풀어올 숙제</Text>
              <View style={styles.hwCount}>
                <Text style={styles.hwCountText}>{homework.length}</Text>
              </View>
            </View>
            <Text style={styles.hwHint}>다음 수업 시간에 확인합니다</Text>
            {homework.map(ws => renderWsCard(ws, { homework: true }))}
          </View>
        )}

        {/* 배포된 학습지 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>배포된 학습지</Text>
          {loadingWS ? (
            <View style={styles.card}>
              <Text style={{ color: Colors.subtext, fontSize: 13, textAlign: 'center' }}>불러오는 중...</Text>
            </View>
          ) : normal.length === 0 ? (
            <View style={styles.card}>
              <Text style={{ color: Colors.subtext, fontSize: 13, textAlign: 'center' }}>
                {homework.length > 0 ? '숙제 외에 배포된 학습지가 없습니다' : '배포된 학습지가 없습니다'}
              </Text>
            </View>
          ) : normal.map(ws => renderWsCard(ws))}
        </View>

        {/* 배정된 교재 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>나의 교재</Text>
          {textbooks.length === 0 ? (
            <View style={styles.card}>
              <Text style={{ color: Colors.subtext, fontSize: 13, textAlign: 'center' }}>배정된 교재가 없습니다</Text>
            </View>
          ) : textbooks.map(tb => (
            <TouchableOpacity
              key={tb.textbookId}
              style={styles.wsCard}
              onPress={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(router.push as any)({
                  pathname: '/(student)/textbook-omr',
                  params: { textbookId: tb.textbookId },
                })
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.wsTitle} numberOfLines={1}>{tb.title}</Text>
              <View style={styles.wsBottom}>
                <Text style={styles.wsInfo}>
                  {tb.publisher} · {tb.totalProblems}문제 중 {tb.submittedCount}개 제출
                </Text>
                {tb.correctRate !== null && (
                  <Text style={[styles.wsScore, { color: Colors.secondary }]}>{tb.correctRate}%</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* 퀘스트 안내 — 게임 시스템 창 */}
      <SystemModal
        visible={questOpen}
        onClose={() => setQuestOpen(false)}
        accent={Colors.secondary}
        eyebrow="QUEST"
        title="퀘스트 안내"
        confirmLabel="확인"
      >
        <SystemLine center>
          <Text style={{ color: Colors.secondary, fontWeight: '800' }}>{user?.name ?? '학생'}</Text>
          <Text> 님, 오늘 해야 할 것이 </Text>
          <Text style={{ color: Colors.gold, fontWeight: '800' }}>{questCount}건</Text>
          <Text> 있습니다.</Text>
        </SystemLine>

        {homework.length > 0 && (
          <SystemQuestRow
            icon="🏠"
            label="집에서 풀어올 숙제"
            hint="다음 수업 시간에 확인합니다"
            count={homework.length}
            color={Colors.gold}
          />
        )}
        {weakSpot.length > 0 && (
          <SystemQuestRow
            icon="🎯"
            label="취약유형 클리닉"
            hint="자주 틀리는 유형을 모았습니다"
            count={weakSpot.length}
            color={STEP_COLOR_MAP['취약유형']}
          />
        )}
        {wrongNote.length > 0 && (
          <SystemQuestRow
            icon="🔁"
            label="오답유형 클리닉"
            hint="틀린 문항을 다시 냈습니다"
            count={wrongNote.length}
            color={STEP_COLOR_MAP['오답유형']}
          />
        )}

        <SystemLine center color={Colors.subtext}>
          학습지를 눌러 답을 입력하면 바로 채점됩니다.
        </SystemLine>
      </SystemModal>

      {/* 미션 안내 — 클리어 조건과 얻는 것을 보여 주고 바로 시작한다 */}
      <MissionModal
        visible={missionOpen !== null}
        missionType={missionOpen}
        isActive={missionOpen === currentMission}
        isCleared={missionOpen != null && clearedMissions.includes(missionOpen)}
        onStart={() => setMissionOpen(null)}
        onClose={() => setMissionOpen(null)}
      />

      {/* 레벨업 축하 */}
      <LevelUpModal
        visible={levelUp !== null}
        from={levelUp?.from ?? 0}
        to={levelUp?.to ?? 0}
        ability={abilityScore}
        onClose={() => setLevelUp(null)}
      />
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
  wsCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  wsCardDone: { opacity: 0.7 },
  // 숙제는 한눈에 갈리도록 금색 테두리를 준다 — 색만으로 구분하지 않고
  // "숙제" 뱃지 글자도 함께 붙인다
  wsCardHomework: { borderColor: Colors.gold, borderWidth: 2, backgroundColor: Colors.cardAlt },
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

  bgmBtn: { fontSize: 18, opacity: 0.45 },
  bgmBtnOn: { opacity: 1 },

  // ── 퀘스트 배너 ──
  questBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.cardAlt, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.secondary + '66',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
  },
  questBannerIcon: { fontSize: 20 },
  questBannerTitle: { color: Colors.secondary, fontSize: 14, fontWeight: '800' },
  questBannerHint: { color: Colors.subtext, fontSize: 11, marginTop: 2 },
  questBannerArrow: { color: Colors.secondary, fontSize: 22, fontWeight: '700' },

  // ── 숙제 ──
  hwHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hwTitle: { color: Colors.gold, fontSize: 16, fontWeight: '700' },
  hwCount: {
    backgroundColor: Colors.gold, borderRadius: 10,
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center',
  },
  hwCountText: { color: Colors.bg, fontSize: 12, fontWeight: '800' },
  hwHint: { color: Colors.subtext, fontSize: 12, marginTop: 2, marginBottom: 12 },
  hwBadge: {
    backgroundColor: Colors.gold, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, marginRight: 8,
  },
  hwBadgeText: { fontSize: 11, color: Colors.bg, fontWeight: '800' },
})
