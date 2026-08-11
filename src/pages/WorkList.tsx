import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, PageHeader, Input, Button } from '../components/ui'
import { IconPlus, IconTrash, IconCheck, IconHome } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useConfirmDelete } from '../lib/confirmDelete'
import { startOfWeek, addDays, toISO, todayISO, isoWeek, formatWeekRange } from '../lib/dates'
import { COMPANIES, companyById, type CompanyId } from '../lib/companies'
import { money } from '../lib/format'

type Bill = { id: string; name: string; amount: number; dueDay?: number }
const ordinalDay = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }

type Cat = 'Task' | 'Home improvement' | 'Legal'
type Priority = 'Low' | 'Medium' | 'High'
type Item = { id: string; text: string; done: boolean; completedAt?: number; cat?: Cat; notes?: string; time?: string; company?: CompanyId; desc?: string; due?: string; priority?: Priority; urgent?: boolean }
const URGENT = '#dc2626'
type WeekBoard = Record<string, Item[]>
type Board = { backlog: Item[]; weeks: Record<string, WeekBoard> }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }
const BACKLOG = 'Unscheduled'
type Tab = 'Home' | 'Work'
const CATS: Cat[] = ['Task', 'Home improvement', 'Legal']
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High']
const DRAG_MIME = 'application/x-jess-task'
const fieldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

const emptyWeek = (): WeekBoard => Object.fromEntries(DAYS.map((d) => [d, []]))
const fmtDue = (d?: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

function migrate(raw: unknown): Board {
  const r = raw as Record<string, unknown>
  if (r && Array.isArray(r.backlog) && r.weeks && typeof r.weeks === 'object') {
    return { backlog: r.backlog as Item[], weeks: r.weeks as Record<string, WeekBoard> }
  }
  const old = (r ?? {}) as Record<string, Item[]>
  const week = emptyWeek()
  let hasDayData = false
  for (const d of DAYS) if (Array.isArray(old[d]) && old[d].length) { week[d] = old[d]; hasDayData = true }
  const weeks: Record<string, WeekBoard> = {}
  if (hasDayData) weeks[toISO(startOfWeek(new Date()))] = week
  return { backlog: Array.isArray(old[BACKLOG]) ? old[BACKLOG] : [], weeks }
}

/** Company wordmark, shown at a fixed height so varying aspect ratios stay tidy. */
function CoLogo({ id, h = 15 }: { id?: string; h?: number }) {
  const c = companyById(id)
  if (!c) return null
  return <img src={c.logo} alt={c.name} draggable={false} className="shrink-0 object-contain" style={{ height: h, width: 'auto', maxWidth: h * 3.6 }} />
}

function TaskRow({ item, variant, onToggle, onRemove, onOpen, onDragStart, dayBadge, onHover, onLeave }: {
  item: Item; variant: 'compact' | 'full'
  onToggle: () => void; onRemove: () => void; onOpen: () => void; onDragStart: () => void
  dayBadge?: string
  onHover?: (e: React.MouseEvent, item: Item) => void; onLeave?: () => void
}) {
  const c = companyById(item.company)
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, '1'); e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      className="group flex items-start gap-1.5 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing"
      style={{ background: 'var(--color-bg)' }}
    >
      <span className="select-none text-xs leading-none shrink-0 mt-1" style={{ color: 'var(--color-muted)' }}>⋮⋮</span>
      <button onClick={onToggle} className="h-4 w-4 rounded grid place-items-center shrink-0 mt-0.5" style={{ border: '2px solid var(--color-accent)', background: item.done ? 'var(--color-accent)' : 'transparent' }} aria-label="Toggle done">
        {item.done && <IconCheck width={11} height={11} style={{ color: 'var(--color-on-accent)' }} />}
      </button>
      <button onClick={onOpen} onMouseEnter={(e) => onHover?.(e, item)} onMouseLeave={onLeave} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          {item.urgent && !item.done && <span className="shrink-0" style={{ color: URGENT }} title="Urgent"><svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M4 21V4M4 4h11l-1.5 3L15 10H4" /></svg></span>}
          {c && <CoLogo id={item.company} h={16} />}
          <span className="js-tasktext text-sm truncate" style={{ color: item.urgent && !item.done ? URGENT : 'var(--color-text)', fontWeight: item.urgent && !item.done ? 600 : 400, textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.5 : 1 }}>{item.text}</span>
        </div>
        {variant === 'full' && item.cat && (
          <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>{item.cat}</div>
        )}
        {variant === 'full' && (item.desc || item.notes) && <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>{item.desc || item.notes}</div>}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        {dayBadge && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))', color: 'var(--color-accent)' }}>{dayBadge}</span>}
        {item.due && <span className="text-[10px] font-semibold tnum" style={{ color: 'var(--color-accent)' }}>{fmtDue(item.due)}</span>}
        {variant === 'full' && item.priority && item.priority !== 'Medium' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-surface)', color: item.priority === 'High' ? '#c0504d' : 'var(--color-muted)' }}>{item.priority}</span>}
        <button onClick={onRemove} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }} aria-label="Delete"><IconTrash width={13} height={13} /></button>
      </div>
    </li>
  )
}

export default function WorkList({ fixedBoard }: { fixedBoard?: Tab }) {
  const tab: Tab = fixedBoard ?? 'Home'
  const isWork = tab === 'Work'
  const confirmDelete = useConfirmDelete()
  const [homeRaw, setHome] = useStore<Board>('work.home', { backlog: [], weeks: {} })
  const [workRaw, setWork] = useStore<Board>('work.work', { backlog: [], weeks: {} })
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [overBucket, setOverBucket] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ from: string; id: string } | null>(null)
  const [selected, setSelected] = useState<{ bucket: string; id: string } | null>(null)
  const [addingCol, setAddingCol] = useState<string | null>(null)
  const [addDraft, setAddDraft] = useState('')
  const [masterAdding, setMasterAdding] = useState(false)
  const [masterDraft, setMasterDraft] = useState('')
  const [masterCat, setMasterCat] = useState<Cat>('Task')
  const [catFilter, setCatFilter] = useState<'All' | Cat | 'Bills'>('All')
  const [rolledNote, setRolledNote] = useState(0)
  const [focusDay, setFocusDay] = useState<string | null>(null)

  // Hover tooltip: shows a task's full name + details when the card truncates it.
  const [hoverTip, setHoverTip] = useState<{ text: string; desc?: string; company?: string; left: number; top: number } | null>(null)
  const showTip = (e: React.MouseEvent, item: Item) => {
    const el = e.currentTarget as HTMLElement
    const span = el.querySelector('.js-tasktext') as HTMLElement | null
    const truncated = span ? (span.scrollWidth > span.clientWidth + 1 || span.scrollHeight > span.clientHeight + 1) : false
    const detail = item.desc || item.notes
    if (!truncated && !detail) return // nothing hidden — no need for a tooltip
    const r = el.getBoundingClientRect()
    setHoverTip({ text: item.text, desc: detail, company: companyById(item.company)?.name, left: r.left, top: r.bottom + 6 })
  }
  const hideTip = () => setHoverTip(null)

  // Bills come straight from Finances so paying them can live as a to-do here.
  const [bills] = useStore<Bill[]>('pay.bills', [])
  const [payCells, setPayCells] = useStore<Record<string, number>>('pay.cells', {})
  const nowDate = new Date()
  const billKey = (id: string) => `${nowDate.getFullYear()}:${id}:${nowDate.getMonth()}`
  const billPaid = (id: string) => payCells[billKey(id)] !== undefined
  const toggleBillPaid = (b: Bill) => setPayCells((prev) => {
    const next = { ...prev }; const k = billKey(b.id)
    if (next[k] !== undefined) delete next[k]; else next[k] = b.amount || 0
    return next
  })
  const sortedBills = [...bills].sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99))
  const billsUnpaid = sortedBills.filter((b) => !billPaid(b.id))
  const billsDue = billsUnpaid.reduce((s, b) => s + (b.amount || 0), 0)
  const monthName = nowDate.toLocaleDateString(undefined, { month: 'long' })

  // Company support (Work board only)
  const [companyFilter, setCompanyFilter] = useState<'all' | CompanyId>('all')
  const [companyMenu, setCompanyMenu] = useState(false)
  const [modal, setModal] = useState<{ day: string | null } | null>(null)
  const [mTitle, setMTitle] = useState('')
  const [mCompany, setMCompany] = useState<CompanyId | ''>('')
  const [mCat, setMCat] = useState<Cat>('Task')
  const [mDesc, setMDesc] = useState('')
  const [mDay, setMDay] = useState('')
  const [mDue, setMDue] = useState('')
  const [mPriority, setMPriority] = useState<Priority>('Medium')
  const [mError, setMError] = useState('')

  const board = migrate(tab === 'Home' ? homeRaw : workRaw)
  const setBoard = tab === 'Home' ? setHome : setWork
  const weekKey = toISO(weekStart)
  const week = board.weeks[weekKey] ?? emptyWeek()
  const prevKey = toISO(addDays(weekStart, -7))
  const hasPrev = !!board.weeks[prevKey]
  const thisWeekKey = toISO(startOfWeek(new Date()))
  const isThisWeek = weekKey === thisWeekKey

  const matchCompany = (i: Item) => !isWork || companyFilter === 'all' || i.company === companyFilter

  const getBucket = (b: Board, bucket: string): Item[] => bucket === BACKLOG ? b.backlog : (b.weeks[weekKey]?.[bucket] ?? [])
  const setBucket = (b: Board, bucket: string, items: Item[]): Board => {
    if (bucket === BACKLOG) return { ...b, backlog: items }
    const wk = { ...(b.weeks[weekKey] ?? emptyWeek()), [bucket]: items }
    return { ...b, weeks: { ...b.weeks, [weekKey]: wk } }
  }
  const update = (fn: (b: Board) => Board) => setBoard((prev) => fn(migrate(prev)))

  const add = (bucket: string, text: string, cat?: Cat) =>
    update((b) => setBucket(b, bucket, [...getBucket(b, bucket), { id: uid('w'), text, done: false, ...(cat ? { cat } : {}), ...(isWork && companyFilter !== 'all' ? { company: companyFilter } : {}) }]))
  const addFull = (bucket: string, fields: Partial<Item> & { text: string }) =>
    update((b) => setBucket(b, bucket, [...getBucket(b, bucket), { id: uid('w'), done: false, ...fields }]))
  const toggle = (bucket: string, id: string) =>
    update((b) => setBucket(b, bucket, getBucket(b, bucket).map((i) => (i.id === id ? { ...i, done: !i.done, completedAt: !i.done ? Date.now() : undefined } : i))))
  const remove = (bucket: string, id: string) =>
    update((b) => setBucket(b, bucket, getBucket(b, bucket).filter((i) => i.id !== id)))
  const confirmRemove = (bucket: string, item: Item, after?: () => void) =>
    confirmDelete({ label: item.text ? `“${item.text}”` : 'this task', detail: 'This task will be removed. This can’t be undone.', onConfirm: () => { remove(bucket, item.id); after?.() } })
  const updateItem = (bucket: string, id: string, patch: Partial<Item>) =>
    update((b) => setBucket(b, bucket, getBucket(b, bucket).map((i) => (i.id === id ? { ...i, ...patch } : i))))
  const moveItem = (from: string, to: string, id: string) => {
    if (from === to) return
    update((b) => {
      const item = getBucket(b, from).find((i) => i.id === id); if (!item) return b
      const removed = setBucket(b, from, getBucket(b, from).filter((i) => i.id !== id))
      return setBucket(removed, to, [...getBucket(removed, to), item])
    })
  }
  const handleDrop = (toBucket: string) => {
    setOverBucket(null)
    if (!drag || drag.from === toBucket) { setDrag(null); return }
    moveItem(drag.from, toBucket, drag.id)
    setDrag(null)
  }

  const copyLastWeek = () =>
    update((b) => {
      const prev = b.weeks[prevKey]; if (!prev) return b
      const cur = { ...(b.weeks[weekKey] ?? emptyWeek()) }
      for (const d of DAYS) cur[d] = [...(cur[d] ?? []), ...(prev[d] ?? []).map((i) => ({ ...i, id: uid('w'), done: false, completedAt: undefined }))]
      return { ...b, weeks: { ...b.weeks, [weekKey]: cur } }
    })

  useEffect(() => {
    const b = migrate(tab === 'Home' ? homeRaw : workRaw)
    const movedByDay: Record<string, Item[]> = {}
    const newWeeks: Record<string, WeekBoard> = {}
    let count = 0
    for (const [wk, wkBoard] of Object.entries(b.weeks)) {
      if (wk >= thisWeekKey) { newWeeks[wk] = wkBoard; continue }
      const kept = emptyWeek()
      for (const day of DAYS) for (const it of wkBoard[day] ?? []) {
        if (it.done) kept[day].push(it); else { (movedByDay[day] ??= []).push(it); count++ }
      }
      newWeeks[wk] = kept
    }
    if (count === 0) return
    const cur = { ...emptyWeek(), ...(b.weeks[thisWeekKey] ?? {}) }
    for (const day of DAYS) cur[day] = [...(cur[day] ?? []), ...(movedByDay[day] ?? [])]
    newWeeks[thisWeekKey] = cur
    ;(tab === 'Home' ? setHome : setWork)({ ...b, weeks: newWeeks })
    setRolledNote(count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, homeRaw, workRaw])

  const weekTotal = DAYS.reduce((s, d) => s + (week[d] ?? []).filter(matchCompany).length, 0)
  const weekDone = DAYS.reduce((s, d) => s + (week[d] ?? []).filter((i) => matchCompany(i) && i.done).length, 0)
  // The Master List is the full, readable checklist of every open task this
  // week — scheduled days included — so nothing hides behind a truncated day
  // card. Ordered by day (Mon→Sun), with unscheduled tasks last.
  const masterItems: { item: Item; bucket: string }[] = [
    ...DAYS.flatMap((day) => (week[day] ?? []).map((item) => ({ item, bucket: day }))),
    ...board.backlog.map((item) => ({ item, bucket: BACKLOG })),
  ]
    .filter(({ item }) => !item.done)
    .filter(({ item }) => matchCompany(item))
    .filter(({ item }) => catFilter === 'All' || item.cat === catFilter)
  const selItem = selected ? getBucket(board, selected.bucket).find((i) => i.id === selected.id) ?? null : null

  // Company banner stats (all-time for the selected company).
  const allBoardItems = [...board.backlog, ...Object.values(board.weeks).flatMap((wk) => DAYS.flatMap((d) => wk[d] ?? []))]
  const selCompany = isWork && companyFilter !== 'all' ? companyById(companyFilter) : null
  const coItems = selCompany ? allBoardItems.filter((i) => i.company === companyFilter) : []
  const coOpen = coItems.filter((i) => !i.done).length
  const coThisWeek = DAYS.reduce((s, d) => s + (week[d] ?? []).filter((i) => i.company === companyFilter && !i.done).length, 0)
  const coOverdue = coItems.filter((i) => !i.done && i.due && i.due < todayISO()).length

  const submitColAdd = (day: string) => { const t = addDraft.trim(); if (t) { add(day, t); setAddDraft('') } }
  const submitMaster = () => { const t = masterDraft.trim(); if (t) { add(BACKLOG, t, masterCat); setMasterDraft('') } }

  const openModal = (day: string | null) => {
    setMTitle(''); setMDesc(''); setMDue(''); setMPriority('Medium'); setMCat('Task'); setMError('')
    setMCompany(companyFilter !== 'all' ? companyFilter : '')
    setMDay(day ?? '')
    setModal({ day })
  }
  const saveModal = () => {
    if (!mTitle.trim()) { setMError('Give the task a title.'); return }
    if (!mCompany) { setMError('Please select a company for this task.'); return }
    addFull(mDay || BACKLOG, { text: mTitle.trim(), company: mCompany, cat: mCat, desc: mDesc.trim() || undefined, due: mDue || undefined, priority: mPriority })
    setModal(null)
  }

  const completed = [
    ...DAYS.flatMap((day) => (week[day] ?? []).filter((i) => i.done && matchCompany(i)).map((i) => ({ item: i, where: day }))),
    ...board.backlog.filter((i) => i.done && matchCompany(i)).map((i) => ({ item: i, where: BACKLOG })),
  ].sort((a, b) => (b.item.completedAt ?? 0) - (a.item.completedAt ?? 0))
  const fmtDone = (ts?: number) => ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

  const companyEmpty = isWork && companyFilter !== 'all' && coItems.length === 0

  const IconExpand = (p: { width?: number; height?: number }) => (
    <svg width={p.width ?? 14} height={p.height ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
  )
  const IconCollapse = (p: { width?: number; height?: number }) => (
    <svg width={p.width ?? 14} height={p.height ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>
  )

  const renderDay = (day: string, idx: number, focused: boolean) => {
    const dayDate = addDays(weekStart, idx)
    const isToday = toISO(dayDate) === todayISO()
    const items = (week[day] ?? []).filter((i) => !i.done && matchCompany(i))
    const over = overBucket === day
    const fullLabel = dayDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    return (
      <div
        key={day}
        onDragOver={(e) => { e.preventDefault(); if (overBucket !== day) setOverBucket(day) }}
        onDragLeave={() => setOverBucket((o) => (o === day ? null : o))}
        onDrop={(e) => { e.preventDefault(); handleDrop(day) }}
        className={`${focused ? 'w-full' : 'snap-start shrink-0 min-w-[78%] sm:min-w-[46%] md:min-w-[31%] lg:min-w-0'} flex flex-col rounded-2xl p-2.5 min-h-[240px] transition-colors`}
        style={{
          background: over ? 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))' : isToday ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))' : 'var(--color-surface)',
          border: `1px solid ${over ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex items-baseline justify-between px-1 mb-2 gap-2">
          <span className="font-semibold text-sm truncate" style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-text)' }}>{focused ? fullLabel : DAY_SHORT[day]}</span>
          <div className="flex items-center gap-2 shrink-0">
            {!focused && <span className="text-[11px] tnum" style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-muted)' }}>{dayDate.getDate()}</span>}
            <button
              onClick={() => setFocusDay(focused ? null : day)}
              className="opacity-55 hover:opacity-100 transition"
              style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-muted)' }}
              title={focused ? 'Show the full week' : 'Focus on this day'}
              aria-label={focused ? 'Collapse to week' : 'Expand this day'}
            >
              {focused ? <IconCollapse width={15} height={15} /> : <IconExpand width={14} height={14} />}
            </button>
          </div>
        </div>
        <ul className={`flex flex-col gap-1 flex-1 ${focused ? 'sm:grid sm:grid-cols-2 sm:gap-2 sm:items-start' : ''}`}>
          {items.map((i) => (
            <TaskRow key={i.id} item={i} variant={focused ? 'full' : 'compact'} onToggle={() => toggle(day, i.id)} onRemove={() => confirmRemove(day, i)} onOpen={() => setSelected({ bucket: day, id: i.id })} onDragStart={() => setDrag({ from: day, id: i.id })} onHover={showTip} onLeave={hideTip} />
          ))}
          {focused && items.length === 0 && (
            <li className="text-sm py-6 text-center sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Nothing scheduled for this day. Add a task below.</li>
          )}
        </ul>
        {isWork ? (
          <button onClick={() => openModal(day)} className="mt-1 text-xs font-semibold flex items-center gap-1 px-1 py-1 opacity-70 hover:opacity-100 transition" style={{ color: 'var(--color-accent)' }}><IconPlus width={13} height={13} /> Add</button>
        ) : addingCol === day ? (
          <input autoFocus value={addDraft} onChange={(e) => setAddDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitColAdd(day); if (e.key === 'Escape') { setAddingCol(null); setAddDraft('') } }}
            onBlur={() => { submitColAdd(day); setAddingCol(null) }} placeholder="Task…"
            className="mt-1 rounded-lg px-2 py-1 text-sm outline-none w-full" style={fieldStyle} />
        ) : (
          <button onClick={() => { setAddingCol(day); setAddDraft('') }} className="mt-1 text-xs font-semibold flex items-center gap-1 px-1 py-1 opacity-70 hover:opacity-100 transition" style={{ color: 'var(--color-accent)' }}><IconPlus width={13} height={13} /> Add</button>
        )}
      </div>
    )
  }

  return (
    <div onDragEnd={() => { setDrag(null); setOverBucket(null) }}>
      {/* Hover tooltip — full task name + details when a card truncates them */}
      {hoverTip && (
        <div
          className="fixed z-[80] max-w-xs rounded-xl px-3 py-2 pointer-events-none fade-up"
          style={{ left: Math.max(8, Math.min(hoverTip.left, window.innerWidth - 288)), top: hoverTip.top, background: 'var(--color-text)', color: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="text-sm font-semibold leading-snug">{hoverTip.text}</div>
          {hoverTip.company && <div className="text-xs mt-0.5" style={{ opacity: 0.75 }}>{hoverTip.company}</div>}
          {hoverTip.desc && <div className="text-xs mt-1 whitespace-pre-wrap leading-snug" style={{ opacity: 0.85 }}>{hoverTip.desc}</div>}
        </div>
      )}
      <PageHeader
        title={fixedBoard ? `${fixedBoard} tasks` : 'Work list'}
        subtitle="Plan your week by dragging tasks onto a day."
        action={
          <div className="flex items-center gap-1.5">
            {!isWork && (
              <Link to="/home-care" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold mr-1" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                <IconHome width={15} height={15} /> Home Service
              </Link>
            )}
            <Button variant="outline" onClick={() => setWeekStart((w) => addDays(w, -7))}>‹</Button>
            <div className="text-center px-2 min-w-[150px]">
              <div className="font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>Week {isoWeek(weekStart)}</div>
              <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{formatWeekRange(weekStart)}</div>
            </div>
            <Button variant="outline" onClick={() => setWeekStart((w) => addDays(w, 7))}>›</Button>
          </div>
        }
      />

      {/* Company selector (Work board) */}
      {isWork && (
        <div className="relative mb-4 inline-block">
          <button onClick={() => setCompanyMenu((o) => !o)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', color: 'var(--color-text)' }}>
            {companyFilter === 'all' ? <span>All Companies</span> : <><CoLogo id={companyFilter} h={18} /><span>{companyById(companyFilter)?.name}</span></>}
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>▾</span>
          </button>
          {companyMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setCompanyMenu(false)} />
              <div className="absolute left-0 mt-1 z-30 rounded-xl p-1 min-w-[240px]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
                <button onClick={() => { setCompanyFilter('all'); setCompanyMenu(false) }} className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={{ background: companyFilter === 'all' ? 'var(--color-bg)' : 'transparent', color: 'var(--color-text)' }}>All Companies</button>
                {COMPANIES.map((c) => (
                  <button key={c.id} onClick={() => { setCompanyFilter(c.id); setCompanyMenu(false) }} className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={{ background: companyFilter === c.id ? 'var(--color-bg)' : 'transparent', color: 'var(--color-text)' }}>
                    <CoLogo id={c.id} h={18} /> {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Company banner (a specific company is selected) */}
      {selCompany && (
        <Card className="p-4 mb-4 flex items-center gap-4 flex-wrap">
          <CoLogo id={selCompany.id} h={40} />
          <div className="flex-1 min-w-[160px]">
            <h2 className="font-bold text-lg leading-tight" style={{ color: 'var(--color-text)' }}>{selCompany.name}</h2>
          </div>
          <div className="flex gap-5 text-center">
            <div><div className="text-xl font-bold tnum" style={{ color: 'var(--color-text)' }}>{coOpen}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Open</div></div>
            <div><div className="text-xl font-bold tnum" style={{ color: 'var(--color-accent)' }}>{coThisWeek}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>This week</div></div>
            <div><div className="text-xl font-bold tnum" style={{ color: coOverdue ? '#c0504d' : 'var(--color-text)' }}>{coOverdue}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Overdue</div></div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${weekTotal ? (weekDone / weekTotal) * 100 : 0}%`, background: 'var(--color-accent)' }} />
          </div>
          <span className="text-sm font-semibold tnum shrink-0" style={{ color: 'var(--color-muted)' }}>{weekDone}/{weekTotal}</span>
        </div>
        {!isThisWeek && <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>}
        {hasPrev && <Button variant="outline" onClick={copyLastWeek} title="Copy last week's tasks">Copy last week</Button>}
      </div>

      {rolledNote > 0 && (
        <button onClick={() => { setWeekStart(startOfWeek(new Date())); setRolledNote(0) }} className="w-full text-left mb-4 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)', color: 'var(--color-text)' }}>
          ⤴ Rolled over {rolledNote} unfinished task{rolledNote === 1 ? '' : 's'} into this week.{!isThisWeek && <span style={{ color: 'var(--color-accent)' }}> Jump to this week →</span>}
        </button>
      )}

      {companyEmpty && (
        <p className="text-sm mb-4 px-1" style={{ color: 'var(--color-muted)' }}>No tasks for {selCompany?.name} yet. Add a task to get started.</p>
      )}

      {/* Week — either the full 7-day grid, or a single focused day full-width */}
      {focusDay ? (
        <div>
          <button onClick={() => setFocusDay(null)} className="mb-3 text-sm font-semibold flex items-center gap-1.5 px-1 py-1 opacity-80 hover:opacity-100 transition" style={{ color: 'var(--color-accent)' }}>
            <IconCollapse width={15} height={15} /> Show full week
          </button>
          {renderDay(focusDay, DAYS.indexOf(focusDay), true)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 lg:grid lg:grid-cols-7 lg:overflow-visible">
          {DAYS.map((day, idx) => renderDay(day, idx, false))}
        </div>
      )}

      {/* Master List */}
      <div
        className="rounded-[20px] p-4 mt-5"
        onDragOver={(e) => { e.preventDefault(); if (overBucket !== BACKLOG) setOverBucket(BACKLOG) }}
        onDragLeave={() => setOverBucket((o) => (o === BACKLOG ? null : o))}
        onDrop={(e) => { e.preventDefault(); handleDrop(BACKLOG) }}
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', outline: overBucket === BACKLOG ? '2px solid var(--color-accent)' : '2px solid transparent', outlineOffset: -2 }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Master List</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>Every open task this week — check one off and it moves to Completed.</p>
          </div>
          <button onClick={() => isWork ? openModal(null) : setMasterAdding((v) => !v)} className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--color-accent)' }}><IconPlus width={15} height={15} /> Add task</button>
        </div>

        {/* Company filters (Work board) */}
        {isWork && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
            <button onClick={() => setCompanyFilter('all')} className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 transition" style={{ background: companyFilter === 'all' ? 'var(--color-accent)' : 'var(--color-bg)', color: companyFilter === 'all' ? 'var(--color-on-accent)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>All</button>
            {COMPANIES.map((c) => (
              <button key={c.id} onClick={() => setCompanyFilter(c.id)} className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 transition" style={{ background: companyFilter === c.id ? 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))' : 'var(--color-bg)', color: 'var(--color-text)', border: `1px solid ${companyFilter === c.id ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                <CoLogo id={c.id} h={15} /> {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Category filters (+ a Bills tab on the Home board) */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['All', ...CATS] as const).map((c) => (
            <button key={c} onClick={() => setCatFilter(c)} className="text-xs font-semibold px-3 py-1 rounded-full transition" style={{ background: catFilter === c ? 'var(--color-accent)' : 'var(--color-bg)', color: catFilter === c ? 'var(--color-on-accent)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{c}</button>
          ))}
          {!isWork && (
            <button onClick={() => setCatFilter('Bills')} className="text-xs font-semibold px-3 py-1 rounded-full transition flex items-center gap-1.5" style={{ background: catFilter === 'Bills' ? 'var(--color-accent)' : 'var(--color-bg)', color: catFilter === 'Bills' ? 'var(--color-on-accent)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
              Bills{billsUnpaid.length > 0 && <span className="text-[10px] tnum px-1 rounded-full" style={{ background: catFilter === 'Bills' ? 'var(--color-on-accent)' : 'var(--color-accent)', color: catFilter === 'Bills' ? 'var(--color-accent)' : 'var(--color-on-accent)' }}>{billsUnpaid.length}</span>}
            </button>
          )}
        </div>

        {!isWork && masterAdding && catFilter !== 'Bills' && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <input autoFocus value={masterDraft} onChange={(e) => setMasterDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitMaster(); if (e.key === 'Escape') setMasterAdding(false) }} placeholder="New task…" className="flex-1 min-w-[160px] rounded-lg px-3 py-2 text-sm outline-none" style={fieldStyle} />
            <select value={masterCat} onChange={(e) => setMasterCat(e.target.value as Cat)} className="rounded-lg px-2 py-2 text-sm outline-none" style={fieldStyle}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <Button onClick={submitMaster}>Add</Button>
          </div>
        )}

        {catFilter === 'Bills' ? (
          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Bills due in {monthName} — check one off when you pay it.</p>
              {billsUnpaid.length > 0 && <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{money(billsDue)} <span style={{ color: 'var(--color-muted)' }}>left · {billsUnpaid.length} unpaid</span></span>}
            </div>
            {sortedBills.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--color-muted)' }}>No bills yet. Add them in Finances → Bills.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {sortedBills.map((b) => {
                  const paid = billPaid(b.id)
                  const overdue = !paid && b.dueDay != null && b.dueDay < nowDate.getDate()
                  return (
                    <li key={b.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2" style={{ background: 'var(--color-bg)' }}>
                      <button onClick={() => toggleBillPaid(b)} className="h-4 w-4 rounded grid place-items-center shrink-0" style={{ border: '2px solid var(--color-accent)', background: paid ? 'var(--color-accent)' : 'transparent' }} aria-label={paid ? 'Mark unpaid' : 'Mark paid'}>
                        {paid && <IconCheck width={11} height={11} style={{ color: 'var(--color-on-accent)' }} />}
                      </button>
                      <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--color-text)', textDecoration: paid ? 'line-through' : 'none', opacity: paid ? 0.5 : 1 }}>Pay {b.name}</span>
                      {b.dueDay != null && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: overdue ? 'color-mix(in srgb, #c0504d 16%, var(--color-surface))' : 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))', color: overdue ? '#c0504d' : 'var(--color-accent)' }}>
                          {overdue ? 'Overdue · ' : ''}Due {ordinalDay(b.dueDay)}
                        </span>
                      )}
                      <span className="text-sm font-semibold tnum shrink-0" style={{ color: 'var(--color-text)', opacity: paid ? 0.5 : 1 }}>{money(b.amount)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            <Link to="/finances" className="inline-block text-xs font-semibold mt-3" style={{ color: 'var(--color-accent)' }}>Manage bills in Finances →</Link>
          </div>
        ) : masterItems.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--color-muted)' }}>
            {companyEmpty ? `No tasks for ${selCompany?.name} yet. Add a task to get started.` : weekTotal - weekDone + board.backlog.filter((i) => !i.done).length === 0 ? 'Nothing here yet. Add a task to get started.' : 'No tasks match these filters.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {masterItems.map(({ item: i, bucket }) => (
              <TaskRow key={i.id} item={i} variant="full" dayBadge={bucket === BACKLOG ? undefined : DAY_SHORT[bucket]} onToggle={() => toggle(bucket, i.id)} onRemove={() => confirmRemove(bucket, i)} onOpen={() => setSelected({ bucket, id: i.id })} onDragStart={() => setDrag({ from: bucket, id: i.id })} onHover={showTip} onLeave={hideTip} />
            ))}
          </ul>
        )}
      </div>

      {completed.length > 0 && (
        <Card className="p-4 mt-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
            <IconCheck width={15} height={15} /> Completed this week ({completed.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {completed.map(({ item, where }) => (
              <li key={item.id} className="group flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--color-bg)' }}>
                <button onClick={() => toggle(where, item.id)} className="h-4 w-4 rounded grid place-items-center shrink-0" style={{ border: '2px solid var(--color-accent)', background: 'var(--color-accent)' }} title="Mark not done">
                  <IconCheck width={11} height={11} style={{ color: 'var(--color-on-accent)' }} />
                </button>
                {companyById(item.company) && <CoLogo id={item.company} h={13} />}
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-text)', textDecoration: 'line-through', opacity: 0.6 }}>{item.text}</span>
                <span className="text-xs tnum shrink-0" style={{ color: 'var(--color-muted)' }}>{where === BACKLOG ? 'Master List' : where} · {fmtDone(item.completedAt)}</span>
                <button onClick={() => confirmRemove(where, item)} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={14} height={14} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Add task modal (Work board) */}
      {modal && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setModal(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92%] max-w-lg max-h-[90vh] overflow-y-auto p-5 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>New task</h3>
              <button onClick={() => setModal(null)} className="text-lg" style={{ color: 'var(--color-muted)' }} aria-label="Close">✕</button>
            </div>

            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Task title</label>
            <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="What needs doing?" className="mb-3 mt-1" autoFocus />

            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Company <span style={{ color: '#c0504d' }}>*</span></label>
            <div className="flex flex-wrap gap-2 mt-1 mb-2">
              {COMPANIES.map((c) => (
                <button key={c.id} onClick={() => setMCompany(c.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition" style={{ background: mCompany === c.id ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : 'var(--color-bg)', border: `1px solid ${mCompany === c.id ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                  <CoLogo id={c.id} h={18} /> <span className="text-sm" style={{ color: 'var(--color-text)' }}>{c.name}</span>
                </button>
              ))}
            </div>
            {mCompany && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                <CoLogo id={mCompany} h={22} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{companyById(mCompany)?.name}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Category</label>
                <select value={mCat} onChange={(e) => setMCat(e.target.value as Cat)} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Priority</label>
                <select value={mPriority} onChange={(e) => setMPriority(e.target.value as Priority)} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Scheduled day</label>
                <select value={mDay} onChange={(e) => setMDay(e.target.value)} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>
                  <option value="">Master List (unscheduled)</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Due date</label>
                <input type="date" value={mDue} onChange={(e) => setMDue(e.target.value)} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle} />
              </div>
            </div>

            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Description</label>
            <textarea value={mDesc} onChange={(e) => setMDesc(e.target.value)} rows={3} placeholder="Optional details…" className="w-full mb-1 mt-1 rounded-xl px-3 py-2 text-sm outline-none resize-y" style={fieldStyle} />

            {mError && <p className="text-sm mt-1 mb-1" style={{ color: '#c0504d' }}>{mError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={saveModal}><IconCheck width={16} height={16} /> Add task</Button>
            </div>
          </div>
        </>
      )}

      {/* Task detail drawer */}
      {selItem && selected && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 z-50 h-full w-full sm:w-96 p-5 overflow-y-auto" style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>Task details</h3>
              <button onClick={() => setSelected(null)} className="text-lg" style={{ color: 'var(--color-muted)' }} aria-label="Close">✕</button>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Task</label>
            <Input value={selItem.text} onChange={(e) => updateItem(selected.bucket, selItem.id, { text: e.target.value })} className="mb-3 mt-1" />
            <button onClick={() => updateItem(selected.bucket, selItem.id, { urgent: !selItem.urgent })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold mb-4 transition" style={selItem.urgent ? { background: 'color-mix(in srgb, #dc2626 14%, var(--color-surface))', border: '1px solid #dc2626', color: URGENT } : { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill={selItem.urgent ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4M4 4h11l-1.5 3L15 10H4" /></svg>
              {selItem.urgent ? 'Urgent' : 'Mark urgent'}
            </button>
            {isWork && (
              <>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Company</label>
                <div className="flex flex-wrap gap-2 mt-1 mb-3">
                  {COMPANIES.map((c) => (
                    <button key={c.id} onClick={() => updateItem(selected.bucket, selItem.id, { company: c.id })} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl" style={{ background: selItem.company === c.id ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : 'var(--color-bg)', border: `1px solid ${selItem.company === c.id ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                      <CoLogo id={c.id} h={16} /> <span className="text-xs" style={{ color: 'var(--color-text)' }}>{c.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Description</label>
            <textarea value={selItem.desc ?? selItem.notes ?? ''} onChange={(e) => updateItem(selected.bucket, selItem.id, { desc: e.target.value })} rows={3} placeholder="Add details…" className="w-full mb-3 mt-1 rounded-xl px-3 py-2 text-sm outline-none resize-y" style={fieldStyle} />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Category</label>
                <select value={selItem.cat ?? ''} onChange={(e) => updateItem(selected.bucket, selItem.id, { cat: (e.target.value || undefined) as Cat | undefined })} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>
                  <option value="">—</option>{CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Priority</label>
                <select value={selItem.priority ?? ''} onChange={(e) => updateItem(selected.bucket, selItem.id, { priority: (e.target.value || undefined) as Priority | undefined })} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>
                  <option value="">—</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Due date</label>
                <input type="date" value={selItem.due ?? ''} onChange={(e) => updateItem(selected.bucket, selItem.id, { due: e.target.value || undefined })} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Due time</label>
                <input type="time" value={selItem.time ?? ''} onChange={(e) => updateItem(selected.bucket, selItem.id, { time: e.target.value || undefined })} className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle} />
              </div>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Move to</label>
            <select value={selected.bucket} onChange={(e) => { const to = e.target.value; moveItem(selected.bucket, to, selItem.id); setSelected({ bucket: to, id: selItem.id }) }} className="w-full mt-1 mb-5 rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>
              <option value={BACKLOG}>Master List</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Button variant="outline" onClick={() => confirmRemove(selected.bucket, selItem, () => setSelected(null))} style={{ color: '#c0504d' }}><IconTrash width={15} height={15} /> Delete task</Button>
          </div>
        </>
      )}
    </div>
  )
}
