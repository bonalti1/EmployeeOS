import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import { ThemeProvider } from './lib/theme.tsx'
import { ToastProvider } from './lib/toast.tsx'
import { ConfirmDeleteProvider } from './lib/confirmDelete.tsx'
import { runMigrations } from './lib/migrations.ts'
import './index.css'

// Bring any stale saved defaults (old purple theme, single-word name) forward
// before the app reads them. Runs once per browser.
runMigrations()

// Capture the PWA install prompt so Settings can offer an "Install app" button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as unknown as { __bip?: Event }).__bip = e
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmDeleteProvider>
          <AuthGate>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthGate>
        </ConfirmDeleteProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
