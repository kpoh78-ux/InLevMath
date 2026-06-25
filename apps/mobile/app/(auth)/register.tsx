import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../../store/authStore'
import { Colors } from '../../constants/colors'

export default function RegisterScreen() {
  const { signIn } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.')
      return
    }
    if (!/^\d{11}$/.test(phone.trim())) {
      Alert.alert('입력 오류', '핸드폰번호는 숫자 11자리로 입력해주세요.\n예) 01012345678')
      return
    }
    if (password.length < 6) {
      Alert.alert('입력 오류', '비밀번호는 6자 이상으로 설정해주세요.')
      return
    }
    setLoading(true)
    try {
      // TODO: 실제 API 연동 — POST /api/auth/register
      await new Promise(r => setTimeout(r, 800))
      await signIn(
        { id: 'teacher-new', name, phone, role: 'teacher' },
        'mock-token-teacher-new'
      )
    } catch {
      Alert.alert('등록 실패', '이미 사용 중인 핸드폰번호이거나 선생님 등록 한도를 초과했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← 돌아가기</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>선생님 계정 만들기</Text>
        <Text style={styles.subtitle}>선생님 계정은 최대 3명까지 등록 가능합니다</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>이름</Text>
        <TextInput
          style={styles.input}
          placeholder="이름을 입력하세요"
          placeholderTextColor={Colors.subtext}
          value={name}
          onChangeText={setName}
        />

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

        <Text style={styles.label}>비밀번호 (6자 이상)</Text>
        <TextInput
          style={styles.input}
          placeholder="비밀번호를 설정하세요"
          placeholderTextColor={Colors.subtext}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.btnText}>선생님 계정 만들기</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.bg, paddingHorizontal: 28, paddingTop: 60 },
  backBtn: { marginBottom: 24 },
  backText: { color: Colors.subtext, fontSize: 14 },
  header: { marginBottom: 32 },
  title: { color: Colors.white, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: Colors.subtext, fontSize: 13, lineHeight: 20 },
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
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
})
