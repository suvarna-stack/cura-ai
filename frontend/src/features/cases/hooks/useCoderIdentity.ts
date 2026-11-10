import { useAuth } from '../../auth/hooks/useAuth'

/** The logged-in account, shaped for activity-log stamping and coder
 *  attribution on approve/reopen. Falls back to the email when the account
 *  has no display name. */
export function useCoderIdentity(): { userId: string; userName: string } {
  const { user } = useAuth()
  return {
    userId: user?.email ?? 'unknown',
    userName: user?.fullName ?? user?.email ?? 'Unknown coder',
  }
}
