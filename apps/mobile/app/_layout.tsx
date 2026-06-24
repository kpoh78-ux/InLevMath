import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../store/authStore'
import { Colors } from '../constants/colors'

function RootNavigator() {
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace('/(auth)/login')
    } else if (user.role === 'student') {
      router.replace('/(student)/')
    } else {
      router.replace('/(teacher)/')
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
