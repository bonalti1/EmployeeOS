import { useEffect, useRef, useState } from 'react'

/**
 * Persisted state hook. Everything in the dashboard is stored locally in the
 * browser (localStorage) so the app works with zero setup and no backend.
 * When we add connected services (Plaid, Google Calendar, Claude AI), those
 * features will sync through a small API layer — but the local store stays the
 * source of truth for the offline-first experience.
 */
export const PREFIX = 'jess:'

/**
 * The cloud sync layer (lib/cloud.ts) registers a listener here so it can push
 * changes up to Supabase whenever a value is saved. Left null when no cloud is
 * configured — the store then behaves as pure local-only storage.
 */
let onLocalWrite: ((key: string, value: unknown) => void) | null = null
export function setLocalWriteListener(fn: ((key: string, value: unknown) => void) | null) {
  onLocalWrite = fn
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function useStore<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial))
  const firstWrite = useRef(true)

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* storage full or unavailable — ignore */
    }
    // Skip the initial mount write (it's just the hydrated value); push real edits.
    if (firstWrite.current) { firstWrite.current = false; return }
    onLocalWrite?.(key, value)
  }, [key, value])

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFIX + key && e.newValue) {
        try {
          setValue(JSON.parse(e.newValue))
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  return [value, setValue] as const
}

/** Stable unique id without external dependencies. */
let counter = 0
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}
