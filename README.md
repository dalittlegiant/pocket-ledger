# PocketLedger 🪙

A completely free, zero-cost, **offline-first** personal finance PWA.

- **No backend, no cloud, no accounts** — all data lives in IndexedDB on your device (via Dexie.js).
- **Stack:** Vite + React + TypeScript + Tailwind CSS + Dexie.js + Zustand + vite-plugin-pwa.

## Run it locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (free)

No config edits needed — `vite.config.ts` automatically uses `/pocket-ledger/`
as the base path for production builds (and `/` for local/sandbox previews).

1. Create a GitHub repo named **pocket-ledger** and push this project (the
   `.github/workflows/deploy.yml` file is already included).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Wait for the workflow to finish → your app is live at
   `https://<your-username>.github.io/pocket-ledger/`.

## Install on iPhone

Open the deployed URL in Safari → **Share → Add to Home Screen**.
It launches fullscreen (no Safari UI) and works fully offline after the first load.
