import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import { Orbitron_800ExtraBold, Orbitron_900Black } from '@expo-google-fonts/orbitron'
import { BlackHanSans_400Regular } from '@expo-google-fonts/black-han-sans'
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
  // 게임풍 글씨체. Orbitron 은 영문 전용이라 한글은 BlackHanSans 가 받는다.
  // 다 못 읽어도 앱은 뜬다 — 기본 글씨체로 나올 뿐이다.
  useFonts({
    Orbitron_800ExtraBold,
    Orbitron_900Black,
    BlackHanSans_400Regular,
  })

  return (
    <AuthProvider>
      {/* 배경음악은 화면을 옮겨도 끊기지 않아야 해서 최상단에 둔다 */}
      <BgmProvider>
        <RootNavigator />
      </BgmProvider>
    </AuthProvider>
  )
}
