import type { AuthResponse, LoginCredentials } from '../types/auth.types'

/**
 * Placeholder auth API — wire to shared apiClient when the backend is ready.
 * Do not add mock credential checks here.
 */
export async function loginUser(
  credentials: LoginCredentials,
): Promise<AuthResponse> {
  void credentials
  // TODO: const { data } = await apiClient.post<AuthResponse>('/auth/login', credentials)
  return { token: '' }
}

export async function logoutUser(): Promise<void> {
  // TODO: await apiClient.post('/auth/logout')
}
