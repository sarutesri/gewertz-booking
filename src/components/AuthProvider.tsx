import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, getMe, logout } from '../lib/api'
import type { Me } from '../../shared/types'

export interface AuthValue {
  /** Null until the session cookie has been resolved against the worker. */
  me: Me | null
  ready: boolean
  setMe: (me: Me | null) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = use(AuthContext)
  if (value === null) throw new Error('useAuth ต้องถูกเรียกภายใน AuthProvider เท่านั้น')
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    getMe()
      .then((user) => {
        if (active) setMe(user)
      })
      .catch((error) => {
        if (active && !(error instanceof ApiError && error.status === 401)) console.error(error)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  const signOut = useCallback(async () => {
    await logout()
    setMe(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ me, ready, setMe, signOut }),
    [me, ready, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}