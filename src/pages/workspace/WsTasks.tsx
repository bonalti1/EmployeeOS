import { useMemo, useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconCheck, IconPlus, IconTrash, IconTasks } from '../../components/icons'
import { WsShell, BrandBadge, PriorityBadge, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import {
  useWorkspace, useWsTable, fmtWsDate, TASK_CATEGORIES, WS_PRIORITIES, type WsTask,
} from '../../lib/workspace'

const LISTS: { id: WsTask['status']; label: string; hint: string }[] = [
  { id: 'inbox', label: 'Inbox', hint: 'New and unsorted — triage into Today / Upcoming.' },
  { id: 'today', label: 'Today', hint: 'What gets done today.' },
  { id: 'upcoming', label: 'Upcoming', hint: 'Scheduled for later.' },
  { id: 'waiting', label: 'Waiting', hint: 'Blocked on someone or something.' },
  { id: 'done', label: 'Completed', hint: 'Finished work.' },
]

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

export default function WsTasks() {
  const { role } = useWorkspace()
  const confirmDelete = useConfirmDelete()
  const { rows, insert, update, remove } = useWsTable<WsTask>('ws_tasks')

  const [list, setList] = useState<WsTask['status']>('inbox')
  const [catFilter, setCatFilter] = useState<'All' | WsTask['category']>('All')
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<WsTask | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const t of rows ?? []) c[t.status] = (c[t.status] || 0) + 1
    return c
  }, [rows])

  const visible = (rows ?? [])
    .filter((t) => t.status === list && (catFilter === 'All' || t.category === catFilter))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due || '9999').localeCompare(b.due || '9999'))

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    await insert({
      title,
      status: list === 'done' ? 'inbox' : list,
      category: catFilter === 'All' ? 'Personal' : catFilter,
      assigned_by: role === 'owner' ? 'owner' : 'assistant',
    } as Partial<WsTask>)
    setDraft('')
  }

  const toggleDone = (t: WsTask) => {
    if (t.status === 'done') void update(t.id, { status: 'inbox', completed_at: null } as Partial<WsTask>)
    else void update(t.id, { status: 'done', completed_at: new Date().toISOString() } as Partial<WsTask>)
  }

  const patchSelected = (values: Partial<WsTask>) => {
    if (!selected) return
    setSelected({ ...selected, ...values })
    void update(selected.id, values)
  }

  return (
    <WsShell
      title="Tasks"
      subtitle={role === 'owner' ? 'Anything you add here is assigned to your assistant' : 'Everything on your plate, in one place'}
    >
      {/* List switcher */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
        {LISTS.map((l) => (
          <button key={l.id} onClick={() => setList(l.id)}
            className="px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition"
            style={{
              background: list === l.id ? 'var(--color-accent)' : 'var(--color-surface)',
              color: list === l.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {l.label}{counts[l.id] ? ` · ${counts[l.id]}` : ''}
          </button>
        ))}
        <span className="mx-1 self-center h-5 w-px shrink-0" style={{ background: 'var(--color-border)' }} />
        {(['All', ...TASK_CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setCatFilter(c)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: catFilter === c ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
              color: catFilter === c ? 'var(--color-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-4">
          <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>{LISTS.find((l) => l.id === list)?.hint}</p>
          {list !== 'done' && (
            <div className="flex gap-2 mb-3">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
                placeholder={role === 'owner' ? `Assign a task to your assistant (goes to ${list})…` : `Add a task to ${list}…`} />
              <Button onClick={() => void add()}><IconPlus width={15} height={15} /> Add</Button>
            </div>
          )}
          {visible.length === 0 ? (
            <EmptyState icon={<IconTasks width={34} height={34} />} title={`Nothing in ${LISTS.find((l) => l.id === list)?.label}`} />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visible.map((t) => (
                <li key={t.id} className="group flex items-start gap-2 rounded-lg px-2 py-2"
                  style={{ background: selected?.id === t.id ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))' : 'var(--color-bg)' }}>
                  <button onClick={() => toggleDone(t)} className="h-4 w-4 rounded grid place-items-center shrink-0 mt-0.5"
                    style={{ border: '2px solid var(--color-accent)', background: t.status === 'done' ? 'var(--color-accent)' : 'transparent' }} aria-label="Toggle done">
                    {t.status === 'done' && <IconCheck width={11} height={11} style={{ color: 'var(--color-on-accent)' }} />}
                  </button>
                  <button onClick={() => setSelected(t)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm" style={{ color: 'var(--color-text)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.5 : 1 }}>{t.title}</span>
                      {t.category !== 'Personal' && <BrandBadge brand={t.category} />}
                      <PriorityBadge priority={t.priority} />
                      {t.assigned_by === 'owner' && role === 'assistant' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', color: 'var(--color-accent)' }}>From Rolando</span>
                      )}
                    </div>
                    {(t.notes || (t.status === 'waiting' && t.waiting_on)) && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                        {t.status === 'waiting' && t.waiting_on ? `Waiting on: ${t.waiting_on}` : t.notes}
                      </p>
                    )}
                  </button>
                  {t.due && <span className="text-[10px] font-semibold tnum shrink-0 mt-1" style={{ color: 'var(--color-accent)' }}>{fmtWsDate(t.due)}</span>}
                  <button
                    onClick={() => confirmDelete({ label: `“${t.title}”`, onConfirm: () => { void remove(t.id); if (selected?.id === t.id) setSelected(null) } })}
                    className="opacity-0 group-hover:opacity-60 shrink-0 mt-1" style={{ color: 'var(--color-muted)' }} aria-label="Delete">
                    <IconTrash width={13} height={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Detail editor */}
        <Card className="p-4 h-fit lg:sticky lg:top-6">
          {!selected ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--color-muted)' }}>Select a task to edit its details.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <Input value={selected.title} onChange={(e) => patchSelected({ title: e.target.value } as Partial<WsTask>)} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Status
                  <select value={selected.status} onChange={(e) => patchSelected({ status: e.target.value as WsTask['status'] } as Partial<WsTask>)}
                    className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                    {LISTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Category
                  <select value={selected.category} onChange={(e) => patchSelected({ category: e.target.value as WsTask['category'] } as Partial<WsTask>)}
                    className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                    {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Priority
                  <select value={selected.priority} onChange={(e) => patchSelected({ priority: e.target.value as WsTask['priority'] } as Partial<WsTask>)}
                    className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
                    {WS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Due date
                  <input type="date" value={selected.due || ''} onChange={(e) => patchSelected({ due: e.target.value || null } as Partial<WsTask>)}
                    className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
                </label>
              </div>
              {selected.status === 'waiting' && (
                <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Waiting on
                  <Input value={selected.waiting_on} onChange={(e) => patchSelected({ waiting_on: e.target.value } as Partial<WsTask>)}
                    placeholder="Who or what is this blocked on?" className="mt-1 font-normal" />
                </label>
              )}
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Notes
                <textarea value={selected.notes} onChange={(e) => patchSelected({ notes: e.target.value } as Partial<WsTask>)}
                  rows={4} className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
              </label>
              <div className="flex justify-between items-center">
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  Added by {selected.assigned_by === 'owner' ? 'Rolando' : 'assistant'}
                </span>
                <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </WsShell>
  )
}
