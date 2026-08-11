import { useMemo, useState } from 'react'
import { Card, PageHeader, Button, IntegrationNote } from '../components/ui'
import { IconBell } from '../components/icons'
import { useStore } from '../lib/store'
import { taskAgenda } from '../lib/agenda'

type Reminder = { source: string; date: string; text: string; days: number }
type Prefs = { Tasks: boolean; Events: boolean; Appointments: boolean; Birthdays: boolean }

const todayMid = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) }
const daysFromToday = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return Infinity
  return Math.round((d.getTime() - todayMid().getTime()) / 86400000)
}
const rkey = (r: Reminder) => `${r.source}|${r.date}|${r.text}`

function gather(prefs: Prefs): Reminder[] {
  const get = <T,>(key: string): T[] => {
    try { return JSON.parse(localStorage.getItem('jess:' + key) || '[]') } catch { return [] }
  }
  const out: Reminder[] = []
  if (prefs.Events) get<{ date: string; title: string }>('calendar.events').forEach((e) => {
    const d = daysFromToday(e.date); if (d >= 0 && d <= 30) out.push({ source: 'Event', date: e.date, text: e.title, days: d })
  })
  if (prefs.Appointments) get<{ date: string; who: string; what: string }>('family.appts').forEach((a) => {
    const d = daysFromToday(a.date); if (d >= 0 && d <= 30) out.push({ source: 'Appointment', date: a.date, text: `${a.who} — ${a.what}`, days: d })
  })
  if (prefs.Birthdays) get<{ name: string; birthday: string }>('family.members').forEach((m) => {
    if (!m.birthday) return
    const [, mm, dd] = m.birthday.split('-').map(Number)
    if (!mm || !dd) return
    let next = new Date(new Date().getFullYear(), mm - 1, dd)
    if (next < todayMid()) next = new Date(new Date().getFullYear() + 1, mm - 1, dd)
    const d = Math.round((next.getTime() - todayMid().getTime()) / 86400000)
    if (d <= 30) out.push({ source: 'Birthday', date: next.toISOString().slice(0, 10), text: `${m.name}'s birthday 🎂`, days: d })
  })
  if (prefs.Tasks) taskAgenda().forEach((t) => {
    if (t.done) return
    const d = daysFromToday(t.date)
    if (d >= 0 && d <= 30) out.push({ source: t.source === 'Task' ? 'To-do' : `${t.source} to-do`, date: t.date, text: t.title, days: d })
  })
  return out.sort((a, b) => a.days - b.days)
}

const dayLabel = (days: number, date: string) =>
  days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

export default function Notifications() {
  const [prefs, setPrefs] = useStore<Prefs>('notif.prefs', { Tasks: true, Events: true, Appointments: true, Birthdays: true })
  const [dismissed, setDismissed] = useStore<string[]>('notif.dismissed', [])
  const [showDismissed, setShowDismissed] = useState(false)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')

  const all = useMemo(() => gather(prefs), [prefs])
  const visible = all.filter((r) => showDismissed || !dismissed.includes(rkey(r)))

  // Group by day label.
  const groups = useMemo(() => {
    const map: Record<string, Reminder[]> = {}
    visible.forEach((r) => { const l = dayLabel(r.days, r.date); (map[l] ??= []).push(r) })
    return Object.entries(map)
  }, [visible])

  const soon = all.filter((r) => r.days <= 7 && !dismissed.includes(rkey(r))).length

  const enable = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission(); setPerm(p)
    if (p === 'granted') new Notification("Rolando's Dashboard", { body: "You'll get reminders here." })
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="What's coming up in the next 30 days — tasks, events, appointments and birthdays."
        action={perm !== 'granted'
          ? <Button onClick={enable}><IconBell width={16} height={16} /> Enable alerts</Button>
          : <span className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>Alerts on ✓</span>}
      />

      {/* Daily digest */}
      <Card className="p-5 mb-4">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Daily digest</p>
        <p className="text-lg font-semibold mt-0.5" style={{ color: 'var(--color-text)' }}>
          {soon === 0 ? 'Nothing pressing in the next 7 days. ✨' : `You have ${soon} thing${soon === 1 ? '' : 's'} coming up this week.`}
        </p>
      </Card>

      {/* Preferences */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold mr-1" style={{ color: 'var(--color-text)' }}>Remind me about:</span>
          {(Object.keys(prefs) as (keyof Prefs)[]).map((k) => (
            <button key={k} onClick={() => setPrefs({ ...prefs, [k]: !prefs[k] })} className="text-xs font-semibold px-3 py-1.5 rounded-full transition"
              style={prefs[k] ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' } : { background: 'var(--color-bg)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
              {k}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {dismissed.length > 0 && <button onClick={() => setShowDismissed((s) => !s)} className="text-xs" style={{ color: 'var(--color-muted)' }}>{showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissed.length})`}</button>}
            {dismissed.length > 0 && <button onClick={() => setDismissed([])} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Reset</button>}
          </div>
        </div>
      </Card>

      <Card className="p-5 mb-6">
        {groups.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>Nothing coming up. Add events, appointments, tasks or birthdays.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([label, items]) => (
              <div key={label}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: label === 'Today' ? 'var(--color-accent)' : 'var(--color-muted)' }}>{label}</div>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => {
                    const isDismissed = dismissed.includes(rkey(r))
                    return (
                      <li key={rkey(r)} className="group flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-bg)', opacity: isDismissed ? 0.5 : 1 }}>
                        <div className="h-9 w-9 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}><IconBell width={16} height={16} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{r.text}</div>
                          <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{r.source}</div>
                        </div>
                        {isDismissed ? (
                          <button onClick={() => setDismissed((p) => p.filter((k) => k !== rkey(r)))} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Restore</button>
                        ) : (
                          <button onClick={() => setDismissed((p) => [...p, rkey(r)])} className="text-xs opacity-0 group-hover:opacity-100" style={{ color: 'var(--color-muted)' }}>Dismiss</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <IntegrationNote title="Push to your phone (next phase)">
        These reminders work in the browser today. To send them to your phone, we'll add a push
        service plus a daily scheduler that checks each morning — it plugs into the same list above.
      </IntegrationNote>
    </div>
  )
}
