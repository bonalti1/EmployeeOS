import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Optional cloud backend. The app is fully offline-first; when these two env
 * vars are present (set in Netlify), the dashboard also backs everything up to
 * your own Supabase project and syncs it across every device you sign in on.
 *
 * When the vars are absent, `supabase` is null and the app behaves exactly as
 * before — local-only, zero setup. Nothing breaks either way.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = !!(url && anonKey)

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
