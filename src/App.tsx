import { useState, type ReactNode } from 'react'
import RecordsTab from './components/RecordsTab'
import ChartsTab from './components/ChartsTab'
import AddTransactionSheet from './components/AddTransactionSheet'
import { useUIStore } from './store'

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

function Placeholder({ tab }: { tab: TabId }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="text-neutral-300">{TABS.find((t) => t.id === tab)?.icon}</div>
      <p className="text-lg font-semibold text-neutral-800">{TITLES[tab]}</p>
      <p className="text-sm text-neutral-500">Coming in the next phase.</p>
    </div>
  )
}

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'records':
      return <RecordsTab />
    case 'charts':
      return <ChartsTab />
    case 'settings':
      return <Placeholder tab={tab} />
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('records')
  const openAddTxn = useUIStore((s) => s.openAddTxn)

  return (
    <div className="flex h-dvh justify-center bg-neutral-200 font-system text-neutral-900 antialiased">
      {/* Phone-width shell — full-bleed on real devices */}
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-[#f2f2f7] sm:shadow-2xl">
        {/* iOS-style navigation header */}
        <header className="shrink-0 bg-[#f2f2f7]/80 pt-safe backdrop-blur-xl">
          <div className="flex items-end justify-between px-5 pb-2 pt-3">
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
          <TabContent tab={activeTab} />
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
