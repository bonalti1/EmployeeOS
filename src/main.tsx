import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import AssistantApp from './components/AssistantApp.tsx'
import AuthGate from './components/AuthGate.tsx'
import { ThemeProvider } from './lib/theme.tsx'
import { WorkspaceProvider, useWorkspace } from './lib/workspace.tsx'
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

/**
 * Routes by workspace role after sign-in. An `assistant` member gets the
 * Assistant OS only — none of the private Personal OS routes are ever
 * mounted for them. Everyone else (Rolando, or local-only mode with no
 * Supabase) gets the Personal OS exactly as before.
 */
function RoleRouter() {
  const { role, loading } = useWorkspace()
  if (loading) {
    return (
      <div className="h-full grid place-items-center" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
        <span className="text-sm">Loading…</span>
      </div>
    )
  }
  return role === 'assistant' ? <AssistantApp /> : <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmDeleteProvider>
          <AuthGate>
            <WorkspaceProvider>
              <BrowserRouter>
                <RoleRouter />
              </BrowserRouter>
            </WorkspaceProvider>
          </AuthGate>
        </ConfirmDeleteProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
