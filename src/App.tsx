import { Component, useEffect, useState, type ReactNode } from 'react'
import RecordsTab from './components/RecordsTab'
import ChartsTab from './components/ChartsTab'
import SettingsTab from './components/SettingsTab'
import AddTransactionSheet from './components/AddTransactionSheet'
import { useUIStore } from './store'
import { db } from './db'
import { runAutoSync } from './lib/scheduler'
import { parseSMS } from './lib/sms'
import { toMinorUnits } from './lib/format'

// Module flag: the sync must run exactly once per page load, even under
// React StrictMode's double-effect invocation in dev.
let autoSyncDone = false

/** Runs once on boot: materializes due scheduled rules into transactions. */
function useAutoSync() {
  useEffect(() => {
    if (autoSyncDone) return
    autoSyncDone = true
    runAutoSync()
      .then((n) => {
        if (n > 0) console.log(`[PocketLedger] auto-synced ${n} scheduled transaction(s)`)
      })
      .catch((e) => console.error('[PocketLedger] auto-sync failed', e))
  }, [])
}

/**
 * iOS Shortcuts bridge: when the app is opened with ?sms_text=…,
 * parse the SMS, prefill the add sheet, and clear the param so a
 * refresh never re-triggers it.
 */
function useSMSReceiver() {
  const openAddTxn = useUIStore((s) => s.openAddTxn)
  const setTxnPrefill = useUIStore((s) => s.setTxnPrefill)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('sms_text')
    if (!raw) return

    // Clear immediately — before parsing — so refresh is always safe.
    params.delete('sms_text')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))

    const parsed = parseSMS(raw)
    if (!parsed) return
    setTxnPrefill({
      amount: (parsed.amount / 100).toFixed(2),
      note: parsed.merchant,
      kind: parsed.kind,
    })
    openAddTxn()
  }, [openAddTxn, setTxnPrefill])
}

/**
 * Apple Wallet automation bridge: an iOS Shortcut triggered by an Apple Pay /
 * Octopus tap opens the app with clean variables, e.g.
 *   ?amount=120.50&merchant=Starbucks&account=Octopus
 * Pre-fills the sheet as an expense (amount + merchant note + resolved account)
 * and clears the params immediately so a refresh never re-triggers it.
 * The ?sms_text= flow above is untouched.
 */
function useWalletURLReceiver() {
  const openAddTxn = useUIStore((s) => s.openAddTxn)
  const setTxnPrefill = useUIStore((s) => s.setTxnPrefill)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const amountRaw = params.get('amount')
    if (!amountRaw) return
    // URLSearchParams.get() already URL-decodes ("Red%20Card" → "Red Card").
    const merchantRaw = params.get('merchant')
    const accountRaw = params.get('account')

    // Clear immediately — before parsing — so refresh is always safe.
    params.delete('amount')
    params.delete('merchant')
    params.delete('account')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))

    const minor = toMinorUnits(amountRaw)
    if (minor === null) return

    // Resolve the account first (async), then open the sheet — the prefill
    // must be fully populated before the sheet's setup effect reads it.
    void (async () => {
      const accountId = await resolveWalletAccount(accountRaw)
      const note = (merchantRaw ?? '').trim()
      // Octopus top-up (credit card → Octopus) is a transfer, not an expense —
      // routing it as an expense would inflate spending totals.
      if (note.toLowerCase().includes('octopus')) {
        const octopusId = await resolveWalletAccount('Octopus')
        setTxnPrefill({
          amount: (minor / 100).toFixed(2),
          note,
          kind: 'transfer',
          accountId,
          toAccountId: octopusId,
        })
      } else {
        setTxnPrefill({
          amount: (minor / 100).toFixed(2),
          note,
          kind: 'expense',
          accountId,
        })
      }
      openAddTxn()
    })()
  }, [openAddTxn, setTxnPrefill])
}

/**
 * Matches a Wallet-provided account name against db.accounts (case-insensitive,
 * partial in either direction). When nothing matches, creates the account on
 * the fly (type 'other') so new Wallet cards work with zero setup.
 * Returns undefined when no account name was provided.
 */
async function resolveWalletAccount(raw: string | null): Promise<number | undefined> {
  const needle = (raw ?? '').trim()
  if (!needle) return undefined
  const lowered = needle.toLowerCase()

  const accounts = await db.accounts.toArray()
  const match = accounts.find((a) => {
    const name = a.name.trim().toLowerCase()
    return name.includes(lowered) || lowered.includes(name)
  })
  if (match?.id !== undefined) return match.id

  const now = Date.now()
  const id = await db.accounts.add({
    name: needle,
    type: 'other',
    currency: 'HKD',
    balance: 0,
    color: '#8e8e93',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  })
  return id as number
}

type TabId = 'records' | 'charts' | 'settings'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: 'records',
    label: 'Records',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
        <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
      </svg>
    ),
  },
  {
    id: 'charts',
    label: 'Charts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        />
      </svg>
    ),
  },
]

const TITLES: Record<TabId, string> = {
  records: 'Records',
  charts: 'Charts',
  settings: 'Settings',
}

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'records':
      return <RecordsTab />
    case 'charts':
      return <ChartsTab />
    case 'settings':
      return <SettingsTab />
  }
}

/**
 * Catches render errors inside a tab and shows a fallback instead of
 * unmounting the whole app (the "white screen of death"). The key on the
 * parent resets the boundary when switching tabs.
 */
class TabErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[PocketLedger] tab render crashed', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <p className="text-[16px] font-semibold text-neutral-900">Something went wrong</p>
          <p className="mt-1 text-[13px] text-neutral-500">
            Try switching tabs or restarting the app.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('records')
  const openAddTxn = useUIStore((s) => s.openAddTxn)

  useAutoSync()
  useSMSReceiver()
  useWalletURLReceiver()

  return (
    <div className="flex h-dvh justify-center bg-neutral-200 font-system text-neutral-900 antialiased">
      {/* Phone-width shell — full-bleed on real devices */}
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-[#f2f2f7] sm:shadow-2xl">
        {/* iOS-style navigation header */}
        <header className="shrink-0 bg-[#f2f2f7]/80 pt-safe backdrop-blur-xl">
          <div className="flex items-end justify-between px-5 pb-1 pt-3">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{TITLES[activeTab]}</h1>
            <button
              type="button"
              onClick={openAddTxn}
              aria-label="Add transaction"
              className="pb-1 text-[30px] font-light leading-none text-ios-blue active:opacity-60"
            >
              +
            </button>
          </div>
        </header>

        {/* Tab content */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <TabErrorBoundary key={activeTab}>
            <TabContent tab={activeTab} />
          </TabErrorBoundary>
        </main>

        {/* iOS-style bottom tab bar */}
        <nav className="shrink-0 border-t border-neutral-300/70 bg-white/80 pb-safe backdrop-blur-xl">
          <div className="grid grid-cols-3">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-ios-blue' : 'text-neutral-400 active:text-neutral-500'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      {/* Bottom sheet lives at root so it overlays everything */}
      <AddTransactionSheet />
    </div>
  )
}
