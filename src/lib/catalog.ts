// Temporary mock data until real account/category management lands.
// IDs are stable so transactions saved now keep resolving later.

export interface MockAccount {
  id: number
  name: string
  color: string
}

export interface MockCategory {
  id: number
  name: string
  kind: 'expense' | 'income'
  color: string
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  { id: 1, name: 'Cash', color: '#30d158' },
  { id: 2, name: 'Credit Card', color: '#0a84ff' },
]

export const MOCK_CATEGORIES: MockCategory[] = [
  { id: 1, name: 'Food', kind: 'expense', color: '#ff9f0a' },
  { id: 2, name: 'Transport', kind: 'expense', color: '#0a84ff' },
  { id: 3, name: 'Salary', kind: 'income', color: '#30d158' },
]

export const getAccount = (id?: number) => MOCK_ACCOUNTS.find((a) => a.id === id)
export const getCategory = (id?: number) => MOCK_CATEGORIES.find((c) => c.id === id)

// --- Money: user-facing string <-> integer minor units ---

/** "50.5" -> 5050. Returns null for empty/invalid/non-positive input. */
export function toMinorUnits(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const minor = Math.round(parseFloat(trimmed) * 100)
  return minor > 0 ? minor : null
}

const moneyFmt = new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' })

/** 5050 -> "HK$50.50" */
export function formatMoney(minorUnits: number): string {
  return moneyFmt.format(minorUnits / 100)
}

// --- Date grouping ---

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function dayLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
