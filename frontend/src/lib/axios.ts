import axios from 'axios'
import { API_BASE_URL } from '../config/env'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Global 401 handling: the token is dead (expired, revoked, or the account
// was deactivated) → clear the session and land on /login. Login's own 401
// is exempt — the form shows "invalid email or password" itself.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const url: string = error?.config?.url ?? ''
    if (status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('token')
      localStorage.removeItem('authUser')
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)
