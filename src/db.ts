import Dexie, { type Table } from 'dexie'

/**
 * Money is stored as INTEGER minor units (cents) to avoid float errors.
 * Timestamps are epoch milliseconds (Date.now()).
 */

export type AccountType = 'cash' | 'bank' | 'credit' | 'ewallet' | 'other'
export type TxnKind = 'expense' | 'income' | 'transfer'
export type RuleFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Account {
  id?: number
  name: string
  type: AccountType
  currency: string // ISO 4217, e.g. 'HKD'
  balance: number // minor units
  icon?: string
  color?: string
  isArchived: boolean
  createdAt: number
  updatedAt: number
}

export interface Category {
  id?: number
  name: string
  kind: Exclude<TxnKind, 'transfer'>
  icon?: string
  color?: string
  sortOrder: number
  isArchived: boolean
}

export interface Transaction {
  id?: number
  accountId: number
  categoryId?: number // undefined for transfers
  kind: TxnKind
  amount: number // minor units, always positive — sign derives from kind
  note?: string
  occurredAt: number
  toAccountId?: number // set only when kind === 'transfer'
  createdAt: number
  updatedAt: number
}

export interface ScheduledRule {
  id?: number
  accountId: number
  categoryId?: number
  kind: TxnKind
  amount: number // minor units
  note?: string
  frequency: RuleFrequency
  interval: number // every N frequency units
  nextRunAt: number
  lastRunAt?: number
  isActive: boolean
  createdAt: number
}

export class PocketLedgerDB extends Dexie {
  accounts!: Table<Account, number>
  categories!: Table<Category, number>
  transactions!: Table<Transaction, number>
  scheduled_rules!: Table<ScheduledRule, number>

  constructor() {
    super('pocket-ledger')
    this.version(1).stores({
      // ++id = auto-increment primary key; the rest are indexed fields
      accounts: '++id, name, type, isArchived',
      categories: '++id, kind, sortOrder, isArchived',
      transactions: '++id, accountId, categoryId, kind, occurredAt, createdAt',
      scheduled_rules: '++id, accountId, kind, nextRunAt, isActive',
    })
  }
}

export const db = new PocketLedgerDB()
