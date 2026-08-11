import type { CSSProperties, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Card, PageHeader } from './ui'
import { IconHome, IconTasks, IconFilm, IconFolder, IconBook, IconStamp, IconSpark, IconJournal, IconTrend } from './icons'
import { useWorkspace, BRAND_COLORS } from '../lib/workspace'

/**
 * Shared chrome for every Assistant Workspace page. The owner reaches these
 * pages inside their existing Personal OS shell (with a pill tab bar to move
 * between sections); the assistant reaches them inside their own app shell
 * (AssistantApp), which provides sidebar/bottom-nav navigation instead.
 */

export const WS_SECTIONS = [
  { to: '/workspace/home', label: 'Home', Icon: IconHome },
  { to: '/workspace/tasks', label: 'Tasks', Icon: IconTasks },
  { to: '/workspace/content', label: 'Content', Icon: IconFilm },
  { to: '/workspace/trends', label: 'Trends', Icon: IconTrend },
  { to: '/workspace/journal', label: 'Journal', Icon: IconJournal },
  { to: '/workspace/media', label: 'Media', Icon: IconFolder },
  { to: '/workspace/sops', label: 'SOPs', Icon: IconBook },
  { to: '/workspace/approvals', label: 'Approvals', Icon: IconStamp },
  { to: '/workspace/ai', label: 'AI Studio', Icon: IconSpark },
]

export const wsField: CSSProperties = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

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

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} action={action} />
      {role !== 'assistant' && <WorkspaceTabs />}
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
          <p className="font-semibold" style={{ color: 'var(--color-text)' }}>One-time workspace setup</p>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            The shared workspace tables aren't set up yet (or your login isn't registered as the owner).
            Open Supabase → SQL Editor, paste the contents of <b>supabase/assistant_workspace.sql</b> from this
            project, and run it. It creates the shared tables, locks them to workspace members with Row Level
            Security, and registers <b>your</b> account as the owner. Then reload this page. Full walkthrough:
            <b> ASSISTANT_WORKSPACE_SETUP.md</b>.
          </p>
        </Card>
      ) : (
        children
      )}
    </div>
  )
}
