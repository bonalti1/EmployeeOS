import { useEffect, useMemo, useState } from 'react'
import { Card, Button, EmptyState } from '../../components/ui'
import { IconMic, IconTrash, IconCheck, IconJournal } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useToast } from '../../lib/toast'
import { useRecorder, fmtDuration, RECORD_SUPPORTED, SPEECH_SUPPORTED } from '../../lib/useRecorder'
import { putWsAudio, getWsAudio, delWsAudio } from '../../lib/wsAudio'
import { useWorkspace, useWsTable, wsTodayISO, ASSISTANT_NAME, type WsJournalEntry, type JournalKind } from '../../lib/workspace'

/**
 * Daily accountability journal. Two prompts a day, each recordable by voice:
 *   • recap  — what got done today
 *   • growth — what he did to get better today (asked in Spanish)
 * Carlos records; Rolando reads and listens. Recordings live in the shared
 * workspace-audio bucket so both sides can play them back.
 */

export const PROMPTS: { kind: JournalKind; title: string; sub: string; placeholder: string; lang: string }[] = [
  {
    kind: 'recap',
    title: 'What I did today',
    sub: 'The honest recap — what got done, what moved, what didn’t',
    placeholder: 'Today I finished… I filmed… I got stuck on…',
    lang: 'en-US',
  },
  {
    kind: 'growth',
    title: '¿Qué hice hoy para superarme y ser mejor?',
    sub: 'What I did today to level myself up — a skill, a lesson, a habit',
    placeholder: 'Hoy aprendí… practiqué… mejoré en…',
    lang: 'es-MX',
  },
]

const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const today = wsTodayISO()
  if (iso === today) return 'Today'
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  const yIso = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
  if (iso === yIso) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Plays a saved recording, fetching it from cache or the shared bucket. */
function AudioPlayer({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  if (url) return <audio src={url} controls className="w-full mt-2" style={{ height: 36 }} />

  return (
    <button
      onClick={async () => {
        setState('loading')
        const blob = await getWsAudio(id)
        if (blob) { setUrl(URL.createObjectURL(blob)); setState('idle') } else setState('missing')
      }}
      disabled={state === 'loading'}
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
      style={{ color: state === 'missing' ? 'var(--color-muted)' : 'var(--color-accent)' }}
    >
      <IconMic width={13} height={13} />
      {state === 'loading' ? 'Loading…' : state === 'missing' ? 'Recording unavailable' : 'Play recording'}
    </button>
  )
}

/** One prompt's recorder + text box for today. */
function PromptCard({ prompt, existing, onSave, onDelete }: {
  prompt: (typeof PROMPTS)[number]
  existing?: WsJournalEntry
  onSave: (text: string, blob: Blob | null, ms: number) => Promise<void>
  onDelete?: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const rec = useRecorder(prompt.lang, (phrase) => setText((prev) => (prev ? prev + ' ' : '') + phrase))

  const save = async () => {
    const blob = rec.recording ? await rec.stop() : rec.blobRef.current
    const body = text.trim()
    if (!body && !blob) return
    setBusy(true)
    await onSave(body, blob, rec.elapsed)
    setBusy(false)
    setText('')
    rec.reset()
  }

  if (existing) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-2">
          <span className="h-5 w-5 rounded-full grid place-items-center shrink-0 mt-0.5"
            style={{ background: '#059669', color: '#fff' }}>
            <IconCheck width={12} height={12} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{prompt.title}</h2>
            <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)' }}>
              {existing.text || <span style={{ color: 'var(--color-muted)' }}>(voice only)</span>}
            </p>
            {existing.has_audio && <AudioPlayer id={existing.id} />}
          </div>
          {onDelete && (
            <button onClick={onDelete} style={{ color: 'var(--color-muted)' }} aria-label="Delete">
              <IconTrash width={14} height={14} />
            </button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{prompt.title}</h2>
      <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--color-muted)' }}>{prompt.sub}</p>

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => (rec.recording ? void rec.stop() : void rec.start())}
          className="h-11 w-11 rounded-full grid place-items-center shrink-0 transition active:scale-95"
          style={{
            background: rec.recording ? '#dc2626' : 'var(--color-accent)',
            color: '#fff',
            boxShadow: rec.recording ? '0 0 0 6px color-mix(in srgb, #dc2626 18%, transparent)' : 'var(--shadow-md)',
          }}
          aria-label={rec.recording ? 'Stop recording' : 'Start recording'}
        >
          {rec.recording ? <span className="block h-3.5 w-3.5 rounded-[3px]" style={{ background: '#fff' }} /> : <IconMic width={19} height={19} />}
        </button>
        <div className="min-w-0">
          <div className="text-sm font-semibold tnum" style={{ color: rec.recording ? '#dc2626' : 'var(--color-text)' }}>
            {rec.recording ? fmtDuration(rec.elapsed) : rec.blob ? `Recorded ${fmtDuration(rec.elapsed)}` : 'Tap to record'}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
            {rec.recording
              ? (SPEECH_SUPPORTED ? 'Listening and transcribing…' : 'Recording audio…')
              : RECORD_SUPPORTED ? 'Or just type it below' : 'Recording not supported here — type below'}
          </div>
        </div>
      </div>

      {rec.error && <p className="text-sm mb-2" style={{ color: '#dc2626' }}>{rec.error}</p>}
      {rec.url && <audio src={rec.url} controls className="w-full mb-3" style={{ height: 36 }} />}

      <textarea
        value={text + (rec.interim ? (text ? ' ' : '') + rec.interim : '')}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={prompt.placeholder}
        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none leading-relaxed"
        style={wsField}
      />

      <div className="flex items-center gap-2 mt-3">
        <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</Button>
        {(rec.blob || text) && <Button variant="ghost" onClick={() => { rec.reset(); setText('') }}>Clear</Button>}
      </div>
    </Card>
  )
}

export default function WsJournal() {
  const { role } = useWorkspace()
  const { toast } = useToast()
  const confirmDelete = useConfirmDelete()
  const { rows, insert, update, remove } = useWsTable<WsJournalEntry>('ws_journal')
  const today = wsTodayISO()

  const entries = rows ?? []
  const todays = entries.filter((e) => e.entry_date === today)

  // Consecutive days (ending today or yesterday) with at least one entry.
  const streak = useMemo(() => {
    const days = new Set(entries.map((e) => e.entry_date))
    let n = 0
    const cursor = new Date()
    if (!days.has(today)) cursor.setDate(cursor.getDate() - 1)
    for (;;) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      if (!days.has(iso)) break
      n++
      cursor.setDate(cursor.getDate() - 1)
    }
    return n
  }, [entries, today])

  const history = useMemo(() => {
    const byDay = new Map<string, WsJournalEntry[]>()
    for (const e of entries) {
      if (e.entry_date === today) continue
      const list = byDay.get(e.entry_date) ?? []
      list.push(e)
      byDay.set(e.entry_date, list)
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries, today])

  const save = async (kind: JournalKind, text: string, blob: Blob | null, ms: number) => {
    const created = await insert({
      entry_date: today,
      kind,
      text,
      has_audio: false,
      duration_ms: blob ? ms : 0,
      author_role: role ?? 'assistant',
    } as Partial<WsJournalEntry>)
    if (!created) { toast('Could not save — check your connection'); return }
    // Only flag the entry as having audio once the upload actually lands, so
    // the owner never sees a play button for a recording that isn't there.
    if (blob) {
      const ok = await putWsAudio(created.id, blob)
      if (ok) await update(created.id, { has_audio: true } as Partial<WsJournalEntry>)
      else toast('Saved your text, but the audio upload failed')
    }
    toast('Entry saved')
  }

  const isOwner = role === 'owner'

  return (
    <WsShell
      title="Daily Journal"
      subtitle={isOwner
        ? `${ASSISTANT_NAME}’s daily recap and growth log — read it, listen to it`
        : 'Two questions, every day. Speak them out loud — it takes a minute.'}
      action={streak > 0 ? (
        <span className="px-3 py-1.5 rounded-full text-[13px] font-bold"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', color: 'var(--color-accent)' }}>
          🔥 {streak} day{streak > 1 ? 's' : ''} in a row
        </span>
      ) : undefined}
    >
      {/* Today */}
      <h2 className="text-[13px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--color-muted)' }}>Today</h2>
      <div className="grid gap-4 lg:grid-cols-2 mb-8">
        {PROMPTS.map((p) => {
          const existing = todays.find((e) => e.kind === p.kind)
          if (isOwner && !existing) {
            return (
              <Card key={p.kind} className="p-5">
                <h2 className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{p.title}</h2>
                <p className="text-sm mt-2" style={{ color: 'var(--color-muted)' }}>
                  Not recorded yet today.
                </p>
              </Card>
            )
          }
          return (
            <PromptCard
              key={p.kind}
              prompt={p}
              existing={existing}
              onSave={(text, blob, ms) => save(p.kind, text, blob, ms)}
              onDelete={existing && !isOwner
                ? () => confirmDelete({
                    label: 'today’s entry',
                    detail: 'The recording and text will be removed.',
                    onConfirm: () => { void delWsAudio(existing.id); void remove(existing.id) },
                  })
                : undefined}
            />
          )
        })}
      </div>

      {/* History */}
      <h2 className="text-[13px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--color-muted)' }}>Previous days</h2>
      {history.length === 0 ? (
        <Card>
          <EmptyState icon={<IconJournal width={34} height={34} />} title="No past entries yet"
            hint={isOwner ? `They'll collect here as ${ASSISTANT_NAME} records each day.` : 'Come back tomorrow — consistency is the whole point.'} />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map(([day, items]) => (
            <Card key={day} className="p-5">
              <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--color-accent)' }}>{fmtDay(day)}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                {PROMPTS.map((p) => {
                  const entry = items.find((e) => e.kind === p.kind)
                  return (
                    <div key={p.kind}>
                      <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>
                        {p.kind === 'recap' ? 'Recap' : 'Growth'}
                      </div>
                      {entry ? (
                        <>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)' }}>
                            {entry.text || <span style={{ color: 'var(--color-muted)' }}>(voice only)</span>}
                          </p>
                          {entry.has_audio && <AudioPlayer id={entry.id} />}
                        </>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Missed</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </WsShell>
  )
}
