export type Status = 'Active' | 'Inactive'

export interface Account {
  id: string
  name: string
  email: string
  status: Status
}

export interface CreateAccountInput {
  name: string
  email: string
  password: string
}

/** Mirrors the backend rule — POST /api/admin/accounts 400s below this. */
export const MIN_PASSWORD_LENGTH = 8
