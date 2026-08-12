import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconTrash, IconMic, IconSpark, IconCheck } from '../../components/icons'
import { WsShell, BrandLogo, BRAND_OPTIONS, wsField } from '../../components/WorkspaceLayout'
import { transcribeBlob } from '../../lib/transcribe'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useToast } from '../../lib/toast'
import { getWsAudio, delWsAudio } from '../../lib/wsAudio'
import {
  useWorkspace, useWsTable, ASSISTANT_NAME, IDEA_CATEGORIES,
  type WsIdea, type WsContent, type WsTask,
} from '../../lib/workspace'
import { supabase } from '../../lib/supabase'

/**
 * Idea Board — the shared scratchpad.
 *
 * Capture is deliberately dumb (one box, see IdeaCapture); this page is where
 * ideas get sorted, greenlit and turned into real work. Promoting an idea
 * copies it into the Content Pipeline or Tasks and marks it shipped, so the
 * board doubles as a record of what actually got built.
 */

const STATUSES: { id: WsIdea['status']; label: string; color: string }[] = [
  { id: 'new', label: 'New', color: '#6b7280' },
  { id: 'exploring', label: 'Exploring', color: '#d97706' },
  { id: 'doing', label: 'Greenlit', color: '#2563eb' },
  { id: 'shipped', label: 'Shipped', color: '#059669' },
  { id: 'parked', label: 'Parked', color: '#9ca3af' },
]

const ago = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

function VoiceNote({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (url) return <audio src={url} controls className="w-full mt-2" style={{ height: 34 }} />
  return (
    <button
      onClick={async () => {
        setState('loading')
        const blob = await getWsAudio(id, 'ideas')
        if (blob) { setUrl(URL.createObjectURL(blob)); setState('idle') } else setState('missing')
      }}
      disabled={state === 'loading'}
      className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold"
      style={{ color: state === 'missing' ? 'var(--color-muted)' : 'var(--color-accent)' }}
    >
      <IconMic width={12} height={12} />
      {state === 'loading' ? 'Loading…' : state === 'missing' ? 'Recording unavailable' : 'Play voice note'}
    </button>
  )
}

export default function WsIdeas() {
  const { role } = useWorkspace()
  const { toast } = useToast()
  const confirmDelete = useConfirmDelete()
  const { rows, update, remove } = useWsTable<WsIdea>('ws_ideas')
  const content = useWsTable<WsContent>('ws_content')
  const tasks = useWsTable<WsTask>('ws_tasks')

  const [filter, setFilter] = useState<'active' | 'starred' | 'shipped' | 'all'>('active')
  const [category, setCategory] = useState<'All' | WsIdea['category']>('All')
  const [brandFilter, setBrandFilter] = useState<'All' | WsIdea['brand']>('All')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState<string | null>(null)

  const visible = useMemo(() => (rows ?? []).filter((i) => {
    if (category !== 'All' && i.category !== category) return false
    // "Both" belongs to every company, so it shows under any brand filter.
    if (brandFilter !== 'All' && i.brand !== brandFilter && i.brand !== 'Both') return false
    if (filter === 'active') return i.status !== 'shipped' && i.status !== 'parked'
    if (filter === 'starred') return i.starred
    if (filter === 'shipped') return i.status === 'shipped'
    return true
  }), [rows, filter, category, brandFilter])

  // Fill in the words for a voice note that saved without a transcript.
  const runTranscribe = async (idea: WsIdea) => {
    setTranscribing(idea.id)
    const blob = await getWsAudio(idea.id, 'ideas')
    const text = blob ? await transcribeBlob(blob) : null
    setTranscribing(null)
    if (!text) { toast('Could not transcribe this recording'); return }
    await update(idea.id, { text } as Partial<WsIdea>)
    toast('Transcribed')
  }

  const counts = useMemo(() => ({
    active: (rows ?? []).filter((i) => i.status !== 'shipped' && i.status !== 'parked').length,
    starred: (rows ?? []).filter((i) => i.starred).length,
    shipped: (rows ?? []).filter((i) => i.status === 'shipped').length,
  }), [rows])

  const toContent = async (idea: WsIdea) => {
    await content.insert({
      title: idea.text.slice(0, 120),
      brand: idea.brand === 'ALTO' ? 'ALTO' : 'STB',
      stage: 'ideas',
      idea: idea.text,
      notes: `From the Idea Board — added by ${idea.author_role === 'owner' ? 'Rolando' : ASSISTANT_NAME}.${idea.note ? `\n${idea.note}` : ''}`,
    } as Partial<WsContent>)
    await update(idea.id, { status: 'shipped', promoted_to: 'content' } as Partial<WsIdea>)
    toast('Sent to Content → Ideas')
  }

  /** Promote into Marketing Studio as a company-scoped marketing idea. */
  const toCampaign = async (idea: WsIdea) => {
    if (!supabase) return
    const slug = idea.brand === 'ALTO' ? 'alto' : 'stb'
    const { data: companies } = await supabase.from('mkt_companies').select('id').eq('slug', slug).limit(1)
    const companyId = companies?.[0]?.id
    if (!companyId) { toast('Run the Marketing Studio SQL first (supabase/05_marketing_studio.sql)'); return }
    await supabase.from('mkt_ideas').insert({
      company_id: companyId,
      title: idea.text.slice(0, 80),
      raw_idea: idea.text,
      notes: idea.note,
      author_role: idea.author_role,
    })
    await update(idea.id, { status: 'shipped', promoted_to: 'campaign' } as Partial<WsIdea>)
    toast(`Sent to Marketing Studio → ${slug === 'alto' ? 'ALTO Pro' : 'South Texas Builders'}`)
  }

  const toTask = async (idea: WsIdea) => {
    await tasks.insert({
      title: idea.text.slice(0, 120),
      notes: idea.note,
      status: 'inbox',
      category: idea.brand === 'STB' ? 'STB' : idea.brand === 'ALTO' ? 'ALTO' : 'Personal',
      assigned_by: role === 'owner' ? 'owner' : 'assistant',
    } as Partial<WsTask>)
    await update(idea.id, { status: 'shipped', promoted_to: 'task' } as Partial<WsIdea>)
    toast('Sent to Tasks → Inbox')
  }

  return (
    <WsShell
      title="Idea Board"
      subtitle="Anything either of us thinks of — captured fast, sorted later, promoted when it’s ready"
    >
      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 items-center" style={{ scrollbarWidth: 'none' }}>
        {([
          { id: 'active', label: `Active${counts.active ? ` · ${counts.active}` : ''}` },
          { id: 'starred', label: `★ Starred${counts.starred ? ` · ${counts.starred}` : ''}` },
          { id: 'shipped', label: `Shipped${counts.shipped ? ` · ${counts.shipped}` : ''}` },
          { id: 'all', label: 'All' },
        ] as const).map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition"
            style={{
              background: filter === f.id ? 'var(--color-accent)' : 'var(--color-surface)',
              color: filter === f.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {f.label}
          </button>
        ))}
        <span className="mx-1 self-center h-5 w-px shrink-0" style={{ background: 'var(--color-border)' }} />
        {(['All', ...IDEA_CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: category === c ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
              color: category === c ? 'var(--color-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {c}
          </button>
        ))}
        <span className="mx-1 self-center h-5 w-px shrink-0" style={{ background: 'var(--color-border)' }} />
        {/* Company — logos only */}
        <button onClick={() => setBrandFilter('All')}
          className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
          style={{
            background: brandFilter === 'All' ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
            color: brandFilter === 'All' ? 'var(--color-accent)' : 'var(--color-muted)',
            border: '1px solid var(--color-border)',
          }}>
          All
        </button>
        {BRAND_OPTIONS.map((b) => (
          <button key={b} onClick={() => setBrandFilter(b)} title={b}
            className="inline-flex items-center rounded-full px-3 py-1.5 shrink-0 transition"
            style={{
              background: brandFilter === b ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
              border: brandFilter === b ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            }}>
            <BrandLogo brand={b} size={15} />
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<IconSpark width={34} height={34} />}
            title={filter === 'active' ? 'No open ideas' : 'Nothing here yet'}
            hint="Tap the + button (bottom right, or ⌘I) from any screen to capture one in seconds — type it or say it." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((idea) => {
            const status = STATUSES.find((s) => s.id === idea.status)!
            const isOpen = expanded === idea.id
            return (
              <Card key={idea.id} className="p-4 flex flex-col">
                <div className="flex items-start gap-2">
                  <button onClick={() => void update(idea.id, { starred: !idea.starred } as Partial<WsIdea>)}
                    className="shrink-0 text-[15px] leading-none mt-0.5 transition hover:scale-110"
                    style={{ color: idea.starred ? '#f59e0b' : 'var(--color-border)' }}
                    aria-label={idea.starred ? 'Unstar' : 'Star'} title="Star the ones worth doing">
                    {idea.starred ? '★' : '☆'}
                  </button>
                  <button onClick={() => setExpanded(isOpen ? null : idea.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm leading-snug" style={{ color: 'var(--color-text)' }}>{idea.text}</p>
                  </button>
                </div>

                {idea.has_audio && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <VoiceNote id={idea.id} />
                    {/* A recording that saved without words — get them now. */}
                    {idea.text === '(voice note)' && (
                      <button onClick={() => void runTranscribe(idea)} disabled={transcribing === idea.id}
                        className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                        {transcribing === idea.id ? 'Transcribing…' : 'Transcribe'}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `color-mix(in srgb, ${status.color} 12%, transparent)`, color: status.color }}>
                    {status.label}
                  </span>
                  {idea.category !== 'Unsorted' && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>{idea.category}</span>
                  )}
                  <span className="inline-flex items-center"><BrandLogo brand={idea.brand} size={14} /></span>
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--color-muted)' }}>
                    {idea.author_role === 'owner' ? 'Rolando' : ASSISTANT_NAME} · {ago(idea.created_at)}
                  </span>
                </div>

                {idea.promoted_to && (
                  <p className="text-[11px] mt-2 flex items-center gap-1" style={{ color: '#059669' }}>
                    <IconCheck width={11} height={11} />
                    Became a {idea.promoted_to === 'content' ? 'content item' : idea.promoted_to === 'campaign' ? 'marketing campaign idea' : 'task'}
                  </p>
                )}

                {isOpen && (
                  <div className="mt-3 pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="grid grid-cols-3 gap-1.5">
                      <select value={idea.status} onChange={(e) => void update(idea.id, { status: e.target.value as WsIdea['status'] } as Partial<WsIdea>)}
                        className="rounded-lg px-1.5 py-1 text-[11px] outline-none" style={wsField}>
                        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <select value={idea.category} onChange={(e) => void update(idea.id, { category: e.target.value as WsIdea['category'] } as Partial<WsIdea>)}
                        className="rounded-lg px-1.5 py-1 text-[11px] outline-none" style={wsField}>
                        {IDEA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select value={idea.brand} onChange={(e) => void update(idea.id, { brand: e.target.value as WsIdea['brand'] } as Partial<WsIdea>)}
                        className="rounded-lg px-1.5 py-1 text-[11px] outline-none" style={wsField}>
                        <option value="Both">Both</option>
                        <option value="STB">STB</option>
                        <option value="ALTO">ALTO</option>
                        <option value="Internal">Internal</option>
                      </select>
                    </div>

                    <Input value={idea.note} onChange={(e) => void update(idea.id, { note: e.target.value } as Partial<WsIdea>)}
                      placeholder="Add a note or next step…" className="text-xs" />

                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void toContent(idea)}>→ Content</Button>
                      <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void toCampaign(idea)}>→ Campaign</Button>
                      <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void toTask(idea)}>→ Task</Button>
                      <button
                        onClick={() => confirmDelete({
                          label: `“${idea.text.slice(0, 60)}”`,
                          onConfirm: () => { if (idea.has_audio) void delWsAudio(idea.id, 'ideas'); void remove(idea.id); setExpanded(null) },
                        })}
                        className="ml-auto" style={{ color: 'var(--color-muted)' }} aria-label="Delete">
                        <IconTrash width={13} height={13} />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </WsShell>
  )
}
