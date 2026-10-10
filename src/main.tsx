import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { seedIfEmpty } from './seed'

// Seed demo data on first launch (no-op once the DB has accounts).
// Fire-and-forget: useLiveQuery picks the data up reactively when it lands.
seedIfEmpty().catch((e) => console.error('[PocketLedger] seed failed', e))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
