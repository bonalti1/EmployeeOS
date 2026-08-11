import { useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconTrend } from '../../components/icons'
import { wsField } from '../../components/WorkspaceLayout'
import { useMktCompany, useMktTable, type MktCampaign } from '../../lib/marketing'

/**
 * Performance — deliberately minimal for now (manual entry only). This is the
 * data RJP Intelligence will learn from later, kept strictly per-company so
 * STB's history and ALTO's history never blend.
 */

type PerfRow = {
  id: string
  company_id: string
  campaign_id: string | null
  platform: string
  publish_date: string | null
  metrics: Record<string, number | string>
  notes: string
  created_at: string
}

const METRIC_KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'clicks', 'leads', 'appointments', 'sales', 'revenue', 'spend']

export default function MktPerformance() {
  const { company } = useMktCompany()
  const perf = useMktTable<PerfRow>('mkt_performance', company?.id ?? null)
  const campaigns = useMktTable<MktCampaign>('mkt_campaigns', company?.id ?? null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<{ campaign_id: string; platform: string; publish_date: string; notes: string; metrics: Record<string, string> }>(
    { campaign_id: '', platform: '', publish_date: '', notes: '', metrics: {} })

  const save = async () => {
    if (!draft.platform.trim()) return
    const metrics: Record<string, number> = {}
    for (const [k, v] of Object.entries(draft.metrics)) if (v.trim()) metrics[k] = Number(v) || 0
    await perf.insert({
      campaign_id: draft.campaign_id || null, platform: draft.platform.trim(),
      publish_date: draft.publish_date || null, notes: draft.notes, metrics,
    } as Partial<PerfRow>)
    setAdding(false)
    setDraft({ campaign_id: '', platform: '', publish_date: '', notes: '', metrics: {} })
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm max-w-xl leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Log real results per published campaign — manually for now. This history is what will eventually power the
          RJP Intelligence lens: what actually works for {company?.name}, kept separate from every other company.
        </p>
        <Button onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Log results'}</Button>
      </div>

      {adding && (
        <Card className="p-4 mb-4">
          <div className="grid gap-3 sm:grid-cols-3 mb-3">
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Campaign
              <select value={draft.campaign_id} onChange={(e) => setDraft({ ...draft, campaign_id: e.target.value })}
                className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                <option value="">(none / general)</option>
                {(campaigns.rows ?? []).map((c) => <option key={c.id} value={c.id}>{c.title || 'Untitled'}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Platform
              <Input value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} placeholder="TikTok / IG / FB…" className="mt-1 font-normal" />
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Publish date
              <input type="date" value={draft.publish_date} onChange={(e) => setDraft({ ...draft, publish_date: e.target.value })}
                className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
            </label>
          </div>
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-6 mb-3">
            {METRIC_KEYS.map((k) => (
              <label key={k} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                {k}
                <input type="number" value={draft.metrics[k] || ''} onChange={(e) => setDraft({ ...draft, metrics: { ...draft.metrics, [k]: e.target.value } })}
                  className="w-full rounded-lg px-2 py-1.5 text-sm outline-none mt-1 tnum" style={wsField} />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Notes — what do we think drove the result?" />
            <Button onClick={() => void save()}>Save</Button>
          </div>
        </Card>
      )}

      {(perf.rows ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<IconTrend width={34} height={34} />} title="No performance data yet"
            hint="Once campaigns publish, log their numbers here — a few rows in, the patterns start talking." />
        </Card>
      ) : (
        <Card className="p-2">
          <ul className="flex flex-col">
            {(perf.rows ?? []).map((r) => {
              const camp = (campaigns.rows ?? []).find((c) => c.id === r.campaign_id)
              return (
                <li key={r.id} className="px-3 py-2.5 rounded-xl flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{camp?.title || 'General'}</span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{r.platform}{r.publish_date ? ` · ${r.publish_date}` : ''}</span>
                  <span className="text-xs tnum ml-auto" style={{ color: 'var(--color-muted)' }}>
                    {Object.entries(r.metrics).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(' · ')}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
