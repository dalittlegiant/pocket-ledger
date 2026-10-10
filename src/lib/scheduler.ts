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
      next = advanceDate(next, rule.frequency, rule.interval)
    }

    // Still behind after the cap → fast-forward silently, no more inserts.
    while (next <= now) {
      next = advanceDate(next, rule.frequency, rule.interval)
    }

    await db.scheduled_rules.update(rule.id as number, { nextRunAt: next, lastRunAt: now })
  }
  return created
}
