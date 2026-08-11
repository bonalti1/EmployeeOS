import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconPlus, IconSearch, IconSpark } from '../../components/icons'
import { PriorityBadge, wsField } from '../../components/WorkspaceLayout'
import { useWorkspace, ASSISTANT_NAME } from '../../lib/workspace'
import {
  useMktCompany, useMktTable, fmtMktDate, IDEA_STATUSES,
  type MktIdea, type MktCampaign,
} from '../../lib/marketing'

/**
 * Idea Center — quick capture on top, idea cards below. One required field to
 * capture; everything else is developed later in the Idea Studio.
 */

const STATUS_COLORS: Record<string, string> = {
  idea: '#6b7280', developing: '#d97706', ready: '#2563eb',
  approved: '#059669', published: '#7c3aed', archived: '#9ca3af',
}

export default function MktIdeas() {
  const navigate = useNavigate()
  const { role } = useWorkspace()
  const { company } = useMktCompany()
  const ideas = useMktTable<MktIdea>('mkt_ideas', company?.id ?? null)
  const campaigns = useMktTable<MktCampaign>('mkt_campaigns', company?.id ?? null)

  const [draft, setDraft] = useState('')
  const [view, setView] = useState<'all' | MktIdea['status']>('all')
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  const allTags = useMemo(() => {
    const t = new Set<string>()
    for (const i of ideas.rows ?? []) for (const tag of i.tags) t.add(tag)
    return [...t].sort()
  }, [ideas.rows])

  const visible = (ideas.rows ?? []).filter((i) => {
    if (view === 'all' ? i.status === 'archived' : i.status !== view) return false
    if (tagFilter && !i.tags.includes(tagFilter)) return false
    if (query) {
      const q = query.toLowerCase()
      if (!`${i.title} ${i.raw_idea} ${i.notes}`.toLowerCase().includes(q)) return false
    }
    return true
  })

  const capture = async () => {
    const text = draft.trim()
    if (!text || !company) return
    const created = await ideas.insert({
      raw_idea: text,
      title: text.length <= 80 ? text : text.slice(0, 77) + '…',
      author_role: role ?? 'assistant',
    } as Partial<MktIdea>)
    setDraft('')
    if (created) navigate(`../idea/${created.id}`)
  }

  const latestCampaignFor = (ideaId: string) =>
    (campaigns.rows ?? []).find((c) => c.idea_id === ideaId)

  return (
    <div>
      {/* Quick capture */}
      <Card className="p-4 mb-5">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void capture() }}
            placeholder={`What's the idea for ${company?.name}? One sentence is enough…`}
          />
          <Button onClick={() => void capture()}><IconPlus width={15} height={15} /> Capture</Button>
        </div>
      </Card>

      {/* Views + search */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 items-center" style={{ scrollbarWidth: 'none' }}>
        {([{ id: 'all' as const, label: 'All' }, ...IDEA_STATUSES]).map((s) => (
          <button key={s.id} onClick={() => setView(s.id as typeof view)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: view === s.id ? 'var(--color-accent)' : 'var(--color-surface)',
              color: view === s.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {s.label}
          </button>
        ))}
        <span className="mx-1 self-center h-5 w-px shrink-0" style={{ background: 'var(--color-border)' }} />
        <div className="relative shrink-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }}>
            <IconSearch width={13} height={13} />
          </span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ideas…"
            className="rounded-full pl-7 pr-3 py-1.5 text-[12px] outline-none w-44" style={wsField} />
        </div>
        {allTags.map((t) => (
          <button key={t} onClick={() => setTagFilter(tagFilter === t ? '' : t)}
            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{
              background: tagFilter === t ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
              color: tagFilter === t ? 'var(--color-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            #{t}
          </button>
        ))}
      </div>

      {ideas.rows === null ? (
        <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading ideas…</Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon={<IconSpark width={34} height={34} />}
            title={view === 'all' ? `No ideas for ${company?.name} yet` : 'Nothing in this view'}
            hint="Capture one above — a single sentence is enough to start." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((idea) => {
            const camp = latestCampaignFor(idea.id)
            return (
              <Card key={idea.id} className="p-4 cursor-pointer transition hover:-translate-y-0.5">
                <button onClick={() => navigate(`../idea/${idea.id}`)} className="w-full text-left">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{
                        background: `color-mix(in srgb, ${STATUS_COLORS[idea.status]} 12%, transparent)`,
                        color: STATUS_COLORS[idea.status],
                      }}>
                      {IDEA_STATUSES.find((s) => s.id === idea.status)?.label}
                    </span>
                    <PriorityBadge priority={idea.priority} />
                    {idea.objective && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>{idea.objective}</span>
                    )}
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--color-muted)' }}>{fmtMktDate(idea.created_at)}</span>
                  </div>
                  <p className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
                    {idea.title || idea.raw_idea.slice(0, 80)}
                  </p>
                  {idea.title && idea.title !== idea.raw_idea && (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {idea.raw_idea}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {camp && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}>
                        {camp.selected_lens ? `Campaign · ${camp.selected_lens}` : 'Campaign started'}
                      </span>
                    )}
                    {idea.tags.map((t) => (
                      <span key={t} className="text-[10px]" style={{ color: 'var(--color-muted)' }}>#{t}</span>
                    ))}
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--color-muted)' }}>
                      {idea.author_role === 'owner' ? 'Rolando' : ASSISTANT_NAME}
                    </span>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
