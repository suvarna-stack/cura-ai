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
export async function updateAccount(account: Account): Promise<Account> {
  const { data } = await apiClient.put<ServerAccount>(
    `/admin/accounts/${account.id}`,
    { fullName: account.name, email: account.email },
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
