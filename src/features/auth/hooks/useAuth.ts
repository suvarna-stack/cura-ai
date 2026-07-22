import { useState } from 'react'

const TOKEN_KEY = 'token'

/**
 * Local auth shell — token read/write only.
 * Real login/logout API + role handling will be wired later.
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  )

  const isAuthenticated = Boolean(token)

  function setAuthToken(nextToken: string): void {
    localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
  }

  function clearAuthToken(): void {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  return {
    token,
    isAuthenticated,
    setAuthToken,
    clearAuthToken,
  }
}
