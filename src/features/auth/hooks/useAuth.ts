import { useState } from 'react'

const TOKEN_KEY = 'token'

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  )

  const isAuthenticated = Boolean(token)

  function login(nextToken: string): void {
    localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  return {
    token,
    isAuthenticated,
    login,
    logout,
  }
}
