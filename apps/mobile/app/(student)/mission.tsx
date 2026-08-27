import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { apiFetch } from '../../store/api'
import { Colors } from '../../constants/colors'
import {
  MissionType, ResultSource,
  MISSION_ORDER, MISSION_LABELS,
  calcCorrectRate, MISSION_CLEAR_THRESHOLD,
} from '@inlevmath/shared'

export default function MissionInputScreen() {
  const [selectedMission, setSelectedMission] = useState<MissionType>('basic_problem')
  const [source, setSource] = useState<ResultSource>('manual')
  const [total, setTotal] = useState('')
  const [correct, setCorrect] = useState('')
  const [saving, setSaving] = useState(false)

  const correctRate = total && correct
    ? calcCorrectRate(Number(total), Number(correct))
    : null

  const threshold = MISSION_CLEAR_THRESHOLD[selectedMission]
  const isCleared = correctRate !== null && correctRate >= threshold

  const handleSubmit = async () => {
    const t = Number(total)
    const c = Number(correct)
    if (!t || t <= 0) { Alert.alert('입력 오류', '총 문제 수를 입력하세요.'); return }
    if (c < 0 || c > t) { Alert.alert('입력 오류', '맞힌 문제 수를 다시 확인하세요.'); return }

    setSaving(true)
    try {
      const res = await apiFetch('/api/missions/results', {
        method: 'POST',
        body: JSON.stringify({
          missionType: selectedMission,
          totalProblems: t,
          correctProblems: c,
          source,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        Alert.alert('저장 실패', data?.error ?? '결과를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
        return
      }

      // 클리어 판정은 서버가 내린다 (화면 미리보기와 어긋날 수 있다)
      const rate = data?.correctRate ?? correctRate
      const cleared = data?.missionCleared === true

      Alert.alert(
        cleared ? '미션 클리어! 🏆' : '결과 저장 완료',
        cleared
          ? `🎉 정답률 ${rate}%\n다음 미션으로 넘어갑니다!`
          : `정답률 ${rate}% — 목표 ${threshold}%까지 조금 더 힘내요!`,
        [{
          text: '확인',
          onPress: () => {
            setTotal(''); setCorrect('')
            router.replace('/(student)')
          },
        }],
      )
    } catch {
      Alert.alert('연결 실패', '인터넷 연결을 확인한 뒤 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>미션 결과 입력</Text>

        {/* 미션 선택 */}
        <Text style={styles.label}>미션 선택</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.missionRow}>
          {MISSION_ORDER.map((m) => {
            const isSelected = m === selectedMission
            const color = Colors.mission[m]
            return (
              <TouchableOpacity
                key={m}
                style={[styles.missionChip, isSelected && { backgroundColor: color, borderColor: color }]}
                onPress={() => setSelectedMission(m)}
              >
                <Text style={[styles.missionChipText, isSelected && { color: Colors.bg }]}>
                  {MISSION_LABELS[m]}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* 입력 출처 */}
        <Text style={styles.label}>입력 방식</Text>
        <View style={styles.sourceRow}>
          {(['manual', 'mathflat'] as ResultSource[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sourceBtn, source === s && styles.sourceBtnActive]}
              onPress={() => setSource(s)}
            >
              <Text style={[styles.sourceBtnText, source === s && styles.sourceBtnTextActive]}>
                {s === 'manual' ? '✏️ 수동 입력' : '📱 매쓰플랫'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 문제 결과 입력 */}
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>채점 결과</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultInput}>
              <Text style={styles.label}>총 문제 수</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 20"
                placeholderTextColor={Colors.subtext}
                value={total}
                onChangeText={setTotal}
                keyboardType="number-pad"
              />
            </View>
            <Text style={styles.slash}>/</Text>
            <View style={styles.resultInput}>
              <Text style={styles.label}>맞힌 문제</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 15"
                placeholderTextColor={Colors.subtext}
                value={correct}
                onChangeText={setCorrect}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* 정답률 미리보기 */}
          {correctRate !== null && (
            <View style={[styles.rateBox, { borderColor: isCleared ? Colors.success : Colors.gold }]}>
              <Text style={styles.rateLabel}>정답률</Text>
              <Text style={[styles.rateValue, { color: isCleared ? Colors.success : Colors.gold }]}>
                {correctRate}%
              </Text>
              <Text style={styles.rateThreshold}>
                {isCleared ? '✅ 미션 클리어 달성!' : `목표: ${threshold}% 이상`}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <Text style={styles.submitBtnText}>{saving ? '저장 중...' : '결과 저장하기'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  pageTitle: { color: Colors.white, fontSize: 22, fontWeight: '800', paddingTop: 20, marginBottom: 24 },
  label: { color: Colors.subtext, fontSize: 13, marginBottom: 8, marginTop: 16 },
  missionRow: { flexDirection: 'row', marginBottom: 4 },
  missionChip: {
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border, marginRight: 8,
    backgroundColor: Colors.card,
  },
  missionChipText: { color: Colors.subtext, fontSize: 13, fontWeight: '600' },
  sourceRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sourceBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card, alignItems: 'center',
  },
  sourceBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sourceBtnText: { color: Colors.subtext, fontSize: 13, fontWeight: '600' },
  sourceBtnTextActive: { color: Colors.white },
  resultCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 20, marginTop: 20 },
  resultTitle: { color: Colors.white, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  resultInput: { flex: 1 },
  slash: { color: Colors.subtext, fontSize: 24, paddingBottom: 12 },
  input: {
    backgroundColor: Colors.bg,
    color: Colors.white,
    borderRadius: 10, padding: 14,
    fontSize: 18, fontWeight: '700',
    borderWidth: 1, borderColor: Colors.border, textAlign: 'center',
  },
  rateBox: {
    borderWidth: 1, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  rateLabel: { color: Colors.subtext, fontSize: 12 },
  rateValue: { fontSize: 36, fontWeight: '900', marginVertical: 4 },
  rateThreshold: { color: Colors.subtext, fontSize: 13 },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
})
