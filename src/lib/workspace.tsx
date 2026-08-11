import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, cloudConfigured } from './supabase'

/**
 * Assistant Workspace data layer.
 *
 * Unlike the private Personal OS (localStorage + the per-user `app_state`
 * table), everything here lives in dedicated shared Supabase tables (ws_*)
 * protected by Row Level Security: only rows visible to workspace members
 * (owner + assistant). None of the owner's private data ever flows through
 * this module.
 */

export type Role = 'owner' | 'assistant'

/**
 * The employee's display name — branding for their whole OS ("Carlos
 * Operating System", sidebar labels, etc.). Deliberately a name, not a job
 * title: if his role evolves, the OS doesn't need re-labeling — and if the
 * seat ever changes hands, updating this one constant re-brands everything.
 */
export const ASSISTANT_NAME = 'Carlos'

export type WsTask = {
  id: string
  title: string
  notes: string
  status: 'inbox' | 'today' | 'upcoming' | 'waiting' | 'done'
  category: 'Personal' | 'STB' | 'ALTO' | 'Content'
  priority: 'Low' | 'Medium' | 'High'
  due: string | null
  assigned_by: Role
  waiting_on: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type WsStage = 'ideas' | 'footage' | 'ready' | 'editing' | 'review' | 'approved' | 'scheduled' | 'published'

export type WsContent = {
  id: string
  brand: 'STB' | 'ALTO'
  platform: string
  title: string
  idea: string
  hook: string
  script: string
  caption: string
  due: string | null
  priority: 'Low' | 'Medium' | 'High'
  raw_link: string
  final_link: string
  published_link: string
  notes: string
  stage: WsStage
  approval_status: 'none' | 'pending' | 'approved' | 'changes'
  approval_note: string
  created_at: string
  updated_at: string
}

export type WsMessage = {
  id: string
  from_role: Role
  body: string
  done: boolean
  created_at: string
}

export type WsSop = {
  id: string
  category: string
  title: string
  body: string
  sort: number
  created_at: string
  updated_at: string
}

export type WsMediaLink = {
  id: string
  brand: 'STB' | 'ALTO' | 'General'
  kind: 'raw' | 'finished' | 'other'
  label: string
  url: string
  notes: string
  created_at: string
}

export const STAGES: { id: WsStage; label: string }[] = [
  { id: 'ideas', label: 'Ideas' },
  { id: 'footage', label: 'Need Footage' },
  { id: 'ready', label: 'Ready' },
  { id: 'editing', label: 'Editing' },
  { id: 'review', label: 'Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
]

export const TASK_CATEGORIES = ['Personal', 'STB', 'ALTO', 'Content'] as const
export const WS_PRIORITIES = ['Low', 'Medium', 'High'] as const

export const BRAND_COLORS: Record<string, string> = { STB: '#b45309', ALTO: '#2563eb', General: '#6b7280' }

// ---------------------------------------------------------------------------
// Role context — who is signed in, and are they a workspace member?
// ---------------------------------------------------------------------------

type WorkspaceCtx = {
  /** 'owner' | 'assistant' — null while loading or when not a member. */
  role: Role | null
  loading: boolean
  /** True when Supabase env vars exist (workspace requires the cloud). */
  configured: boolean
  /** True when the ws_* tables exist and membership was found. */
  ready: boolean
  userEmail: string
}

const Ctx = createContext<WorkspaceCtx>({ role: null, loading: true, configured: false, ready: false, userEmail: '' })

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceCtx>({
    role: null, loading: cloudConfigured, configured: cloudConfigured, ready: false, userEmail: '',
  })

  useEffect(() => {
    if (!cloudConfigured || !supabase) return
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase!.auth.getUser()
      const user = auth.user
      if (!user) { if (!cancelled) setState((s) => ({ ...s, loading: false })); return }
      // Missing table (migration not run yet) or no membership row both resolve
      // to role null — the personal app then renders exactly as before.
      const { data, error } = await supabase!.from('workspace_members').select('role').eq('user_id', user.id).maybeSingle()
      if (cancelled) return
      const role = !error && data ? (data.role as Role) : null
      setState({ role, loading: false, configured: true, ready: !error && !!data, userEmail: user.email || '' })
    })()
    return () => { cancelled = true }
  }, [])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export function useWorkspace() {
  return useContext(Ctx)
}

// ---------------------------------------------------------------------------
// Generic table hook — fetch + realtime + CRUD helpers
// ---------------------------------------------------------------------------

type WsRow = { id: string }

export function useWsTable<T extends WsRow>(table: string, orderBy = 'created_at', ascending = false) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending })
    if (error) { setError(error.message); return }
    setError('')
    setRows((data ?? []) as T[])
  }, [table, orderBy, ascending])

  useEffect(() => {
    if (!supabase) { setRows([]); return }
    void refresh()
    const channel = supabase
      .channel(`ws_${table}_changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => { void refresh() })
      .subscribe()
    // Realtime events can be missed while backgrounded — re-pull on focus.
    const onWake = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      channel.unsubscribe()
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [table, refresh])

  const insert = useCallback(async (values: Partial<T>) => {
    if (!supabase) return null
    const { data, error } = await supabase.from(table).insert(values as Record<string, unknown>).select().single()
    if (error) { setError(error.message); return null }
    setRows((r) => (r ? [data as T, ...r] : [data as T]))
    return data as T
  }, [table])

  const update = useCallback(async (id: string, values: Partial<T>) => {
    if (!supabase) return
    // Optimistic — realtime/refresh will reconcile.
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, ...values } : row)) ?? null)
    const { error } = await supabase.from(table).update({ ...values, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setError(error.message); void refresh() }
  }, [table, refresh])

  const remove = useCallback(async (id: string) => {
    if (!supabase) return
    setRows((r) => r?.filter((row) => row.id !== id) ?? null)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { setError(error.message); void refresh() }
  }, [table, refresh])

  return { rows, error, refresh, insert, update, remove }
}

// ---------------------------------------------------------------------------
// Settings (brand voice, company context, non-negotiables) — key/value
// ---------------------------------------------------------------------------

export function useWsSettings() {
  const [rows, setRows] = useState<{ key: string; value: string }[] | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.from('ws_settings').select('key, value')
    if (!error) setRows((data ?? []) as { key: string; value: string }[])
  }, [])

  useEffect(() => {
    if (!supabase) { setRows([]); return }
    void refresh()
    const channel = supabase
      .channel('ws_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ws_settings' }, () => { void refresh() })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [refresh])

  const map: Record<string, string> = {}
  for (const r of rows ?? []) map[r.key] = r.value

  const set = useCallback(async (key: string, value: string) => {
    if (!supabase) return
    const { error } = await supabase.from('ws_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (!error) void refresh()
    return error?.message
  }, [refresh])

  return { settings: map, loaded: rows !== null, set }
}

/** Format an ISO date for compact display (e.g. "Aug 14"). */
export function fmtWsDate(d?: string | null) {
  if (!d) return ''
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function wsTodayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
