import { db, type Account, type Category, type ScheduledRule, type Transaction } from '../db'

export interface BackupData {
  version: 1
  app: 'PocketLedger'
  exportedAt: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  scheduled_rules: ScheduledRule[]
}

function isBackupData(v: unknown): v is BackupData {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    d.app === 'PocketLedger' &&
    Array.isArray(d.accounts) &&
    Array.isArray(d.categories) &&
    Array.isArray(d.transactions) &&
    Array.isArray(d.scheduled_rules)
  )
}

/** Serializes all tables and triggers a JSON file download. */
export async function exportBackup(): Promise<void> {
  const [accounts, categories, transactions, scheduled_rules] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.scheduled_rules.toArray(),
  ])

  const data: BackupData = {
    version: 1,
    app: 'PocketLedger',
    exportedAt: Date.now(),
    accounts,
    categories,
    transactions,
    scheduled_rules,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const d = new Date()
  const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')

  const a = document.createElement('a')
  a.href = url
  a.download = `PocketLedger_Backup_${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // On iOS Safari this opens the "Save to Files" / iCloud dialog.
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Replaces ALL local data with the contents of a backup file.
 * Validates the shape first; throws on invalid files.
 */
export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!isBackupData(parsed)) {
    throw new Error('This file is not a PocketLedger backup.')
  }

  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    // Explicit IDs are preserved so account/category relationships survive.
    if (parsed.accounts.length > 0) await db.accounts.bulkAdd(parsed.accounts)
    if (parsed.categories.length > 0) await db.categories.bulkAdd(parsed.categories)
    if (parsed.transactions.length > 0) await db.transactions.bulkAdd(parsed.transactions)
    if (parsed.scheduled_rules.length > 0) await db.scheduled_rules.bulkAdd(parsed.scheduled_rules)
  })
}
