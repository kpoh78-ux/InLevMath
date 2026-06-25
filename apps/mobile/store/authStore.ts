import React, { createContext, useContext, useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import { UserRole } from '@inlevmath/shared'

interface AuthUser {
  id: string
  name: string
  phone: string   // 핸드폰번호 = 로그인 아이디
  role: UserRole
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  signIn: (user: AuthUser, token: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await SecureStore.getItemAsync('auth_user')
        if (stored) setUser(JSON.parse(stored))
      } finally {
        setIsLoading(false)
      }
    }
    loadUser()
  }, [])

  const signIn = async (authUser: AuthUser, token: string) => {
    await SecureStore.setItemAsync('auth_user', JSON.stringify(authUser))
    await SecureStore.setItemAsync('auth_token', token)
    setUser(authUser)
  }

  const signOut = async () => {
    await SecureStore.deleteItemAsync('auth_user')
    await SecureStore.deleteItemAsync('auth_token')
    setUser(null)
  }

  return React.createElement(AuthContext.Provider, { value: { user, isLoading, signIn, signOut } }, children)
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
