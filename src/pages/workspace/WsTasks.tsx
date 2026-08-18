import { useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { Card, Button, Input } from '../../components/ui'
import { IconCheck, IconPlus, IconTrash, IconTasks } from '../../components/icons'
import { WsShell, PriorityBadge, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import {
  useWorkspace, useWsTable, TASK_CATEGORIES, WS_PRIORITIES, ASSISTANT_NAME, type WsTask,
} from '../../lib/workspace'

/**
 * Weekly task planner — mirrors the Personal OS business planner: the week's
 * days across the top (tap a day's + to schedule straight onto it) and a
 * Master List below showing every open task with its day badge and project
 * logo. Checking a task moves it to Completed with a timestamp. All of it is
 * the shared ws_tasks table, so Rolando and Carlos see the same board live.
 */

const LISTS: { id: WsTask['status']; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'Completed' },
]

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const WDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Drag-and-drop planning: any task can be picked up and dropped on a day
 * column (schedules it there) or back on the Master List (unschedules it).
 *
 * Activation is deliberately not instant. On mouse the pointer must travel
 * 6px before a drag starts, so every click on a checkbox or title still lands
 * as a click. On touch the finger must HOLD for a beat first — a quick swipe
 * scrolls the day strip like it always did, a hold lifts the task. Without
 * that split, drag and scroll fight over every touch and the phone loses.
 */

/** A task row anyone can pick up. Renders the <li> itself so it slots into
 * the existing lists, and fades while its ghost travels in the DragOverlay. */
function DragRow({ id, className, style, children }: {
  id: string; className?: string; style?: React.CSSProperties; children: React.ReactNode
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id })
  return (
    <li ref={setNodeRef} {...listeners} {...attributes} className={className}
      style={{ ...style, opacity: isDragging ? 0.35 : 1, touchAction: 'manipulation', cursor: 'grab' }}>
      {children}
    </li>
  )
}

/** A surface a task can land on. Lights up while a drag hovers over it. */
function DropZone({ id, className, children }: { id: string; className?: string; children: (over: boolean) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={className}>{children(isOver)}</div>
}

// ---- Local date helpers (all local-time, YYYY-MM-DD) ----------------------
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)) }
const monthShort = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
}

/** Project logo for a task's category (Personal shows a quiet dot). */
function CatLogo({ cat, size = 15 }: { cat: WsTask['category']; size?: number }) {
  if (cat === 'STB') return <img src="/logos/stb.png" alt="STB" title="South Texas Builders" draggable={false} style={{ height: size, width: 'auto', maxWidth: size * 2.4, objectFit: 'contain' }} />
  if (cat === 'ALTO') return <img src="/logos/alto.png" alt="ALTO" title="Alto-Pro" draggable={false} style={{ height: size, width: 'auto', maxWidth: size * 2.4, objectFit: 'contain' }} />
  if (cat === 'Content') return <img src="/logos/bonalti.png" alt="Content" title="Content" draggable={false} style={{ height: size * 0.62, width: 'auto', maxWidth: size * 4.4, objectFit: 'contain', filter: 'invert(0.75)' }} />
  return <span title="Personal" className="rounded-full shrink-0" style={{ width: 7, height: 7, background: 'var(--color-border)' }} />
}

export default function WsTasks() {
  const { role } = useWorkspace()
  const confirmDelete = useConfirmDelete()
  const { rows, insert, update, remove } = useWsTable<WsTask>('ws_tasks')

  const [weekOff, setWeekOff] = useState(0)
  const [catFilter, setCatFilter] = useState<'All' | WsTask['category']>('All')
  const [draft, setDraft] = useState('')
  const [dayDrafts, setDayDrafts] = useState<Record<string, string>>({})
  const [addingDay, setAddingDay] = useState<string | null>(null)
  const [selected, setSelected] = useState<WsTask | null>(null)
  const escRef = useRef(false) // Escape cancels a day-add without saving on blur
  // Which company/project a newly added task belongs to. Chosen with the logo
  // picker next to the add box and reused for day-column adds.
  const [newCat, setNewCat] = useState<WsTask['category']>('Content')

  const today = toISO(new Date())
  const monday = addDays(startOfWeek(new Date()), weekOff * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const weekISO = days.map(toISO)
  const weekLabel = `${monthShort(days[0])} ${days[0].getDate()} – ${monthShort(days[6])} ${days[6].getDate()}`

  const all = rows ?? []
  const open = all.filter((t) => t.status !== 'done')
  const byCat = (t: WsTask) => catFilter === 'All' || t.category === catFilter

  // Master-list groups
  const inbox = open.filter((t) => !t.due && byCat(t))
  const thisWeek = open.filter((t) => t.due && weekISO.includes(t.due) && byCat(t))
    .sort((a, b) => weekISO.indexOf(a.due!) - weekISO.indexOf(b.due!) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const other = open.filter((t) => t.due && !weekISO.includes(t.due) && byCat(t))
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''))
  const doneList = all.filter((t) => t.status === 'done' && byCat(t))
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).slice(0, 30)

  const dayBadge = (iso: string) => {
    const i = weekISO.indexOf(iso)
    if (i >= 0) return WDAY_SHORT[i]
    const d = new Date(iso + 'T00:00:00')
    return `${monthShort(d)} ${d.getDate()}`
  }

  const scheduleStatus = (iso: string | null): WsTask['status'] => (!iso ? 'inbox' : iso === today ? 'today' : 'upcoming')

  const addTo = async (iso: string | null, title: string) => {
    const t = title.trim()
    if (!t) return
    await insert({
      title: t,
      due: iso,
      status: scheduleStatus(iso),
      category: newCat,
      assigned_by: role === 'owner' ? 'owner' : 'assistant',
    } as Partial<WsTask>)
  }

  const toggleDone = (t: WsTask) => {
    if (t.status === 'done') void update(t.id, { status: scheduleStatus(t.due), completed_at: null } as Partial<WsTask>)
    else void update(t.id, { status: 'done', completed_at: new Date().toISOString() } as Partial<WsTask>)
  }

  // ---- Drag to plan -------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )
  const [dragTask, setDragTask] = useState<WsTask | null>(null)

  const onDragStart = (e: DragStartEvent) => {
    setDragTask(all.find((t) => t.id === String(e.active.id)) ?? null)
  }

  /** Drop targets are day ISO dates plus 'unschedule' (the Master List).
   * A completed task keeps its checkmark wherever it is dropped — moving a
   * task is planning, not un-finishing it. */
  const onDragEnd = (e: DragEndEvent) => {
    const t = dragTask
    setDragTask(null)
    if (!t || !e.over) return
    const dest = String(e.over.id)
    const iso = dest === 'unschedule' ? null : dest
    if (iso === t.due) return
    void update(t.id, {
      due: iso,
      status: t.status === 'done' ? 'done' : t.status === 'waiting' ? 'waiting' : scheduleStatus(iso),
    } as Partial<WsTask>)
  }

  const patchSelected = (values: Partial<WsTask>) => {
    if (!selected) return
    setSelected({ ...selected, ...values })
    void update(selected.id, values)
  }

  const Row = ({ t, badge }: { t: WsTask; badge?: string }) => {
    const done = t.status === 'done'
    return (
      <DragRow id={t.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-2"
        style={{ background: selected?.id === t.id ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))' : 'var(--color-bg)' }}>
        <button onClick={() => toggleDone(t)} className="h-[18px] w-[18px] rounded grid place-items-center shrink-0"
          style={{ border: '2px solid var(--color-accent)', background: done ? 'var(--color-accent)' : 'transparent' }} aria-label="Toggle done">
          {done && <IconCheck width={11} height={11} style={{ color: 'var(--color-on-accent)' }} />}
        </button>
        <CatLogo cat={t.category} />
        <button onClick={() => setSelected(t)} className="flex-1 min-w-0 text-left">
          <span className="text-sm" style={{ color: done ? 'var(--color-muted)' : 'var(--color-text)', opacity: done ? 0.65 : 1 }}>{t.title}</span>
          {t.status === 'waiting' && t.waiting_on && <span className="text-xs ml-1.5" style={{ color: '#d97706' }}>⏳ {t.waiting_on}</span>}
        </button>
        {t.priority === 'High' && !done && <PriorityBadge priority={t.priority} />}
        {t.assigned_by === 'owner' && role === 'assistant' && !done && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', color: 'var(--color-accent)' }}>From Rolando</span>
        )}
        {badge && <span className="text-[10px] font-bold tnum px-1.5 py-0.5 rounded-md shrink-0" style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}>{badge}</span>}
        {done && t.completed_at && <span className="text-[10px] tnum shrink-0" style={{ color: 'var(--color-muted)' }}>{new Date(t.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        <button onClick={() => confirmDelete({ label: `“${t.title}”`, onConfirm: () => { void remove(t.id); if (selected?.id === t.id) setSelected(null) } })}
          className="opacity-0 group-hover:opacity-60 shrink-0" style={{ color: 'var(--color-muted)' }} aria-label="Delete">
          <IconTrash width={13} height={13} />
        </button>
      </DragRow>
    )
  }

  // One editor, rendered in the desktop side panel and the phone bottom sheet.
  const editor = selected && (
    <div className="flex flex-col gap-3">
      <Input value={selected.title} onChange={(e) => patchSelected({ title: e.target.value } as Partial<WsTask>)} />
      <div>
        <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Company</span>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {TASK_CATEGORIES.map((c) => {
            const on = selected.category === c
            return (
              <button key={c} onClick={() => patchSelected({ category: c } as Partial<WsTask>)} title={c}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition"
                style={{
                  background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : 'var(--color-bg)',
                  border: on ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                }}>
                <CatLogo cat={c} size={16} />
                {c === 'Personal' && <span className="text-[11px] font-semibold" style={{ color: on ? 'var(--color-accent)' : 'var(--color-muted)' }}>Personal</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Day / date
          <input type="date" value={selected.due || ''} onChange={(e) => { const v = e.target.value || null; patchSelected({ due: v, status: selected.status === 'done' ? 'done' : selected.status === 'waiting' ? 'waiting' : scheduleStatus(v) } as Partial<WsTask>) }}
            className="w-full rounded-xl px-2.5 py-2.5 text-sm outline-none mt-1 font-normal" style={wsField} />
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Priority
          <select value={selected.priority} onChange={(e) => patchSelected({ priority: e.target.value as WsTask['priority'] } as Partial<WsTask>)}
            className="w-full rounded-xl px-2.5 py-2.5 text-sm outline-none mt-1 font-normal" style={wsField}>
            {WS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold col-span-2" style={{ color: 'var(--color-muted)' }}>Status
          <select value={selected.status} onChange={(e) => patchSelected({ status: e.target.value as WsTask['status'], completed_at: e.target.value === 'done' ? new Date().toISOString() : null } as Partial<WsTask>)}
            className="w-full rounded-xl px-2.5 py-2.5 text-sm outline-none mt-1 font-normal" style={wsField}>
            {LISTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
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
      <div className="flex justify-between items-center gap-3">
        <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
          Added by {selected.assigned_by === 'owner' ? 'Rolando' : ASSISTANT_NAME}
        </span>
        <Button onClick={() => setSelected(null)}>Done</Button>
      </div>
    </div>
  )

  return (
    <WsShell
      title="Tasks"
      subtitle={role === 'owner' ? `Plan ${ASSISTANT_NAME}'s week — anything you add here is assigned to him` : 'Plan your week, then work the list'}
    >
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragTask(null)}>
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOff((n) => n - 1)} className="h-8 w-8 rounded-full grid place-items-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} aria-label="Previous week">‹</button>
          <div className="text-center min-w-[150px]">
            <div className="font-bold leading-tight" style={{ color: 'var(--color-text)' }}>Week {isoWeek(days[0])}</div>
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{weekLabel}</div>
          </div>
          <button onClick={() => setWeekOff((n) => n + 1)} className="h-8 w-8 rounded-full grid place-items-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} aria-label="Next week">›</button>
          {weekOff !== 0 && <Button variant="ghost" onClick={() => setWeekOff(0)}>Today</Button>}
        </div>
        {/* Project filter */}
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {(['All', ...TASK_CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => { setCatFilter(c); if (c !== 'All') setNewCat(c) }}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
              style={{
                background: catFilter === c ? 'var(--color-accent)' : 'var(--color-surface)',
                color: catFilter === c ? 'var(--color-on-accent)' : 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Day columns */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'thin' }}>
        {days.map((d, i) => {
          const iso = weekISO[i]
          const isToday = iso === today
          const dayTasks = all.filter((t) => t.due === iso && byCat(t))
            .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
          return (
            <DropZone key={iso} id={iso} className="shrink-0 w-[168px] flex">
              {(over) => (
            <Card className="p-3 flex-1 flex flex-col transition-shadow"
              style={{
                border: over ? '1.5px solid var(--color-accent)' : isToday ? '1.5px solid var(--color-accent)' : undefined,
                boxShadow: over ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent)' : undefined,
                background: over ? 'color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))' : undefined,
              }}>
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-bold text-sm" style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-text)' }}>{WDAY_SHORT[i]}</span>
                <span className="text-xs tnum" style={{ color: 'var(--color-muted)' }}>{monthShort(d)} {d.getDate()}</span>
              </div>
              <ul className="flex flex-col gap-1.5 flex-1 min-h-[60px]">
                {dayTasks.map((t) => {
                  const done = t.status === 'done'
                  return (
                    <DragRow key={t.id} id={t.id} className="flex items-start gap-1.5">
                      <button onClick={() => toggleDone(t)} className="h-4 w-4 rounded grid place-items-center shrink-0 mt-0.5"
                        style={{ border: '2px solid var(--color-accent)', background: done ? 'var(--color-accent)' : 'transparent' }} aria-label="Toggle done">
                        {done && <IconCheck width={10} height={10} style={{ color: 'var(--color-on-accent)' }} />}
                      </button>
                      <button onClick={() => setSelected(t)} className="flex-1 min-w-0 text-left">
                        <span className="text-xs leading-snug block" style={{ color: done ? 'var(--color-muted)' : 'var(--color-text)', opacity: done ? 0.6 : 1 }}>{t.title}</span>
                        <span className="mt-0.5 inline-flex"><CatLogo cat={t.category} size={11} /></span>
                      </button>
                    </DragRow>
                  )
                })}
              </ul>
              {addingDay === iso ? (
                <input
                  autoFocus
                  value={dayDrafts[iso] ?? ''}
                  onChange={(e) => setDayDrafts((p) => ({ ...p, [iso]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { void addTo(iso, dayDrafts[iso] ?? ''); setDayDrafts((p) => ({ ...p, [iso]: '' })) }
                    if (e.key === 'Escape') { escRef.current = true; setDayDrafts((p) => ({ ...p, [iso]: '' })); setAddingDay(null) }
                  }}
                  onBlur={() => {
                    if (escRef.current) { escRef.current = false; return }
                    void addTo(iso, dayDrafts[iso] ?? ''); setDayDrafts((p) => ({ ...p, [iso]: '' })); setAddingDay(null)
                  }}
                  placeholder="Task…"
                  className="w-full rounded-lg px-2 py-1.5 text-xs outline-none mt-1.5"
                  style={wsField}
                />
              ) : (
                <button onClick={() => setAddingDay(iso)} className="text-xs font-semibold text-left mt-1.5" style={{ color: 'var(--color-accent)' }}>+ Add</button>
              )}
            </Card>
              )}
            </DropZone>
          )
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        {/* Master List — also the drop target that takes a task OFF a day */}
        <DropZone id="unschedule">
          {(over) => (
        <Card className="p-4"
          style={over ? { border: '1.5px solid var(--color-accent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent)' } : undefined}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>Master List</h3>
            <span className="text-xs tnum" style={{ color: 'var(--color-muted)' }}>{inbox.length + thisWeek.length + other.length} open</span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>Every open task — check one off and it moves to Completed.</p>

          {/* Company picker — every task is assigned to a project by its logo */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] shrink-0" style={{ color: 'var(--color-muted)' }}>Assign to</span>
            {TASK_CATEGORIES.map((c) => {
              const on = newCat === c
              // The logo identifies the company on its own — only Personal,
              // which has no mark, carries a text label.
              return (
                <button key={c} onClick={() => setNewCat(c)} title={c}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition"
                  style={{
                    background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : 'var(--color-bg)',
                    border: on ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                  }}>
                  <CatLogo cat={c} size={16} />
                  {c === 'Personal' && <span className="text-[11px] font-semibold" style={{ color: on ? 'var(--color-accent)' : 'var(--color-muted)' }}>Personal</span>}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 mb-4">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { void addTo(null, draft); setDraft('') } }}
              placeholder={role === 'owner' ? `Assign a task to ${ASSISTANT_NAME}…` : 'Add a task…'} />
            <Button onClick={() => { void addTo(null, draft); setDraft('') }}><IconPlus width={15} height={15} /> Add</Button>
          </div>

          {inbox.length === 0 && thisWeek.length === 0 && other.length === 0 && doneList.length === 0 && (
            <div className="py-8 text-center" style={{ color: 'var(--color-muted)' }}>
              <IconTasks width={30} height={30} style={{ margin: '0 auto 8px' }} />
              <p className="text-sm">Nothing here yet — add a task above or on a day.</p>
            </div>
          )}

          {inbox.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--color-muted)' }}>Inbox — pick a day</h4>
              <ul className="flex flex-col gap-1.5">{inbox.map((t) => <Row key={t.id} t={t} />)}</ul>
            </div>
          )}

          {thisWeek.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--color-muted)' }}>This week</h4>
              <ul className="flex flex-col gap-1.5">{thisWeek.map((t) => <Row key={t.id} t={t} badge={dayBadge(t.due!)} />)}</ul>
            </div>
          )}

          {other.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--color-muted)' }}>Other dates</h4>
              <ul className="flex flex-col gap-1.5">{other.map((t) => <Row key={t.id} t={t} badge={dayBadge(t.due!)} />)}</ul>
            </div>
          )}

          {doneList.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--color-muted)' }}>Completed</h4>
              <ul className="flex flex-col gap-1.5">{doneList.map((t) => <Row key={t.id} t={t} />)}</ul>
            </div>
          )}
        </Card>
          )}
        </DropZone>

        {/* Detail editor — sticky side panel on desktop */}
        <Card className="p-4 h-fit lg:sticky lg:top-6 hidden lg:block">
          {!selected
            ? <p className="text-sm py-8 text-center" style={{ color: 'var(--color-muted)' }}>Select a task to edit its details.</p>
            : editor}
        </Card>
      </div>

      {/* Phone: the same editor as a bottom sheet, so tapping a task never
          scrolls you away from the list. */}
      {/* The travelling ghost. A DragOverlay escapes the scroll containers,
          so the task stays visible even when its column is clipped. */}
      <DragOverlay dropAnimation={null}>
        {dragTask && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{
              background: 'var(--color-surface)', color: 'var(--color-text)',
              border: '1.5px solid var(--color-accent)', boxShadow: '0 12px 32px -8px rgba(0,0,0,0.45)',
              cursor: 'grabbing', maxWidth: 240,
            }}>
            <CatLogo cat={dragTask.category} size={14} />
            <span className="truncate">{dragTask.title}</span>
          </div>
        )}
      </DragOverlay>
      </DndContext>

      {selected && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSelected(null)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl p-4 max-h-[88vh] overflow-y-auto"
            style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', boxShadow: '0 -12px 40px -12px rgba(0,0,0,0.4)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
            <div className="mx-auto mb-3 rounded-full" style={{ width: 40, height: 4, background: 'var(--color-border)' }} />
            {editor}
          </div>
        </div>
      )}
    </WsShell>
  )
}
