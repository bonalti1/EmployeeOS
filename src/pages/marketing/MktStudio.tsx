import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { WsShell } from '../../components/WorkspaceLayout'
import { MktCompanyProvider, useMktCompany, useBrandKits } from '../../lib/marketing'
import MktIdeas from './MktIdeas'
import MktIdeaStudio from './MktIdeaStudio'
import MktCampaigns from './MktCampaigns'
import MktBrand from './MktBrand'
import MktAssets from './MktAssets'
import MktPerformance from './MktPerformance'

/**
 * Marketing Studio shell. The company tabs at the top are the room switcher —
 * every page below reads the selected company from context and every query is
 * scoped to it. Switching companies swaps the entire dataset.
 */

const SECTIONS = [
  { to: 'ideas', label: 'Ideas' },
  { to: 'campaigns', label: 'Campaigns' },
  { to: 'brand', label: 'Brand DNA' },
  { to: 'assets', label: 'Assets' },
  { to: 'performance', label: 'Performance' },
]

function CompanyTabs() {
  const { companies, company, setCompanyId, loading } = useMktCompany()
  const kits = useBrandKits()
  if (loading) return null
  if (companies.length === 0) {
    return (
      <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
        No companies found — run <b>supabase/05_marketing_studio.sql</b> to create South Texas Builders and ALTO Pro.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {companies.map((c) => {
        const active = company?.id === c.id
        const kit = kits[c.id]
        // A company with a saved primary color gets its own color as the active
        // tab — switching tabs literally changes rooms.
        const activeBg = kit?.primary || 'var(--color-accent)'
        return (
          <button
            key={c.id}
            onClick={() => setCompanyId(c.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition"
            style={{
              background: active ? activeBg : 'var(--color-surface)',
              color: active ? '#ffffff' : 'var(--color-muted)',
              border: `1px solid ${active ? activeBg : 'var(--color-border)'}`,
              boxShadow: active ? 'var(--shadow-md)' : 'none',
            }}
          >
            {kit?.logo && (
              <span className="h-5 w-5 rounded grid place-items-center overflow-hidden shrink-0"
                style={{ background: active ? 'rgba(255,255,255,0.9)' : 'transparent' }}>
                <img src={kit.logo} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            )}
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

function SectionNav() {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
      {SECTIONS.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          className="px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition"
          style={({ isActive }) => ({
            background: isActive ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
            color: isActive ? 'var(--color-accent)' : 'var(--color-muted)',
            border: '1px solid var(--color-border)',
          })}
        >
          {s.label}
        </NavLink>
      ))}
    </div>
  )
}

function StudioBody() {
  const { company } = useMktCompany()
  return (
    <Routes>
      {/* Idea Studio owns its full page (no section nav) */}
      <Route path="idea/:ideaId" element={<MktIdeaStudio />} />
      <Route
        path="*"
        element={
          <>
            <CompanyTabs />
            {company && (
              <>
                <SectionNav />
                <Routes>
                  <Route path="/" element={<Navigate to="ideas" replace />} />
                  <Route path="ideas" element={<MktIdeas />} />
                  <Route path="campaigns" element={<MktCampaigns />} />
                  <Route path="brand" element={<MktBrand />} />
                  <Route path="assets" element={<MktAssets />} />
                  <Route path="performance" element={<MktPerformance />} />
                  <Route path="*" element={<Navigate to="ideas" replace />} />
                </Routes>
              </>
            )}
          </>
        }
      />
    </Routes>
  )
}

export default function MktStudio() {
  return (
    <WsShell title="Marketing Studio" subtitle="Idea → strategy → campaign → creative, one company at a time">
      <MktCompanyProvider>
        <StudioBody />
      </MktCompanyProvider>
    </WsShell>
  )
}
