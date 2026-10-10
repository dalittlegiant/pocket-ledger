import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { seedIfEmpty } from './seed'

// Seed first, then render — so the boot-time auto-sync in App sees the
// freshly seeded scheduled rules on a first launch.
seedIfEmpty()
  .catch((e) => console.error('[PocketLedger] seed failed', e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
