import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatMoney, getCategory } from '../lib/catalog'

type Period = 'this' | 'last'

interface MonthRange {
  start: number
  end: number
  label: string
}

function getMonthRange(period: Period): MonthRange {
  const now = new Date()
  const ref =
    period === 'this'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return {
    start: ref.getTime(),
    // Dexie's between() is [inclusive, exclusive) — exactly [monthStart, nextMonthStart)
    end: new Date(ref.getFullYear(), ref.getMonth() + 1, 1).getTime(),
    label: ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

const PERIODS: { id: Period; label: string }[] = [
  { id: 'this', label: 'This Month' },
  { id: 'last', label: 'Last Month' },
]

export default function ChartsTab() {
  const [period, setPeriod] = useState<Period>('this')
  const range = useMemo(() => getMonthRange(period), [period])

  const txns = useLiveQuery(
    () => db.transactions.where('occurredAt').between(range.start, range.end).toArray(),
    [range.start, range.end],
  )

  const stats = useMemo(() => {
    let expense = 0
    let income = 0
    const byCategory = new Map<number, number>()
    for (const t of txns ?? []) {
      if (t.kind === 'expense') {
        expense += t.amount
        if (t.categoryId !== undefined) {
          byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amount)
        }
      } else if (t.kind === 'income') {
        income += t.amount
      }
      // transfers are excluded from income/expense analytics
    }
    const rows = [...byCategory.entries()]
      .map(([id, total]) => ({ category: getCategory(id), total }))
      .filter(
        (r): r is { category: NonNullable<ReturnType<typeof getCategory>>; total: number } =>
          r.category !== undefined,
      )
      .sort((a, b) => b.total - a.total)
    return { expense, income, net: income - expense, rows }
  }, [txns])

  return (
    <div className="px-5 pb-6 pt-1">
      {/* Period toggle */}
      <div className="flex rounded-xl bg-neutral-300/60 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all ${
              period === p.id
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 active:text-neutral-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="mt-4 px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
        {range.label}
      </p>

      {/* Summary card */}
      <div className="mt-1.5 rounded-2xl bg-white p-5 shadow-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-500">Expense</p>
            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#ff3b30]">
              {formatMoney(stats.expense)}
            </p>
          </div>
          <div className="border-x border-neutral-200/70">
            <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-500">Income</p>
            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#34c759]">
              {formatMoney(stats.income)}
            </p>
          </div>
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-500">Net Flow</p>
            <p
              className={`mt-1 text-[17px] font-bold tabular-nums ${
                stats.net >= 0 ? 'text-neutral-900' : 'text-[#ff3b30]'
              }`}
            >
              {stats.net >= 0 ? '+' : '−'}
              {formatMoney(Math.abs(stats.net))}
            </p>
          </div>
        </div>
      </div>

      {/* Spending breakdown */}
      <h3 className="mb-1.5 mt-5 px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
        Spending
      </h3>
      {txns === undefined ? (
        <div className="p-2 text-sm text-neutral-400">Loading…</div>
      ) : stats.rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-neutral-400 shadow-sm">
          No expenses {period === 'this' ? 'this month' : 'last month'} yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {stats.rows.map(({ category, total }, i) => {
            const pct = stats.expense > 0 ? (total / stats.expense) * 100 : 0
            return (
              <div
                key={category.id}
                className={`px-4 py-3.5 ${i > 0 ? 'border-t border-neutral-200/70' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.name[0].toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[16px] text-neutral-900">
                    {category.name}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-neutral-400">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="shrink-0 text-[16px] font-semibold tabular-nums text-neutral-900">
                    {formatMoney(total)}
                  </span>
                </div>
                {/* Pure-CSS progress bar */}
                <div className="ml-[48px] mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-200/70">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: category.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
