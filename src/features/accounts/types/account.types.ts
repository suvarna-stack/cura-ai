export type Role = 'Coder' | 'Senior Coder'
export type Status = 'Active' | 'Inactive'

export interface Account {
  id: string
  name: string
  email: string
  role: Role
  status: Status
}

export interface CreateAccountInput {
  name: string
  email: string
  role: Role
  password: string
}

export const SEED_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    name: 'Sarah K. (Sarah Kongkiat)',
    email: 'sarah.k@hospital.th',
    role: 'Senior Coder',
    status: 'Active',
  },
  {
    id: 'a2',
    name: 'Naret Pichitporn',
    email: 'naret.p@hospital.th',
    role: 'Coder',
    status: 'Active',
  },
  {
    id: 'a3',
    name: 'Panitda Wongchot',
    email: 'panitda.w@hospital.th',
    role: 'Coder',
    status: 'Active',
  },
  {
    id: 'a4',
    name: 'Suwan Ariyarat',
    email: 'suwan.a@hospital.th',
    role: 'Coder',
    status: 'Inactive',
  },
  {
    id: 'a5',
    name: 'Lalita Meechai',
    email: 'lalita.m@hospital.th',
    role: 'Senior Coder',
    status: 'Active',
  },
  {
    id: 'a6',
    name: 'Teerapat Somboon',
    email: 'teerapat.s@hospital.th',
    role: 'Coder',
    status: 'Active',
  },
]
