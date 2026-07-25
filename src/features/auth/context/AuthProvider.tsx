/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { fetchMe, loginUser, logoutUser } from '../api/authService'
import type { AuthUser, LoginCredentials } from '../types/auth.types'

const TOKEN_KEY = 'token'
const USER_KEY = 'authUser'

interface AuthContextValue {
  /** null while logged out; hydrated from localStorage then verified via /auth/me */
  user: AuthUser | null
  /** false until the stored token has been verified (or ruled out) on load */
  ready: boolean
  login: (credentials: LoginCredentials) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    localStorage.getItem(TOKEN_KEY) ? readStoredUser() : null,
  )
  // no stored token = nothing to verify, ready immediately
  const [ready, setReady] = useState(() => !localStorage.getItem(TOKEN_KEY))

  // On load: verify the stored token and refresh the role from the server —
  // a stale localStorage role must never grant a page the server would deny.
  // A 401 is handled globally by the axios interceptor (clears + /login).
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      return
    }
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled) return
        localStorage.setItem(USER_KEY, JSON.stringify(me))
        setUser(me)
      })
      .catch(() => {
        // interceptor already cleared storage on 401; network errors keep the
        // cached user so a flaky connection doesn't log the coder out
        if (!cancelled && !localStorage.getItem(TOKEN_KEY)) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (credentials: LoginCredentials): Promise<AuthUser> => {
    const { token, user: nextUser } = await loginUser(credentials)
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
    return nextUser
  }

  const logout = async (): Promise<void> => {
    try {
      await logoutUser() // best-effort server-side revoke
    } catch {
      // token may already be dead — local clear below is what matters
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where each role lands after login / when visiting the other role's pages. */
export function roleHome(role: AuthUser['role']): string {
  return role === 'admin' ? '/admin/dashboard' : '/cases'
}
