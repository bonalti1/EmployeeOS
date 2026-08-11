import { NavLink } from 'react-router-dom'
import { IconHome, IconWork, IconTasks, IconJournal } from './icons'

/**
 * Thumb-reachable bottom tab bar for phones (hidden on lg+, where the sidebar
 * takes over). Holds the daily-use destinations; everything else lives behind
 * "More", which opens the full menu drawer.
 */

const TABS = [
  { to: '/home', label: 'Home', Icon: IconHome },
  { to: '/work-tasks', label: 'Work', Icon: IconWork },
  { to: '/home-tasks', label: 'Tasks', Icon: IconTasks },
  { to: '/journal', label: 'Journal', Icon: IconJournal },
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

export default function BottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass"
      style={{ borderTop: '1px solid var(--color-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch">
        {TABS.map(({ to, label, Icon }) => (
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
