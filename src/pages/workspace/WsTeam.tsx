import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Card } from '../../components/ui'
import { IconCheck, IconPlus, IconTrash } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/toast'
import { todayISO, formatDueLabel } from '../../lib/dates'
import {
  fmtWorked, geoLabel, localDayISO, mapsLink, timeLabel, workedMinutes,
  type EmpApp, type EmpClock, type EmpTask,
} from '../../lib/employee'

/**
 * Team — Rolando's view into every field employee's OS (owner only).
 *
 * Reads the emp_* tables directly; Row Level Security lets only the owner do
 * that. Employees reach the same rows through the PIN-session functions in
 * supabase/09_employee_os.sql.
 */

type Employee = {
  id: string; name: string; title: string; company: string
  pin_hash: string | null; active: boolean
  apps: EmpApp[]; nn_owner: string[]; nn_own: string[]
}
type Day = { employee_id: string; day: string; nn_done: string[]; journal: string; updated_at: string }
type Clock = EmpClock & { employee_id: string }
type Task = EmpTask & { employee_id: string; created_at: string }

const db = () => supabase!

export default function WsTeam() {
  const { toast } = useToast()
  const [emps, setEmps] = useState<Employee[]>([])
  const [clock, setClock] = useState<Clock[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [setupMissing, setSetupMissing] = useState(false)
  const today = todayISO()

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 86400000).toISOString()
    const [e, c, t, d] = await Promise.all([
      db().from('emp_employees').select('id,name,title,company,pin_hash,active,apps,nn_owner,nn_own').order('created_at'),
      db().from('emp_clock').select('*').gte('at', since).order('at'),
      db().from('emp_tasks').select('*').order('created_at'),
      db().from('emp_days').select('*').gte('day', since.slice(0, 10)).order('day', { ascending: false }),
    ])
    if (e.error) { setSetupMissing(true); setLoaded(true); return }
    setEmps((e.data || []) as Employee[])
    setClock((c.data || []) as Clock[])
    setTasks((t.data || []) as Task[])
    setDays((d.data || []) as Day[])
    setLoaded(true)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const ch = db().channel('emp-team')
    for (const table of ['emp_clock', 'emp_tasks', 'emp_days', 'emp_employees']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => void load())
    }
    ch.subscribe()
    return () => { void db().removeChannel(ch) }
  }, [load])

  useEffect(() => { if (!sel && emps.length) setSel(emps[0].id) }, [emps, sel])

  const write = async (p: PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    const { error } = await p
    if (error) { toast(error.message); return false }
    if (ok) toast(ok)
    await load()
    return true
  }

  const addEmployee = async () => {
    const name = prompt('Employee name')?.trim()
    if (!name) return
    const { data, error } = await db().from('emp_employees')
      .insert({ name, apps: [{ label: 'Open STB Scheduling', url: 'https://stb-scheduling.netlify.app/' }] })
      .select('id').single()
    if (error) { toast(error.message); return }
    await load(); setSel(data.id)
  }

  const emp = emps.find((x) => x.id === sel) || null

  return (
    <WsShell title="Team" subtitle="Every field employee's OS — clock-ins, tasks, non-negotiables and journal."
      action={<button onClick={addEmployee} className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold"
        style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}><IconPlus width={16} height={16} /> Add employee</button>}>
      {setupMissing ? (
        <Card className="p-6">
          <p className="font-semibold" style={{ color: 'var(--color-text)' }}>One-time setup</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--color-muted)' }}>
            Run <b>supabase/09_employee_os.sql</b> in Supabase → SQL Editor, then reload this page.
          </p>
        </Card>
      ) : !loaded ? (
        <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-6">
            {emps.map((e) => (
              <EmployeeTile key={e.id} e={e} active={e.id === sel} onClick={() => setSel(e.id)}
                clock={clock.filter((c) => c.employee_id === e.id)}
                tasks={tasks.filter((t) => t.employee_id === e.id)}
                day={days.find((d) => d.employee_id === e.id && d.day === today)} today={today} />
            ))}
          </div>
          {emp && (
            <EmployeeDetail key={emp.id} e={emp} today={today} write={write} reload={load}
              clock={clock.filter((c) => c.employee_id === emp.id)}
              tasks={tasks.filter((t) => t.employee_id === emp.id)}
              days={days.filter((d) => d.employee_id === emp.id)} />
          )}
        </>
      )}
    </WsShell>
  )
}

type Write = (p: PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>

function nnProgress(e: Employee, day?: Day) {
  const keys = [...e.nn_owner.map((i) => `r:${i}`), ...e.nn_own.map((i) => `m:${i}`)]
  const done = keys.filter((k) => day?.nn_done?.includes(k)).length
  return { done, total: keys.length }
}

function EmployeeTile({ e, active, onClick, clock, tasks, day, today }: {
  e: Employee; active: boolean; onClick: () => void; clock: Clock[]; tasks: Task[]; day?: Day; today: string
}) {
  const todays = clock.filter((c) => localDayISO(c.at) === today)
  const last = todays[todays.length - 1]
  const firstIn = todays.find((c) => c.kind === 'in')
  const nn = nnProgress(e, day)
  const open = tasks.filter((t) => !t.done).length
  const status = !last ? { t: 'Not clocked in', c: 'var(--color-muted)' }
    : last.kind === 'in' ? { t: `On the clock since ${timeLabel(firstIn!.at)}`, c: '#16a34a' }
    : { t: `Clocked out ${timeLabel(last.at)}`, c: '#b45309' }
  return (
    <button onClick={onClick} className="text-left">
      <Card className="p-4" style={active ? { borderColor: 'var(--color-accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-accent) 30%, transparent)' } : undefined}>
        <div className="flex items-center justify-between">
          <p className="font-semibold" style={{ color: 'var(--color-text)' }}>{e.name}{!e.active && <span className="ml-2 text-xs" style={{ color: '#dc2626' }}>off</span>}</p>
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{[e.title, e.company].filter(Boolean).join(' · ')}</span>
        </div>
        <p className="text-sm mt-1.5 font-medium" style={{ color: status.c }}>{status.t}</p>
        <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          {todays.length > 0 && <span>⏱ {fmtWorked(workedMinutes(clock, today))}</span>}
          {nn.total > 0 && <span>✅ {nn.done}/{nn.total} non-negotiables</span>}
          <span>📋 {open} open</span>
          {!e.pin_hash && <span style={{ color: '#dc2626' }}>No PIN yet</span>}
        </div>
      </Card>
    </button>
  )
}

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{title}</h3>
        {right}
      </div>
      {children}
    </Card>
  )
}

function EmployeeDetail({ e, clock, tasks, days, today, write, reload }: {
  e: Employee; clock: Clock[]; tasks: Task[]; days: Day[]; today: string; write: Write; reload: () => Promise<void>
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ClockPanel clock={clock} />
      <TasksPanel e={e} tasks={tasks} today={today} write={write} />
      <NnPanel e={e} day={days.find((d) => d.day === today)} write={write} />
      <JournalPanel days={days} />
      <SettingsPanel e={e} write={write} reload={reload} />
    </div>
  )
}

function ClockPanel({ clock }: { clock: Clock[] }) {
  const byDay = useMemo(() => {
    const m = new Map<string, Clock[]>()
    for (const c of clock) { const k = localDayISO(c.at); m.set(k, [...(m.get(k) || []), c]) }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [clock])
  return (
    <Panel title="Time clock · last 14 days">
      {byDay.length === 0 && <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No punches yet.</p>}
      <div className="space-y-3 max-h-[420px] overflow-y-auto">
        {byDay.map(([d, list]) => (
          <div key={d}>
            <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>
              <span>{new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className="tnum">{fmtWorked(workedMinutes(list, d))}</span>
            </div>
            {list.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                <span className="font-semibold w-9" style={{ color: c.kind === 'in' ? '#16a34a' : '#dc2626' }}>{c.kind === 'in' ? 'In' : 'Out'}</span>
                <span className="tnum" style={{ color: 'var(--color-text)' }}>{timeLabel(c.at)}</span>
                {c.lat != null && c.lng != null
                  ? <a href={mapsLink(c.lat, c.lng)} target="_blank" rel="noopener" className="ml-auto text-xs font-medium" style={{ color: 'var(--color-accent)' }}>📍 Map · ±{Math.round(c.accuracy_m || 0)} m</a>
                  : <span className="ml-auto text-xs" style={{ color: '#b45309' }}>{geoLabel(c)}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function TasksPanel({ e, tasks, today, write }: { e: Employee; tasks: Task[]; today: string; write: Write }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 10)

  const add = async () => {
    if (!title.trim()) return
    const ok = await write(db().from('emp_tasks').insert({ employee_id: e.id, title: title.trim(), notes: notes.trim(), due: due || null, created_by: 'owner' }))
    if (ok) { setTitle(''); setNotes(''); setDue('') }
  }
  const row = (t: Task) => (
    <li key={t.id} className="flex items-start gap-2.5 py-2">
      <span className="w-5 h-5 mt-0.5 rounded-md grid place-items-center shrink-0"
        style={{ background: t.done ? '#16a34a' : 'transparent', border: t.done ? 'none' : '2px solid var(--color-border)', color: '#fff' }}>
        {t.done && <IconCheck width={13} height={13} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--color-text)', opacity: t.done ? 0.6 : 1 }}>{t.title}</p>
        <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
          {t.created_by === 'employee' ? `Added by ${e.name}` : 'From you'}
          {t.due && <span style={{ color: !t.done && t.due < today ? '#dc2626' : undefined }}> · {formatDueLabel(t.due)}</span>}
          {t.done && t.done_at && ` · done ${new Date(t.done_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
        </p>
      </div>
      <button onClick={() => void write(db().from('emp_tasks').delete().eq('id', t.id))} aria-label="Delete" style={{ color: 'var(--color-muted)' }}><IconTrash width={15} height={15} /></button>
    </li>
  )
  return (
    <Panel title={`Tasks · ${open.length} open`}>
      <div className="flex flex-col gap-2 mb-3">
        <input value={title} onChange={(ev) => setTitle(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') void add() }}
          placeholder={`Assign a task to ${e.name}…`} className="rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
        <div className="flex gap-2">
          <input value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Notes (optional)" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
          <input type="date" value={due} onChange={(ev) => setDue(ev.target.value)} className="rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
          <button onClick={() => void add()} disabled={!title.trim()} className="rounded-xl px-3.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Assign</button>
        </div>
      </div>
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>{open.map(row)}</ul>
      {done.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide mt-3" style={{ color: 'var(--color-muted)' }}>Recently done</p>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>{done.map(row)}</ul>
        </>
      )}
    </Panel>
  )
}

function NnPanel({ e, day, write }: { e: Employee; day?: Day; write: Write }) {
  const [draft, setDraft] = useState('')
  const save = (items: string[]) => write(db().from('emp_employees').update({ nn_owner: items }).eq('id', e.id))
  const tick = (k: string) => day?.nn_done?.includes(k)
  const item = (label: string, k: string, remove?: () => void) => (
    <li key={k} className="flex items-center gap-2.5 py-1.5">
      <span className="w-5 h-5 rounded-md grid place-items-center shrink-0"
        style={{ background: tick(k) ? '#16a34a' : 'transparent', border: tick(k) ? 'none' : '2px solid var(--color-border)', color: '#fff' }}>
        {tick(k) && <IconCheck width={13} height={13} />}
      </span>
      <span className="text-sm flex-1" style={{ color: 'var(--color-text)' }}>{label}</span>
      {remove && <button onClick={remove} aria-label="Remove" style={{ color: 'var(--color-muted)' }}><IconTrash width={15} height={15} /></button>}
    </li>
  )
  const add = () => { if (draft.trim()) { void save([...e.nn_owner, draft.trim()]); setDraft('') } }
  return (
    <Panel title="Non-negotiables · today">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>Your standard for {e.name} (he can't edit these)</p>
      <ul>{e.nn_owner.map((i) => item(i, `r:${i}`, () => void save(e.nn_owner.filter((x) => x !== i))))}</ul>
      <div className="flex gap-2 mt-2 mb-4">
        <input value={draft} onChange={(ev) => setDraft(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') add() }}
          placeholder="Add a non-negotiable…" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
        <button onClick={add} className="rounded-xl px-3" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}><IconPlus width={16} height={16} /></button>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>His own</p>
      {e.nn_own.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-muted)' }}>None yet.</p> : <ul>{e.nn_own.map((i) => item(i, `m:${i}`))}</ul>}
    </Panel>
  )
}

function JournalPanel({ days }: { days: Day[] }) {
  const entries = days.filter((d) => d.journal.trim())
  return (
    <Panel title="Journal · last 14 days">
      {entries.length === 0 && <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No entries yet.</p>}
      <div className="space-y-3 max-h-[420px] overflow-y-auto">
        {entries.map((d) => (
          <div key={d.day}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
              {new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <p className="text-sm whitespace-pre-wrap mt-0.5" style={{ color: 'var(--color-text)' }}>{d.journal}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function SettingsPanel({ e, write, reload }: { e: Employee; write: Write; reload: () => Promise<void> }) {
  const { toast } = useToast()
  const [name, setName] = useState(e.name)
  const [title, setTitle] = useState(e.title)
  const [pin, setPin] = useState('')
  const [apps, setApps] = useState<EmpApp[]>(e.apps || [])
  const loginUrl = `${window.location.origin}/employee`

  const setPinNow = async () => {
    const { error } = await supabase!.rpc('emp_set_pin', { p_employee: e.id, p_pin: pin })
    if (error) {
      const m = error.message
      toast(m.includes('pin_taken') ? 'Another employee already uses that code.' : m.includes('pin_too_short') ? 'Use at least 4 characters.' : m)
      return
    }
    setPin(''); toast(`PIN set — ${e.name} is signed out on other phones.`); await reload()
  }

  return (
    <Panel title="Settings">
      <div className="grid gap-3">
        <div className="flex gap-2">
          <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Name" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
          <input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Role (PM, Runner, QC…)" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
          <button onClick={() => void write(db().from('emp_employees').update({ name: name.trim() || e.name, title: title.trim() }).eq('id', e.id), 'Saved')}
            className="rounded-xl px-3.5 text-sm font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Save</button>
        </div>

        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>
            Employee code (PIN) {e.pin_hash ? '· set' : <span style={{ color: '#dc2626' }}>· not set yet</span>}
          </p>
          <div className="flex gap-2">
            <input value={pin} onChange={(ev) => setPin(ev.target.value)} placeholder={e.pin_hash ? 'Type a new code to change it' : 'e.g. B1234'}
              autoComplete="off" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
            <button onClick={() => void setPinNow()} disabled={pin.trim().length < 4} className="rounded-xl px-3.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Set PIN</button>
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>
            He signs in at <b>{loginUrl}</b>{' '}
            <button className="font-semibold" style={{ color: 'var(--color-accent)' }}
              onClick={() => { void navigator.clipboard?.writeText(loginUrl); toast('Link copied') }}>Copy link</button>
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>Buttons on his home screen</p>
          {apps.map((a, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={a.label} onChange={(ev) => setApps(apps.map((x, j) => j === i ? { ...x, label: ev.target.value } : x))}
                placeholder="Label" className="w-40 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
              <input value={a.url} onChange={(ev) => setApps(apps.map((x, j) => j === i ? { ...x, url: ev.target.value } : x))}
                placeholder="https://…" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
              <button onClick={() => setApps(apps.filter((_, j) => j !== i))} aria-label="Remove" style={{ color: 'var(--color-muted)' }}><IconTrash width={15} height={15} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setApps([...apps, { label: '', url: '' }])} className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>+ Add button</button>
            <button onClick={() => void write(db().from('emp_employees').update({ apps: apps.filter((a) => a.url.trim()) }).eq('id', e.id), 'Buttons saved')}
              className="ml-auto rounded-xl px-3.5 py-1.5 text-sm font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Save buttons</button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
          <input type="checkbox" checked={e.active}
            onChange={(ev) => void write(db().from('emp_employees').update({ active: ev.target.checked }).eq('id', e.id), ev.target.checked ? 'Access on' : 'Access off — signed out')} />
          Access on (turn off to lock {e.name} out immediately)
        </label>
      </div>
    </Panel>
  )
}
