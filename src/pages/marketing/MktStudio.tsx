import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { WsShell } from '../../components/WorkspaceLayout'
import { MktCompanyProvider, useMktCompany } from '../../lib/marketing'
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
  if (loading) return null
  if (companies.length === 0) {
    return (
      <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
        No companies found — run <b>supabase/05_marketing_studio.sql</b> to create South Texas Builders and ALTO Pro.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2 mb-4">
      {companies.map((c) => {
        const active = company?.id === c.id
        return (
          <button
            key={c.id}
            onClick={() => setCompanyId(c.id)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition"
            style={{
              background: active ? 'var(--color-accent)' : 'var(--color-surface)',
              color: active ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
              boxShadow: active ? 'var(--shadow-md)' : 'none',
            }}
          >
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
