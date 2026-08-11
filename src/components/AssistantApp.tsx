import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { IconMenu, IconHome, IconTasks, IconFilm, IconJournal } from './icons'
import { Logo } from './Logo'
import { WS_SECTIONS } from './WorkspaceLayout'
import { useWorkspace, ASSISTANT_NAME } from '../lib/workspace'
import { supabase } from '../lib/supabase'
import WsHome from '../pages/workspace/WsHome'
import WsTasks from '../pages/workspace/WsTasks'
import WsContent from '../pages/workspace/WsContent'
import WsJournal from '../pages/workspace/WsJournal'
import WsTrends from '../pages/workspace/WsTrends'
import WsIdeas from '../pages/workspace/WsIdeas'
import MktStudio from '../pages/marketing/MktStudio'
import IdeaCapture from './IdeaCapture'
import WsMedia from '../pages/workspace/WsMedia'
import WsSops from '../pages/workspace/WsSops'
import WsApprovals from '../pages/workspace/WsApprovals'
import WsAiStudio from '../pages/workspace/WsAiStudio'

/**
 * The Assistant OS — the entire app as seen by the Personal Assistant /
 * Content Creator. Mirrors the Personal OS shell (sidebar, mobile drawer,
 * bottom tabs, theming) but mounts ONLY workspace routes: none of Rolando's
 * private pages exist in this tree, so no URL can reach them, and the
 * assistant's login can't read the private `app_state` rows anyway (RLS).
 */

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 15)
    return () => clearInterval(t)
  }, [])
  return now
}

function AssistantSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const now = useClock()
  const { userEmail } = useWorkspace()
  const hour = now.getHours() % 12 || 12
  const minute = String(now.getMinutes()).padStart(2, '0')
  const ampm = now.getHours() < 12 ? 'AM' : 'PM'
  const weekday = now.toLocaleDateString([], { weekday: 'long' })
  const monthDay = now.toLocaleDateString([], { month: 'long', day: 'numeric' })

  const signOut = async () => {
    await supabase?.auth.signOut()
    window.location.href = '/'
  }

  return (
    <aside
      className="w-[260px] h-full overflow-y-auto px-4 py-5 flex flex-col"
      style={{
        background: 'linear-gradient(180deg, var(--color-sidebar) 0%, var(--color-sidebar-2) 100%)',
        color: 'var(--color-sidebar-text)',
        borderRight: '1px solid color-mix(in srgb, var(--color-sidebar-text) 8%, transparent)',
      }}
    >
      <div className="flex flex-col items-center text-center">
        <div className="flex items-baseline gap-1.5 tnum justify-center">
          <span className="text-[26px] leading-none font-light tracking-tight">{hour}:{minute}</span>
          <span className="text-xs font-medium opacity-60">{ampm}</span>
        </div>
        <div className="text-[11px] mt-0.5 opacity-55 tracking-wide">{weekday}, {monthDay}</div>
      </div>

      <div className="mt-4 mb-5 flex flex-col items-center">
        <Logo height={64} />
        <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.22em] opacity-55 text-center">{ASSISTANT_NAME} Operating System</div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1 px-3 opacity-45">Menu</div>
        <nav className="flex-1 flex flex-col justify-between py-0.5">
          {WS_SECTIONS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className="group flex items-center gap-3 px-3 py-[7px] rounded-xl text-[14px] transition-all duration-200"
              style={({ isActive }) => ({
                color: isActive ? 'var(--color-accent)' : 'var(--color-sidebar-text)',
                fontWeight: isActive ? 600 : 450,
                background: isActive ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  <span className="transition-transform duration-200 group-hover:scale-110"
                    style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-sidebar-text)', opacity: isActive ? 1 : 0.75 }}>
                    <Icon width={18} height={18} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-3 pt-3" style={{ borderTop: '1px solid color-mix(in srgb, var(--color-sidebar-text) 10%, transparent)' }}>
          {userEmail && <div className="px-3 text-[11px] truncate opacity-55 mb-1.5">{userEmail}</div>}
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-[7px] rounded-xl text-[13px] font-medium transition hover:opacity-80"
            style={{ color: 'var(--color-sidebar-text)', opacity: 0.75 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

const MOBILE_TABS = [
  { to: '/workspace/home', label: 'Home', Icon: IconHome },
  { to: '/workspace/tasks', label: 'Tasks', Icon: IconTasks },
  { to: '/workspace/content', label: 'Content', Icon: IconFilm },
  { to: '/workspace/journal', label: 'Journal', Icon: IconJournal },
]

function IconMore({ width = 22, height = 22 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  )
}

function AssistantBottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass"
      style={{ borderTop: '1px solid var(--color-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch">
        {MOBILE_TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 min-h-[56px] transition-colors"
            style={({ isActive }) => ({ color: isActive ? 'var(--color-accent)' : 'var(--color-muted)' })}
          >
            {({ isActive }) => (
              <>
                <span style={{ transform: isActive ? 'translateY(-1px)' : 'none', transition: 'transform .15s' }}>
                  <Icon width={22} height={22} />
                </span>
                <span className="text-[10px] font-semibold tracking-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={onMore}
          className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 min-h-[56px]"
          style={{ color: 'var(--color-muted)' }}
          aria-label="More"
        >
          <IconMore />
          <span className="text-[10px] font-semibold tracking-tight">More</span>
        </button>
      </div>
    </nav>
  )
}

export default function AssistantApp() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-full" style={{ background: 'var(--color-bg)' }}>
      <div className="hidden lg:block h-full shrink-0">
        <AssistantSidebar />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <AssistantSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 h-full overflow-y-auto">
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 glass" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => setMobileOpen(true)} aria-label="Menu" style={{ color: 'var(--color-text)' }}>
            <IconMenu width={24} height={24} />
          </button>
          <Logo height={24} />
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted)' }}>{ASSISTANT_NAME} OS</span>
        </div>

        <div key={location.pathname} className="max-w-[100rem] mx-auto px-5 sm:px-6 md:px-10 pt-6 md:pt-8 pb-28 lg:pb-8">
          <Routes>
            <Route path="/workspace/home" element={<WsHome />} />
            <Route path="/workspace/tasks" element={<WsTasks />} />
            <Route path="/workspace/content" element={<WsContent />} />
            <Route path="/workspace/ideas" element={<WsIdeas />} />
            <Route path="/workspace/marketing/*" element={<MktStudio />} />
            <Route path="/workspace/trends" element={<WsTrends />} />
            <Route path="/workspace/journal" element={<WsJournal />} />
            <Route path="/workspace/media" element={<WsMedia />} />
            <Route path="/workspace/sops" element={<WsSops />} />
            <Route path="/workspace/approvals" element={<WsApprovals />} />
            <Route path="/workspace/ai" element={<WsAiStudio />} />
            {/* Anything else — including every private Personal OS URL — lands on the assistant home. */}
            <Route path="*" element={<Navigate to="/workspace/home" replace />} />
          </Routes>
        </div>
      </main>

      <IdeaCapture />
      <AssistantBottomNav onMore={() => setMobileOpen(true)} />
    </div>
  )
}
