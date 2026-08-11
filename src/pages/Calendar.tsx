import { useMemo, useState, useEffect } from 'react'
import { Card, PageHeader, Button, Input } from '../components/ui'
import { IconPlus, IconTrash } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useConfirmDelete } from '../lib/confirmDelete'
import { taskAgenda, agendaByDate } from '../lib/agenda'

type Event = { id: string; date: string; title: string; time?: string }
type GEvent = { date: string; time?: string; title: string; location?: string; allDay?: boolean }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const fmtTime = (t?: string) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
}

export default function Calendar() {
  const confirmDelete = useConfirmDelete()
  const today = new Date()
  const todayStr = iso(today.getFullYear(), today.getMonth(), today.getDate())
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [mode, setMode] = useState<'month' | 'agenda'>('month')
  const [events, setEvents] = useStore<Event[]>('calendar.events', [])
  const [selected, setSelected] = useState(todayStr)
  const [draft, setDraft] = useState('')
  const [draftTime, setDraftTime] = useState('')

  // Read-only Google Calendar import (via the calendar-ics function).
  const [icsConf, setIcsConf] = useStore<{ url?: string; lastSynced?: number }>('calendar.ics', {})
  const [googleEvents, setGoogleEvents] = useStore<GEvent[]>('calendar.googleEvents', [])
  const [icsUrl, setIcsUrl] = useState(icsConf.url ?? '')
  const [syncing, setSyncing] = useState(false)
  const [syncErr, setSyncErr] = useState('')

  const doSync = async (url: string, manual: boolean) => {
    if (!url) return
    setSyncing(true); if (manual) setSyncErr('')
    try {
      const r = await fetch('/.netlify/functions/calendar-ics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const d = await r.json()
      if (d.ok) { setGoogleEvents(d.events); setIcsConf({ url, lastSynced: Date.now() }) }
      else if (manual) setSyncErr(d.message || 'Could not read that calendar.')
    } catch {
      if (manual) setSyncErr('Sync needs the site deployed with functions — connect the repo to Netlify first.')
    } finally { setSyncing(false) }
  }
  // Refresh once on open if already connected.
  useEffect(() => { if (icsConf.url) doSync(icsConf.url, false) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const disconnect = () => { setIcsConf({}); setGoogleEvents([]); setIcsUrl(''); setSyncErr('') }

  const taskMap = useMemo(() => agendaByDate(taskAgenda()), [])
  const dayTasks = (d: string) => taskMap[d] ?? []
  const dayEvents = (d: string) => events.filter((e) => e.date === d).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const dayGoogle = (d: string) => googleEvents.filter((e) => e.date === d).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  const grid = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay()
    const days = new Date(view.y, view.m + 1, 0).getDate()
    const cells: (number | null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [view])

  const move = (delta: number) => setView((v) => {
    const m = v.m + delta
    if (m < 0) return { y: v.y - 1, m: 11 }
    if (m > 11) return { y: v.y + 1, m: 0 }
    return { ...v, m }
  })
  const goToday = () => { setView({ y: today.getFullYear(), m: today.getMonth() }); setSelected(todayStr) }

  const addEvent = () => {
    if (!draft.trim()) return
    setEvents((prev) => [...prev, { id: uid('e'), date: selected, title: draft.trim(), time: draftTime || undefined }])
    setDraft(''); setDraftTime('')
  }
  const updateEvent = (id: string, patch: Partial<Event>) => setEvents((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e))
  const removeEvent = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id))

  // Agenda: events + tasks from today forward.
  const agenda = useMemo(() => {
    const items: { date: string; time?: string; title: string; tag: string; id?: string }[] = []
    events.forEach((e) => { if (e.date >= todayStr) items.push({ date: e.date, time: e.time, title: e.title, tag: 'Event', id: e.id }) })
    googleEvents.forEach((e) => { if (e.date >= todayStr) items.push({ date: e.date, time: e.time, title: e.title, tag: 'Google' }) })
    taskAgenda().forEach((a) => { if (a.date >= todayStr && !a.done) items.push({ date: a.date, title: a.title, tag: a.source }) })
    items.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    const byDate: Record<string, typeof items> = {}
    items.forEach((it) => (byDate[it.date] ??= []).push(it))
    return byDate
  }, [events, googleEvents, todayStr])

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Your events, tasks and weekly planner — all on one calendar."
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {(['month', 'agenda'] as const).map((mo) => (
                <button key={mo} onClick={() => setMode(mo)} className="px-3 py-1.5 rounded-lg text-sm font-semibold capitalize transition"
                  style={{ background: mode === mo ? 'var(--color-accent)' : 'transparent', color: mode === mo ? 'var(--color-on-accent)' : 'var(--color-muted)' }}>{mo}</button>
              ))}
            </div>
            {mode === 'month' && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" onClick={() => move(-1)}>‹</Button>
                <span className="font-semibold text-sm" style={{ color: 'var(--color-text)', minWidth: 120, textAlign: 'center' }}>{MONTH_NAMES[view.m]} {view.y}</span>
                <Button variant="outline" onClick={() => move(1)}>›</Button>
              </div>
            )}
            <Button variant="outline" onClick={goToday}>Today</Button>
          </div>
        }
      />

      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h2 className="font-bold" style={{ color: 'var(--color-text)' }}>Google Calendar (read-only)</h2>
          {icsConf.lastSynced && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Synced {new Date(icsConf.lastSynced).toLocaleString()}</span>}
        </div>
        <p className="text-sm mb-2" style={{ color: 'var(--color-muted)' }}>
          Paste your calendar's <b>Secret address in iCal format</b> (Google Calendar → Settings → click your calendar → “Integrate calendar”). Your events show up here automatically — the link stays on this device.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Input value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className="flex-1 min-w-[220px]" />
          <Button onClick={() => doSync(icsUrl.trim(), true)} disabled={syncing || !icsUrl.trim()}>{syncing ? 'Syncing…' : 'Sync'}</Button>
          {icsConf.url && <Button variant="ghost" onClick={disconnect}>Remove</Button>}
        </div>
        {syncErr && <p className="text-xs mt-2" style={{ color: '#c0504d' }}>{syncErr}</p>}
        {!syncErr && googleEvents.length > 0 && <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>{googleEvents.length} events imported (read-only).</p>}
      </Card>

      {mode === 'agenda' ? (
        <Card className="p-5">
          {Object.keys(agenda).length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--color-muted)' }}>Nothing upcoming. Add events on the month view.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {Object.entries(agenda).map(([date, items]) => {
                const d = new Date(date + 'T00:00:00')
                return (
                  <div key={date}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="font-bold" style={{ color: date === todayStr ? 'var(--color-accent)' : 'var(--color-text)' }}>
                        {date === todayStr ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {items.map((it, i) => (
                        <li key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                          <span className="text-xs font-semibold w-20 shrink-0 tnum" style={{ color: 'var(--color-accent)' }}>{it.time ? fmtTime(it.time) : '—'}</span>
                          <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{it.title}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>{it.tag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="p-4 lg:col-span-2">
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((d) => <div key={d} className="text-center text-xs font-semibold py-1" style={{ color: 'var(--color-muted)' }}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, i) => {
                if (d === null) return <div key={i} />
                const dateStr = iso(view.y, view.m, d)
                const markers = dayEvents(dateStr).length + dayTasks(dateStr).length + dayGoogle(dateStr).length
                const isToday = dateStr === todayStr
                const isSel = dateStr === selected
                return (
                  <button key={i} onClick={() => setSelected(dateStr)} className="aspect-square rounded-lg p-1.5 text-left flex flex-col transition"
                    style={{ background: isSel ? 'var(--color-accent)' : 'var(--color-bg)', border: isToday ? '2px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: isSel ? 'var(--color-on-accent)' : 'var(--color-text)' }}>{d}</span>
                    <div className="flex flex-wrap gap-0.5 mt-auto">
                      {Array.from({ length: Math.min(markers, 4) }).map((_, k) => (
                        <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: isSel ? 'var(--color-on-accent)' : 'var(--color-accent)', opacity: k < dayEvents(dateStr).length ? 1 : 0.5 }} />
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              {new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); addEvent() }} className="flex gap-2 my-3">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New event…" />
              <input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} className="rounded-xl px-2 text-sm outline-none shrink-0" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }} />
              <Button type="submit"><IconPlus width={16} height={16} /></Button>
            </form>
            <ul className="flex flex-col gap-1">
              {dayEvents(selected).length === 0 && dayTasks(selected).length === 0 && dayGoogle(selected).length === 0 && (
                <li className="text-sm py-4 text-center" style={{ color: 'var(--color-muted)' }}>Nothing planned.</li>
              )}
              {dayGoogle(selected).map((e, i) => (
                <li key={`g${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded-lg">
                  <span className="text-xs font-semibold w-[72px] shrink-0 tnum" style={{ color: 'var(--color-accent)' }}>{e.allDay ? 'All day' : fmtTime(e.time)}</span>
                  <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{e.title}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>Google</span>
                </li>
              ))}
              {dayEvents(selected).map((e) => (
                <li key={e.id} className="group flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/5">
                  <input type="time" value={e.time ?? ''} onChange={(ev) => updateEvent(e.id, { time: ev.target.value || undefined })} className="text-xs bg-transparent outline-none w-[72px] shrink-0" style={{ color: 'var(--color-accent)' }} />
                  <input value={e.title} onChange={(ev) => updateEvent(e.id, { title: ev.target.value })} className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--color-text)' }} />
                  <button onClick={() => confirmDelete({ label: e.title ? `“${e.title}”` : 'this event', detail: 'This event will be removed from your calendar.', onConfirm: () => removeEvent(e.id) })} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={14} height={14} /></button>
                </li>
              ))}
              {dayTasks(selected).map((t, i) => (
                <li key={`t${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded-lg">
                  <span className="h-2 w-2 rounded-full shrink-0 ml-1" style={{ background: 'var(--color-accent)', opacity: 0.5 }} />
                  <span className="flex-1 text-sm" style={{ color: 'var(--color-text)', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.5 : 1 }}>{t.title}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>{t.source}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
