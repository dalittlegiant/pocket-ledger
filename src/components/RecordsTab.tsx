import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account, type Category, type Transaction } from '../db'
import { dayKey, dayLabel, formatMoney, timeLabel } from '../lib/format'

function amountStyle(kind: Transaction['kind']): string {
  switch (kind) {
    case 'expense':
      return 'text-[#ff3b30]'
    case 'income':
      return 'text-[#34c759]'
    case 'transfer':
      return 'text-neutral-700'
  }
}

function amountPrefix(kind: Transaction['kind']): string {
  return kind === 'expense' ? '−' : kind === 'income' ? '+' : ''
}

function Row({
  txn,
  account,
  category,
  toAccount,
}: {
  txn: Transaction
  account?: Account
  category?: Category
  toAccount?: Account
}) {
  const title = txn.note?.trim() || category?.name || (txn.kind === 'transfer' ? 'Transfer' : 'Transaction')
  const subtitle =
    txn.kind === 'transfer' ? `${account?.name ?? ''} → ${toAccount?.name ?? ''}` : (account?.name ?? '')
  const dotColor = category?.color ?? '#8e8e93'
  const initial = (category?.name ?? (txn.kind === 'transfer' ? 'T' : '?'))[0].toUpperCase()

  return (
    <div className="flex items-center gap-3 px-4 py-3 active:bg-neutral-100">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
        style={{ backgroundColor: dotColor }}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] text-neutral-900">{title}</p>
        <p className="truncate text-[13px] text-neutral-500">
          {subtitle}
          {subtitle ? ' · ' : ''}
          {timeLabel(txn.occurredAt)}
        </p>
      </div>
      <span className={`shrink-0 text-[16px] font-semibold tabular-nums ${amountStyle(txn.kind)}`}>
        {amountPrefix(txn.kind)}
        {formatMoney(txn.amount)}
      </span>
    </div>
  )
}

export default function RecordsTab() {
  const txns = useLiveQuery(() => db.transactions.orderBy('occurredAt').reverse().toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const accountById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id as number, a])),
    [accounts],
  )
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id as number, c])),
    [categories],
  )

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Transaction[] }>()
    for (const t of txns ?? []) {
      const key = dayKey(t.occurredAt)
      const entry = map.get(key)
      if (entry) entry.items.push(t)
      else map.set(key, { label: dayLabel(t.occurredAt), items: [t] })
    }
    return [...map.values()]
  }, [txns])

  if (txns === undefined || accounts === undefined || categories === undefined) {
    return <div className="p-5 text-sm text-neutral-400">Loading…</div>
  }

  if (txns.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-2xl text-neutral-400">
          ∅
        </div>
        <p className="mt-2 text-[17px] font-semibold text-neutral-800">No records yet</p>
        <p className="text-sm text-neutral-500">
          Tap <span className="font-semibold text-ios-blue">+</span> to add your first transaction.
        </p>
      </div>
    )
  }

  return (
    <div className="px-5 pb-6 pt-1">
      {groups.map((g) => (
        <section key={g.label} className="mb-5">
          <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
            {g.label}
          </h3>
          <div className="divide-y divide-neutral-200/70 overflow-hidden rounded-2xl bg-white shadow-sm">
            {g.items.map((t) => (
              <Row
                key={t.id}
                txn={t}
                account={accountById.get(t.accountId)}
                category={t.categoryId !== undefined ? categoryById.get(t.categoryId) : undefined}
                toAccount={t.toAccountId !== undefined ? accountById.get(t.toAccountId) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
