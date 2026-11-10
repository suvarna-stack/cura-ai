/**
 * Auth hook — context-backed since Phase 3 (real login/logout/me + roles).
 * Kept at this path so existing imports keep working.
 */
export { useAuthContext as useAuth, roleHome } from '../context/AuthProvider'
