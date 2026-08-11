import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A single global "type delete to confirm" guard. Any destructive action in the
 * app routes through `confirmDelete({ label, onConfirm })`; the user must type
 * the word "delete" before the button unlocks, and the modal always names
 * exactly what is being removed so nothing gets wiped by accident.
 */
type Req = {
  label: string
  detail?: string
  confirmText?: string
  onConfirm: () => void
}

type Ctx = { confirmDelete: (req: Req) => void }

const DeleteCtx = createContext<Ctx | null>(null)

export function ConfirmDeleteProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Req | null>(null)
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const confirmDelete = useCallback((r: Req) => { setTyped(''); setReq(r) }, [])
  const close = useCallback(() => { setReq(null); setTyped('') }, [])

  const word = (req?.confirmText ?? 'delete').toLowerCase()
  const ready = typed.trim().toLowerCase() === word

  useEffect(() => {
    if (!req) return
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [req, close])

  const run = () => { if (!ready || !req) return; req.onConfirm(); close() }

  return (
    <DeleteCtx.Provider value={{ confirmDelete }}>
      {children}
      {req && (
        <>
          <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={close} />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[92%] max-w-md p-5 rounded-2xl fade-up"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-lg" style={{ background: 'color-mix(in srgb, #c0504d 16%, var(--color-surface))', color: '#c0504d' }}>⚠</div>
              <div className="min-w-0">
                <h3 className="font-bold text-lg leading-tight" style={{ color: 'var(--color-text)' }}>Delete {req.label}?</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                  {req.detail ?? 'This can’t be undone.'}
                </p>
              </div>
            </div>

            <label className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Type <span className="font-bold" style={{ color: 'var(--color-text)' }}>{word}</span> to confirm you want to delete <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{req.label}</span>.
            </label>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') run() }}
              placeholder={`Type "${word}"`}
              className="w-full mt-2 mb-4 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-bg)', border: `1px solid ${ready ? '#c0504d' : 'var(--color-border)'}`, color: 'var(--color-text)' }}
            />

            <div className="flex justify-end gap-2">
              <button onClick={close} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>Cancel</button>
              <button
                onClick={run}
                disabled={!ready}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#c0504d', color: '#fff' }}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </DeleteCtx.Provider>
  )
}

export function useConfirmDelete() {
  const ctx = useContext(DeleteCtx)
  if (!ctx) throw new Error('useConfirmDelete must be used within ConfirmDeleteProvider')
  return ctx.confirmDelete
}
