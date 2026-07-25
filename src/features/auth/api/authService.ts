import { apiClient } from '../../../lib/axios'
import type { AuthResponse, AuthUser, LoginCredentials } from '../types/auth.types'

/**
 * Auth API against medcode-api (docs/api-contract.md, Authentication).
 * Errors: 401 {"error":"invalid email or password"}, 429 lockout — the form
 * surfaces the server's message via extractAuthError.
 */
export async function loginUser(
  credentials: LoginCredentials,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', credentials)
  return data
}

/** Revokes the current token server-side. Idempotent; failures are ignored
 *  by callers (the local session is cleared regardless). */
export async function logoutUser(): Promise<void> {
  await apiClient.post('/auth/logout')
}

/** The account behind the stored token — used to (re)hydrate on app load. */
export async function fetchMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/auth/me')
  return data
}

/** The server's {"error": "..."} message, else a generic fallback. */
export function extractAuthError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const res = (err as { response?: { data?: { error?: string } } }).response
    if (res?.data?.error) return res.data.error
  }
  return 'Login failed — check your connection and try again'
}
