import { db, type ScheduledRule } from '../db'

export type Frequency = ScheduledRule['frequency']

/** Advance a timestamp by interval × frequency (calendar-aware). */
export function advanceDate(ts: number, frequency: Frequency, interval: number): number {
  const d = new Date(ts)
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + interval)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval)
      break
    case 'monthly': {
      // Clamp to end-of-month so Jan 31 → Feb 28 (not Mar 3).
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + interval)
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(day, lastDay))
      break
    }
    case 'yearly': {
      // Feb 29 → Feb 28 on non-leap years.
      const day = d.getDate()
      const month = d.getMonth()
      d.setDate(1)
      d.setFullYear(d.getFullYear() + interval)
      const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate()
      d.setMonth(month)
      d.setDate(Math.min(day, lastDay))
      break
    }
  }
  return d.getTime()
}

/** Days in a 0-based month. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Advance a monthly rule pinned to a specific day-of-month.
 * Clamps to the target month's last day (31st → Feb 28) — never rolls over
 * into the following month. Anchoring on the pinned day also prevents drift:
 * Jan 31 → Feb 28 → Mar 31, not Mar 28.
 */
export function advanceMonthlyPinned(fromTs: number, interval: number, dayOfMonth: number): number {
  const from = new Date(fromTs)
  const target = from.getMonth() + interval
  const year = from.getFullYear() + Math.floor(target / 12)
  const month = (((target % 12) + 12) % 12)
  const d = new Date(from)
  // Single setFullYear(year, month, day) call — no intermediate overflow.
  d.setFullYear(year, month, Math.min(dayOfMonth, daysInMonth(year, month)))
  return d.getTime()
}

/**
 * Next calendar occurrence of a pinned day-of-month at/after fromTs.
 * If the (clamped) day is still ahead today → this month, else next month.
 * Choosing today's date lands next month — matching the old "one month from
 * creation" default when the day defaults to today.
 */
export function nextMonthlyOccurrence(fromTs: number, dayOfMonth: number): number {
  const from = new Date(fromTs)
  const y = from.getFullYear()
  const m = from.getMonth()
  const candidate = new Date(y, m, Math.min(dayOfMonth, daysInMonth(y, m)))
  candidate.setHours(from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds())
  if (candidate.getTime() > fromTs) return candidate.getTime()
  const ny = y + Math.floor((m + 1) / 12)
  const nm = (m + 1) % 12
  const next = new Date(ny, nm, Math.min(dayOfMonth, daysInMonth(ny, nm)))
  next.setHours(from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds())
  return next.getTime()
}

/**
 * Safety cap: max catch-up transactions generated per rule per boot.
 * Prevents a runaway loop if the app hasn't been opened for months —
 * anything older than the cap is skipped and the rule fast-forwards.
 */
const MAX_CATCH_UP_RUNS = 24

/**
 * Finds due scheduled rules (nextRunAt <= now), inserts one transaction per
 * missed occurrence (backdated to each scheduled date), then pushes nextRunAt
 * into the future. Returns the number of transactions created.
 * Idempotent: re-running immediately finds nothing due.
 */
export async function runAutoSync(): Promise<number> {
  const now = Date.now()
  const due = (await db.scheduled_rules.where('nextRunAt').belowOrEqual(now).toArray()).filter(
    (r) => r.isActive,
  )

  let created = 0
  for (const rule of due) {
    let next = rule.nextRunAt
    let runs = 0
    // Pinned monthly rules advance from the configured day-of-month (clamped,
    // no drift); everything else uses the legacy step-from-last-run advance.
    const step = (ts: number): number =>
      rule.frequency === 'monthly' && rule.dayOfMonth != null
        ? advanceMonthlyPinned(ts, rule.interval, rule.dayOfMonth)
        : advanceDate(ts, rule.frequency, rule.interval)

    while (next <= now && runs < MAX_CATCH_UP_RUNS) {
      const t = Date.now()
      await db.transactions.add({
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        kind: rule.kind,
        amount: rule.amount,
        note: rule.note,
        occurredAt: next,
        createdAt: t,
        updatedAt: t,
      })
      created += 1
      runs += 1
      next = step(next)
    }

    // Still behind after the cap → fast-forward silently, no more inserts.
    while (next <= now) {
      next = step(next)
    }

    await db.scheduled_rules.update(rule.id as number, { nextRunAt: next, lastRunAt: now })
  }
  return created
}
