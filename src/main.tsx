import React, { Component, type ReactNode } from 'react'
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
 * Last-resort error boundary. A crash anywhere in the tree renders a readable
 * error card instead of a silent blank page, with a reload button — and the
 * message tells us exactly what broke without needing devtools.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f7fa' }}>
        <div style={{ maxWidth: 560, background: '#fff', border: '1px solid #e6eaf1', borderRadius: 20, padding: 28, boxShadow: '0 6px 16px -4px rgba(17,18,20,0.08)' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#141a24', margin: 0 }}>Something broke on this screen</h1>
          <p style={{ fontSize: 13, color: '#697488', lineHeight: 1.6, marginTop: 8 }}>
            Screenshot this and send it to get it fixed:
          </p>
          <pre style={{ fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap', background: '#fef2f2', borderRadius: 12, padding: 12, marginTop: 10, maxHeight: 220, overflow: 'auto' }}>
            {String(this.state.error?.message || this.state.error)}
            {'\n\n'}
            {String((this.state.error as Error & { stack?: string })?.stack || '').split('\n').slice(0, 6).join('\n')}
          </pre>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 14, background: '#2f6fed', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}

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
    <ErrorBoundary>
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
    </ErrorBoundary>
  </React.StrictMode>,
)
