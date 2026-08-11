import { useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconPlus, IconTrash, IconFilm } from '../../components/icons'
import { WsShell, BrandBadge, PriorityBadge, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useToast } from '../../lib/toast'
import {
  useWsTable, fmtWsDate, STAGES, WS_PRIORITIES, type WsContent as Item, type WsStage,
} from '../../lib/workspace'

const DRAG_MIME = 'application/x-ws-content'

const APPROVAL_LABEL: Record<Item['approval_status'], { label: string; color: string } | null> = {
  none: null,
  pending: { label: 'Awaiting approval', color: '#d97706' },
  approved: { label: 'Approved', color: '#059669' },
  changes: { label: 'Changes requested', color: '#dc2626' },
}

/** Moving into Review flags the item for Rolando's approval queue. */
function stagePatch(stage: WsStage, item: Item): Partial<Item> {
  const patch: Partial<Item> = { stage }
  if (stage === 'review') patch.approval_status = 'pending'
  else if (item.approval_status === 'pending') patch.approval_status = 'none'
  return patch
}

function ContentCard({ item, onOpen, onDragStart }: { item: Item; onOpen: () => void; onDragStart: () => void }) {
  const badge = APPROVAL_LABEL[item.approval_status]
  return (
    <button
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, '1'); e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onClick={onOpen}
      className="w-full text-left rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-1.5">
        <BrandBadge brand={item.brand} />
        {item.platform && <span className="text-[10px] font-medium truncate" style={{ color: 'var(--color-muted)' }}>{item.platform}</span>}
        <span className="ml-auto" />
        <PriorityBadge priority={item.priority} />
        {item.due && <span className="text-[10px] font-semibold tnum shrink-0" style={{ color: 'var(--color-accent)' }}>{fmtWsDate(item.due)}</span>}
      </div>
      <p className="text-[13px] font-medium mt-1 leading-snug" style={{ color: 'var(--color-text)' }}>{item.title}</p>
      {badge && (
        <span className="inline-block text-[10px] font-bold mt-1.5 px-1.5 py-0.5 rounded"
          style={{ background: `color-mix(in srgb, ${badge.color} 12%, transparent)`, color: badge.color }}>
          {badge.label}
        </span>
      )}
      {item.approval_status === 'changes' && item.approval_note && (
        <p className="text-[11px] mt-1 leading-snug" style={{ color: '#dc2626' }}>“{item.approval_note}”</p>
      )}
    </button>
  )
}

export default function WsContent() {
  const confirmDelete = useConfirmDelete()
  const { toast } = useToast()
  const { rows, insert, update, remove } = useWsTable<Item>('ws_content')

  const [brandFilter, setBrandFilter] = useState<'All' | 'STB' | 'ALTO'>('All')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftBrand, setDraftBrand] = useState<'STB' | 'ALTO'>('STB')
  const [selected, setSelected] = useState<Item | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<WsStage | null>(null)

  const visible = (rows ?? []).filter((c) => brandFilter === 'All' || c.brand === brandFilter)

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    await insert({ title, brand: draftBrand, stage: 'ideas' } as Partial<Item>)
    setDraft('')
    setAdding(false)
  }

  const moveTo = (id: string, stage: WsStage) => {
    const item = (rows ?? []).find((c) => c.id === id)
    if (!item || item.stage === stage) return
    void update(id, stagePatch(stage, item))
    if (stage === 'review') toast('Sent to Rolando for approval')
  }

  const patchSelected = (values: Partial<Item>) => {
    if (!selected) return
    setSelected({ ...selected, ...values })
    void update(selected.id, values)
  }

  const field = (label: string, key: keyof Item, placeholder: string, rows = 1) => (
    <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>{label}
      {rows === 1 ? (
        <Input value={(selected?.[key] as string) || ''} onChange={(e) => patchSelected({ [key]: e.target.value } as Partial<Item>)}
          placeholder={placeholder} className="mt-1 font-normal" />
      ) : (
        <textarea value={(selected?.[key] as string) || ''} onChange={(e) => patchSelected({ [key]: e.target.value } as Partial<Item>)}
          placeholder={placeholder} rows={rows} className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
      )}
    </label>
  )

  return (
    <WsShell
      title="Content Pipeline"
      subtitle="Ideas → Need Footage → Ready → Editing → Review → Approved → Scheduled → Published"
      action={
        <div className="flex items-center gap-2">
          {(['All', 'STB', 'ALTO'] as const).map((b) => (
            <button key={b} onClick={() => setBrandFilter(b)}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
              style={{
                background: brandFilter === b ? 'var(--color-accent)' : 'var(--color-surface)',
                color: brandFilter === b ? 'var(--color-on-accent)' : 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}>
              {b}
            </button>
          ))}
          <Button onClick={() => setAdding(true)}><IconPlus width={15} height={15} /> New idea</Button>
        </div>
      }
    >
      {adding && (
        <Card className="p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={draftBrand} onChange={(e) => setDraftBrand(e.target.value as 'STB' | 'ALTO')}
              className="rounded-xl px-3 py-2 text-sm outline-none" style={wsField}>
              <option value="STB">STB</option>
              <option value="ALTO">ALTO</option>
            </select>
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="Content idea title…" />
            <Button onClick={() => void add()}>Add to Ideas</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {(rows ?? []).length === 0 ? (
        <Card><EmptyState icon={<IconFilm width={34} height={34} />} title="No content yet" hint="Add your first idea — it starts in the Ideas column and moves right as it progresses." /></Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 items-start">
          {STAGES.map((stage) => {
            const items = visible.filter((c) => c.stage === stage.id)
            return (
              <div
                key={stage.id}
                onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setOverStage(stage.id) } }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => { e.preventDefault(); setOverStage(null); if (drag) moveTo(drag, stage.id); setDrag(null) }}
                className="w-[240px] shrink-0 rounded-2xl p-2.5 transition"
                style={{
                  background: overStage === stage.id ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))' : 'var(--color-surface)',
                  border: `1px solid ${overStage === stage.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{stage.label}</span>
                  <span className="text-[11px] font-semibold tnum" style={{ color: 'var(--color-muted)' }}>{items.length}</span>
                </div>
                <div className="flex flex-col gap-1.5 min-h-[40px]">
                  {items.map((item) => (
                    <ContentCard key={item.id} item={item} onOpen={() => setSelected(item)} onDragStart={() => setDrag(item.id)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail editor */}
      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-center px-4 py-6" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-2 mb-4">
                <BrandBadge brand={selected.brand} />
                <h2 className="text-lg font-semibold leading-tight flex-1" style={{ color: 'var(--color-text)' }}>{selected.title || 'Untitled'}</h2>
                <button
                  onClick={() => confirmDelete({ label: `“${selected.title}”`, onConfirm: () => { void remove(selected.id); setSelected(null) } })}
                  style={{ color: 'var(--color-muted)' }} aria-label="Delete"><IconTrash width={16} height={16} /></button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Company
                  <select value={selected.brand} onChange={(e) => patchSelected({ brand: e.target.value as Item['brand'] } as Partial<Item>)}
                    className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                    <option value="STB">South Texas Builders</option>
                    <option value="ALTO">ALTO Pro</option>
                  </select>
                </label>
                {field('Platform', 'platform', 'TikTok / Instagram Reels / YouTube Shorts / Facebook…')}
                <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Title
                  <Input value={selected.title} onChange={(e) => patchSelected({ title: e.target.value } as Partial<Item>)} className="mt-1 font-normal" />
                </label>
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Stage
                  <select value={selected.stage}
                    onChange={(e) => { const stage = e.target.value as WsStage; patchSelected(stagePatch(stage, selected)); if (stage === 'review') toast('Sent to Rolando for approval') }}
                    className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                    {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Priority
                    <select value={selected.priority} onChange={(e) => patchSelected({ priority: e.target.value as Item['priority'] } as Partial<Item>)}
                      className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                      {WS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Due date
                    <input type="date" value={selected.due || ''} onChange={(e) => patchSelected({ due: e.target.value || null } as Partial<Item>)}
                      className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
                  </label>
                </div>
                <div className="sm:col-span-2 grid gap-3">
                  {field('Idea', 'idea', 'What is this piece of content about?', 2)}
                  {field('Hook', 'hook', 'The first line that stops the scroll…', 2)}
                  {field('Script', 'script', 'Full script / shot list…', 5)}
                  {field('Caption', 'caption', 'Caption + hashtags…', 3)}
                </div>
                {field('Raw media link', 'raw_link', 'Google Drive link to raw footage…')}
                {field('Final media link', 'final_link', 'Google Drive link to the finished edit…')}
                {field('Published link', 'published_link', 'Link to the live post…')}
                {field('Notes', 'notes', 'Anything else…', 2)}
              </div>

              {selected.approval_status !== 'none' && (
                <div className="mt-4 rounded-xl px-3 py-2.5 text-sm"
                  style={{ background: `color-mix(in srgb, ${APPROVAL_LABEL[selected.approval_status]!.color} 10%, transparent)`, color: APPROVAL_LABEL[selected.approval_status]!.color }}>
                  <b>{APPROVAL_LABEL[selected.approval_status]!.label}</b>
                  {selected.approval_note && <span> — “{selected.approval_note}”</span>}
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button onClick={() => setSelected(null)}>Done</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </WsShell>
  )
}
