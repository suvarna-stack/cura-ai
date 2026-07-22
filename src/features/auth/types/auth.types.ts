export interface LoginCredentials {
  username: string
  password: string
}

export interface AuthResponse {
  token: string
}

export interface AuthUser {
  id: string
  username: string
}
