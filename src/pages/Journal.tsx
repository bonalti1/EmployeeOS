import { useEffect, useRef, useState } from 'react'
import { Card, PageHeader, Button, Input, EmptyState } from '../components/ui'
import { IconMic, IconJournal, IconTrash, IconCheck, IconPlus } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useConfirmDelete } from '../lib/confirmDelete'
import { putAudio, getAudio, delAudio } from '../lib/audioStore'

/**
 * Voice journal. Record a thought, get a live transcription (browser Web Speech
 * API), a short summary, and a timestamped entry you can revisit later.
 * Audio lives in IndexedDB; the text metadata lives in localStorage.
 */

type Entry = {
  id: string
  ts: number
  title: string
  transcript: string
  summary: string
  hasAudio: boolean
  durationMs: number
}
type Goal = { id: string; text: string; done: boolean; category?: string }
const GOAL_CATEGORIES = ['Health', 'Business', 'Family', 'Non-negotiables']

// ---- Minimal typing for the Web Speech API (not in the TS DOM lib) ----------
interface SRAlt { transcript: string }
interface SRResult { 0: SRAlt; isFinal: boolean }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SREvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
const SRClass =
  (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
const SPEECH_SUPPORTED = !!SRClass
const RECORD_SUPPORTED = typeof window !== 'undefined' && 'MediaRecorder' in window

function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const o of options) {
    try { if (MediaRecorder.isTypeSupported(o)) return o } catch { /* ignore */ }
  }
  return ''
}

function makeSummary(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const firstSentence = t.match(/^.*?[.!?](\s|$)/)
  const base = firstSentence ? firstSentence[0].trim() : t
  return base.length > 160 ? base.slice(0, 157).trimEnd() + '…' : base
}

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Loads a recording from IndexedDB and shows an inline player so you can hear it. */
function AudioPlayer({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let objUrl: string | null = null
    let alive = true
    getAudio(id).then((blob) => {
      if (!alive) return
      if (blob) { objUrl = URL.createObjectURL(blob); setUrl(objUrl) }
      else setMissing(true)
    }).catch(() => alive && setMissing(true))
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [id])
  if (missing) return <span className="text-xs" style={{ color: 'var(--color-muted)' }}>🎤 Recording isn’t available on this device yet</span>
  if (!url) return <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Loading audio…</span>
  return <audio src={url} controls preload="metadata" className="h-9 w-full max-w-sm" />
}

export default function Journal() {
  const confirmDelete = useConfirmDelete()
  const [entries, setEntries] = useStore<Entry[]>('journal.entries', [])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draftBlob, setDraftBlob] = useState<Blob | null>(null)
  const [draftUrl, setDraftUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editText, setEditText] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const draftBlobRef = useRef<Blob | null>(null)
  const mimeRef = useRef<string>('')
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedRef = useRef(0)

  const setDraft = (blob: Blob | null) => {
    draftBlobRef.current = blob
    setDraftBlob(blob)
    setDraftUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return blob ? URL.createObjectURL(blob) : null })
  }

  const stopTracks = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null }

  // Clean up any live capture if the user navigates away mid-recording.
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    try { recorderRef.current?.stop() } catch { /* ignore */ }
    stopTracks()
  }, [])

  const startRecording = async () => {
    setError('')
    if (!RECORD_SUPPORTED) { setError('Audio recording is not supported in this browser.'); return }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked. Allow it in your browser to record.')
      return
    }
    streamRef.current = stream
    chunksRef.current = []
    setDraft(null)
    const mime = pickMime()
    mimeRef.current = mime
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
      setDraft(blob)
      stopTracks()
      stopResolveRef.current?.(blob)
      stopResolveRef.current = null
    }
    rec.start()
    recorderRef.current = rec

    // Live transcription (best-effort; not every browser supports it).
    if (SRClass) {
      const rec2 = new SRClass()
      rec2.lang = navigator.language || 'en-US'
      rec2.continuous = true
      rec2.interimResults = true
      rec2.onresult = (e: SREvent) => {
        let live = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) setText((prev) => (prev ? prev + ' ' : '') + r[0].transcript.trim())
          else live += r[0].transcript
        }
        setInterim(live)
      }
      rec2.onend = () => setInterim('')
      rec2.onerror = () => { /* transient — keep recording audio regardless */ }
      try { rec2.start() } catch { /* already started */ }
      recognitionRef.current = rec2
    }

    startedRef.current = Date.now()
    setElapsed(0)
    setRecording(true)
    timerRef.current = window.setInterval(() => setElapsed(Date.now() - startedRef.current), 250)
  }

  // Returns the finished recording once MediaRecorder has flushed it, so Save
  // works even if you tap Save while still recording.
  const stopRecording = (): Promise<Blob | null> => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    setInterim('')
    setRecording(false)
    const rec = recorderRef.current
    recorderRef.current = null
    if (!rec || rec.state === 'inactive') return Promise.resolve(draftBlobRef.current)
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve
      try { rec.stop() } catch { stopResolveRef.current = null; resolve(draftBlobRef.current) }
    })
  }

  const clearDraft = () => {
    if (recording) void stopRecording()
    setDraft(null)
    setText(''); setTitle(''); setInterim(''); setElapsed(0); setError('')
  }

  const save = async () => {
    const blob = recording ? await stopRecording() : draftBlobRef.current
    const body = text.trim()
    if (!body && !blob) return
    const id = uid('j')
    let audioSaved = false
    if (blob) {
      try { await putAudio(id, blob); audioSaved = true }
      catch { setError('Could not save the audio, but your text was kept.') }
    }
    const entry: Entry = {
      id,
      ts: Date.now(),
      title: title.trim(),
      transcript: body,
      summary: makeSummary(body),
      hasAudio: audioSaved,
      durationMs: audioSaved ? elapsed : 0,
    }
    setEntries((prev) => [entry, ...prev])
    setDraft(null)
    setText(''); setTitle(''); setInterim(''); setElapsed(0)
  }

  // ---- Edit an existing entry's title & text ----
  const startEdit = (e: Entry) => { setEditing(e.id); setEditTitle(e.title); setEditText(e.transcript); setOpen(e.id) }
  const saveEdit = () => {
    setEntries((prev) => prev.map((e) => e.id === editing ? { ...e, title: editTitle.trim(), transcript: editText.trim(), summary: makeSummary(editText.trim()) } : e))
    setEditing(null)
  }

  const remove = async (e: Entry) => {
    if (e.hasAudio) await delAudio(e.id)
    setEntries((prev) => prev.filter((x) => x.id !== e.id))
  }

  const hasDraftAudio = !!draftBlob
  const canSave = recording || text.trim().length > 0 || hasDraftAudio

  const [goals, setGoals] = useStore<Goal[]>('journal.goals', [])
  const [goalDraft, setGoalDraft] = useState('')
  const [goalCat, setGoalCat] = useState(GOAL_CATEGORIES[0])
  const addGoal = () => { const t = goalDraft.trim(); if (!t) return; setGoals((p) => [...p, { id: uid('goal'), text: t, done: false, category: goalCat }]); setGoalDraft('') }
  const toggleGoal = (id: string) => setGoals((p) => p.map((g) => g.id === id ? { ...g, done: !g.done } : g))
  const removeGoal = (id: string) => setGoals((p) => p.filter((g) => g.id !== id))
  // Goal categories start collapsed; tap a category to reveal its goals.
  const [openGoalCats, setOpenGoalCats] = useState<Set<string>>(new Set())
  const toggleGoalCat = (cat: string) => setOpenGoalCats((prev) => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })
  const goalGroups = [
    ...GOAL_CATEGORIES.map((cat) => ({ cat, items: goals.filter((g) => (g.category ?? '') === cat) })),
    { cat: 'Other', items: goals.filter((g) => !GOAL_CATEGORIES.includes(g.category ?? '')) },
  ].filter((grp) => grp.items.length > 0)

  // Group entries by month, then by day, so a finished month reads as a chapter.
  const q = query.trim().toLowerCase()
  const shown = q ? entries.filter((e) => `${e.title} ${e.transcript}`.toLowerCase().includes(q)) : entries
  const months: { month: string; days: { day: string; items: Entry[] }[] }[] = []
  for (const e of shown) {
    const d = new Date(e.ts)
    const monthKey = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const dayKey = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    let mg = months.find((m) => m.month === monthKey)
    if (!mg) { mg = { month: monthKey, days: [] }; months.push(mg) }
    let dg = mg.days.find((x) => x.day === dayKey)
    if (!dg) { dg = { day: dayKey, items: [] }; mg.days.push(dg) }
    dg.items.push(e)
  }

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle="Record a thought — it's transcribed, summarized and saved by month. Your goals live alongside it."
      />

      {/* Composer — kept compact so goals & entries stay in view */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={recording ? stopRecording : startRecording}
            className="h-10 w-10 rounded-full grid place-items-center shrink-0 transition active:scale-95"
            style={{
              background: recording ? '#c0504d' : 'var(--color-accent)',
              color: recording ? '#ffffff' : 'var(--color-on-accent)',
              boxShadow: recording ? '0 0 0 5px color-mix(in srgb, #c0504d 22%, transparent)' : 'var(--shadow-sm)',
            }}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            {recording ? <span className="h-3 w-3 rounded-sm" style={{ background: '#fff' }} /> : <IconMic width={18} height={18} />}
          </button>
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
              {recording ? `Recording · ${fmtClock(elapsed)}` : hasDraftAudio ? `Recorded · ${fmtClock(elapsed)}` : 'Tap to record'}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {recording
                ? (SPEECH_SUPPORTED ? 'Listening and transcribing…' : 'Recording audio…')
                : SPEECH_SUPPORTED ? 'Transcribed live — or just type below.' : 'Type your entry (live transcription isn’t supported here).'}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {(text || title || hasDraftAudio) && !recording && (
              <Button variant="ghost" onClick={clearDraft}>Clear</Button>
            )}
            <Button onClick={save} disabled={!canSave}><IconCheck width={16} height={16} /> Save</Button>
          </div>
        </div>

        {error && <p className="text-sm mt-2" style={{ color: '#c0504d' }}>{error}</p>}

        <div className="mt-3 flex flex-col gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="What's on your mind? Speak or type…"
              className="rounded-xl px-3 py-2 text-sm outline-none w-full resize-y"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
            {interim && <p className="text-sm mt-1 px-1 italic" style={{ color: 'var(--color-muted)' }}>{interim}</p>}
          </div>
          {draftUrl && !recording && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-accent)' }}>Preview</span>
              <audio src={draftUrl} controls preload="metadata" className="h-9 flex-1 min-w-0" />
            </div>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Goals — right on desktop, first after the composer on mobile */}
        <div className="lg:col-span-1 lg:order-2">
          <Card className="p-5 lg:sticky lg:top-4">
            <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Goals</h2>
            <p className="text-sm mb-3" style={{ color: 'var(--color-muted)' }}>What you're building toward.</p>
            {goalGroups.length === 0 ? (
              <p className="text-sm mb-3" style={{ color: 'var(--color-muted)' }}>Add your first goal below.</p>
            ) : (
              <div className="flex flex-col gap-1.5 mb-4">
                {goalGroups.map((grp) => {
                  const open = openGoalCats.has(grp.cat)
                  const doneCount = grp.items.filter((g) => g.done).length
                  return (
                    <div key={grp.cat} className="rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                      <button onClick={() => toggleGoalCat(grp.cat)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                        <span className="text-xs shrink-0 transition-transform" style={{ color: 'var(--color-muted)', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] flex-1" style={{ color: 'var(--color-text)' }}>{grp.cat}</span>
                        <span className="text-[11px] font-semibold tnum" style={{ color: 'var(--color-muted)' }}>{doneCount}/{grp.items.length}</span>
                      </button>
                      {open && (
                        <ul className="flex flex-col gap-1.5 px-3 pb-3 pt-0.5">
                          {grp.items.map((g) => (
                            <li key={g.id} className="group flex items-center gap-2.5">
                              <button
                                onClick={() => toggleGoal(g.id)}
                                className="h-5 w-5 rounded-md grid place-items-center shrink-0 transition"
                                style={{ border: '2px solid var(--color-accent)', background: g.done ? 'var(--color-accent)' : 'transparent' }}
                                aria-label={g.done ? 'Mark not achieved' : 'Mark achieved'}
                              >
                                {g.done && <IconCheck width={12} height={12} style={{ color: 'var(--color-on-accent)' }} />}
                              </button>
                              <span className="flex-1 text-sm" style={{ color: 'var(--color-text)', textDecoration: g.done ? 'line-through' : 'none', opacity: g.done ? 0.5 : 1 }}>{g.text}</span>
                              <button onClick={() => confirmDelete({ label: g.text ? `the goal “${g.text}”` : 'this goal', onConfirm: () => removeGoal(g.id) })} className="opacity-0 group-hover:opacity-60 transition" style={{ color: 'var(--color-muted)' }} aria-label="Remove goal">
                                <IconTrash width={15} height={15} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <select value={goalCat} onChange={(e) => setGoalCat(e.target.value)} className="rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                {GOAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <Input value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addGoal() }} placeholder={`Add a ${goalCat} goal…`} />
                <Button variant="outline" onClick={addGoal}><IconPlus width={16} height={16} /></Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Timeline — left on desktop */}
        <div className="lg:col-span-2 lg:order-1">
          {entries.length === 0 ? (
            <EmptyState icon={<IconJournal width={40} height={40} />} title="No journal entries yet"
              hint="Record your first thought above. Entries are grouped by month so you can look back on a whole season of thinking." />
          ) : (
            <>
              <div className="relative mb-5">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your journal…"
                  className="w-full rounded-xl pl-3 pr-9 py-2.5 text-sm outline-none" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                {query && <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-muted)' }} aria-label="Clear search">✕</button>}
              </div>

              {months.length === 0 ? (
                <p className="text-sm px-1" style={{ color: 'var(--color-muted)' }}>No entries match “{query}”.</p>
              ) : (
                <div className="flex flex-col gap-8">
                  {months.map((mg) => (
                    <div key={mg.month}>
                      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text)' }}>{mg.month}</h2>
                      <div className="flex flex-col gap-5">
                        {mg.days.map((g) => (
                          <div key={g.day}>
                            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] mb-2 px-1" style={{ color: 'var(--color-muted)' }}>{g.day}</h3>
                            <Card className="overflow-hidden">
                              {g.items.map((e, idx) => {
                                const time = new Date(e.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                                const expanded = open === e.id
                                const isEditing = editing === e.id
                                return (
                                  <div key={e.id} style={{ borderTop: idx > 0 ? '1px solid var(--color-border)' : undefined }}>
                                    {isEditing ? (
                                      <div className="flex flex-col gap-2 p-4">
                                        <Input value={editTitle} onChange={(ev) => setEditTitle(ev.target.value)} placeholder="Title (optional)" />
                                        <textarea value={editText} onChange={(ev) => setEditText(ev.target.value)} rows={6} placeholder="Your entry…"
                                          className="rounded-xl px-3 py-2 text-sm outline-none w-full resize-y" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                                        <div className="flex justify-end gap-2">
                                          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                                          <Button onClick={saveEdit}><IconCheck width={16} height={16} /> Save</Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <button onClick={() => setOpen(expanded ? null : e.id)} className="w-full flex items-start gap-3 text-left px-4 py-3 transition" style={{ background: expanded ? 'color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))' : 'transparent' }}>
                                          <span className="text-xs tnum shrink-0 pt-0.5 w-14" style={{ color: 'var(--color-muted)' }}>{time}</span>
                                          <span className="flex-1 min-w-0">
                                            {e.title && <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{e.title} — </span>}
                                            <span className={expanded ? '' : 'line-clamp-2'} style={{ color: e.title ? 'var(--color-muted)' : 'var(--color-text)' }}>{e.summary || '(no transcript)'}</span>
                                          </span>
                                          {e.hasAudio && e.durationMs > 0 && (
                                            <span className="text-[11px] tnum shrink-0 rounded-full px-2 py-0.5 font-semibold" style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))', color: 'var(--color-accent)' }}>🎤 {fmtClock(e.durationMs)}</span>
                                          )}
                                          <span className="text-xs shrink-0 pt-0.5 transition-transform" style={{ color: 'var(--color-muted)', transform: expanded ? 'rotate(90deg)' : 'none' }}>▸</span>
                                        </button>

                                        {expanded && (
                                          <div className="px-4 pb-4 pl-[4.25rem]">
                                            {e.transcript && e.transcript !== e.summary && (
                                              <p className="text-sm whitespace-pre-wrap leading-relaxed mb-3" style={{ color: 'var(--color-text)' }}>{e.transcript}</p>
                                            )}
                                            {e.hasAudio && <div className="mb-3"><AudioPlayer id={e.id} /></div>}
                                            <div className="flex items-center gap-4">
                                              <button onClick={() => startEdit(e)} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                                Edit
                                              </button>
                                              <button onClick={() => confirmDelete({ label: e.title ? `the entry “${e.title}”` : 'this journal entry', detail: 'The entry and its audio recording will be permanently deleted.', onConfirm: () => { void remove(e) } })} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: '#c0504d' }}>
                                                <IconTrash width={14} height={14} /> Delete
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </Card>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-xs mt-6" style={{ color: 'var(--color-muted)' }}>
        Recordings and transcripts are stored privately on this device. Live transcription uses your browser's speech engine
        (best in Chrome/Edge). Cloud transcription &amp; AI summaries can be added later via Settings → Integrations.
      </p>
    </div>
  )
}
