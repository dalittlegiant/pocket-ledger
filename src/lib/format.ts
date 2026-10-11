// Shared formatting helpers. (Accounts/categories live in Dexie — no mocks here.)

/** "50.5" -> 5050; "0" -> 0 (zero is valid, e.g. a free bus ride).
 *  Returns null for empty/invalid input. Negatives never match the regex. */
export function toMinorUnits(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const minor = Math.round(parseFloat(trimmed) * 100)
  return minor >= 0 ? minor : null
}

const moneyFmt = new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' })

/** 5050 -> "HK$50.50" */
export function formatMoney(minorUnits: number): string {
  return moneyFmt.format(minorUnits / 100)
}

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
