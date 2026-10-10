import { db } from './db'

/** Default accounts + categories, seeded only when the DB is completely empty. */
export async function seedDefaults(): Promise<void> {
  const count = await db.accounts.count()
  if (count > 0) return

  const now = Date.now()
  await db.accounts.bulkAdd([
    {
      id: 1,
      name: 'Cash',
      type: 'cash',
      currency: 'HKD',
      balance: 0,
      color: '#30d158',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      name: 'Credit Card',
      type: 'credit',
      currency: 'HKD',
      balance: 0,
      color: '#0a84ff',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.categories.bulkAdd([
    { id: 1, name: 'Food', kind: 'expense', color: '#ff9f0a', sortOrder: 1, isArchived: false },
    { id: 2, name: 'Transport', kind: 'expense', color: '#0a84ff', sortOrder: 2, isArchived: false },
    { id: 3, name: 'Salary', kind: 'income', color: '#30d158', sortOrder: 3, isArchived: false },
  ])

  // Demo scheduled rule: already due, so the first app boot materializes
  // a Netflix transaction and showcases the auto-sync.
  await db.scheduled_rules.add({
    accountId: 2,
    kind: 'expense',
    amount: 7800, // HK$78.00
    note: 'Netflix',
    frequency: 'monthly',
    interval: 1,
    nextRunAt: now - 1000,
    isActive: true,
    createdAt: now,
  })
}

/** Demo transactions, seeded only when the transactions table is empty. */
export async function seedDemoTransactions(): Promise<void> {
  const count = await db.transactions.count()
  if (count > 0) return

  const now = Date.now()
  const DAY = 86_400_000
  await db.transactions.bulkAdd([
    {
      accountId: 1,
      categoryId: 1,
      kind: 'expense',
      amount: 4850, // HK$48.50
      note: 'Lunch at Tsui Wah',
      occurredAt: now - 2 * 3_600_000,
      createdAt: now,
      updatedAt: now,
    },
    {
      accountId: 2,
      categoryId: 2,
      kind: 'expense',
      amount: 1200, // HK$12.00
      note: 'MTR to Central',
      occurredAt: now - DAY - 5 * 3_600_000,
      createdAt: now,
      updatedAt: now,
    },
    {
      accountId: 1,
      categoryId: 3,
      kind: 'income',
      amount: 2500000, // HK$25,000.00
      note: 'October salary',
      occurredAt: now - 2 * DAY,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

/** First-launch seeding: defaults + demo data. */
export async function seedIfEmpty(): Promise<void> {
  await seedDefaults()
  await seedDemoTransactions()
}

/** Clears every table, then restores the default accounts/categories. */
export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  await seedDefaults()
}
