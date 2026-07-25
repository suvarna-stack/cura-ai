// Mirrors medcode-api/docs/types.ts (LoginRequest / LoginResponse / AuthMe).

export type UserRole = 'coder' | 'admin'

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthUser {
  id: number
  email: string
  fullName: string | null
  role: UserRole
}

/** POST /api/auth/login response. */
export interface AuthResponse {
  token: string
  user: AuthUser
}

/** Demo credentials shown on the login screen — medcode-api's bootstrap
 *  admin defaults (SchemaBootstrap). Local/demo only. */
export const DEMO_EMAIL = 'admin@medcodeai.demo'
export const DEMO_PASSWORD = 'admin1234'
