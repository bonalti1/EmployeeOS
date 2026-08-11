import { useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { IconMenu } from './components/icons'
import { Logo } from './components/Logo'
import Home from './pages/Home'
import WorkList from './pages/WorkList'
import HomeCare from './pages/HomeCare'
import Companies from './pages/Companies'
import Finances from './pages/Finances'
import Calendar from './pages/Calendar'
import Health from './pages/Health'
import Family from './pages/Family'
import Journal from './pages/Journal'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import WsHome from './pages/workspace/WsHome'
import WsTasks from './pages/workspace/WsTasks'
import WsContent from './pages/workspace/WsContent'
import WsJournal from './pages/workspace/WsJournal'
import WsTrends from './pages/workspace/WsTrends'
import WsMedia from './pages/workspace/WsMedia'
import WsSops from './pages/workspace/WsSops'
import WsApprovals from './pages/workspace/WsApprovals'
import WsAiStudio from './pages/workspace/WsAiStudio'

function useClockShort() {
  const now = new Date()
  const hour = now.getHours() % 12 || 12
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${hour}:${minute} ${now.getHours() < 12 ? 'AM' : 'PM'}`
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const time = useClockShort()

  return (
    <div className="flex h-full" style={{ background: 'var(--color-bg)' }}>
      {/* Desktop sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 h-full overflow-y-auto">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 glass" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => setMobileOpen(true)} aria-label="Menu" style={{ color: 'var(--color-text)' }}>
            <IconMenu width={24} height={24} />
          </button>
          <Logo height={24} />
          <span className="ml-auto text-sm tnum font-medium" style={{ color: 'var(--color-muted)' }}>{time}</span>
        </div>

        <div key={location.pathname} className={`${/^\/(home-tasks|work-tasks|companies|workspace)/.test(location.pathname) ? 'max-w-[100rem]' : 'max-w-6xl'} mx-auto px-5 sm:px-6 md:px-10 pt-6 md:pt-8 pb-28 lg:pb-8`}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/home-tasks" element={<WorkList fixedBoard="Home" />} />
            <Route path="/home-care" element={<HomeCare />} />
            <Route path="/work-tasks" element={<WorkList fixedBoard="Work" />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/tasks" element={<Navigate to="/home-tasks" replace />} />
            <Route path="/work" element={<Navigate to="/work-tasks" replace />} />
            <Route path="/finances" element={<Finances />} />
            <Route path="/payments" element={<Navigate to="/finances" replace />} />
            <Route path="/bank" element={<Navigate to="/finances" replace />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/health" element={<Health />} />
            <Route path="/family" element={<Family />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/assistant" element={<Navigate to="/journal" replace />} />
            {/* Assistant Workspace — shared area with the assistant (owner view) */}
            <Route path="/workspace" element={<Navigate to="/workspace/home" replace />} />
            <Route path="/workspace/home" element={<WsHome />} />
            <Route path="/workspace/tasks" element={<WsTasks />} />
            <Route path="/workspace/content" element={<WsContent />} />
            <Route path="/workspace/trends" element={<WsTrends />} />
            <Route path="/workspace/journal" element={<WsJournal />} />
            <Route path="/workspace/media" element={<WsMedia />} />
            <Route path="/workspace/sops" element={<WsSops />} />
            <Route path="/workspace/approvals" element={<WsApprovals />} />
            <Route path="/workspace/ai" element={<WsAiStudio />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <BottomNav onMore={() => setMobileOpen(true)} />
    </div>
  )
}
