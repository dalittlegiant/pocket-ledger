# PocketLedger — Developer Handover Guide

> **Read this first.** This document is written for any AI assistant (or human developer)
> picking up PocketLedger for the first time. It describes the architecture, the data
> model, the non-obvious mechanisms, and the hard-won lessons from building it — so you
> can extend the app without breaking its core invariants.

**One-line summary:** A completely free, zero-cost, **100% offline-first** personal
finance PWA. No backend, no cloud database, no accounts — all user data lives in
IndexedDB on the device.

**Owner workflow (important):** The owner (Kong) cannot run a local dev environment.
The working delivery loop is: **CodeSandbox → download ZIP → drag-drop into the GitHub
repo → GitHub Pages (via GitHub Actions)**. Any change you make should be shippable
through that pipeline. See §6 for details.

---

## 1. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Build | **Vite 5** + TypeScript | Fast builds, automatic base-path handling |
| UI | **React 18** + **Tailwind CSS** | iOS-native styling, safe-area support |
| Database | **Dexie.js** (IndexedDB) | The entire backend. Offline-first, reactive queries |
| UI state | **Zustand** | UI-only state (modals, prefills). **Never** financial data — that lives in Dexie |
| PWA | **vite-plugin-pwa** (`generateSW`) | iOS standalone mode, offline precaching |
| Reactive DB reads | **dexie-react-hooks** (`useLiveQuery`) | Components re-render automatically when Dexie data changes |

**Global invariants (do not violate):**
- **Money is stored as integer minor units** (e.g. `5050` = HK$50.50). Never store floats.
  Use `toMinorUnits()` / `formatMoney()` from `src/lib/format.ts`.
- **Timestamps are epoch milliseconds** (`Date.now()`).
- **Transaction amounts are non-negative minor units** — zero is valid (e.g. a free
  bus ride); the sign is derived from `kind` (`expense` / `income` / `transfer`).

---

## 2. Project Structure

```
pocket-ledger/
├── index.html                  # PWA meta tags, iOS standalone + theme-color
├── vite.config.ts              # Base path: "/" in dev, "/pocket-ledger/" in production builds
├── tailwind.config.js          # iOS palette extensions (ios-blue, etc.)
├── public/
│   ├── favicon.svg
│   ├── apple-touch-icon.png    # Generated PNGs (180×180)
│   ├── pwa-192x192.png         # Generated PNGs
│   └── pwa-512x512.png         # Generated PNGs
├── src/
│   ├── main.tsx                # Entry: awaits seedIfEmpty() BEFORE first render
│   ├── App.tsx                 # Bottom-tab shell; owns useAutoSync() + useSMSReceiver()
│   ├── index.css               # Tailwind + iOS safe-area utilities
│   ├── db.ts                   # Dexie schema + TypeScript interfaces (the "backend")
│   ├── store.ts                # Zustand: UI-only state (sheet open, SMS prefill)
│   ├── seed.ts                 # First-launch defaults, demo data, wipeAllData()
│   ├── lib/
│   │   ├── format.ts           # toMinorUnits(), formatMoney() — the ONLY money helpers
│   │   ├── scheduler.ts        # advanceDate() + runAutoSync() (scheduled rules engine)
│   │   ├── sms.ts              # parseSMS() — iOS Shortcuts SMS regex parser
│   │   └── backup.ts           # exportBackup() / importBackup() (JSON backup)
│   └── components/
│       ├── AddTransactionSheet.tsx  # iOS slide-up sheet; consumes SMS prefill
│       ├── RecordsTab.tsx          # Transaction list, grouped by date (useLiveQuery)
│       ├── ChartsTab.tsx           # This/Last month: totals + by-category breakdown
│       └── SettingsTab.tsx         # Accounts, Categories, Scheduled Transactions, Data
└── .github/workflows/deploy.yml    # GitHub Pages deploy (see §6 — added manually)
```

### File responsibilities

- **`src/db.ts`** — The schema of record. Four tables, version 1. If you ever change
  indexes or fields, you **must** bump the Dexie version and write a migration; never
  silently edit `version(1).stores()`.
- **`src/store.ts`** — Zustand holds *only* ephemeral UI state: `isAddTxnModalOpen`,
  `txnPrefill`. If you're tempted to put financial data here, stop — use `useLiveQuery`.
- **`src/main.tsx`** — Deliberately awaits `seedIfEmpty()` before rendering, so the
  boot-time auto-sync (in `App.tsx`) sees freshly seeded scheduled rules on first launch.
  Do not "optimize" this into a fire-and-forget without understanding the race it prevents.
- **`src/components/AddTransactionSheet.tsx`** — bottom sheet for add/edit. Edit mode is
  driven by `editingTxnId` in the Zustand store (`openEditTxn(id)`); on open the sheet
  loads the record via `db.transactions.get()` and pre-fills kind/amount/account/
  category/note/date, then saves with `db.transactions.put()` (not `add`). A two-tap
  red delete button appears only in edit mode. A date field (`<input type="date">`,
  noon-local-time conversion) sets `occurredAt`. The open-time setup effect runs once
  per open with precedence: edit record > SMS prefill > fresh defaults.
- **`src/components/SettingsTab.tsx`** — category add/edit lives in an iOS-style
  `CategoryModal` (segmented Income/Expense control + name input), never
  `window.prompt`. Deleting a category is blocked when transactions or scheduled
  rules reference it (transactions use the indexed `categoryId`; scheduled_rules
  has no `categoryId` index so it's filtered in JS — see the orderBy lesson below).
- **`src/seed.ts`** — `seedIfEmpty()` runs on every boot but is a no-op unless tables are
  empty. Seeds: 2 accounts (Cash, Credit Card), 3 categories (Food, Transport, Salary),
  3 demo transactions, and **one scheduled rule (Netflix, HK$78/mo) that is already due** —
  this is intentional: it demonstrates the auto-sync on first launch.

---

## 3. Database Schema

Dexie database name: **`pocket-ledger`**, version **1**.

### Tables and indexes

```
accounts:        '++id, name, type, isArchived'
categories:      '++id, kind, sortOrder, isArchived'
transactions:    '++id, accountId, categoryId, kind, occurredAt, createdAt'
scheduled_rules: '++id, accountId, kind, nextRunAt, isActive'
```

(`++id` = auto-increment primary key; the rest are queryable indexes.)

### `accounts`

| Field | Type | Notes |
|---|---|---|
| `id` | number? | Auto-increment |
| `name` | string | e.g. "Cash", "Credit Card" |
| `type` | `'cash' \| 'bank' \| 'credit' \| 'ewallet' \| 'other'` | |
| `currency` | string | ISO 4217, e.g. `'HKD'` |
| `balance` | number | Minor units. (Seeded as 0; not auto-maintained yet — see §7) |
| `icon` / `color` | string? | Optional UI hints |
| `isArchived` | boolean | Soft-delete flag; UI filters these out |
| `createdAt` / `updatedAt` | number | Epoch ms |

### `categories`

| Field | Type | Notes |
|---|---|---|
| `id` | number? | Auto-increment |
| `name` | string | e.g. "Food" |
| `kind` | `'expense' \| 'income'` | Transfers have no category — see below |
| `icon` / `color` | string? | e.g. `'#ff9f0a'` |
| `sortOrder` | number | Display order in Settings |
| `isArchived` | boolean | |

### `transactions`

| Field | Type | Notes |
|---|---|---|
| `id` | number? | Auto-increment |
| `accountId` | number | → `accounts.id` (source account) |
| `categoryId` | number? | → `categories.id`. **Undefined for transfers** |
| `kind` | `'expense' \| 'income' \| 'transfer'` | |
| `amount` | number | **Minor units, always positive** |
| `note` | string? | Free text; SMS bridge writes the merchant name here |
| `occurredAt` | number | When the money moved (user-facing date; may be backdated by auto-sync) |
| `toAccountId` | number? | → `accounts.id`. **Set only when `kind === 'transfer'`** |
| `createdAt` / `updatedAt` | number | Epoch ms |

**Transfer convention:** a transfer is a *single* row with `kind: 'transfer'`,
`accountId` = source, `toAccountId` = destination, `categoryId` = undefined.
Charts **exclude transfers** from income/expense analytics (they're movement, not flow).

### `scheduled_rules`

| Field | Type | Notes |
|---|---|---|
| `id` | number? | Auto-increment |
| `accountId` | number | → `accounts.id` |
| `categoryId` | number? | → `categories.id` (optional) |
| `kind` | `'expense' \| 'income' \| 'transfer'` | |
| `amount` | number | Minor units |
| `note` | string? | e.g. "Rent", "Netflix" — becomes the transaction's note |
| `frequency` | `'daily' \| 'weekly' \| 'monthly' \| 'yearly'` | |
| `interval` | number | Every N frequency units (currently always `1` from the UI) |
| `nextRunAt` | number | **The engine's cursor.** Indexed; auto-sync queries `nextRunAt <= now` |
| `lastRunAt` | number? | Set each time the rule fires |
| `isActive` | boolean | Inactive rules are skipped by the engine |
| `createdAt` | number | |

### Relationships (all enforced by convention, not FK constraints)

```
accounts 1───∞ transactions   (via transactions.accountId)
accounts 1───∞ transactions   (via transactions.toAccountId, transfers only)
accounts 1───∞ scheduled_rules (via scheduled_rules.accountId)
categories 1───∞ transactions (via transactions.categoryId, optional)
```

IndexedDB has no foreign keys — **deleting an account does not cascade**. If you add
delete functionality, decide the policy explicitly (block / nullify / cascade).

---

## 4. Core Mechanisms

### 4.1 `useAutoSync` — Scheduled Rules engine

**Files:** `src/App.tsx` (hook), `src/lib/scheduler.ts` (engine).

**Boot flow:**
1. `main.tsx` awaits `seedIfEmpty()`, then renders.
2. `App.tsx` calls `useAutoSync()`, which fires once per page load.
3. `runAutoSync()` queries `scheduled_rules` where `nextRunAt <= Date.now()` and
   `isActive`, then for each due rule:
   - Inserts **one transaction per missed occurrence**, with `occurredAt` **backdated**
     to each scheduled date (so history stays truthful).
   - Advances `nextRunAt` by `interval × frequency` per occurrence via `advanceDate()`.
   - Sets `lastRunAt = now`.

**Safety caps (the parts future you must not remove):**
- `MAX_CATCH_UP_RUNS = 24` — if the user hasn't opened the app for months, at most 24
  catch-up transactions are created per rule per boot. Anything older is **skipped** and
  `nextRunAt` is fast-forwarded silently (the second `while` loop). This bounds both the
  write volume and the loop itself — the `while (next <= now)` loop always terminates
  because `advanceDate` strictly increases the timestamp.
- **Idempotency:** after a run, every rule's `nextRunAt` is in the future, so an
  immediate re-run finds nothing due.
- **StrictMode guard:** `App.tsx` keeps a module-level `autoSyncDone` flag. React 18
  StrictMode double-invokes effects in dev; without the flag, two concurrent
  `runAutoSync()` calls could both read the same due rule and double-insert. The flag
  makes the second invocation a no-op. (Production builds don't double-invoke, but the
  guard is harmless there.)

**`advanceDate()` edge cases** (deliberately handled — there are unit-level checks in
the project history):
- Monthly: clamps to end-of-month — Jan 31 + 1 month → **Feb 28**, not Mar 3
  (naive `setMonth()` overflows). The clamped day persists for subsequent runs.
- Yearly: Feb 29 + 1 year → **Feb 28** on non-leap years.

**Settings UI:** `SettingsTab.tsx` → "Scheduled Transactions" group lists rules live
(`useLiveQuery`) and offers "+ Add Monthly Expense" (name + amount via `prompt()`;
kind fixed to `expense`, frequency fixed to `monthly`, first account used,
`nextRunAt` = one month from now).

### 4.2 iOS Shortcuts SMS bridge (`?sms_text=`)

**Files:** `src/App.tsx` (`useSMSReceiver`), `src/lib/sms.ts` (`parseSMS`),
`src/store.ts` (`txnPrefill`), `src/components/AddTransactionSheet.tsx` (consumes prefill).

**Flow:**
1. iOS Shortcut opens the app URL with a query param, e.g.
   `https://<user>.github.io/pocket-ledger/?sms_text=You%20paid%20HKD%2068.00%20to%20Starbucks`
2. `useSMSReceiver()` runs on mount: reads `sms_text` via `URLSearchParams` (which
   URL-decodes it).
3. **It clears the parameter immediately** with `history.replaceState` *before* parsing —
   so a page refresh can never re-trigger the sheet.
4. `parseSMS(text)` tries the rules below in order; on a match it returns
   `{ amount /* minor units */, merchant, source }`.
5. The hook writes `{ amount: "68.00", note: "Starbucks" }` into the Zustand
   `txnPrefill` and opens the sheet.
6. `AddTransactionSheet` applies the prefill on open and **consumes it immediately**
   (`setTxnPrefill(null)`) — one-shot, never re-applied.

**Exact regex rules** (`src/lib/sms.ts`, tried in order; a hard fail-list
`/未能完成|交易失敗|付款失敗|交易取消/` returns `null` first so failed payments are
never logged):

| # | Source | Kind | Pattern | Example |
|---|---|---|---|---|
| 1 | `hsbc-refund` | income | `` /一項([A-Z]{3})([\d,]+(?:\.\d{1,2})?)從\(([^)]+)\)的退款/ `` | `…一項USD1.00從(METAPAY YGXHK96WE4)的退款…` → 100 minor units, note `METAPAY YGXHK96WE4 (USD)` |
| 2 | `hsbc-expense` | expense | `` /有([A-Z]{3})([\d,]+(?:\.\d{1,2})?)交易\(([^)]+)\)/ `` | `…有JPY23,080交易(WEST JAPAN RAILWAY C)…` → 2308000 minor units, note `WEST JAPAN RAILWAY C (JPY)` |
| 3 | `alipay-auto` | expense | `` /通過(.+?)授權自動付款支付HKD([\d,]+(?:\.\d{1,2})?)/ `` | `…通過Google授權自動付款支付HKD40.00` → 4000, note `Google` |
| 4 | `payme` | expense | `` /paid HKD ([\d.,]+) to (.+)/i `` | `You paid HKD 68.00 to Starbucks` → 6800, note `Starbucks` |
| 5 | `credit-card` | expense | `` /for HKD ([\d.,]+) at (.+)/i `` | `…for HKD 120.50 at MTR Corporation` → 12050, note `MTR Corporation` |

Parser details: amounts go through `toMinorUnits()` (commas stripped, malformed
rejected); merchant trimmed with trailing `.`/`。` stripped; the extracted `kind`
flows through the Zustand `txnPrefill` and **switches the sheet's Expense/Income
segmented control** (`AddTransactionSheet` applies `setKind(prefill.kind)`).
Returns `null` on no match (the app then does nothing — no sheet, no error). To add
a new bank, append to `RULES` and keep the `parseSMS` return contract.

**Apple Wallet bridge** (`useWalletURLReceiver` in `App.tsx`): a separate hook that
runs alongside the SMS receiver. An iOS Shortcut fired by an Apple Pay / Octopus tap
opens the app with clean variables — `?amount=120.50&merchant=Starbucks&account=Octopus`
(all optional except `amount`; URL-encoded values are decoded by URLSearchParams).
The `account` value is resolved by `resolveWalletAccount()`: case-insensitive partial
match against `db.accounts` in either direction, and when nothing matches a new
account is auto-created (type `'other'`) so new Wallet cards work with zero setup —
never a random fallback. The resolved `accountId` travels in the Zustand `txnPrefill`
and pre-selects the account pill in the sheet. Params are cleared with
`history.replaceState` immediately, exactly like the SMS flow. The `?sms_text=` logic
is untouched; both hooks coexist.

**Setting up the iPhone Shortcut** (for the owner / end users):
1. Shortcuts app → **+** → add action **"URL-Encode"**, input = **Shortcut Input**.
2. Add action **"Open URLs"**: `https://<username>.github.io/pocket-ledger/?sms_text=`
   followed by the encoded-text variable.
3. Name it (e.g. "Log to PocketLedger"), enable **Show in Share Sheet**.
4. In Messages: long-press a bank SMS → **Share** → run the shortcut → the app opens
   with the sheet pre-filled; the user just taps Save. (There is no reliable
   fully-automatic "on SMS received" trigger on iOS — the Share-sheet path is the
   supported one.)

### 4.3 JSON Backup / Restore (atomic)

**File:** `src/lib/backup.ts`. UI: `SettingsTab.tsx` → "Data" group.

**Export (`exportBackup()`):**
- Reads all four tables with `Promise.all(...)`, wraps them in
  `{ version: 1, app: 'PocketLedger', exportedAt, accounts, categories, transactions, scheduled_rules }`.
- Creates a `Blob` (`application/json`), an object URL, and a temporary `<a download>`
  click → file named `PocketLedger_Backup_YYYY-MM-DD.json`.
- On iOS Safari this natively opens the **Save to Files / iCloud Drive** dialog.
  Object URL is revoked after 5s.

**Import (`importBackup(file)`):**
1. Reads the file as text; `JSON.parse` in a try/catch → friendly alert on invalid JSON.
2. **Shape validation first** (`isBackupData`): requires `app === 'PocketLedger'` and
   all four tables to be arrays. Rejects anything else *before touching the database*.
3. Destructive `confirm()`: *"Import this backup? This will REPLACE all your current
   data. Are you sure?"* — abort = zero writes.
4. **Atomic replace** inside a single Dexie read-write transaction over all tables:
   clear every table, then `bulkAdd` each table's rows. Explicit `id`s are preserved,
   so account/category relationships survive the round-trip.
5. `window.location.reload()` — the simplest reliable way to refresh every
   `useLiveQuery` subscription at once.

**Why it's safe:** validation happens before any write; the clear+insert is one
transaction (all-or-nothing — a failed `bulkAdd` rolls back the clears); and the
user must pass two gates (file picker + confirm dialog).

---

## 5. Key Conventions for Future Development

- **Money:** always integer minor units in state/DB; convert at the boundary with
  `toMinorUnits()` (input → DB) and `formatMoney()` (DB → display). Never `parseFloat`
  an amount into state.
- **State split:** Dexie = source of truth for all persistent data (read via
  `useLiveQuery`). Zustand = ephemeral UI only (sheet open/close, prefill).
- **Dates:** `occurredAt` is the user-facing date (grouping, charts); `createdAt` is
  the write timestamp. Charts filter on `occurredAt` by calendar month.
- **Charts exclude transfers** (`kind !== 'transfer'` filter). If you add analytics,
  decide per-metric whether transfers count.
- **PWA icons** (`public/*.png`) are generated binaries. They are **not** included in
  text-based CodeSandbox uploads — after re-uploading to CodeSandbox, re-add them or
  the PWA manifest will 404 the icons (see §6).
- **Dexie `orderBy()` / `where()` require an indexed field.** Calling either on a
  non-indexed keyPath throws `SchemaError: KeyPath X on object store Y is not indexed`
  at query time — and inside `useLiveQuery` that error is re-thrown during render,
  unmounting the whole app (white screen). This happened twice: `db.accounts.orderBy(
  'createdAt')` (`createdAt` was never indexed on `accounts`), and later
  `db.transactions.where('toAccountId')` (`toAccountId` was never indexed on
  `transactions` — the account delete's second tap silently died from it).
  Fix options: add the index (requires a Dexie version bump) or sort/filter small
  tables in JS after `toArray()`. When in doubt, grep `version(1).stores()` in `db.ts`
  before using `orderBy`/`where` on a field.
- **Dexie versioning:** current version is 1. Any schema/index change requires a version
  bump + upgrade handler. Test upgrades against a v1 database before shipping.

---

## 6. Run, Build & Deploy

### Local development

```bash
npm install
npm run dev      # → http://localhost:5173/
npm run build    # TypeScript check + production build + PWA service worker
npm run preview  # serve the production build locally
```

`npm run build` must pass cleanly (it runs `tsc` first). The PWA plugin generates
`dist/sw.js` + precache manifest automatically.

### Base path (do not "fix" this)

`vite.config.ts` sets `base: '/'` in dev and `base: '/pocket-ledger/'` in production
builds. This is what makes the **same codebase** work on CodeSandbox previews (`/`)
and GitHub Pages (`/pocket-ledger/`). If you hardcode absolute asset paths, you will
break one of the two.

### Deploy to GitHub Pages (owner's flow)

1. Push the code to the `dalittlegiant/pocket-ledger` repo (`main` branch).
2. The repo needs `.github/workflows/deploy.yml` — **it is not pushed by the
   automation** because the deploy token lacks the `workflow` scope. The owner adds
   this file once via the GitHub web UI (copy from the local project); afterwards it
   persists in the repo.
3. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to `main` → workflow builds → live at
   `https://<username>.github.io/pocket-ledger/`.

### CodeSandbox loop (owner's primary workflow)

The CodeSandbox define-API creates a **new** sandbox per upload (it cannot update a
URL in place). After generating a new sandbox link, the owner downloads the ZIP and
drags it into GitHub. Notes for whoever generates the sandbox:
- Include **all** source files (see the file list in §2) — the upload is text-based.
- **PNG icons are excluded** from the text upload; the sandbox preview will lack them
  until they're re-added. This is cosmetic in preview, but the downloaded ZIP → GitHub
  flow restores them (they're committed in the repo).
- The preview URL is `https://codesandbox.io/s/<id>` — the *preview* pane URL (not the
  editor URL) is what you append `?sms_text=…` to when testing the SMS bridge.

---

## 7. Known Limitations / Suggested Next Steps

- **Account balances are not auto-maintained** — `accounts.balance` exists in the schema
  but nothing updates it yet. Either compute balances from transactions on read, or
  maintain them on write (and backfill).
- **No transaction editing/deletion UI** yet — Dexie supports it; it's purely a UI gap.
- **Scheduled rules:** only monthly expenses creatable from the UI; the engine already
  supports daily/weekly/yearly + arbitrary intervals. No rule editing/deletion UI yet.
- **SMS rules** cover PayMe + generic credit-card phrasing; new banks need new regexes
  in `src/lib/sms.ts` (append to `RULES`, keep the `parseSMS` return contract).
- **No multi-currency handling** — `currency: 'HKD'` is stored per account but the UI
  formats everything as HK$.

---

*Last updated: 2026-10-10. PocketLedger v5 — foundation, records, charts, settings,
auto-sync, SMS bridge, backup/restore.*
