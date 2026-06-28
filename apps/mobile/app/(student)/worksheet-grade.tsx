import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../../constants/colors'
import { STEP_CLEAR_THRESHOLD } from '@inlevmath/shared'
import { apiFetch } from '../../store/api'

const STEP_COLOR_MAP: Record<string, string> = {
  '기초': '#74B9FF', '기본': '#55EFC4', '발전': '#FDCB6E', '최상위': '#E17055',
  '최다빈출': '#A29BFE', '최다오답': '#FD79A8', '서술형': '#FF7675', '모의고사': '#00B894',
}

type GradeResult = {
  correctProblems: number
  totalProblems: number
  correctRate: number
  cleared: boolean
  abilityDelta: { comprehension: number; reasoning: number; calculation: number }
  newAbility: { comprehension: number; reasoning: number; calculation: number }
}

export default function WorksheetGradeScreen() {
  const params = useLocalSearchParams<{
    distributionId: string; title: string; step: string; examSubType: string; total: string
  }>()
  const distributionId = params.distributionId
  const step = params.step ?? '기초'
  const examSubType = params.examSubType
  const total = parseInt(params.total ?? '10')
  const title = params.title ?? '학습지'
  const threshold = (STEP_CLEAR_THRESHOLD as Record<string, number>)[step] ?? 70
  const stepColor = STEP_COLOR_MAP[step] ?? '#74B9FF'
  const displayStep = step === '모의고사' && examSubType ? examSubType : step

  const [answers, setAnswers] = useState<(boolean | null)[]>(Array(total).fill(null))
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GradeResult | null>(null)

  const toggle = (i: number) => {
    if (result) return
    setAnswers(prev => {
      const next = [...prev]
      if (next[i] === null) next[i] = true
      else if (next[i] === true) next[i] = false
      else next[i] = null
      return next
    })
  }

  const correct = answers.filter(a => a === true).length
  const answered = answers.filter(a => a !== null).length
  const rate = total > 0 ? Math.round(correct / total * 100) : 0

  const handleSubmit = () => {
    const unanswered = total - answered
    const doSubmit = async () => {
      setSubmitting(true)
      try {
        const res = await apiFetch(`/api/student/worksheets/${distributionId}/grade`, {
          method: 'POST',
          body: JSON.stringify({ correctProblems: correct }),
        })
        const data = await res.json()
        if (!res.ok) {
          Alert.alert('오류', data.error || '제출에 실패했습니다.')
          return
        }
        setResult(data)
      } finally {
        setSubmitting(false)
      }
    }

    if (unanswered > 0) {
      Alert.alert(
        '미입력 문제가 있습니다',
        `${unanswered}개 문제가 입력되지 않았습니다.\n미입력 문제는 오답으로 처리됩니다.`,
        [
          { text: '계속 입력', style: 'cancel' },
          { text: '제출하기', onPress: doSubmit },
        ]
      )
    } else {
      doSubmit()
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← 뒤로</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>채점 입력</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* 학습지 정보 */}
          <View style={styles.infoCard}>
            <View style={[styles.stepBadge, { backgroundColor: stepColor + '25', borderColor: stepColor }]}>
              <Text style={[styles.stepText, { color: stepColor }]}>{displayStep}</Text>
            </View>
            <Text style={styles.wsTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.wsInfo}>총 {total}문제 · 클리어 기준 {threshold}%</Text>
          </View>

          {/* 채점 결과 — 제출 후 */}
          {result && (
            <View style={[styles.resultCard, { borderColor: result.cleared ? Colors.success : Colors.danger }]}>
              <Text style={[styles.resultScore, { color: result.cleared ? Colors.success : Colors.danger }]}>
                {result.correctProblems}/{result.totalProblems} ({result.correctRate}%)
              </Text>
              <Text style={[styles.resultLabel, { color: result.cleared ? Colors.success : Colors.danger }]}>
                {result.cleared ? '🎉 클리어! 능력치가 올라갔어요!' : `아쉬워요. 클리어 기준 ${threshold}%`}
              </Text>
              {/* 능력치 변화 */}
              <View style={styles.deltaRow}>
                {result.abilityDelta.comprehension > 0 && (
                  <Text style={styles.deltaText}>이해력 +{result.abilityDelta.comprehension.toFixed(1)}</Text>
                )}
                {result.abilityDelta.reasoning > 0 && (
                  <Text style={styles.deltaText}>추론력 +{result.abilityDelta.reasoning.toFixed(1)}</Text>
                )}
                {result.abilityDelta.calculation > 0 && (
                  <Text style={styles.deltaText}>계산력 +{result.abilityDelta.calculation.toFixed(1)}</Text>
                )}
              </View>
            </View>
          )}

          {/* 실시간 진행 바 */}
          {!result && (
            <View style={styles.progressArea}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>정답 {correct}개 ({rate}%)</Text>
                <Text style={styles.progressThreshold}>목표 {threshold}%</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, {
                  width: `${rate}%` as any,
                  backgroundColor: rate >= threshold ? Colors.success : stepColor,
                }]} />
                <View style={[styles.thresholdLine, { left: `${threshold}%` as any }]} />
              </View>
            </View>
          )}

          {/* 문제별 O/X */}
          <Text style={styles.sectionLabel}>문제별 채점 (탭: O → X → 미입력)</Text>
          <View style={styles.grid}>
            {answers.map((ans, i) => (
              <TouchableOpacity key={i} onPress={() => toggle(i)}
                style={[
                  styles.cell,
                  ans === true  && styles.cellCorrect,
                  ans === false && styles.cellWrong,
                  !!result && styles.cellDone,
                ]}
                activeOpacity={result ? 1 : 0.7}
              >
                <Text style={styles.cellNum}>{i + 1}</Text>
                <Text style={[
                  styles.cellMark,
                  ans === true  ? { color: Colors.success } : null,
                  ans === false ? { color: Colors.danger  } : null,
                  ans === null  ? { color: Colors.border  } : null,
                ]}>
                  {ans === true ? 'O' : ans === false ? 'X' : '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.hint}>
            {result ? '채점이 완료됐습니다.' : '각 번호를 탭해서 O / X를 입력하세요'}
          </Text>
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* 하단 버튼 */}
        <View style={styles.footer}>
          {result ? (
            <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.secondary }]} onPress={() => router.back()}>
              <Text style={styles.btnText}>완료</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: answered === 0 ? Colors.border : stepColor }]}
              onPress={handleSubmit}
              disabled={answered === 0 || submitting}
            >
              <Text style={styles.btnText}>
                {submitting ? '제출 중...' : answered < total ? `제출 (${answered}/${total} 입력)` : '채점 제출하기'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 60 },
  backText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  headerTitle: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  infoCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginTop: 16, marginBottom: 12 },
  stepBadge: {
    alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8,
  },
  stepText: { fontSize: 12, fontWeight: '700' },
  wsTitle: { color: Colors.white, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  wsInfo: { color: Colors.subtext, fontSize: 12 },
  resultCard: { borderWidth: 2, borderRadius: 14, padding: 16, marginBottom: 12, alignItems: 'center' },
  resultScore: { fontSize: 32, fontWeight: '900', marginBottom: 4 },
  resultLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  deltaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  deltaText: { fontSize: 12, color: Colors.secondary, fontWeight: '700',
    backgroundColor: Colors.secondary + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  progressArea: { marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  progressThreshold: { color: Colors.subtext, fontSize: 12 },
  progressBg: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden', position: 'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  thresholdLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: Colors.white + '60' },
  sectionLabel: { color: Colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cellCorrect: { backgroundColor: Colors.success + '20', borderColor: Colors.success },
  cellWrong:   { backgroundColor: Colors.danger  + '20', borderColor: Colors.danger  },
  cellDone: { opacity: 0.85 },
  cellNum: { color: Colors.subtext, fontSize: 10, fontWeight: '600' },
  cellMark: { fontSize: 18, fontWeight: '900' },
  hint: { color: Colors.subtext, fontSize: 11, textAlign: 'center', marginTop: 16 },
  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: Colors.bg, fontSize: 16, fontWeight: '800' },
})
