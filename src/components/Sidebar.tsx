import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  IconHome, IconTasks, IconWork, IconCompanies, IconPayments, IconCalendar,
  IconHealth, IconFamily, IconJournal, IconBell, IconSettings,
} from './icons'
import { useStore } from '../lib/store'
import { Logo } from './Logo'

const MENU = [
  { to: '/home', label: 'Home', Icon: IconHome },
  { to: '/home-tasks', label: 'Home tasks', Icon: IconTasks },
  { to: '/work-tasks', label: 'Work tasks', Icon: IconWork },
  { to: '/companies', label: 'Companies', Icon: IconCompanies },
  { to: '/finances', label: 'Finances', Icon: IconPayments },
  { to: '/calendar', label: 'Calendar', Icon: IconCalendar },
  { to: '/health', label: 'Health', Icon: IconHealth },
  { to: '/family', label: 'Family', Icon: IconFamily },
  { to: '/journal', label: 'Journal', Icon: IconJournal },
]

const PREFS = [
  { to: '/notifications', label: 'Notifications', Icon: IconBell },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
]

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 15)
    return () => clearInterval(t)
  }, [])
  return now
}

function Section({ items, label, onNavigate, spread }: { items: typeof MENU; label: string; onNavigate?: () => void; spread?: boolean }) {
  return (
    <div className={spread ? 'flex-1 flex flex-col min-h-0' : ''}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1 px-3 opacity-45">{label}</div>
      <nav className={`flex flex-col ${spread ? 'flex-1 justify-between py-0.5' : 'gap-0.5'}`}>
        {items.map(({ to, label, Icon }) => (
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
    </div>
  )
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const now = useClock()
  const [profile] = useStore<{ name: string; photo?: string; photoInSidebar?: boolean }>('profile', { name: 'Rolando Joan' })
  const showPhoto = profile.photo && profile.photoInSidebar
  const hour = now.getHours() % 12 || 12
  const minute = String(now.getMinutes()).padStart(2, '0')
  const ampm = now.getHours() < 12 ? 'AM' : 'PM'
  const weekday = now.toLocaleDateString([], { weekday: 'long' })
  const monthDay = now.toLocaleDateString([], { month: 'long', day: 'numeric' })

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
        {showPhoto && <img src={profile.photo} alt="" className="h-11 w-11 rounded-full object-cover mb-2" style={{ border: '2px solid color-mix(in srgb, var(--color-accent) 60%, transparent)' }} />}
        <div className="flex items-baseline gap-1.5 tnum justify-center">
          <span className="text-[26px] leading-none font-light tracking-tight">{hour}:{minute}</span>
          <span className="text-xs font-medium opacity-60">{ampm}</span>
        </div>
        <div className="text-[11px] mt-0.5 opacity-55 tracking-wide">{weekday}, {monthDay}</div>
      </div>

      <div className="mt-4 mb-5 flex flex-col items-center">
        <Logo height={64} />
        <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.22em] opacity-55 text-center">Personal Operating System</div>
      </div>

      {/* Nav fills the remaining height: Menu spreads evenly, Preferences anchored at the bottom. */}
      <div className="flex-1 flex flex-col min-h-0">
        <Section items={MENU} label="Menu" onNavigate={onNavigate} spread />
        <div className="mt-3">
          <Section items={PREFS} label="Preferences" onNavigate={onNavigate} />
        </div>
      </div>
    </aside>
  )
}
