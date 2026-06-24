import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../../store/authStore'
import { Colors } from '../../constants/colors'
import { APP_LIMITS, UserRole } from '@inlevmath/shared'

export default function RegisterScreen() {
  const { signIn } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')   // 학원 등록 코드 (선생님 발급)
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !code.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      // TODO: 실제 API 연동
      // 학원 코드 검증 → 학생으로 등록
      // 등록 전 서버에서 maxStudents(100) 초과 여부 확인
      await new Promise(r => setTimeout(r, 800))
      await signIn(
        { id: 'student-new', name, email, role: 'student' },
        'mock-token-new'
      )
    } catch {
      Alert.alert('가입 실패', '학원 등록 코드를 확인해주세요.')
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
        <Text style={styles.title}>학생 계정 만들기</Text>
        <Text style={styles.subtitle}>
          선생님께 학원 등록 코드를 받아 가입하세요{'\n'}
          (학생 최대 {APP_LIMITS.maxStudents}명)
        </Text>
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

        <Text style={styles.label}>이메일</Text>
        <TextInput
          style={styles.input}
          placeholder="이메일을 입력하세요"
          placeholderTextColor={Colors.subtext}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={styles.input}
          placeholder="비밀번호 (6자 이상)"
          placeholderTextColor={Colors.subtext}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.label}>학원 등록 코드</Text>
        <TextInput
          style={styles.input}
          placeholder="선생님께 받은 코드를 입력하세요"
          placeholderTextColor={Colors.subtext}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
        />

        <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.btnText}>가입 완료</Text>
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
    paddingTop: 60,
  },
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
