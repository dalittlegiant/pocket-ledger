import { toMinorUnits } from './format'

export type SMSSource = 'payme' | 'credit-card' | 'hsbc-expense' | 'hsbc-refund' | 'alipay-auto'

export type ParsedKind = 'expense' | 'income'

export interface ParsedSMS {
  amount: number // minor units
  merchant: string // pre-filled note text, e.g. "WEST JAPAN RAILWAY C (JPY)"
  kind: ParsedKind
  source: SMSSource
  currency?: string // ISO code when the SMS states one, e.g. 'JPY'
}

/**
 * Hard fail-list: messages that look like payments but never completed.
 * A finance app must never log money that didn't actually move.
 */
const FAILURE_MARKERS = /未能完成|交易失敗|付款失敗|交易取消/

interface Rule {
  source: SMSSource
  kind: ParsedKind
  pattern: RegExp
  amountGroup: number
  currencyGroup?: number
  note: (m: RegExpMatchArray) => string
}

const RULES: Rule[] = [
  // HSBC refund (income): "…一項USD1.00從(METAPAY YGXHK96WE4)的退款…"
  {
    source: 'hsbc-refund',
    kind: 'income',
    pattern: /一項([A-Z]{3})([\d,]+(?:\.\d{1,2})?)從\(([^)]+)\)的退款/,
    amountGroup: 2,
    currencyGroup: 1,
    note: (m) => `${m[3].trim()} (${m[1]})`,
  },
  // HSBC card expense (incl. foreign currency): "…有JPY23,080交易(WEST JAPAN RAILWAY C)…"
  {
    source: 'hsbc-expense',
    kind: 'expense',
    pattern: /有([A-Z]{3})([\d,]+(?:\.\d{1,2})?)交易\(([^)]+)\)/,
    amountGroup: 2,
    currencyGroup: 1,
    note: (m) => `${m[3].trim()} (${m[1]})`,
  },
  // AlipayHK auto-payment: "[AlipayHK]…成功通過Google授權自動付款支付HKD40.00"
  {
    source: 'alipay-auto',
    kind: 'expense',
    pattern: /通過(.+?)授權自動付款支付HKD([\d,]+(?:\.\d{1,2})?)/,
    amountGroup: 2,
    note: (m) => m[1].trim(),
  },
  // PayMe: "You paid HKD 68.00 to Starbucks"
  {
    source: 'payme',
    kind: 'expense',
    pattern: /paid HKD ([\d.,]+) to (.+)/i,
    amountGroup: 1,
    note: (m) => m[2],
  },
  // Credit card: "Payment for HKD 120.50 at MTR Corporation"
  {
    source: 'credit-card',
    kind: 'expense',
    pattern: /for HKD ([\d.,]+) at (.+)/i,
    amountGroup: 1,
    note: (m) => m[2],
  },
]

/** Tries each rule in order; returns null when nothing matches. */
export function parseSMS(text: string): ParsedSMS | null {
  const input = text.trim()
  if (input.length === 0) return null
  if (FAILURE_MARKERS.test(input)) return null

  for (const rule of RULES) {
    const m = input.match(rule.pattern)
    if (!m) continue
    const amount = toMinorUnits(m[rule.amountGroup])
    const merchant = rule.note(m).trim().replace(/[.。]+$/, '')
    if (amount === null || merchant.length === 0) continue
    return {
      amount,
      merchant,
      kind: rule.kind,
      source: rule.source,
      currency: rule.currencyGroup !== undefined ? m[rule.currencyGroup] : undefined,
    }
  }
  return null
}
