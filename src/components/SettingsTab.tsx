import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account, type AccountType, type Category, type ScheduledRule } from '../db'
import { wipeAllData } from '../seed'
import { nextMonthlyOccurrence } from '../lib/scheduler'
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

type CatModalState = { mode: 'add' } | { mode: 'edit'; category: Category }

/**
 * iOS-style centered dialog for adding / editing a category.
 * Replaces the old window.prompt / window.confirm flow.
 */
function CategoryModal({ initial, onClose }: { initial: CatModalState; onClose: () => void }) {
  const isEdit = initial.mode === 'edit'
  const [name, setName] = useState(isEdit ? initial.category.name : '')
  const [kind, setKind] = useState<'expense' | 'income'>(
    isEdit ? initial.category.kind : 'expense',
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a category name.')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await db.categories.update(initial.category.id as number, { name: trimmed, kind })
      } else {
        const last = await db.categories.orderBy('sortOrder').last()
        await db.categories.add({
          name: trimmed,
          kind,
          color: kind === 'income' ? '#30d158' : '#ff9f0a',
          sortOrder: (last?.sortOrder ?? 0) + 1,
          isArchived: false,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    const id = initial.category.id as number
    // categoryId is indexed on transactions; scheduled_rules has no
    // categoryId index, so filter that table in JS (see db.ts).
    const usedByTxns = await db.transactions.where('categoryId').equals(id).count()
    const usedByRules = await db.scheduled_rules.filter((r) => r.categoryId === id).count()
    const total = usedByTxns + usedByRules
    if (total > 0) {
      setError(
        `This category is used by ${total} transaction${total === 1 ? '' : 's'}. ` +
          `Reassign or delete ${total === 1 ? 'it' : 'them'} first.`,
      )
      setConfirmingDelete(false)
      return
    }
    await db.categories.delete(id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-center text-[17px] font-semibold text-neutral-900">
          {isEdit ? 'Edit Category' : 'New Category'}
        </h2>

        {/* Kind segmented control */}
        <div className="mt-4 flex rounded-xl bg-neutral-300/60 p-1">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all ${
                kind === k
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 active:text-neutral-900'
              }`}
            >
              {k === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="Category name"
          maxLength={40}
          autoFocus
          className="mt-3 w-full rounded-xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
        />

        {error && <p className="mt-2 text-[13px] text-[#ff3b30]">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || name.trim().length === 0}
          className={`mt-4 w-full rounded-2xl py-3 text-[17px] font-semibold text-white transition-all active:scale-[0.98] ${
            saving || name.trim().length === 0 ? 'bg-neutral-300' : 'bg-ios-blue'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full py-2 text-[17px] text-ios-blue active:opacity-60"
        >
          Cancel
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className={`mt-1 w-full rounded-2xl py-3 text-[17px] font-semibold transition-all active:scale-[0.98] ${
              confirmingDelete ? 'bg-[#ff3b30] text-white' : 'bg-[#ff3b30]/10 text-[#ff3b30]'
            }`}
          >
            {confirmingDelete ? 'Tap again to confirm delete' : 'Delete Category'}
          </button>
        )}
      </div>
    </div>
  )
}

const ACCOUNT_TYPES: { id: AccountType; label: string; color: string }[] = [
  { id: 'cash', label: 'Cash', color: '#30d158' },
  { id: 'bank', label: 'Bank', color: '#0a84ff' },
  { id: 'credit', label: 'Credit Card', color: '#ff9f0a' },
  { id: 'ewallet', label: 'E-Wallet', color: '#bf5af2' },
  { id: 'other', label: 'Other', color: '#8e8e93' },
]

function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find((t) => t.id === type)?.label ?? type
}

type AccountModalState = { mode: 'add' } | { mode: 'edit'; account: Account }

/**
 * iOS-style centered dialog for adding / editing an account.
 * Same premium treatment as the category dialog.
 */
function AccountModal({ initial, onClose }: { initial: AccountModalState; onClose: () => void }) {
  const isEdit = initial.mode === 'edit'
  const [name, setName] = useState(isEdit ? initial.account.name : '')
  const [type, setType] = useState<AccountType>(isEdit ? initial.account.type : 'cash')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter an account name.')
      return
    }
    const color = ACCOUNT_TYPES.find((t) => t.id === type)?.color ?? '#8e8e93'
    setSaving(true)
    try {
      if (isEdit) {
        await db.accounts.update(initial.account.id as number, {
          name: trimmed,
          type,
          color,
          updatedAt: Date.now(),
        })
      } else {
        const now = Date.now()
        await db.accounts.add({
          name: trimmed,
          type,
          currency: 'HKD',
          balance: 0,
          color,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    const id = initial.account.id as number
    // accountId is indexed on both tables; toAccountId is NOT indexed on
    // transactions (see db.ts) — Dexie's where() throws on non-indexed
    // fields, so filter those in JS instead.
    const [usedAsSource, usedAsDest, usedByRules] = await Promise.all([
      db.transactions.where('accountId').equals(id).count(),
      db.transactions.filter((t) => t.toAccountId === id).count(),
      db.scheduled_rules.where('accountId').equals(id).count(),
    ])
    const total = usedAsSource + usedAsDest + usedByRules
    if (total > 0) {
      setError(
        `This account is used by ${total} transaction${total === 1 ? '' : 's'}. ` +
          `Reassign or delete ${total === 1 ? 'it' : 'them'} first.`,
      )
      setConfirmingDelete(false)
      return
    }
    await db.accounts.delete(id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-center text-[17px] font-semibold text-neutral-900">
          {isEdit ? 'Edit Account' : 'New Account'}
        </h2>

        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="Account name"
          maxLength={40}
          autoFocus
          className="mt-4 w-full rounded-xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
        />

        {/* Account type pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {ACCOUNT_TYPES.map((t) => {
            const selected = type === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
                  selected
                    ? 'border-ios-blue bg-ios-blue/10 text-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-600'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.label}
                {selected && <span className="text-ios-blue">✓</span>}
              </button>
            )
          })}
        </div>

        {error && <p className="mt-2 text-[13px] text-[#ff3b30]">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || name.trim().length === 0}
          className={`mt-4 w-full rounded-2xl py-3 text-[17px] font-semibold text-white transition-all active:scale-[0.98] ${
            saving || name.trim().length === 0 ? 'bg-neutral-300' : 'bg-ios-blue'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full py-2 text-[17px] text-ios-blue active:opacity-60"
        >
          Cancel
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className={`mt-1 w-full rounded-2xl py-3 text-[17px] font-semibold transition-all active:scale-[0.98] ${
              confirmingDelete ? 'bg-[#ff3b30] text-white' : 'bg-[#ff3b30]/10 text-[#ff3b30]'
            }`}
          >
            {confirmingDelete ? 'Tap again to confirm delete' : 'Delete Account'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * iOS-style centered dialog for creating / editing a scheduled transaction.
 * Add mode starts empty with no delete button; edit mode pre-fills name/amount
 * and offers the two-step delete. Rule deletions need no guard — generated
 * transactions are independent copies.
 */
type RuleModalState = { mode: 'add' } | { mode: 'edit'; rule: ScheduledRule }

function RuleModal({ initial, onClose }: { initial: RuleModalState; onClose: () => void }) {
  const isEdit = initial.mode === 'edit'
  const originalDay = isEdit
    ? (initial.rule.dayOfMonth ?? new Date(initial.rule.nextRunAt).getDate())
    : new Date().getDate()
  const [name, setName] = useState(isEdit ? (initial.rule.note ?? '') : '')
  const [amountStr, setAmountStr] = useState(
    isEdit ? (initial.rule.amount / 100).toFixed(2) : '0.00',
  )
  const [dayStr, setDayStr] = useState(String(originalDay))
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const dayNum = /^\d{1,2}$/.test(dayStr.trim()) ? parseInt(dayStr.trim(), 10) : NaN
  const dayValid = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31
  const dayChanged = isEdit && dayValid && dayNum !== originalDay
  // Preview: the stored nextRunAt unless the day was just (re)chosen, in
  // which case the freshly computed, clamped occurrence.
  const previewTs = !dayValid
    ? isEdit
      ? initial.rule.nextRunAt
      : null
    : isEdit && !dayChanged
      ? initial.rule.nextRunAt
      : nextMonthlyOccurrence(Date.now(), dayNum)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a name.')
      return
    }
    const minor = toMinorUnits(amountStr)
    if (minor === null) {
      setError('Please enter a valid amount.')
      return
    }
    if (!dayValid) {
      setError('Day of the month must be between 1 and 31.')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const patch: Partial<ScheduledRule> = { note: trimmed, amount: minor, dayOfMonth: dayNum }
        // Day changed → re-anchor the schedule on the new day from today.
        if (dayChanged) patch.nextRunAt = nextMonthlyOccurrence(Date.now(), dayNum)
        await db.scheduled_rules.update(initial.rule.id as number, patch)
      } else {
        const allAccounts = await db.accounts.toArray()
        const firstAccount = allAccounts.sort((a, b) => a.createdAt - b.createdAt)[0]
        if (!firstAccount?.id) {
          setError('Add an account first.')
          return
        }
        const now = Date.now()
        await db.scheduled_rules.add({
          accountId: firstAccount.id,
          kind: 'expense',
          amount: minor,
          note: trimmed,
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: dayNum,
          nextRunAt: nextMonthlyOccurrence(now, dayNum),
          isActive: true,
          createdAt: now,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    await db.scheduled_rules.delete(initial.rule.id as number)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-center text-[17px] font-semibold text-neutral-900">
          {isEdit ? 'Edit Scheduled Transaction' : 'New Scheduled Transaction'}
        </h2>

        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="Name (e.g. Rent)"
          maxLength={40}
          autoFocus
          className="mt-4 w-full rounded-xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
        />

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-100 px-4 py-3 focus-within:ring-2 focus-within:ring-ios-blue/40">
          <span className="text-[16px] font-medium text-neutral-400">HK$</span>
          <input
            value={amountStr}
            onChange={(e) => {
              setAmountStr(e.target.value)
              setError(null)
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-transparent text-[16px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-100 px-4 py-2.5">
          <label htmlFor="rule-day" className="text-[16px] text-neutral-900">
            Day of the month
          </label>
          <input
            id="rule-day"
            value={dayStr}
            onChange={(e) => {
              setDayStr(e.target.value)
              setError(null)
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="1–31"
            className="w-16 rounded-lg bg-white px-2 py-1.5 text-center text-[16px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
          />
        </div>
        <p className="mt-2 px-1 text-[12px] text-neutral-400">
          Repeats monthly
          {previewTs !== null &&
            ` · next ${new Date(previewTs).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}`}
        </p>

        {error && <p className="mt-2 text-[13px] text-[#ff3b30]">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || name.trim().length === 0}
          className={`mt-4 w-full rounded-2xl py-3 text-[17px] font-semibold text-white transition-all active:scale-[0.98] ${
            saving || name.trim().length === 0 ? 'bg-neutral-300' : 'bg-ios-blue'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full py-2 text-[17px] text-ios-blue active:opacity-60"
        >
          Cancel
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className={`mt-1 w-full rounded-2xl py-3 text-[17px] font-semibold transition-all active:scale-[0.98] ${
              confirmingDelete ? 'bg-[#ff3b30] text-white' : 'bg-[#ff3b30]/10 text-[#ff3b30]'
            }`}
          >
            {confirmingDelete ? 'Tap again to confirm delete' : 'Delete Scheduled Transaction'}
          </button>
        )}
      </div>
    </div>
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
  const [catModal, setCatModal] = useState<CatModalState | null>(null)
  const [accountModal, setAccountModal] = useState<AccountModalState | null>(null)
  const [ruleModal, setRuleModal] = useState<RuleModalState | null>(null)

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

  if (accounts === undefined || categories === undefined || rules === undefined) {
    return <div className="p-5 text-sm text-neutral-400">Loading…</div>
  }

  return (
    <div className="px-5 pb-6 pt-1">
      {/* Accounts */}
      <Section title="Accounts">
        <div className="divide-y divide-neutral-200/70">
          {(accounts ?? []).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => a.id !== undefined && setAccountModal({ mode: 'edit', account: a })}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-neutral-100"
            >
              <Dot color={a.color} letter={a.name[0].toUpperCase()} />
              <span className="min-w-0 flex-1 truncate text-[16px] text-neutral-900">{a.name}</span>
              <span className="shrink-0 text-[13px] text-neutral-400">
                {accountTypeLabel(a.type)}
              </span>
            </button>
          ))}
          <AddRow label="Add Account" onClick={() => setAccountModal({ mode: 'add' })} />
        </div>
      </Section>

      {/* Categories */}
      <Section title="Categories">
        <div className="divide-y divide-neutral-200/70">
          {(categories ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => c.id !== undefined && setCatModal({ mode: 'edit', category: c })}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-neutral-100"
            >
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
            </button>
          ))}
          <AddRow label="Add Category" onClick={() => setCatModal({ mode: 'add' })} />
        </div>
      </Section>

      {/* Scheduled Transactions */}
      <Section title="Scheduled Transactions">
        <div className="divide-y divide-neutral-200/70">
          {(rules ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRuleModal({ mode: 'edit', rule: r })}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-neutral-100"
            >
              <Dot color="#bf5af2" letter={(r.note ?? 'R')[0].toUpperCase()} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] text-neutral-900">{r.note ?? 'Recurring'}</p>
                <p className="text-[13px] text-neutral-500">
                  Monthly{r.dayOfMonth != null && ` · day ${r.dayOfMonth}`} · next{' '}
                  {new Date(r.nextRunAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <span className="shrink-0 text-[16px] font-semibold tabular-nums text-neutral-900">
                {formatMoney(r.amount)}
              </span>
            </button>
          ))}
          <AddRow label="Add Monthly Expense" onClick={() => setRuleModal({ mode: 'add' })} />
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

      {/* Category add/edit dialog */}
      {catModal !== null && (
        <CategoryModal
          key={catModal.mode === 'edit' ? catModal.category.id : 'new'}
          initial={catModal}
          onClose={() => setCatModal(null)}
        />
      )}

      {/* Account add/edit dialog */}
      {accountModal !== null && (
        <AccountModal
          key={accountModal.mode === 'edit' ? accountModal.account.id : 'new'}
          initial={accountModal}
          onClose={() => setAccountModal(null)}
        />
      )}

      {/* Scheduled transaction add/edit dialog */}
      {ruleModal !== null && (
        <RuleModal
          key={ruleModal.mode === 'edit' ? ruleModal.rule.id : 'new'}
          initial={ruleModal}
          onClose={() => setRuleModal(null)}
        />
      )}
    </div>
  )
}
