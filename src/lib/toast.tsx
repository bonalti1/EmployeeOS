import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void }

type ToastCtx = {
  toast: (message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void
  /** Remove an item with an Undo affordance; restore() runs if the user taps Undo. */
  removeWithUndo: (message: string, remove: () => void, restore: () => void) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback<ToastCtx['toast']>((message, opts) => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }])
    const duration = opts?.duration ?? (opts?.actionLabel ? 5000 : 2600)
    window.setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  const removeWithUndo = useCallback<ToastCtx['removeWithUndo']>((message, remove, restore) => {
    remove()
    toast(message, { actionLabel: 'Undo', onAction: restore })
  }, [toast])

  return (
    <Ctx.Provider value={{ toast, removeWithUndo }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="fade-up pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--color-text)', color: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', maxWidth: '90vw' }}>
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                onClick={() => { t.onAction?.(); dismiss(t.id) }}
                className="font-bold uppercase text-xs tracking-wide"
                style={{ color: 'var(--color-accent)' }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
