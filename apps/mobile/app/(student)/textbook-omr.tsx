import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../../constants/colors'
import { apiFetch } from '../../store/api'
import { useSfx } from '../../store/useSfx'
import { GradingResultModal } from '../../components/GameModals'
import type { GradingFeedback } from '@inlevmath/shared'
import { OmrSheet, type OmrItem } from '../../components/OmrSheet'

// 교재 답안 입력 (OMR) — 학습지와 같은 방식이다.
//
// 교재는 문제가 수천 개일 수 있어 50문항씩 끊어서 보여준다.
// 낸 문항은 잠기고, 남은 문항은 나중에 이어서 낸다.

type Problem = {
  number: number
  type: 'multiple' | 'short'
  bookPage: number
  hasAnswer: boolean
  submitted: string
}

type Sheet = {
  title: string
  grade: string
  publisher: string
  completed: boolean
  totalProblems: number
  submittedCount: number
  from: number
  nextFrom: number | null
  problems: Problem[]
}

type Result = {
  correctProblems: number
  totalProblems: number
  submittedCount: number
  remaining: number
  complete: boolean
  correctRate: number
  wrongProblems: number[]
  pendingProblems: number[]
  /** 서버가 만들어 준 피드백 — 등급·성적변화·레벨변화·소리 단서 */
  feedback?: GradingFeedback
}

export default function TextbookOmrScreen() {
  const { textbookId } = useLocalSearchParams<{ textbookId: string }>()

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const sfx = useSfx()

  const load = useCallback(async (from?: number) => {
    setLoading(true)
    try {
      const q = from ? `?from=${from}` : ''
      const res = await apiFetch(`/api/student/textbooks/${textbookId}/sheet${q}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? '답안지를 불러오지 못했습니다.')
      setSheet(d as Sheet)
      const next: Record<number, string> = {}
      for (const p of (d as Sheet).problems) next[p.number] = p.submitted
      setAnswers(next)
      setResult(null)
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '불러오기 실패', [
        { text: '확인', onPress: () => router.back() },
      ])
    } finally {
      setLoading(false)
    }
  }, [textbookId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }
  if (!sheet) return null

  const items: OmrItem[] = sheet.problems.map(p => ({
    no: p.number,
    type: p.type,
    value: answers[p.number] ?? '',
    locked: p.submitted !== '',
    noAnswer: !p.hasAnswer,
  }))

  const newly = items.filter(i => !i.locked && i.value.trim() !== '').length

  const setAnswer = (no: number, v: string) =>
    setAnswers(prev => ({ ...prev, [no]: v }))

  const submit = () => {
    if (newly === 0) {
      Alert.alert('낼 답이 없습니다', '새로 푼 문제를 입력한 뒤 제출해주세요.')
      return
    }
    const go = async () => {
      setSubmitting(true)
      try {
        // 이번에 새로 낸 것만 보낸다
        const payload: Record<string, string> = {}
        for (const i of items) {
          if (!i.locked && i.value.trim() !== '') payload[String(i.no)] = i.value
        }
        const res = await apiFetch(`/api/student/textbooks/${textbookId}/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers: payload }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? '제출 실패')
        setResult(d as Result)
        if (d.feedback) {
          setFeedbackOpen(true)
          sfx.play(d.feedback.sound)
        }
      } catch (e) {
        Alert.alert('제출 실패', e instanceof Error ? e.message : '다시 시도해주세요.')
      } finally {
        setSubmitting(false)
      }
    }
    Alert.alert(
      '지금까지 푼 만큼 낼까요?',
      `${newly}문제를 냅니다. 한 번 낸 답은 고칠 수 없습니다.`,
      [{ text: '더 풀기', style: 'cancel' }, { text: '제출', onPress: go }]
    )
  }

  // ── 채점 결과 ──
  if (result) {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.resultWrap}>
          <Text style={s.resultTitle}>채점 결과</Text>
          <Text style={[s.rate, { color: result.correctRate >= 70 ? '#00B894' : '#FF7675' }]}>
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

          <View style={{ width: '100%', gap: 10, marginTop: 18 }}>
            {!result.complete && (
              <TouchableOpacity style={s.primaryBtn} onPress={() => load()}>
                <Text style={s.primaryBtnText}>이어서 풀기</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
              <Text style={s.ghostBtnText}>나가기</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 채점 직후 뜨는 결과 창 */}
        <GradingResultModal
          visible={feedbackOpen}
          feedback={result.feedback ?? null}
          onClose={() => setFeedbackOpen(false)}
        />
      </SafeAreaView>
    )
  }

  // ── 답안 입력 ──
  const first = sheet.problems[0]?.number ?? 0
  const last = sheet.problems[sheet.problems.length - 1]?.number ?? 0

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{sheet.title}</Text>
          <Text style={s.sub}>
            {first}~{last}번 · 전체 {sheet.totalProblems}문제 중 {sheet.submittedCount}개 제출
          </Text>
        </View>
      </View>

      {sheet.problems.length === 0 ? (
        <View style={s.center}>
          <Text style={s.empty}>낼 문제가 없습니다.</Text>
        </View>
      ) : (
        <OmrSheet items={items} onChange={setAnswer} />
      )}

      <View style={s.footer}>
        {sheet.nextFrom !== null && (
          <TouchableOpacity style={s.ghostBtn} onPress={() => load(sheet.nextFrom!)}>
            <Text style={s.ghostBtnText}>다음 {last + 1}번부터 보기</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.primaryBtn, submitting && s.btnDisabled]}
          onPress={submit}
          disabled={submitting}
        >
          <Text style={s.primaryBtnText}>
            {submitting ? '채점 중...' : `${newly}문제 제출하고 채점받기`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: Colors.subtext, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  back: { color: Colors.white, fontSize: 24, fontWeight: '700' },
  title: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  sub: { color: Colors.subtext, fontSize: 12, marginTop: 2 },

  footer: {
    padding: 14, gap: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghostBtn: {
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  ghostBtnText: { color: Colors.subtext, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },

  resultWrap: { padding: 24, alignItems: 'center' },
  resultTitle: { color: Colors.subtext, fontSize: 14, marginBottom: 8 },
  rate: { fontSize: 56, fontWeight: '800' },
  resultSub: { color: Colors.white, fontSize: 15, marginTop: 6 },
  remain: { color: Colors.gold, fontSize: 13, marginTop: 8, textAlign: 'center' },
  box: {
    width: '100%', marginTop: 18, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  boxTitle: { color: Colors.subtext, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  boxBody: { color: Colors.white, fontSize: 15, fontWeight: '600' },
  boxNote: { color: Colors.subtext, fontSize: 11, lineHeight: 17, marginTop: 6 },
})
