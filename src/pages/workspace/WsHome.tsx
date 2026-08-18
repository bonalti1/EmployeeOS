import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Button, Input } from '../../components/ui'
import { IconCheck, IconPlus } from '../../components/icons'
import { WsShell, BrandBadge, PriorityBadge, wsField } from '../../components/WorkspaceLayout'
import {
  useWorkspace, useWsTable, useWsSettings, wsTodayISO, fmtWsDate, STAGES, ASSISTANT_NAME,
  type WsTask, type WsContent, type WsMessage, type WsJournalEntry, type WsIdea,
} from '../../lib/workspace'
import { PROMPTS } from './WsJournal'

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

/** One non-negotiable. Identical in both lists — whose it is shows in the
 * heading above it, not in how the row looks, because they carry equal weight
 * once the day starts. Only a removable row shows the ✕. */
function NnRow({ item, done, onToggle, onRemove }: {
  item: string; done: boolean; onToggle: () => void; onRemove?: () => void
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5" style={{ background: 'var(--color-bg)' }}>
      <button onClick={onToggle} className="h-4 w-4 rounded grid place-items-center shrink-0"
        style={{ border: '2px solid var(--color-accent)', background: done ? 'var(--color-accent)' : 'transparent' }} aria-label="Toggle">
        {done && <IconCheck width={11} height={11} style={{ color: 'var(--color-on-accent)' }} />}
      </button>
      <span className="text-sm" style={{ color: 'var(--color-text)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1 }}>{item}</span>
      {onRemove && (
        <button onClick={onRemove} className="ml-auto text-xs shrink-0" style={{ color: 'var(--color-muted)' }} aria-label="Remove">✕</button>
      )}
    </li>
  )
}

/** Time-of-day greeting, same voice as the Personal OS home. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function SectionTitle({ children, to }: { children: React.ReactNode; to?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>{children}</h2>
      {to && <Link to={to} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>View all</Link>}
    </div>
  )
}

export default function WsHome() {
  const { role } = useWorkspace()
  const tasks = useWsTable<WsTask>('ws_tasks')
  const content = useWsTable<WsContent>('ws_content')
  const messages = useWsTable<WsMessage>('ws_messages')
  const journal = useWsTable<WsJournalEntry>('ws_journal')
  const ideas = useWsTable<WsIdea>('ws_ideas')
  const { settings, set } = useWsSettings()

  const [quick, setQuick] = useState('')
  const [quickKind, setQuickKind] = useState<'task' | 'idea'>('task')
  const [msgDraft, setMsgDraft] = useState('')
  const [editingNN, setEditingNN] = useState(false)
  const [nnDraft, setNnDraft] = useState('')
  const [ownDraft, setOwnDraft] = useState('')

  const today = wsTodayISO()
  const splitList = (raw: string) => raw.split('\n').map((s) => s.trim()).filter(Boolean)
  // Two lists, deliberately kept in separate settings keys: `nn_list` is the
  // owner's and is owner-write-only in RLS, `nn_list_assistant` is the
  // assistant's own. See supabase/06_non_negotiables.sql.
  const nnList = useMemo(() => splitList(settings['nn_list'] || ''), [settings])
  const ownList = useMemo(() => splitList(settings['nn_list_assistant'] || ''), [settings])

  // Ticks are keyed 'o:<i>' / 'a:<i>' so the two lists cannot collide. Older
  // days stored bare indices, which always meant the owner's list.
  const nnDone = useMemo<string[]>(() => {
    try {
      const raw: unknown = JSON.parse(settings[`nn_done_${today}`] || '[]')
      return Array.isArray(raw) ? raw.map((v) => (typeof v === 'number' ? `o:${v}` : String(v))) : []
    } catch { return [] }
  }, [settings, today])

  const toggleNN = (id: string) => {
    const next = nnDone.includes(id) ? nnDone.filter((x) => x !== id) : [...nnDone, id]
    void set(`nn_done_${today}`, JSON.stringify(next))
  }

  /** The assistant's own list — theirs to add to and theirs to drop. */
  const addOwn = async () => {
    const t = ownDraft.trim()
    if (!t) return
    await set('nn_list_assistant', [...ownList, t].join('\n'))
    setOwnDraft('')
  }
  const removeOwn = async (i: number) => {
    await set('nn_list_assistant', ownList.filter((_, n) => n !== i).join('\n'))
  }

  const todayTasks = (tasks.rows ?? [])
    .filter((t) => t.status === 'today')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const waiting = (tasks.rows ?? []).filter((t) => t.status === 'waiting')
  const inbox = (messages.rows ?? []).filter((m) => m.from_role === 'owner' && !m.done)

  const snapshot = STAGES.map((s) => ({ ...s, count: (content.rows ?? []).filter((c) => c.stage === s.id).length }))
  const needsApproval = (content.rows ?? []).filter((c) => c.stage === 'review').length

  const quickAdd = async () => {
    const text = quick.trim()
    if (!text) return
    if (quickKind === 'task') {
      await tasks.insert({ title: text, status: 'inbox', assigned_by: role === 'owner' ? 'owner' : 'assistant' } as Partial<WsTask>)
    } else {
      await content.insert({ title: text, stage: 'ideas' } as Partial<WsContent>)
    }
    setQuick('')
  }

  const sendMessage = async () => {
    const body = msgDraft.trim()
    if (!body || !role) return
    await messages.insert({ from_role: role, body } as Partial<WsMessage>)
    setMsgDraft('')
  }

  return (
    <WsShell
      title={`${greeting()}, ${ASSISTANT_NAME} 👋`}
      subtitle={role === 'assistant' ? 'Your daily command center' : `Shared command center for you and ${ASSISTANT_NAME}`}
    >
      {/* Quick add */}
      <Card className="p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={quickKind} onChange={(e) => setQuickKind(e.target.value as 'task' | 'idea')}
            className="rounded-xl px-3 py-2 text-sm outline-none" style={wsField}>
            <option value="task">New task</option>
            <option value="idea">Content idea</option>
          </select>
          <Input value={quick} onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void quickAdd() }}
            placeholder={quickKind === 'task' ? 'Quick add a task → goes to the Inbox…' : 'Quick add a content idea → goes to Ideas…'} />
          <Button onClick={() => void quickAdd()}><IconPlus width={15} height={15} /> Add</Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Daily non-negotiables */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Daily non-negotiables</h2>
            {role === 'owner' && (
              <button onClick={() => { setEditingNN(!editingNN); setNnDraft(nnList.join('\n')) }}
                className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                {editingNN ? 'Cancel' : 'Edit list'}
              </button>
            )}
          </div>
          {editingNN ? (
            <div>
              <textarea value={nnDraft} onChange={(e) => setNnDraft(e.target.value)} rows={6}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={wsField}
                placeholder="One non-negotiable per line" />
              <Button className="mt-2" onClick={async () => { await set('nn_list', nnDraft); setEditingNN(false) }}>Save</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Rolando's list: everyone ticks it off, only he can change it. */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                    Set by Rolando
                  </span>
                  {role === 'assistant' && (
                    <span className="text-[11px]" style={{ color: 'var(--color-muted)' }} title="Only Rolando can change these">🔒</span>
                  )}
                </div>
                {nnList.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Nothing set yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {nnList.map((item, i) => (
                      <NnRow key={`o${i}`} item={item} done={nnDone.includes(`o:${i}`)} onToggle={() => toggleNN(`o:${i}`)} />
                    ))}
                  </ul>
                )}
              </div>

              {/* The assistant's own. Added here, removed here, nobody else's
                  business — but visible to Rolando, because a standard you set
                  for yourself is worth him seeing you hold. */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-muted)' }}>
                  {role === 'assistant' ? 'Mine' : `${ASSISTANT_NAME}’s own`}
                </div>
                {ownList.length === 0 && role !== 'assistant' ? (
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{ASSISTANT_NAME} hasn’t added any yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {ownList.map((item, i) => (
                      <NnRow key={`a${i}`} item={item} done={nnDone.includes(`a:${i}`)} onToggle={() => toggleNN(`a:${i}`)}
                        onRemove={role === 'assistant' ? () => void removeOwn(i) : undefined} />
                    ))}
                  </ul>
                )}
                {role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Input value={ownDraft} onChange={(e) => setOwnDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void addOwn() }}
                      placeholder="Add one of your own…" className="text-sm" />
                    <Button variant="outline" className="px-2.5 shrink-0" onClick={() => void addOwn()} aria-label="Add">
                      <IconPlus width={15} height={15} />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Today's priorities */}
        <Card className="p-5">
          <SectionTitle to="/workspace/tasks">Today’s priorities</SectionTitle>
          {todayTasks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Nothing scheduled for today — pull tasks in from the Inbox.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {todayTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--color-bg)' }}>
                  <button onClick={() => void tasks.update(t.id, { status: 'done', completed_at: new Date().toISOString() } as Partial<WsTask>)}
                    className="h-4 w-4 rounded grid place-items-center shrink-0"
                    style={{ border: '2px solid var(--color-accent)' }} aria-label="Complete" />
                  <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>{t.title}</span>
                  {t.category !== 'Personal' && <BrandBadge brand={t.category} />}
                  <PriorityBadge priority={t.priority} />
                  {t.due && <span className="text-[10px] font-semibold tnum shrink-0" style={{ color: 'var(--color-accent)' }}>{fmtWsDate(t.due)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Inbox from Rolando */}
        <Card className="p-5">
          <SectionTitle>{role === 'assistant' ? 'Inbox from Rolando' : `Notes to ${ASSISTANT_NAME}`}</SectionTitle>
          {role === 'owner' && (
            <div className="flex gap-2 mb-3">
              <Input value={msgDraft} onChange={(e) => setMsgDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void sendMessage() }}
                placeholder={`Leave a note or request for ${ASSISTANT_NAME}…`} />
              <Button onClick={() => void sendMessage()}>Send</Button>
            </div>
          )}
          {inbox.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {role === 'assistant' ? 'No open items from Rolando. 🎉' : `No open notes — anything you send shows on ${ASSISTANT_NAME}’s home screen.`}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {inbox.map((m) => (
                <li key={m.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2" style={{ background: 'var(--color-bg)' }}>
                  <button onClick={() => void messages.update(m.id, { done: true } as Partial<WsMessage>)}
                    className="h-4 w-4 rounded grid place-items-center shrink-0 mt-0.5"
                    style={{ border: '2px solid var(--color-accent)' }} aria-label="Mark handled" title="Mark handled" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: 'var(--color-text)' }}>{m.body}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Content snapshot */}
        <Card className="p-5">
          <SectionTitle to="/workspace/content">Content snapshot</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {snapshot.map((s) => (
              <Link key={s.id} to="/workspace/content" className="rounded-xl px-2 py-2.5 text-center transition hover:opacity-80" style={{ background: 'var(--color-bg)' }}>
                <div className="text-lg font-semibold tnum" style={{ color: s.id === 'review' && s.count > 0 ? 'var(--color-accent)' : 'var(--color-text)' }}>{s.count}</div>
                <div className="text-[10px] font-medium mt-0.5 leading-tight" style={{ color: 'var(--color-muted)' }}>{s.label}</div>
              </Link>
            ))}
          </div>
          {role === 'owner' && needsApproval > 0 && (
            <Link to="/workspace/approvals" className="block mt-3 text-sm font-semibold rounded-xl px-3 py-2 text-center"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}>
              {needsApproval} item{needsApproval > 1 ? 's' : ''} waiting for your approval →
            </Link>
          )}
        </Card>

        {/* Fresh ideas — surfaced so the board doesn't become a write-only pile */}
        <Card className="p-5">
          <SectionTitle to="/workspace/ideas">Latest ideas</SectionTitle>
          {(ideas.rows ?? []).filter((i) => i.status !== 'shipped' && i.status !== 'parked').length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No open ideas. Tap the <b>+</b> button (bottom right) any time one hits you — type it or say it.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(ideas.rows ?? [])
                .filter((i) => i.status !== 'shipped' && i.status !== 'parked')
                .slice(0, 5)
                .map((i) => (
                  <li key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--color-bg)' }}>
                    {i.starred && <span className="shrink-0 text-[13px] leading-none" style={{ color: '#f59e0b' }}>★</span>}
                    <Link to="/workspace/ideas" className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>{i.text}</Link>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--color-muted)' }}>
                      {i.author_role === 'owner' ? 'Rolando' : ASSISTANT_NAME}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* Daily journal status */}
        <Card className="p-5">
          <SectionTitle to="/workspace/journal">Daily journal</SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {PROMPTS.map((p) => {
              const done = (journal.rows ?? []).some((e) => e.entry_date === today && e.kind === p.kind)
              return (
                <li key={p.kind} className="flex items-center gap-2.5 rounded-lg px-2 py-2" style={{ background: 'var(--color-bg)' }}>
                  <span className="h-4 w-4 rounded grid place-items-center shrink-0"
                    style={{ border: `2px solid ${done ? '#059669' : 'var(--color-border)'}`, background: done ? '#059669' : 'transparent' }}>
                    {done && <IconCheck width={11} height={11} style={{ color: '#fff' }} />}
                  </span>
                  <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)', opacity: done ? 0.55 : 1 }}>{p.title}</span>
                  {!done && (
                    <Link to="/workspace/journal" className="text-[11px] font-bold shrink-0" style={{ color: 'var(--color-accent)' }}>
                      {role === 'assistant' ? 'Record' : 'Not yet'}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        {/* Waiting / blocked */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle to="/workspace/tasks">Waiting / blocked</SectionTitle>
          {waiting.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Nothing is blocked right now.</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {waiting.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--color-bg)' }}>
                  <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>{t.title}</span>
                  {t.waiting_on && <span className="text-[11px] shrink-0" style={{ color: 'var(--color-muted)' }}>waiting on: {t.waiting_on}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </WsShell>
  )
}
