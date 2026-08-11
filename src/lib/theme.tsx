import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useStore } from './store'

export type Theme = {
  sidebar: string
  sidebar2: string
  sidebarText: string
  accent: string
  onAccent: string
  bg: string
  surface: string
  text: string
  muted: string
  border: string
}

export const PRESETS: Record<string, Theme> = {
  // Deep navy + Apple blue — the professional default.
  Azure: {
    sidebar: '#172032', sidebar2: '#1f2b42', sidebarText: '#eef2f8',
    accent: '#2f6fed', onAccent: '#ffffff', bg: '#f5f7fa', surface: '#ffffff',
    text: '#141a24', muted: '#697488', border: '#e6eaf1',
  },
  // Dark green + emerald.
  Emerald: {
    sidebar: '#10231b', sidebar2: '#16342a', sidebarText: '#e9f5ef',
    accent: '#10b981', onAccent: '#ffffff', bg: '#f4f8f6', surface: '#ffffff',
    text: '#11211a', muted: '#6a7d74', border: '#e5efe9',
  },
  // Near-black + clean blue.
  Obsidian: {
    sidebar: '#0f1112', sidebar2: '#17191c', sidebarText: '#eef0f2',
    accent: '#3b82f6', onAccent: '#ffffff', bg: '#f5f6f8', surface: '#ffffff',
    text: '#14171a', muted: '#6b7280', border: '#e6e8ec',
  },
  // Blue-grey, understated.
  Slate: {
    sidebar: '#1e293b', sidebar2: '#334155', sidebarText: '#f1f5f9',
    accent: '#5a7bb5', onAccent: '#ffffff', bg: '#f4f6f8', surface: '#ffffff',
    text: '#1e293b', muted: '#64748b', border: '#e6eaef',
  },
  // Neutral graphite.
  Graphite: {
    sidebar: '#1c1d22', sidebar2: '#2b2d35', sidebarText: '#f0f1f4',
    accent: '#5b6472', onAccent: '#ffffff', bg: '#f4f5f7', surface: '#ffffff',
    text: '#1c1d22', muted: '#888c96', border: '#eaecef',
  },
  // Full dark mode + blue.
  Midnight: {
    sidebar: '#0d1117', sidebar2: '#161b22', sidebarText: '#e6edf3',
    accent: '#2f81f7', onAccent: '#ffffff', bg: '#0d1117', surface: '#161b22',
    text: '#e6edf3', muted: '#8b949e', border: '#21262d',
  },
}

/** The default theme new installs start with. */
export const DEFAULT_PRESET = 'Azure'

const VAR_MAP: Record<keyof Theme, string> = {
  sidebar: '--color-sidebar',
  sidebar2: '--color-sidebar-2',
  sidebarText: '--color-sidebar-text',
  accent: '--color-accent',
  onAccent: '--color-on-accent',
  bg: '--color-bg',
  surface: '--color-surface',
  text: '--color-text',
  muted: '--color-muted',
  border: '--color-border',
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  for (const key of Object.keys(VAR_MAP) as (keyof Theme)[]) {
    root.style.setProperty(VAR_MAP[key], theme[key])
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme.sidebar)
}

type ThemeCtx = {
  theme: Theme
  setTheme: (t: Theme) => void
  applyPreset: (name: string) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useStore<Theme>('theme', PRESETS[DEFAULT_PRESET])

  useEffect(() => {
    // Backfill any keys added in newer versions so older saved themes don't break.
    applyTheme({ ...PRESETS[DEFAULT_PRESET], ...theme })
  }, [theme])

  const applyPreset = (name: string) => {
    const preset = PRESETS[name]
    if (preset) setTheme(preset)
  }

  return <Ctx.Provider value={{ theme, setTheme, applyPreset }}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
