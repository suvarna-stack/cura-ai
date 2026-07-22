import { apiClient } from '../../../lib/axios'
import type { AuthResponse, LoginCredentials } from '../types/auth.types'

export async function loginUser(
  credentials: LoginCredentials,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', credentials)
  return data
}

export async function logoutUser(): Promise<void> {
  await apiClient.post('/auth/logout')
}
