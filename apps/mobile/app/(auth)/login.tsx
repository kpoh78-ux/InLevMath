import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useAuth } from '../../store/authStore'
import { API_BASE } from '../../store/api'
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
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.token) {
        Alert.alert('로그인 실패', data?.error ?? '핸드폰번호 또는 비밀번호를 확인해주세요.')
        return
      }

      // 학생 전용 앱이다. 선생님 계정은 웹으로 안내한다.
      if (data.user?.role !== 'student') {
        Alert.alert(
          '학생 전용 앱입니다',
          '선생님 계정은 이 앱에서 사용할 수 없습니다.\n태블릿이나 PC의 브라우저에서 접속해주세요.',
        )
        return
      }

      await signIn(data.user, data.token)
    } catch {
      Alert.alert(
        '연결 실패',
        '학원 서버에 연결하지 못했습니다.\n인터넷 연결을 확인한 뒤 다시 시도해주세요.',
      )
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
