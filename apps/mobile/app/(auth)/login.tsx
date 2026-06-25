import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useAuth } from '../../store/authStore'
import { Colors } from '../../constants/colors'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert('입력 오류', '핸드폰번호와 비밀번호를 입력해주세요.')
      return
    }
    if (!/^\d{11}$/.test(phone.trim())) {
      Alert.alert('입력 오류', '핸드폰번호는 숫자 11자리로 입력해주세요.\n예) 01012345678')
      return
    }
    setLoading(true)
    try {
      // TODO: 실제 API 연동 — 임시 Mock 로그인
      await new Promise(r => setTimeout(r, 800))
      // 선생님 테스트: 01011111111 / 학생: 그 외 번호
      const isTeacher = phone === '01011111111'
      await signIn(
        {
          id: isTeacher ? 'teacher-1' : 'student-1',
          name: isTeacher ? '오근표 선생님' : '홍길동',
          phone,
          role: isTeacher ? 'teacher' : 'student',
        },
        'mock-token-123'
      )
    } catch {
      Alert.alert('로그인 실패', '핸드폰번호 또는 비밀번호를 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.logo}>InLevMath</Text>
        <Text style={styles.subtitle}>무한 레벨업 수학</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>핸드폰번호 (아이디)</Text>
        <TextInput
          style={styles.input}
          placeholder="01012345678"
          placeholderTextColor={Colors.subtext}
          value={phone}
          onChangeText={setPhone}
          keyboardType="number-pad"
          maxLength={11}
        />

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={styles.input}
          placeholder="비밀번호를 입력하세요"
          placeholderTextColor={Colors.subtext}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.hint}>학생 초기 비밀번호: math1234</Text>

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.btnText}>로그인</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 28,
    paddingTop: 100,
  },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 36, fontWeight: '900', color: Colors.primary, letterSpacing: 1 },
  subtitle: { color: Colors.gold, fontSize: 14, marginTop: 6 },
  form: {},
  label: { color: Colors.subtext, fontSize: 13, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: Colors.card,
    color: Colors.white,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hint: { color: Colors.subtext, fontSize: 12, marginTop: 8, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
})
