import { useNavigate } from 'react-router-dom'
import { Card, EmptyState } from '../../components/ui'
import { IconFilm } from '../../components/icons'
import { useMktCompany, useMktTable, fmtMktDate, type MktCampaign } from '../../lib/marketing'

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280', generated: '#d97706', approved: '#059669', published: '#7c3aed', archived: '#9ca3af',
}

export default function MktCampaigns() {
  const navigate = useNavigate()
  const { company } = useMktCompany()
  const { rows } = useMktTable<MktCampaign>('mkt_campaigns', company?.id ?? null)

  if (rows === null) return <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading campaigns…</Card>

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={<IconFilm width={34} height={34} />} title={`No ${company?.name} campaigns yet`}
          hint="Open an idea and hit Generate Campaign — every generation lands here." />
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((c) => (
        <Card key={c.id} className="p-4 cursor-pointer transition hover:-translate-y-0.5">
          <button onClick={() => c.idea_id && navigate(`../idea/${c.idea_id}`)} className="w-full text-left">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ background: `color-mix(in srgb, ${STATUS_COLORS[c.status]} 12%, transparent)`, color: STATUS_COLORS[c.status] }}>
                {c.status}
              </span>
              {c.selected_lens && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
                  {c.selected_lens}
                </span>
              )}
              <span className="text-[10px] ml-auto" style={{ color: 'var(--color-muted)' }}>{fmtMktDate(c.created_at)}</span>
            </div>
            <p className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{c.title || 'Untitled campaign'}</p>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
              {c.objective}{c.channels.length ? ` · ${c.channels.slice(0, 3).join(', ')}` : ''}
            </p>
          </button>
        </Card>
      ))}
    </div>
  )
}
