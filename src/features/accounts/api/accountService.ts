import type {
  Account,
  CreateAccountInput,
} from '../types/account.types'
import { SEED_ACCOUNTS } from '../types/account.types'

/**
 * Placeholder account API — wire to shared apiClient when the backend is ready.
 */
export async function fetchAccounts(): Promise<Account[]> {
  // TODO: const { data } = await apiClient.get<Account[]>('/admin/accounts')
  return [...SEED_ACCOUNTS]
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  void input
  // TODO: const { data } = await apiClient.post<Account>('/admin/accounts', input)
  throw new Error('createAccount is not implemented')
}

export async function updateAccount(account: Account): Promise<Account> {
  void account
  // TODO: const { data } = await apiClient.put<Account>(`/admin/accounts/${account.id}`, account)
  throw new Error('updateAccount is not implemented')
}

export async function deleteAccount(id: string): Promise<void> {
  void id
  // TODO: await apiClient.delete(`/admin/accounts/${id}`)
  throw new Error('deleteAccount is not implemented')
}
