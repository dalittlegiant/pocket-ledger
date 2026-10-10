import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves project sites from a subpath (/<repo>/), while the
// CodeSandbox preview serves from root. Use the subpath only for production
// builds so the sandbox preview keeps working with zero manual edits.
// The PWA manifest's id/start_url/scope MUST match the base path, otherwise
// launching from the iOS Home Screen 404s on the deployed subpath.
const isProd = process.env.NODE_ENV === 'production'
const base = isProd ? '/pocket-ledger/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'PocketLedger',
        short_name: 'PocketLedger',
        description: 'Offline-first personal finance tracker. Your data never leaves your device.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f7',
        theme_color: '#0a84ff',
        categories: ['finance', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          // iOS ignores manifest icons for home-screen installs — this one matters:
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: { enabled: false },
    }),
  ],
})
