import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../../constants/colors'
import { STEP_CLEAR_THRESHOLD, WorksheetStep } from '@inlevmath/shared'

const STEP_COLOR_MAP: Record<WorksheetStep, string> = {
  '기초': '#74B9FF', '기본': '#55EFC4', '발전': '#FDCB6E', '최상위': '#E17055',
  '최다빈출': '#A29BFE', '최다오답': '#FD79A8', '서술형': '#FF7675',
}

export default function WorksheetGradeScreen() {
  const params = useLocalSearchParams<{ id: string; title: string; step: string; total: string }>()
  const step = (params.step ?? '기초') as WorksheetStep
  const total = parseInt(params.total ?? '10')
  const title = params.title ?? '학습지'
  const threshold = STEP_CLEAR_THRESHOLD[step]
  const stepColor = STEP_COLOR_MAP[step]

  // 문제별 O/X 입력 (null=미입력, true=정답, false=오답)
  const [answers, setAnswers] = useState<(boolean | null)[]>(Array(total).fill(null))
  const [submitted, setSubmitted] = useState(false)

  const toggle = (i: number) => {
    if (submitted) return
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
  const cleared = rate >= threshold

  const handleSubmit = () => {
    if (answered < total) {
      Alert.alert('미입력 문제가 있습니다', `${total - answered}개 문제의 채점 결과를 입력해주세요.`, [
        { text: '계속 입력' },
        { text: '제출하기', onPress: () => setSubmitted(true) },
      ])
      return
    }
    setSubmitted(true)
  }

  const handleDone = () => {
    router.back()
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
              <Text style={[styles.stepText, { color: stepColor }]}>{step}</Text>
            </View>
            <Text style={styles.wsTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.wsInfo}>총 {total}문제 · 클리어 기준 {threshold}%</Text>
          </View>

          {/* 채점 결과 — 제출 후 */}
          {submitted && (
            <View style={[styles.resultCard, { borderColor: cleared ? Colors.success : Colors.danger }]}>
              <Text style={[styles.resultScore, { color: cleared ? Colors.success : Colors.danger }]}>
                {correct}/{total} ({rate}%)
              </Text>
              <Text style={[styles.resultLabel, { color: cleared ? Colors.success : Colors.danger }]}>
                {cleared ? '🎉 클리어! 능력치가 올라갔어요!' : `아쉬워요. 클리어 기준 ${threshold}%`}
              </Text>
            </View>
          )}

          {/* 실시간 진행 바 */}
          {!submitted && (
            <View style={styles.progressArea}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>정답 {correct}개 ({rate}%)</Text>
                <Text style={styles.progressThreshold}>목표 {threshold}%</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${rate}%` as any, backgroundColor: rate >= threshold ? Colors.success : stepColor }]} />
                {/* 목표 기준선 */}
                <View style={[styles.thresholdLine, { left: `${threshold}%` as any }]} />
              </View>
            </View>
          )}

          {/* 문제별 O/X 버튼 */}
          <Text style={styles.sectionLabel}>문제별 채점</Text>
          <View style={styles.grid}>
            {answers.map((ans, i) => (
              <TouchableOpacity key={i} onPress={() => toggle(i)}
                style={[
                  styles.cell,
                  ans === true  && styles.cellCorrect,
                  ans === false && styles.cellWrong,
                  submitted && styles.cellDone,
                ]}
                activeOpacity={submitted ? 1 : 0.7}
              >
                <Text style={styles.cellNum}>{i + 1}</Text>
                <Text style={[styles.cellMark,
                  ans === true  && { color: Colors.success },
                  ans === false && { color: Colors.danger },
                  ans === null  && { color: Colors.border },
                ]}>
                  {ans === true ? 'O' : ans === false ? 'X' : '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.hint}>
            {submitted
              ? '채점이 제출되었습니다.'
              : '각 번호를 탭해서 O → X → 미입력 순으로 토글하세요'}
          </Text>

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* 하단 버튼 */}
        <View style={styles.footer}>
          {submitted ? (
            <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.secondary }]} onPress={handleDone}>
              <Text style={styles.btnText}>완료</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: answered === 0 ? Colors.border : stepColor }]}
              onPress={handleSubmit}
              disabled={answered === 0}
            >
              <Text style={styles.btnText}>
                {answered < total ? `제출 (${answered}/${total} 입력됨)` : '채점 제출하기'}
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
  infoCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginTop: 16, marginBottom: 12,
  },
  stepBadge: {
    alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8,
  },
  stepText: { fontSize: 12, fontWeight: '700' },
  wsTitle: { color: Colors.white, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  wsInfo: { color: Colors.subtext, fontSize: 12 },
  resultCard: {
    borderWidth: 2, borderRadius: 14, padding: 16, marginBottom: 12, alignItems: 'center',
  },
  resultScore: { fontSize: 32, fontWeight: '900', marginBottom: 4 },
  resultLabel: { fontSize: 14, fontWeight: '600' },
  progressArea: { marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  progressThreshold: { color: Colors.subtext, fontSize: 12 },
  progressBg: {
    height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden', position: 'relative',
  },
  progressFill: { height: '100%', borderRadius: 5 },
  thresholdLine: {
    position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: Colors.white + '60',
  },
  sectionLabel: { color: Colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cellCorrect: { backgroundColor: Colors.success + '20', borderColor: Colors.success },
  cellWrong: { backgroundColor: Colors.danger + '20', borderColor: Colors.danger },
  cellDone: { opacity: 0.85 },
  cellNum: { color: Colors.subtext, fontSize: 10, fontWeight: '600' },
  cellMark: { fontSize: 18, fontWeight: '900' },
  hint: { color: Colors.subtext, fontSize: 11, textAlign: 'center', marginTop: 16 },
  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: Colors.bg, fontSize: 16, fontWeight: '800' },
})
