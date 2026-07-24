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

export const SEED_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    name: 'Sarah K. (Sarah Kongkiat)',
    email: 'sarah.k@hospital.th',
    status: 'Active',
  },
  {
    id: 'a2',
    name: 'Naret Pichitporn',
    email: 'naret.p@hospital.th',
    status: 'Active',
  },
  {
    id: 'a3',
    name: 'Panitda Wongchot',
    email: 'panitda.w@hospital.th',
    status: 'Active',
  },
  {
    id: 'a4',
    name: 'Suwan Ariyarat',
    email: 'suwan.a@hospital.th',
    status: 'Inactive',
  },
  {
    id: 'a5',
    name: 'Lalita Meechai',
    email: 'lalita.m@hospital.th',
    status: 'Active',
  },
  {
    id: 'a6',
    name: 'Teerapat Somboon',
    email: 'teerapat.s@hospital.th',
    status: 'Active',
  },
]
