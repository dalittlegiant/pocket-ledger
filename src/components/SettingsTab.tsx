import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { wipeAllData } from '../seed'
import { advanceDate } from '../lib/scheduler'
import { formatMoney, toMinorUnits } from '../lib/format'
import { exportBackup, importBackup } from '../lib/backup'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">{children}</div>
    </section>
  )
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1 px-4 py-3 text-[16px] text-ios-blue active:bg-neutral-100"
    >
      <span className="text-xl font-light leading-none">+</span>
      {label}
    </button>
  )
}

function Dot({ color, letter }: { color?: string; letter: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
      style={{ backgroundColor: color ?? '#8e8e93' }}
    >
      {letter}
    </span>
  )
}

export default function SettingsTab() {
  // NOTE: db.accounts has no 'createdAt' index (see db.ts) — Dexie's orderBy()
  // throws on non-indexed fields, so sort the small account list in JS instead.
  const accounts = useLiveQuery(async () => {
    const list = await db.accounts.toArray()
    return list.sort((a, b) => a.createdAt - b.createdAt)
  }, [])
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), [])
  const rules = useLiveQuery(() => db.scheduled_rules.orderBy('nextRunAt').toArray(), [])
  const fileRef = useRef<HTMLInputElement>(null)

  const addAccount = async () => {
    const name = window.prompt('Account name:')
    if (!name?.trim()) return
    const now = Date.now()
    await db.accounts.add({
      name: name.trim(),
      type: 'other',
      currency: 'HKD',
      balance: 0,
      color: '#8e8e93',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    })
  }

  const addCategory = async () => {
    const name = window.prompt('Category name:')
    if (!name?.trim()) return
    const isIncome = window.confirm('Category kind:\n\nOK = Income\nCancel = Expense')
    const last = await db.categories.orderBy('sortOrder').last()
    await db.categories.add({
      name: name.trim(),
      kind: isIncome ? 'income' : 'expense',
      color: isIncome ? '#30d158' : '#ff9f0a',
      sortOrder: (last?.sortOrder ?? 0) + 1,
      isArchived: false,
    })
  }

  const wipe = async () => {
    const confirmed = window.confirm(
      'Wipe all data?\n\nThis permanently deletes every account, category and transaction on this device.',
    )
    if (!confirmed) return
    await wipeAllData()
  }

  const doExport = async () => {
    try {
      await exportBackup()
    } catch (e) {
      window.alert('Export failed: ' + (e instanceof Error ? e.message : 'unknown error'))
    }
  }

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return
    const confirmed = window.confirm(
      'Import this backup?\n\nThis will REPLACE all your current data. Are you sure?',
    )
    if (!confirmed) return
    try {
      await importBackup(file)
      window.location.reload() // simplest reliable way to refresh all live queries
    } catch (e) {
      window.alert('Import failed: ' + (e instanceof Error ? e.message : 'unknown error'))
    }
  }

  const addRule = async () => {
    const name = window.prompt('Recurring expense name (e.g. Rent):')
    if (!name?.trim()) return
    const amountInput = window.prompt(`Monthly amount for "${name.trim()}" (e.g. 120.00):`)
    const minor = amountInput ? toMinorUnits(amountInput) : null
    if (minor === null) {
      window.alert('Invalid amount — rule not created.')
      return
    }
    const allAccounts = await db.accounts.toArray()
    const firstAccount = allAccounts.sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!firstAccount?.id) {
      window.alert('Add an account first.')
      return
    }
    const now = Date.now()
    await db.scheduled_rules.add({
      accountId: firstAccount.id,
      kind: 'expense',
      amount: minor,
      note: name.trim(),
      frequency: 'monthly',
      interval: 1,
      nextRunAt: advanceDate(now, 'monthly', 1),
      isActive: true,
      createdAt: now,
    })
  }

  if (accounts === undefined || categories === undefined || rules === undefined) {
    return <div className="p-5 text-sm text-neutral-400">Loading…</div>
  }

  return (
    <div className="px-5 pb-6 pt-1">
      {/* Accounts */}
      <Section title="Accounts">
        <div className="divide-y divide-neutral-200/70">
          {(accounts ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <Dot color={a.color} letter={a.name[0].toUpperCase()} />
              <span className="min-w-0 flex-1 truncate text-[16px] text-neutral-900">{a.name}</span>
              <span className="shrink-0 text-[13px] capitalize text-neutral-400">{a.type}</span>
            </div>
          ))}
          <AddRow label="Add Account" onClick={addAccount} />
        </div>
      </Section>

      {/* Categories */}
      <Section title="Categories">
        <div className="divide-y divide-neutral-200/70">
          {(categories ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <Dot color={c.color} letter={c.name[0].toUpperCase()} />
              <span className="min-w-0 flex-1 truncate text-[16px] text-neutral-900">{c.name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                  c.kind === 'income'
                    ? 'bg-[#34c759]/15 text-[#248a3d]'
                    : 'bg-[#ff3b30]/10 text-[#d70015]'
                }`}
              >
                {c.kind === 'income' ? 'Income' : 'Expense'}
              </span>
            </div>
          ))}
          <AddRow label="Add Category" onClick={addCategory} />
        </div>
      </Section>

      {/* Scheduled Transactions */}
      <Section title="Scheduled Transactions">
        <div className="divide-y divide-neutral-200/70">
          {(rules ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <Dot color="#bf5af2" letter={(r.note ?? 'R')[0].toUpperCase()} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] text-neutral-900">{r.note ?? 'Recurring'}</p>
                <p className="text-[13px] text-neutral-500">
                  Monthly · next{' '}
                  {new Date(r.nextRunAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <span className="shrink-0 text-[16px] font-semibold tabular-nums text-neutral-900">
                {formatMoney(r.amount)}
              </span>
            </div>
          ))}
          <AddRow label="Add Monthly Expense" onClick={addRule} />
        </div>
      </Section>

      {/* Data */}
      <Section title="Data">
        <div className="divide-y divide-neutral-200/70">
          <button
            type="button"
            onClick={doExport}
            className="w-full px-4 py-3 text-center text-[16px] text-ios-blue active:bg-neutral-100"
          >
            Export Backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full px-4 py-3 text-center text-[16px] text-ios-blue active:bg-neutral-100"
          >
            Import Backup
          </button>
          <button
            type="button"
            onClick={wipe}
            className="w-full px-4 py-3 text-center text-[16px] font-medium text-[#ff3b30] active:bg-neutral-100"
          >
            Wipe All Data
          </button>
        </div>
        {/* Hidden file picker for imports */}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const input = e.target
            void onFilePicked(input.files?.[0]).finally(() => {
              input.value = '' // allow picking the same file again
            })
          }}
        />
      </Section>

      <p className="px-1 text-center text-[12px] text-neutral-400">
        PocketLedger · all data stays on this device
      </p>
    </div>
  )
}
