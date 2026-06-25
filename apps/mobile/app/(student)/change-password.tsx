import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'

export default function ChangePasswordScreen() {
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)

  const handleChange = async () => {
    if (!current.trim() || !next.trim() || !confirm.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.')
      return
    }
    if (next.length < 6) {
      Alert.alert('입력 오류', '새 비밀번호는 6자 이상으로 설정해주세요.')
      return
    }
    if (next !== confirm) {
      Alert.alert('입력 오류', '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.')
      return
    }
    setLoading(true)
    try {
      // TODO: 실제 API 연동 — POST /api/auth/change-password
      await new Promise(r => setTimeout(r, 600))
      Alert.alert('완료', '비밀번호가 변경되었습니다.', [
        { text: '확인', onPress: () => router.back() },
      ])
    } catch {
      Alert.alert('오류', '현재 비밀번호가 일치하지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← 돌아가기</Text>
        </TouchableOpacity>

        <Text style={styles.title}>비밀번호 변경</Text>
        <Text style={styles.subtitle}>초기 비밀번호(math1234)를 변경해주세요</Text>

        <Text style={styles.label}>현재 비밀번호</Text>
        <TextInput
          style={styles.input}
          placeholder="현재 비밀번호"
          placeholderTextColor={Colors.subtext}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
        />

        <Text style={styles.label}>새 비밀번호 (6자 이상)</Text>
        <TextInput
          style={styles.input}
          placeholder="새 비밀번호"
          placeholderTextColor={Colors.subtext}
          value={next}
          onChangeText={setNext}
          secureTextEntry
        />

        <Text style={styles.label}>새 비밀번호 확인</Text>
        <TextInput
          style={styles.input}
          placeholder="새 비밀번호 확인"
          placeholderTextColor={Colors.subtext}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <TouchableOpacity style={styles.btn} onPress={handleChange} disabled={loading}>
          {loading
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.btnText}>비밀번호 변경</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 60 },
  backBtn: { marginBottom: 24 },
  backText: { color: Colors.subtext, fontSize: 14 },
  title: { color: Colors.white, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: Colors.subtext, fontSize: 13, marginBottom: 32 },
  label: { color: Colors.subtext, fontSize: 13, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: Colors.card, color: Colors.white,
    borderRadius: 10, padding: 14, fontSize: 15,
    borderWidth: 1, borderColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 32,
  },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
})
