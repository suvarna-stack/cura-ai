import { apiClient } from '../../../lib/axios'
import type { Account, CreateAccountInput } from '../types/account.types'

/**
 * Admin accounts API — live against medcode-api since Phase 4
 * (docs/api-contract.md, /api/admin/accounts; admin token required — the
 * shared apiClient attaches it).
 *
 * The backend account shape (id:number, fullName, role, status
 * 'active'|'inactive'|'suspended') is mapped to this UI's simpler
 * {id:string, name, status 'Active'|'Inactive'} here in one place.
 */

/**
 * The server's {"error": "..."} text, else the caller's fallback. The backend
 * writes these for humans ("an account with this email already exists", "this
 * account has coding history and cannot be deleted — deactivate it instead"),
 * so they go straight to the UI.
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const res = (err as { response?: { data?: { error?: string } } }).response
    if (res?.data?.error) return res.data.error
  }
  return fallback
}

interface ServerAccount {
  id: number
  fullName: string | null
  email: string
  role: 'coder' | 'admin'
  status: 'active' | 'inactive' | 'suspended'
  createdAt: string | null
  lastLoginAt: string | null
}

const toUi = (a: ServerAccount): Account => ({
  id: String(a.id),
  name: a.fullName ?? a.email,
  email: a.email,
  status: a.status === 'active' ? 'Active' : 'Inactive',
})

export async function fetchAccounts(): Promise<Account[]> {
  const { data } = await apiClient.get<ServerAccount[]>('/admin/accounts')
  return data.map(toUi)
}

/** Creates a coder account (the admin UI manages coder access). */
export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  const { data } = await apiClient.post<ServerAccount>('/admin/accounts', {
    fullName: input.name,
    email: input.email,
    password: input.password,
    role: 'coder',
  })
  return toUi(data)
}

/** Pushes the account's full desired state: profile fields via PUT
 *  /admin/accounts/{id}, then active/inactive via the status endpoint
 *  (deactivation also revokes the account's live sessions server-side). */
/** newPassword re-hashes the account's password when provided — omitted or
 *  empty leaves the current password untouched (the API treats blank as
 *  "no change"). Sent exactly as typed, like account creation. */
export async function updateAccount(
  account: Account,
  newPassword?: string,
): Promise<Account> {
  const { data } = await apiClient.put<ServerAccount>(
    `/admin/accounts/${account.id}`,
    {
      fullName: account.name,
      email: account.email,
      ...(newPassword ? { password: newPassword } : {}),
    },
  )
  const desired = account.status === 'Active' ? 'active' : 'inactive'
  if (data.status !== desired) {
    const { data: after } = await apiClient.put<ServerAccount>(
      `/admin/accounts/${account.id}/status`,
      { status: desired },
    )
    return toUi(after)
  }
  return toUi(data)
}

/** 409 = the account has coding history; the backend refuses hard-deletes
 *  then (deactivate instead) — surfaced to the caller as a rejection. */
export async function deleteAccount(id: string): Promise<void> {
  await apiClient.delete(`/admin/accounts/${id}`)
}
