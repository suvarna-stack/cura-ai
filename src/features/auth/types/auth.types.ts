export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
}

export interface AuthUser {
  id: string
  email: string
  role?: string
}

/** Demo credentials shown on the login screen (UI only — not validated). */
export const DEMO_EMAIL = 'admin@hospital.th'
export const DEMO_PASSWORD = 'superadmin123'
