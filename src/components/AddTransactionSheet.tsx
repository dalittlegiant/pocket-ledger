import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TxnKind } from '../db'
import { useUIStore } from '../store'
import { toMinorUnits } from '../lib/format'

const KINDS: { id: TxnKind; label: string }[] = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
]

function Pill({
  selected,
  color,
  label,
  onClick,
}: {
  selected: boolean
  color: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
        selected
          ? 'border-ios-blue bg-ios-blue/10 text-neutral-900'
          : 'border-neutral-200 bg-white text-neutral-600'
      }`}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
      {selected && <span className="text-ios-blue">✓</span>}
    </button>
  )
}

/** Epoch ms → "YYYY-MM-DD" for <input type="date"> (local timezone). */
function toDateInputValue(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * "YYYY-MM-DD" → epoch ms. Uses noon local time to dodge DST/midnight
 * boundary issues — only the calendar day matters for grouping.
 */
function fromDateInputValue(v: string): number | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

export default function AddTransactionSheet() {
  const isOpen = useUIStore((s) => s.isAddTxnModalOpen)
  const editingTxnId = useUIStore((s) => s.editingTxnId)
  const close = useUIStore((s) => s.closeAddTxn)
  const setTxnPrefill = useUIStore((s) => s.setTxnPrefill)

  const isEditMode = editingTxnId !== null

  // Mount/unmount with slide animation
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 320)
    return () => clearTimeout(t)
  }, [isOpen])

  // Live data from Dexie
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const activeAccounts = useMemo(() => (accounts ?? []).filter((a) => !a.isArchived), [accounts])

  // Form state
  const [kind, setKind] = useState<TxnKind>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | undefined>(undefined)
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [toAccountId, setToAccountId] = useState<number | undefined>(undefined)
  const [note, setNote] = useState('')
  const [dateStr, setDateStr] = useState(() => toDateInputValue(Date.now()))
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Populate the form exactly once per open. Precedence: edit record >
  // SMS prefill > fresh defaults. Reading via getState() keeps this a
  // single-shot effect — clearing the prefill inside won't re-trigger it.
  useEffect(() => {
    if (!isOpen) return
    setConfirmingDelete(false)
    const { editingTxnId: editId, txnPrefill: prefill } = useUIStore.getState()
    if (editId !== null) {
      let cancelled = false
      db.transactions.get(editId).then((t) => {
        if (cancelled || !t) return
        setKind(t.kind)
        setAmount((t.amount / 100).toFixed(2))
        setAccountId(t.accountId)
        setCategoryId(t.categoryId)
        setToAccountId(t.toAccountId)
        setNote(t.note ?? '')
        setDateStr(toDateInputValue(t.occurredAt))
      })
      return () => {
        cancelled = true
      }
    }
    if (prefill) {
      // One-shot prefill from the iOS Shortcuts SMS bridge.
      setKind(prefill.kind)
      setAmount(prefill.amount)
      setNote(prefill.note)
      setAccountId(undefined)
      setCategoryId(undefined)
      setToAccountId(undefined)
      setDateStr(toDateInputValue(Date.now()))
      useUIStore.getState().setTxnPrefill(null)
      return
    }
    // Fresh add form.
    setKind('expense')
    setAmount('')
    setAccountId(undefined)
    setCategoryId(undefined)
    setToAccountId(undefined)
    setNote('')
    setDateStr(toDateInputValue(Date.now()))
  }, [isOpen])

  const isTransfer = kind === 'transfer'
  const visibleCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => !c.isArchived && c.kind === kind)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, kind],
  )

  // Effective selections: explicit choice, else first available
  const effectiveAccountId = accountId ?? activeAccounts[0]?.id
  const effectiveCategoryId = visibleCategories.some((c) => c.id === categoryId)
    ? categoryId
    : visibleCategories[0]?.id
  const toOptions = useMemo(
    () => activeAccounts.filter((a) => a.id !== effectiveAccountId),
    [activeAccounts, effectiveAccountId],
  )
  const effectiveToAccountId = toOptions.some((a) => a.id === toAccountId)
    ? toAccountId
    : toOptions[0]?.id

  const minor = toMinorUnits(amount)
  const occurredAt = fromDateInputValue(dateStr)
  const canSave =
    !saving &&
    minor !== null &&
    occurredAt !== null &&
    effectiveAccountId !== undefined &&
    (isTransfer ? effectiveToAccountId !== undefined : effectiveCategoryId !== undefined)

  const handleSave = async () => {
    if (!canSave || minor === null || occurredAt === null || effectiveAccountId === undefined)
      return
    setSaving(true)
    try {
      const now = Date.now()
      const fields = {
        accountId: effectiveAccountId,
        categoryId: isTransfer ? undefined : effectiveCategoryId,
        kind,
        amount: minor,
        note: note.trim() || undefined,
        occurredAt,
        toAccountId: isTransfer ? effectiveToAccountId : undefined,
        updatedAt: now,
      }
      if (isEditMode && editingTxnId !== null) {
        const existing = await db.transactions.get(editingTxnId)
        if (existing) {
          await db.transactions.put({ ...existing, ...fields })
        }
      } else {
        await db.transactions.add({ ...fields, createdAt: now })
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEditMode || editingTxnId === null) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    await db.transactions.delete(editingTxnId)
    close()
  }

  if (!mounted) return null
  const loading = accounts === undefined || categories === undefined

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden bg-[#f2f2f7] shadow-2xl transition-transform duration-300 ease-out rounded-t-[20px] sm:rounded-[20px] ${
          shown ? 'translate-y-0' : 'translate-y-full sm:translate-y-8 sm:opacity-0'
        }`}
      >
        {/* Grabber */}
        <div className="flex shrink-0 justify-center pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-neutral-300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-2">
          <button type="button" onClick={close} className="text-[17px] text-ios-blue active:opacity-60">
            Cancel
          </button>
          <h2 className="text-[17px] font-semibold">
            {isEditMode ? 'Edit Transaction' : 'New Transaction'}
          </h2>
          <span className="w-[52px]" />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">
          {/* Segmented control */}
          <div className="flex rounded-xl bg-neutral-300/60 p-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all ${
                  kind === k.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 active:text-neutral-900'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="mt-5 flex items-baseline justify-center gap-1">
            <span className="text-2xl font-semibold text-neutral-400">HK$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-48 bg-transparent text-center text-5xl font-bold tracking-tight text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
            />
          </div>

          {loading ? (
            <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : (
            <>
              {/* Category (not for transfers) */}
              {!isTransfer && (
                <div className="mt-6">
                  <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
                    Category
                  </p>
                  {visibleCategories.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      No categories yet — add one in Settings.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {visibleCategories.map((c) => (
                        <Pill
                          key={c.id}
                          label={c.name}
                          color={c.color ?? '#8e8e93'}
                          selected={effectiveCategoryId === c.id}
                          onClick={() => setCategoryId(c.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Account(s) */}
              <div className="mt-6">
                <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
                  {isTransfer ? 'From' : 'Account'}
                </p>
                {activeAccounts.length === 0 ? (
                  <p className="text-sm text-neutral-400">No accounts yet — add one in Settings.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeAccounts.map((a) => (
                      <Pill
                        key={a.id}
                        label={a.name}
                        color={a.color ?? '#8e8e93'}
                        selected={effectiveAccountId === a.id}
                        onClick={() => setAccountId(a.id)}
                      />
                    ))}
                  </div>
                )}
                {isTransfer && toOptions.length > 0 && (
                  <>
                    <p className="mb-2 mt-4 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
                      To
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {toOptions.map((a) => (
                        <Pill
                          key={a.id}
                          label={a.name}
                          color={a.color ?? '#8e8e93'}
                          selected={effectiveToAccountId === a.id}
                          onClick={() => setToAccountId(a.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Date */}
              <div className="mt-6">
                <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
                  Date
                </p>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full rounded-xl bg-white px-4 py-3 text-[16px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
                />
              </div>
            </>
          )}

          {/* Note */}
          <div className="mt-6">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={120}
              className="w-full rounded-xl bg-white px-4 py-3 text-[16px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
            />
          </div>

          {/* Delete (edit mode only) */}
          {isEditMode && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleDelete}
                className={`w-full rounded-2xl py-3 text-[17px] font-semibold transition-all active:scale-[0.98] ${
                  confirmingDelete
                    ? 'bg-[#ff3b30] text-white'
                    : 'bg-[#ff3b30]/10 text-[#ff3b30]'
                }`}
              >
                {confirmingDelete ? 'Tap again to confirm delete' : 'Delete Transaction'}
              </button>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="shrink-0 bg-[#f2f2f7] px-5 pb-safe pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full rounded-2xl py-3.5 text-[17px] font-semibold text-white transition-all active:scale-[0.98] ${
              canSave ? 'bg-ios-blue' : 'bg-neutral-300'
            }`}
          >
            {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Save'}
          </button>
          <div className="h-2" />
        </div>
      </div>
    </div>
  )
}
