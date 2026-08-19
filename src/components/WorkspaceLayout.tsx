import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Card, PageHeader } from './ui'
import { IconHome, IconTasks, IconFilm, IconFolder, IconStamp, IconSpark, IconJournal, IconTrend, IconBulb } from './icons'
import { useWorkspace, BRAND_COLORS } from '../lib/workspace'

/**
 * Shared chrome for every Assistant Workspace page. The owner reaches these
 * pages inside their existing Personal OS shell (with a pill tab bar to move
 * between sections); the assistant reaches them inside their own app shell
 * (AssistantApp), which provides sidebar/bottom-nav navigation instead.
 */

/**
 * Features hidden for now — hidden, not removed.
 *
 * Every page behind these flags still exists and still works: WsAiStudio and
 * WsTrends, their routes, the brand-kit panel and the studio Netlify
 * functions are all untouched. A flag rather than a commented-out block keeps
 * that code compiling with the rest of the app, so it cannot quietly rot
 * while it is out of sight, and turning a feature back on is one boolean.
 *
 * Trends only ever fed AI Studio, so the two travel together.
 */
export const AI_STUDIO_ENABLED = false
export const TRENDS_ENABLED = false

export const WS_SECTIONS = [
  { to: '/workspace/home', label: 'Home', Icon: IconHome },
  { to: '/workspace/tasks', label: 'Tasks', Icon: IconTasks },
  { to: '/workspace/ideas', label: 'Ideas', Icon: IconBulb },
  { to: '/workspace/content', label: 'Content', Icon: IconFilm },
  { to: '/workspace/journal', label: 'Journal', Icon: IconJournal },
  { to: '/workspace/media', label: 'Media', Icon: IconFolder },
  { to: '/workspace/approvals', label: 'Approvals', Icon: IconStamp },
  // Trends feeds AI Studio, so it sits directly beneath it when shown.
  ...(AI_STUDIO_ENABLED ? [{ to: '/workspace/ai', label: 'AI Studio', Icon: IconSpark }] : []),
  ...(TRENDS_ENABLED ? [{ to: '/workspace/trends', label: 'Trends', Icon: IconTrend }] : []),
]

export const wsField: CSSProperties = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

/**
 * True while a page renders inside the Assistant shell, which already provides
 * a sidebar (desktop) and bottom tabs (phone). The pill tab bar is redundant
 * there, so WsShell hides it — including in the owner's "view as" preview.
 */
export const BRAND_OPTIONS = ['STB', 'ALTO', 'Both', 'Internal'] as const
export type BrandKey = typeof BRAND_OPTIONS[number]

/**
 * Company mark for a brand tag. The logo identifies the company on its own, so
 * no wording is drawn next to it; "Both" shows the two builder marks together
 * and "Internal" uses the BONALTI wordmark (our own house work).
 */
export function BrandLogo({ brand, size = 16 }: { brand: BrandKey; size?: number }) {
  const img = (src: string, alt: string, h = size) => (
    <img src={src} alt={alt} title={alt} draggable={false}
      style={{ height: h, width: 'auto', maxWidth: h * 3, objectFit: 'contain' }} />
  )
  if (brand === 'STB') return img('/logos/stb.png', 'South Texas Builders')
  if (brand === 'ALTO') return img('/logos/alto.png', 'Alto-Pro')
  if (brand === 'Internal') return (
    <img src="/logos/bonalti.png" alt="Bonalti" title="Bonalti (internal)" draggable={false}
      style={{ height: size * 0.6, width: 'auto', maxWidth: size * 4.5, objectFit: 'contain', filter: 'invert(0.75)' }} />
  )
  return (
    <span className="inline-flex items-center gap-1" title="Both companies">
      {img('/logos/stb.png', 'South Texas Builders', size * 0.85)}
      {img('/logos/alto.png', 'Alto-Pro', size * 0.85)}
    </span>
  )
}

const AssistantShellCtx = createContext(false)
export const AssistantShell = AssistantShellCtx.Provider
export const useInAssistantShell = () => useContext(AssistantShellCtx)

export function WorkspaceTabs() {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-5" style={{ scrollbarWidth: 'none' }}>
      {WS_SECTIONS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition"
          style={({ isActive }) => ({
            background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
            color: isActive ? 'var(--color-on-accent)' : 'var(--color-muted)',
            border: '1px solid var(--color-border)',
          })}
        >
          <Icon width={14} height={14} />
          {label}
        </NavLink>
      ))}
    </div>
  )
}

/** Brand chip: STB (amber) / ALTO (blue). */
export function BrandBadge({ brand }: { brand: string }) {
  const c = BRAND_COLORS[brand] || 'var(--color-muted)'
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
      style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>
      {brand}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'Medium') return null
  const color = priority === 'High' ? '#dc2626' : 'var(--color-muted)'
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
      {priority}
    </span>
  )
}

/**
 * Page wrapper: header + (for the owner) the section tab bar + a setup notice
 * when the workspace backend isn't ready yet. Pages render their content only
 * once `ready` is true, so they can assume the ws_* tables exist.
 */
export function WsShell({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode
}) {
  const { role, configured, ready, loading } = useWorkspace()
  const inAssistantShell = useInAssistantShell()

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} action={action} />
      {role !== 'assistant' && !inAssistantShell && <WorkspaceTabs />}
      {!configured ? (
        <Card className="p-6">
          <p className="font-semibold" style={{ color: 'var(--color-text)' }}>Cloud setup required</p>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            The Assistant Workspace is shared between you and your assistant, so it needs the Supabase cloud
            backend. Follow <b>SUPABASE_SETUP.md</b> first (your private dashboard sync), then run
            <b> supabase/assistant_workspace.sql</b> as described in <b>ASSISTANT_WORKSPACE_SETUP.md</b>.
          </p>
        </Card>
      ) : loading ? (
        <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading workspace…</Card>
      ) : !ready ? (
        <Card className="p-6">
          <p className="font-semibold" style={{ color: 'var(--color-text)' }}>Almost in — your account needs to be added</p>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Your account exists, but it isn't a member of this workspace yet.
            <b> Joining the team?</b> You're done — ask Rolando to add your account, then reload this page.
            Nothing to install, nothing to configure on your side.
          </p>
          <p className="text-sm mt-2.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            <b>Setting the workspace up as the owner?</b> Open Supabase → SQL Editor and run
            <b> supabase/assistant_workspace.sql</b> from this project — it creates the shared tables, locks
            them with Row Level Security, and registers your account as the owner. To add a teammate
            afterwards, insert their account into <b>workspace_members</b> (see
            <b> ASSISTANT_WORKSPACE_SETUP.md</b>).
          </p>
        </Card>
      ) : (
        children
      )}
    </div>
  )
}
