import { toMinorUnits } from './format'

export type SMSSource = 'payme' | 'credit-card'

export interface ParsedSMS {
  amount: number // minor units
  merchant: string
  source: SMSSource
}

const RULES: { source: SMSSource; pattern: RegExp }[] = [
  // PayMe:  "You paid HKD 68.00 to Starbucks"
  { source: 'payme', pattern: /paid HKD ([\d.]+) to (.+)/i },
  // Credit card: "Payment of HKD 120.50 at MTR Corporation"
  { source: 'credit-card', pattern: /for HKD ([\d.]+) at (.+)/i },
]

/** Tries each rule in order; returns null when nothing matches. */
export function parseSMS(text: string): ParsedSMS | null {
  const input = text.trim()
  for (const { source, pattern } of RULES) {
    const m = input.match(pattern)
    if (!m) continue
    const amount = toMinorUnits(m[1])
    const merchant = m[2].trim().replace(/[.。]+$/, '')
    if (amount === null || merchant.length === 0) continue
    return { amount, merchant, source }
  }
  return null
}
