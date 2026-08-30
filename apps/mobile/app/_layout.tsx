import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../store/authStore'
import { BgmProvider } from '../store/useBgm'

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
      {/* 배경음악은 화면을 옮겨도 끊기지 않아야 해서 최상단에 둔다 */}
      <BgmProvider>
        <RootNavigator />
      </BgmProvider>
    </AuthProvider>
  )
}
