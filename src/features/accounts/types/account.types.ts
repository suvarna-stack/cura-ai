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
