import { useMemo, useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconPlus, IconTrash, IconLink, IconSpark } from '../../components/icons'
import { WsShell, BrandBadge, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useToast } from '../../lib/toast'
import {
  useWsTable, wsTodayISO, trendAgeDays, TREND_STALE_DAYS, TREND_FRESH_DAYS,
  type WsTrend, type TrendKind, type WsContent,
} from '../../lib/workspace'

/**
 * Trend Board — manually researched platform trends with a date attached.
 *
 * Deliberately not an automated feed: there is no official TikTok trends API
 * available to a business, and scraper services break constantly. A weekly
 * 15-minute pass through TikTok's (free) Creative Center produces better
 * signal, and logging it here gives AI Studio real, dated research to work
 * from instead of guesses. If we ever add an automated source, only the
 * ingestion changes — this board and the AI wiring stay as they are.
 */

const CREATIVE_CENTER = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en'

const KINDS: { id: TrendKind; label: string; hint: string }[] = [
  { id: 'hashtag', label: 'Hashtag', hint: 'A topic or tag that’s climbing' },
  { id: 'sound', label: 'Sound', hint: 'An audio worth using while it’s hot' },
  { id: 'format', label: 'Format', hint: 'A structure that’s working (e.g. “cost breakdown POV”)' },
  { id: 'topic', label: 'Topic', hint: 'A subject people are engaging with' },
  { id: 'creator', label: 'Creator', hint: 'An account in our space worth studying' },
]

const STATUSES: { id: WsTrend['status']; label: string; color: string }[] = [
  { id: 'watching', label: 'Watching', color: '#d97706' },
  { id: 'using', label: 'Using', color: '#2563eb' },
  { id: 'used', label: 'Used', color: '#059669' },
  { id: 'passed', label: 'Passed', color: '#6b7280' },
]

const kindLabel = (k: TrendKind) => KINDS.find((x) => x.id === k)?.label ?? k

/** Colour-coded age chip — the honest freshness signal on every trend. */
function Freshness({ observedOn }: { observedOn: string }) {
  const age = trendAgeDays(observedOn)
  const stale = age > TREND_STALE_DAYS
  const aging = age > TREND_FRESH_DAYS
  const color = stale ? '#dc2626' : aging ? '#d97706' : '#059669'
  const text = age === 0 ? 'Today' : age === 1 ? '1 day old' : `${age} days old`
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
      title={stale ? 'Stale — re-check before using, and excluded from AI drafts' : undefined}>
      {text}{stale ? ' · stale' : ''}
    </span>
  )
}

export default function WsTrends() {
  const confirmDelete = useConfirmDelete()
  const { toast } = useToast()
  const { rows, insert, update, remove } = useWsTable<WsTrend>('ws_trends', 'observed_on', false)
  const content = useWsTable<WsContent>('ws_content')

  const [brandFilter, setBrandFilter] = useState<'All' | 'STB' | 'ALTO'>('All')
  const [kindFilter, setKindFilter] = useState<'All' | TrendKind>('All')
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({
    kind: 'hashtag' as TrendKind, brand: 'Both' as WsTrend['brand'],
    label: '', url: '', notes: '', observed_on: wsTodayISO(),
  })

  const visible = useMemo(() => (rows ?? []).filter((t) => {
    if (!showArchived && (t.status === 'used' || t.status === 'passed')) return false
    if (brandFilter !== 'All' && t.brand !== brandFilter && t.brand !== 'Both') return false
    if (kindFilter !== 'All' && t.kind !== kindFilter) return false
    return true
  }), [rows, brandFilter, kindFilter, showArchived])

  const freshCount = (rows ?? []).filter(
    (t) => trendAgeDays(t.observed_on) <= TREND_STALE_DAYS && t.status !== 'passed' && t.status !== 'used',
  ).length

  const lastResearch = (rows ?? []).reduce<string>((max, t) => (t.observed_on > max ? t.observed_on : max), '')
  const daysSinceResearch = lastResearch ? trendAgeDays(lastResearch) : null

  const add = async () => {
    if (!draft.label.trim()) return
    await insert({
      kind: draft.kind, brand: draft.brand, label: draft.label.trim(),
      url: draft.url.trim(), notes: draft.notes.trim(), observed_on: draft.observed_on,
    } as Partial<WsTrend>)
    setDraft({ kind: draft.kind, brand: draft.brand, label: '', url: '', notes: '', observed_on: wsTodayISO() })
    toast('Trend logged')
  }

  const sendToIdeas = async (t: WsTrend) => {
    await content.insert({
      title: `Trend: ${t.label}`,
      brand: t.brand === 'Both' ? 'STB' : t.brand,
      stage: 'ideas',
      idea: `Ride the ${kindLabel(t.kind).toLowerCase()} “${t.label}”.${t.notes ? ` ${t.notes}` : ''}`,
      notes: `From the Trend Board — observed ${t.observed_on} via ${t.source}.${t.url ? `\n${t.url}` : ''}`,
    } as Partial<WsContent>)
    await update(t.id, { status: 'using' } as Partial<WsTrend>)
    toast('Added to Content → Ideas')
  }

  return (
    <WsShell
      title="Trend Board"
      subtitle="What’s working on the platforms right now — researched weekly, dated, and fed into AI Studio"
      action={<Button onClick={() => setAdding((v) => !v)}><IconPlus width={15} height={15} /> Log a trend</Button>}
    >
      {/* Research prompt — the actual weekly workflow, one click away */}
      <Card className="p-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Weekly research: TikTok Creative Center
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Free, no account needed. Check Hashtags, Songs, Top Ads and Creators — filter to Home Improvement
              or Real Estate — then log what’s relevant here. Full steps are in <b>SOPs → Weekly Trend Research</b>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {daysSinceResearch !== null && (
              <span className="text-[11px] font-semibold px-2 py-1 rounded"
                style={{
                  background: daysSinceResearch > 7 ? 'color-mix(in srgb, #d97706 12%, transparent)' : 'color-mix(in srgb, #059669 12%, transparent)',
                  color: daysSinceResearch > 7 ? '#d97706' : '#059669',
                }}>
                {daysSinceResearch === 0 ? 'Researched today' : `Last logged ${daysSinceResearch}d ago`}
              </span>
            )}
            <a href={CREATIVE_CENTER} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
              <IconLink width={14} height={14} /> Open Creative Center
            </a>
          </div>
        </div>
      </Card>

      {adding && (
        <Card className="p-4 mb-5">
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Type
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TrendKind })}
                className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Relevant to
              <select value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value as WsTrend['brand'] })}
                className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                <option value="Both">Both</option>
                <option value="STB">STB</option>
                <option value="ALTO">ALTO</option>
              </select>
            </label>
            <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>
              What is it? <span className="font-normal">({KINDS.find((k) => k.id === draft.kind)?.hint})</span>
              <Input autoFocus value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
                placeholder="#homerenovation / “Oh No” sound / cost-breakdown POV…" className="mt-1 font-normal" />
            </label>
            <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Link (optional)
              <Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://…" className="mt-1 font-normal" />
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Seen on
              <input type="date" value={draft.observed_on} onChange={(e) => setDraft({ ...draft, observed_on: e.target.value })}
                className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
            </label>
            <label className="text-xs font-semibold sm:col-span-4" style={{ color: 'var(--color-muted)' }}>
              Why it applies to us <span className="font-normal">— this note is what the AI writes from, so be specific</span>
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2}
                placeholder="e.g. Buyers keep asking what a remodel really costs — this format answers that head-on."
                className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={() => void add()}>Log trend</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Done</Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 items-center" style={{ scrollbarWidth: 'none' }}>
        {(['All', 'STB', 'ALTO'] as const).map((b) => (
          <button key={b} onClick={() => setBrandFilter(b)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: brandFilter === b ? 'var(--color-accent)' : 'var(--color-surface)',
              color: brandFilter === b ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {b}
          </button>
        ))}
        <span className="mx-1 self-center h-5 w-px shrink-0" style={{ background: 'var(--color-border)' }} />
        {(['All', ...KINDS.map((k) => k.id)] as const).map((k) => (
          <button key={k} onClick={() => setKindFilter(k as 'All' | TrendKind)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: kindFilter === k ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
              color: kindFilter === k ? 'var(--color-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {k === 'All' ? 'All types' : kindLabel(k as TrendKind)}
          </button>
        ))}
        <span className="mx-1 self-center h-5 w-px shrink-0" style={{ background: 'var(--color-border)' }} />
        <button onClick={() => setShowArchived((v) => !v)}
          className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
          style={{
            background: showArchived ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
            color: showArchived ? 'var(--color-accent)' : 'var(--color-muted)',
            border: '1px solid var(--color-border)',
          }}>
          {showArchived ? 'Hiding nothing' : 'Show used & passed'}
        </button>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<IconSpark width={34} height={34} />} title="No trends logged yet"
            hint="Open Creative Center above, spend 15 minutes, and log what you find. AI Studio drafts from whatever lands here." />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((t) => {
              const status = STATUSES.find((s) => s.id === t.status)!
              return (
                <Card key={t.id} className="p-4 flex flex-col">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>{kindLabel(t.kind)}</span>
                    <BrandBadge brand={t.brand} />
                    <Freshness observedOn={t.observed_on} />
                  </div>

                  {t.url ? (
                    <a href={t.url} target="_blank" rel="noreferrer" className="text-[15px] font-semibold leading-snug hover:underline"
                      style={{ color: 'var(--color-text)' }}>{t.label}</a>
                  ) : (
                    <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{t.label}</p>
                  )}

                  {t.notes && <p className="text-xs mt-1.5 leading-relaxed flex-1" style={{ color: 'var(--color-muted)' }}>{t.notes}</p>}

                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <select value={t.status} onChange={(e) => void update(t.id, { status: e.target.value as WsTrend['status'] } as Partial<WsTrend>)}
                      className="rounded-lg px-2 py-1 text-[11px] font-bold outline-none"
                      style={{ background: `color-mix(in srgb, ${status.color} 12%, transparent)`, color: status.color, border: 'none' }}>
                      {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button onClick={() => void sendToIdeas(t)} className="text-[11px] font-bold ml-auto" style={{ color: 'var(--color-accent)' }}>
                      → Ideas
                    </button>
                    <button onClick={() => confirmDelete({ label: `“${t.label}”`, onConfirm: () => void remove(t.id) })}
                      style={{ color: 'var(--color-muted)' }} aria-label="Delete"><IconTrash width={13} height={13} /></button>
                  </div>
                </Card>
              )
            })}
          </div>

          <p className="text-[11px] mt-4 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {freshCount} active trend{freshCount === 1 ? '' : 's'} are passed to AI Studio as research context.
            Anything older than {TREND_STALE_DAYS} days is held back — stale trends produce stale ideas.
          </p>
        </>
      )}
    </WsShell>
  )
}
