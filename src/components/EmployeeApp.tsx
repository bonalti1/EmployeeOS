import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Card } from './ui'
import { IconCheck, IconHome, IconJournal, IconPlus, IconTasks, IconTrash } from './icons'
import { todayISO, formatDueLabel } from '../lib/dates'
import {
  empApi, empErrorText, empToken, fmtWorked, geoLabel, getGeoStamp, isSessionExpired, localDayISO,
  mapsLink, timeLabel, workedMinutes, type EmpMe, type EmpTask,
} from '../lib/employee'

/**
 * Employee OS — the whole app as a field employee sees it, at /employee.
 *
 * Deliberately outside AuthGate: there is no email account. The employee types
 * his PIN once, the phone keeps the session token, and he lands here on every
 * open. What he can reach is decided by the emp_* database functions, not by
 * this screen (see src/lib/employee.ts).
 */

export default function EmployeeApp() {
  const [token, setToken] = useState<string | null>(() => empToken.get())
  if (!token) return <PinGate onIn={(t) => { empToken.set(t); setToken(t) }} />
  return <EmployeeOS token={token} onOut={() => { empToken.clear(); setToken(null) }} />
}

// ── PIN screen ──────────────────────────────────────────────────────────────

function PinGate({ onIn }: { onIn: (token: string) => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!pin.trim() || busy) return
    setBusy(true); setError('')
    try {
      const r = await empApi.login(pin)
      onIn(r.token)
    } catch (e) {
      setError(empErrorText(e)); setPin('')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-full grid place-items-center px-5 py-10" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #16294d 0%, #0b1220 70%)' }}>
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="rounded-2xl p-2.5" style={{ background: '#fff' }}>
            <img src="/logos/stb.png" alt="South Texas Builders" style={{ height: 52, width: 'auto' }} />
          </div>
          <h1 className="mt-5 text-[22px] font-semibold" style={{ color: '#f4f7fb' }}>Employee OS</h1>
          <p className="text-sm mt-1" style={{ color: '#93a1b5' }}>Enter your employee code</p>
        </div>
        <div className="rounded-[22px] p-5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <input
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            type="password"
            autoCapitalize="none" autoCorrect="off" autoComplete="off"
            placeholder="Code"
            className="w-full rounded-xl px-4 py-3.5 text-lg text-center tracking-[0.2em] outline-none"
            style={{ background: 'rgba(10,15,26,0.55)', border: '1px solid rgba(255,255,255,0.14)', color: '#f4f7fb' }}
          />
          <button
            onClick={submit}
            disabled={busy || !pin.trim()}
            className="w-full mt-3 rounded-xl px-4 py-3.5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)', color: '#fff' }}
          >
            {busy ? 'Checking…' : 'Enter'}
          </button>
          {error && <p className="text-sm text-center mt-3 font-medium" style={{ color: '#fca5a5' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}

// ── The OS ──────────────────────────────────────────────────────────────────

type Tab = 'today' | 'tasks' | 'journal'

function EmployeeOS({ token, onOut }: { token: string; onOut: () => void }) {
  const [day, setDay] = useState(todayISO())
  const [me, setMe] = useState<EmpMe | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('today')

  const load = useCallback(async () => {
    const d = todayISO()
    setDay(d)
    try { setMe(await empApi.me(token, d)); setError('') }
    catch (e) { if (isSessionExpired(e)) onOut(); else setError(empErrorText(e)) }
  }, [token, onOut])

  useEffect(() => { void load() }, [load])
  // Coming back to the app (unlocking the phone, switching back) refreshes
  // the day, so a new morning never shows yesterday's checklist.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  /** Runs a write; a dead session sends him back to the PIN screen. */
  const run = useCallback(async (fn: () => Promise<unknown>, reload = true) => {
    try { await fn(); if (reload) await load() }
    catch (e) { if (isSessionExpired(e)) onOut(); else setError(empErrorText(e)) }
  }, [load, onOut])

  const signOut = async () => { try { await empApi.logout(token) } catch { /* offline: still sign out here */ } onOut() }

  if (!me) {
    return (
      <div className="h-full grid place-items-center px-6 text-center" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
        <div>
          <p className="text-sm">{error || 'Loading…'}</p>
          {error && <button className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-accent)' }} onClick={() => void load()}>Try again</button>}
        </div>
      </div>
    )
  }

  const first = me.employee.name.split(' ')[0]
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <img src="/logos/stb.png" alt="" style={{ height: 22, width: 'auto' }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted)' }}>{first}'s OS</span>
        <button onClick={signOut} className="ml-auto text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Sign out</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 pt-5 pb-28">
          {error && (
            <div className="mb-4 rounded-xl px-3.5 py-2.5 text-sm" style={{ background: '#fef2f2', color: '#b91c1c' }}>{error}</div>
          )}
          {tab === 'today' && (
            <>
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{greet}, {first}</h1>
              <p className="text-sm mt-0.5 mb-5" style={{ color: 'var(--color-muted)' }}>
                {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <ClockCard me={me} day={day} token={token} run={run} />
              <AppsCard me={me} />
              <NonNegotiables me={me} day={day} token={token} run={run} />
              <TasksCard me={me} token={token} run={run} todayOnly day={day} onSeeAll={() => setTab('tasks')} />
            </>
          )}
          {tab === 'tasks' && <TasksCard me={me} token={token} run={run} day={day} />}
          {tab === 'journal' && <JournalCard me={me} day={day} token={token} run={run} />}
        </div>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 glass" style={{ borderTop: '1px solid var(--color-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex max-w-xl mx-auto">
          {([
            ['today', 'Today', IconHome],
            ['tasks', 'Tasks', IconTasks],
            ['journal', 'Journal', IconJournal],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 min-h-[56px]"
              style={{ color: tab === id ? 'var(--color-accent)' : 'var(--color-muted)' }}>
              <Icon width={22} height={22} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

type Run = (fn: () => Promise<unknown>, reload?: boolean) => Promise<void>

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{title}</h2>
        {right}
      </div>
      {children}
    </Card>
  )
}

// ── Clock in / out with a GPS stamp ─────────────────────────────────────────

function ClockCard({ me, day, token, run }: { me: EmpMe; day: string; token: string; run: Run }) {
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t) }, [])

  const today = me.clock.filter((c) => localDayISO(c.at) === day)
  const last = today[today.length - 1]
  const clockedIn = last?.kind === 'in'
  const worked = workedMinutes(me.clock, day)

  const punch = async () => {
    setBusy(true)
    const geo = await getGeoStamp()
    await run(() => empApi.punch(token, clockedIn ? 'out' : 'in', geo))
    setBusy(false)
  }

  return (
    <Section title="Time clock" right={today.length > 0 ? <span className="text-sm font-semibold tnum" style={{ color: 'var(--color-text)' }}>{fmtWorked(worked)}</span> : undefined}>
      <button
        onClick={punch}
        disabled={busy}
        className="w-full rounded-2xl py-4 text-[17px] font-semibold transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: clockedIn ? '#dc2626' : '#16a34a', color: '#fff' }}
      >
        {busy ? 'Getting location…' : clockedIn ? 'Clock out' : 'Clock in'}
      </button>
      <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-muted)' }}>
        📍 Your location is saved only at the moment you tap this button.
      </p>
      {today.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {today.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="font-semibold w-14" style={{ color: c.kind === 'in' ? '#16a34a' : '#dc2626' }}>{c.kind === 'in' ? 'In' : 'Out'}</span>
              <span className="tnum" style={{ color: 'var(--color-text)' }}>{timeLabel(c.at)}</span>
              {c.lat != null && c.lng != null
                ? <a href={mapsLink(c.lat, c.lng)} target="_blank" rel="noopener" className="ml-auto text-xs font-medium" style={{ color: 'var(--color-accent)' }}>{geoLabel(c)}</a>
                : <span className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>{geoLabel(c)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ── App buttons (Open STB Scheduling, …) ────────────────────────────────────

function AppsCard({ me }: { me: EmpMe }) {
  const apps = (me.employee.apps || []).filter((a) => a && a.url)
  if (apps.length === 0) return null
  return (
    <div className="mb-4 grid gap-2.5">
      {apps.map((a) => (
        <a key={a.url + a.label} href={a.url} target="_blank" rel="noopener"
          className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition active:scale-[0.98]"
          style={{ background: '#16294d', color: '#fff' }}>
          <span>{a.label || 'Open'}</span>
          <span aria-hidden>↗</span>
        </a>
      ))}
    </div>
  )
}

// ── Non-negotiables: Rolando's list + his own ───────────────────────────────

function NonNegotiables({ me, day, token, run }: { me: EmpMe; day: string; token: string; run: Run }) {
  const [done, setDone] = useState<string[]>(me.day?.nn_done || [])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useEffect(() => { setDone(me.day?.nn_done || []) }, [me.day, day])

  const owner = me.employee.nn_owner || []
  const own = me.employee.nn_own || []
  // Ticks are keyed by list so the same wording on both lists stays separate.
  const key = (list: 'r' | 'm', item: string) => `${list}:${item}`

  const toggle = (k: string) => {
    const next = done.includes(k) ? done.filter((x) => x !== k) : [...done, k]
    setDone(next)
    void run(() => empApi.saveDay(token, day, { nn_done: next }), false)
  }
  const saveOwn = (items: string[]) => run(() => empApi.saveOwnNn(token, items))

  const total = owner.length + own.length
  const count = done.filter((k) => owner.some((i) => key('r', i) === k) || own.some((i) => key('m', i) === k)).length

  const Row = ({ k, label, removable }: { k: string; label: string; removable?: () => void }) => {
    const on = done.includes(k)
    return (
      <li className="flex items-center gap-3 py-1.5">
        <button onClick={() => toggle(k)} aria-label={on ? 'Undo' : 'Done'}
          className="w-6 h-6 rounded-lg grid place-items-center shrink-0"
          style={{ background: on ? '#16a34a' : 'transparent', border: on ? 'none' : '2px solid var(--color-border)', color: '#fff' }}>
          {on && <IconCheck width={15} height={15} />}
        </button>
        <span className="text-[15px] flex-1" style={{ color: 'var(--color-text)', textDecoration: on ? 'line-through' : 'none', opacity: on ? 0.6 : 1 }}>{label}</span>
        {editing && removable && (
          <button onClick={removable} aria-label="Remove" style={{ color: 'var(--color-muted)' }}><IconTrash width={16} height={16} /></button>
        )}
      </li>
    )
  }

  return (
    <Section title="Non-negotiables" right={total > 0 ? <span className="text-sm font-semibold tnum" style={{ color: count === total ? '#16a34a' : 'var(--color-text)' }}>{count}/{total}</span> : undefined}>
      {owner.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>From Rolando</p>
          <ul className="mb-3">{owner.map((i) => <Row key={key('r', i)} k={key('r', i)} label={i} />)}</ul>
        </>
      )}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Mine</p>
        <button onClick={() => setEditing((v) => !v)} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      {own.length === 0 && !editing && <p className="text-sm py-1" style={{ color: 'var(--color-muted)' }}>Add the things you hold yourself to every day.</p>}
      <ul>{own.map((i) => <Row key={key('m', i)} k={key('m', i)} label={i} removable={() => void saveOwn(own.filter((x) => x !== i))} />)}</ul>
      {editing && (
        <div className="flex gap-2 mt-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add one…"
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { void saveOwn([...own, draft.trim()]); setDraft('') } }}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <button onClick={() => { if (draft.trim()) { void saveOwn([...own, draft.trim()]); setDraft('') } }}
            className="rounded-xl px-3" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}><IconPlus width={18} height={18} /></button>
        </div>
      )}
    </Section>
  )
}

// ── Tasks ───────────────────────────────────────────────────────────────────

function TasksCard({ me, token, run, day, todayOnly, onSeeAll }: {
  me: EmpMe; token: string; run: Run; day: string; todayOnly?: boolean; onSeeAll?: () => void
}) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const open = me.tasks.filter((t) => !t.done)
  const shown = todayOnly ? open.filter((t) => !t.due || t.due <= day) : me.tasks

  const add = () => {
    if (!title.trim()) return
    const t = title.trim(); const d = due || null
    setTitle(''); setDue('')
    void run(() => empApi.taskAdd(token, t, d))
  }

  return (
    <Section title={todayOnly ? 'Today’s tasks' : 'Tasks'}
      right={todayOnly && onSeeAll ? <button onClick={onSeeAll} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>All tasks ({open.length})</button> : undefined}>
      {shown.length === 0 && <p className="text-sm py-1" style={{ color: 'var(--color-muted)' }}>{todayOnly ? 'Nothing due today.' : 'No tasks yet.'}</p>}
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {shown.map((t) => <TaskRow key={t.id} t={t} day={day} token={token} run={run} />)}
      </ul>
      {!todayOnly && (
        <div className="mt-3 flex flex-col gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task for yourself…"
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <div className="flex gap-2">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
            <button onClick={add} disabled={!title.trim()} className="rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Add</button>
          </div>
        </div>
      )}
    </Section>
  )
}

function TaskRow({ t, day, token, run }: { t: EmpTask; day: string; token: string; run: Run }) {
  const overdue = !t.done && t.due && t.due < day
  return (
    <li className="flex items-start gap-3 py-2.5">
      <button onClick={() => void run(() => empApi.taskDone(token, t.id, !t.done))} aria-label={t.done ? 'Undo' : 'Done'}
        className="w-6 h-6 mt-0.5 rounded-lg grid place-items-center shrink-0"
        style={{ background: t.done ? '#16a34a' : 'transparent', border: t.done ? 'none' : '2px solid var(--color-border)', color: '#fff' }}>
        {t.done && <IconCheck width={15} height={15} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[15px]" style={{ color: 'var(--color-text)', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1 }}>{t.title}</p>
        {t.notes && <p className="text-xs mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--color-muted)' }}>{t.notes}</p>}
        <div className="flex gap-2 mt-0.5 text-[11px] font-medium">
          {t.created_by === 'owner' && <span style={{ color: '#b45309' }}>From Rolando</span>}
          {t.due && <span style={{ color: overdue ? '#dc2626' : 'var(--color-muted)' }}>{overdue ? 'Overdue · ' : ''}{formatDueLabel(t.due)}</span>}
        </div>
      </div>
      {t.created_by === 'employee' && (
        <button onClick={() => void run(() => empApi.taskDelete(token, t.id))} aria-label="Delete" style={{ color: 'var(--color-muted)' }}>
          <IconTrash width={16} height={16} />
        </button>
      )}
    </li>
  )
}

// ── Journal ─────────────────────────────────────────────────────────────────

function JournalCard({ me, day, token, run }: { me: EmpMe; day: string; token: string; run: Run }) {
  const [text, setText] = useState(me.day?.journal || '')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => { setText(me.day?.journal || '') }, [day]) // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (v: string) => {
    setText(v); setSaved('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await run(() => empApi.saveDay(token, day, { journal: v }), false)
      setSaved('saved')
    }, 800)
  }

  return (
    <Section title={`Journal · ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
      right={<span className="text-xs" style={{ color: 'var(--color-muted)' }}>{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}</span>}>
      <p className="text-sm mb-2" style={{ color: 'var(--color-muted)' }}>What got done today, what's blocked, what Rolando should know.</p>
      <textarea value={text} onChange={(e) => onChange(e.target.value)} rows={12}
        className="w-full rounded-xl px-3 py-2.5 text-[15px] leading-relaxed outline-none resize-y"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
    </Section>
  )
}
