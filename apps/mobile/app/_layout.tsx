import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../store/authStore'

function RootNavigator() {
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) return
    // 이 앱은 학생 전용이다. 선생님은 웹(태블릿·PC)에서 쓰므로 로그인 단계에서 걸러진다.
    if (!user) {
      router.replace('/(auth)/login')
    } else {
      // 그룹 경로는 끝에 / 를 붙이지 않는다. '/(student)' 가 그 그룹의 index 화면이다
      router.replace('/(student)')
    }
  }, [user, isLoading])

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  )
}
