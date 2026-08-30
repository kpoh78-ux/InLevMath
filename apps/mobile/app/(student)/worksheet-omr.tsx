import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../../constants/colors'
import { STEP_CLEAR_THRESHOLD, stepDisplayLabel , type GradingFeedback } from '@inlevmath/shared'
import { apiFetch } from '../../store/api'
import { useSfx } from '../../store/useSfx'
import { GradingResultModal } from '../../components/GameModals'
import { OmrSheet, type OmrItem } from '../../components/OmrSheet'

// 학습지 답안 입력 (OMR)
//
// 객관식은 1~5 를 눌러 고르고, 단답형은 아래 수식 키패드로 입력한다.
// 제출하면 서버가 저장된 정답과 맞춰 1차 채점 결과를 바로 돌려준다.
// 정답이 그림인 문항은 자동 판정이 안 되므로 '선생님 확인'으로 표시된다.
//
// 다 못 풀었으면 푼 만큼만 내도 된다.
// 낸 문항은 잠겨서 학생이 못 고치고(고치려면 선생님), 남은 문항은 나중에 이어서 낸다.

type Sheet = {
  title: string
  step: string
  examSubType: string | null
  problemCount: number
  types: ('multiple' | 'short')[]
  answersReady: boolean
  alreadyGraded: boolean
  /** 이미 낸 답. 빈 문자열이면 아직 안 낸 문항이다 */
  submittedAnswers: string[]
}

type Result = {
  correctProblems: number
  totalProblems: number
  submittedCount: number
  remaining: number
  complete: boolean
  correctRate: number
  cleared: boolean
  wrongProblems: number[]
  pendingProblems: number[]
  /** 서버가 만들어 준 피드백 — 등급·성적변화·레벨변화·소리 단서 */
  feedback?: GradingFeedback
}

export default function WorksheetOmrScreen() {
  const { distributionId } = useLocalSearchParams<{ distributionId: string }>()

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  // 결과 팝업 — 채점 직후 한 번 뜨고, 닫으면 뒤의 결과 화면이 남는다
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const sfx = useSfx()
  // 이미 낸 문항 — 학생은 고칠 수 없다
  const [locked, setLocked] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/student/worksheets/${distributionId}/sheet`)
      if (!res.ok) throw new Error('답안지를 불러오지 못했습니다.')
      const d: Sheet = await res.json()
      setSheet(d)
      const prev = d.submittedAnswers ?? []
      setAnswers(Array.from({ length: d.problemCount }, (_, i) => prev[i] ?? ''))
      setLocked(new Set(
        Array.from({ length: d.problemCount }, (_, i) => ((prev[i] ?? '') !== '' ? i : -1))
          .filter(i => i >= 0)
      ))
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '불러오기 실패', [
        { text: '확인', onPress: () => router.back() },
      ])
    } finally {
      setLoading(false)
    }
  }, [distributionId])

  useEffect(() => { load() }, [load])

  const setAnswer = (i: number, v: string) => {
    if (locked.has(i)) return    // 낸 답은 학생이 못 고친다
    setAnswers(prev => { const n = [...prev]; n[i] = v; return n })
  }

  const answered = answers.filter(a => a.trim() !== '').length
  const newly = answers.filter((a, i) => a.trim() !== '' && !locked.has(i)).length

  const submit = () => {
    if (!sheet) return
    const blank = sheet.problemCount - answered
    const go = async () => {
      setSubmitting(true)
      try {
        const res = await apiFetch(`/api/student/worksheets/${distributionId}/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? '제출 실패')
        setResult(d)
        if (d.feedback) {
          setFeedbackOpen(true)
          // 상황에 맞는 소리 — 레벨이 움직였으면 등급 소리 대신 그쪽이 울린다
          sfx.play(d.feedback.sound)
        }
      } catch (e) {
        Alert.alert('제출 실패', e instanceof Error ? e.message : '다시 시도해주세요.')
      } finally {
        setSubmitting(false)
      }
    }
    if (newly === 0) {
      Alert.alert('낼 답이 없습니다', '새로 푼 문제를 입력한 뒤 제출해주세요.')
      return
    }
    if (blank > 0) {
      Alert.alert(
        '지금까지 푼 만큼 낼까요?',
        `${newly}문제를 냅니다. 남은 ${blank}문제는 나중에 이어서 낼 수 있습니다.
`
        + '한 번 낸 답은 고칠 수 없습니다.',
        [{ text: '더 풀기', style: 'cancel' }, { text: '제출', onPress: go }]
      )
    } else {
      Alert.alert('제출할까요?', '한 번 낸 답은 고칠 수 없습니다.', [
        { text: '취소', style: 'cancel' },
        { text: '제출', onPress: go },
      ])
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }
  if (!sheet) return null

  // ── 채점 결과 ──
  if (result) {
    const threshold = (STEP_CLEAR_THRESHOLD as Record<string, number>)[sheet.step] ?? 70
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.resultWrap}>
          <Text style={s.resultTitle}>채점 결과</Text>
          <Text style={[s.rate, { color: result.correctRate >= threshold ? '#00B894' : '#FF7675' }]}>
            {result.correctRate}%
          </Text>
          <Text style={s.resultSub}>
            낸 {result.submittedCount}문제 중 {result.correctProblems}문제 정답
          </Text>
          {!result.complete && (
            <Text style={s.remain}>
              남은 {result.remaining}문제는 나중에 이어서 낼 수 있습니다
            </Text>
          )}
          {result.cleared && <Text style={s.cleared}>🎉 클리어! (기준 {threshold}%)</Text>}

          {result.wrongProblems.length > 0 && (
            <View style={s.box}>
              <Text style={s.boxTitle}>틀린 문제</Text>
              <Text style={s.boxBody}>{result.wrongProblems.join(', ')}번</Text>
            </View>
          )}
          {result.pendingProblems.length > 0 && (
            <View style={[s.box, { borderColor: '#FDCB6E' }]}>
              <Text style={s.boxTitle}>선생님 확인 필요</Text>
              <Text style={s.boxBody}>{result.pendingProblems.join(', ')}번</Text>
              <Text style={s.boxNote}>
                정답이 그림이거나 자동으로 판정할 수 없는 문제입니다.
                선생님이 확인 후 점수가 바뀔 수 있습니다.
              </Text>
            </View>
          )}

          <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>확인</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* 채점 직후 뜨는 결과 창 — 등급·성적변화·레벨변화를 한 번에 알린다 */}
        <GradingResultModal
          visible={feedbackOpen}
          feedback={result.feedback ?? null}
          onClose={() => setFeedbackOpen(false)}
        />
      </SafeAreaView>
    )
  }

  // ── 답안 입력 ──
  const displayStep = stepDisplayLabel(sheet.step, sheet.examSubType)

  // 학습지는 1번부터 이어지는 번호라 배열 인덱스 = 번호-1 이다
  const items: OmrItem[] = answers.map((v, i) => ({
    no: i + 1,
    type: sheet.types[i] === 'short' ? 'short' : 'multiple',
    value: v,
    locked: locked.has(i),
  }))

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{sheet.title}</Text>
          <Text style={s.sub}>{displayStep} · {sheet.problemCount}문제 · {answered}개 입력</Text>
        </View>
      </View>

      {!sheet.answersReady && (
        <View style={s.warn}>
          <Text style={s.warnText}>
            아직 정답이 등록되지 않아 제출할 수 없습니다. 선생님께 알려주세요.
          </Text>
        </View>
      )}

      <OmrSheet items={items} onChange={(no, v) => setAnswer(no - 1, v)} />

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.primaryBtn, (submitting || !sheet.answersReady) && s.btnDisabled]}
          onPress={submit}
          disabled={submitting || !sheet.answersReady}
        >
          <Text style={s.primaryBtnText}>
            {submitting
              ? '채점 중...'
              : newly > 0
                ? `${newly}문제 제출하고 채점받기 (${answered}/${sheet.problemCount})`
                : `제출할 답을 입력하세요 (${answered}/${sheet.problemCount})`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  back: { color: Colors.white, fontSize: 24, fontWeight: '700' },
  title: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  sub: { color: Colors.subtext, fontSize: 12, marginTop: 2 },

  warn: { backgroundColor: 'rgba(253,203,110,0.15)', padding: 12, marginHorizontal: 14, marginTop: 10, borderRadius: 10 },
  warnText: { color: '#FDCB6E', fontSize: 12, lineHeight: 18 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowFocused: { backgroundColor: 'rgba(108,92,231,0.18)' },
  rowLocked: { opacity: 0.55 },
  boxLocked: { borderColor: 'rgba(255,255,255,0.12)' },
  bubbleLocked: { opacity: 0.9 },
  lockTag: { color: Colors.subtext, fontSize: 10, fontWeight: '700' },
  no: { color: Colors.subtext, fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },

  choices: { flexDirection: 'row', gap: 8, flex: 1 },
  bubble: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  bubbleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  bubbleText: { color: Colors.subtext, fontSize: 15, fontWeight: '700' },
  bubbleTextOn: { color: '#fff' },

  shortBox: {
    flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, justifyContent: 'center',
  },
  shortBoxFocused: { borderColor: Colors.primary },
  shortText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  shortPlaceholder: { color: Colors.subtext, fontSize: 13 },

  keypad: {
    backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  keypadHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 6 },
  keypadTitle: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  keypadClose: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  keyRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  key: {
    flex: 1, height: 46, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  keyWide: { flex: 5 },
  keyText: { color: Colors.white, fontSize: 16, fontWeight: '600' },

  footer: { padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  resultWrap: { padding: 24, alignItems: 'center' },
  resultTitle: { color: Colors.subtext, fontSize: 14, marginBottom: 8 },
  rate: { fontSize: 56, fontWeight: '800' },
  resultSub: { color: Colors.white, fontSize: 15, marginTop: 6 },
  cleared: { color: '#00B894', fontSize: 15, fontWeight: '700', marginTop: 10 },
  remain: { color: Colors.gold, fontSize: 13, marginTop: 8, textAlign: 'center' },
  box: {
    width: '100%', marginTop: 18, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  boxTitle: { color: Colors.subtext, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  boxBody: { color: Colors.white, fontSize: 15, fontWeight: '600' },
  boxNote: { color: Colors.subtext, fontSize: 11, lineHeight: 17, marginTop: 6 },
})
