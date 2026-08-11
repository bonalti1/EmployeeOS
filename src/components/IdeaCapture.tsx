import { useEffect, useState } from 'react'
import { Card, Button } from './ui'
import { IconPlus, IconMic } from './icons'
import { wsField } from './WorkspaceLayout'
import { useRecorder, fmtDuration, RECORD_SUPPORTED } from '../lib/useRecorder'
import { putWsAudio } from '../lib/wsAudio'
import { useToast } from '../lib/toast'
import { useWorkspace, useWsTable, type WsIdea } from '../lib/workspace'

/**
 * Always-available idea capture — a floating button on every workspace screen.
 *
 * The design rule: an idea must be loggable in seconds or it never gets logged
 * at all. So there is exactly one required field (the text), no category, no
 * brand, no priority. Sorting happens later on the Idea Board, or never —
 * an unsorted idea that was captured beats a tidy one that wasn't.
 *
 * Voice works the same way: tap, talk, save. The transcript fills the box
 * live, and the audio is kept too in case the transcription mangles it.
 */
export default function IdeaCapture() {
  const { ready, role } = useWorkspace()
  const { toast } = useToast()
  const { insert, update } = useWsTable<WsIdea>('ws_ideas')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const rec = useRecorder(navigator.language || 'en-US', (phrase) =>
    setText((prev) => (prev ? prev + ' ' : '') + phrase))

  // Esc closes; Cmd/Ctrl+I opens from anywhere in the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!ready) return null

  const close = () => {
    if (rec.recording) void rec.stop()
    setOpen(false)
    setText('')
    rec.reset()
  }

  const save = async () => {
    const blob = rec.recording ? await rec.stop() : rec.blobRef.current
    const body = text.trim()
    if (!body && !blob) return
    setBusy(true)
    const created = await insert({
      text: body || '(voice note)',
      author_role: role ?? 'assistant',
    } as Partial<WsIdea>)
    if (created && blob) {
      const ok = await putWsAudio(created.id, blob, 'ideas')
      if (ok) await update(created.id, { has_audio: true } as Partial<WsIdea>)
    }
    setBusy(false)
    toast(created ? 'Idea captured' : 'Could not save — check your connection')
    close()
  }

  return (
    <>
      {/* Floating capture button — sits above the mobile tab bar. */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 right-5 rounded-full grid place-items-center transition active:scale-95 hover:scale-105"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 76px)',
          height: 54, width: 54,
          background: 'var(--color-accent)', color: 'var(--color-on-accent)',
          boxShadow: '0 10px 30px -8px color-mix(in srgb, var(--color-accent) 70%, transparent)',
        }}
        title="Capture an idea (⌘I)"
        aria-label="Capture an idea"
      >
        <IconPlus width={24} height={24} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
          style={{ background: 'rgba(0,0,0,0.45)' }} onClick={close}>
          <Card className="w-full max-w-lg p-5 fade-up" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[17px] font-semibold" style={{ color: 'var(--color-text)' }}>Capture an idea</h2>
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Sort it later</span>
              </div>

              <textarea
                autoFocus
                value={text + (rec.interim ? (text ? ' ' : '') + rec.interim : '')}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save() }}
                rows={3}
                placeholder="What's the idea? Just get it down…"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none leading-relaxed"
                style={wsField}
              />

              {rec.error && <p className="text-sm mt-2" style={{ color: '#dc2626' }}>{rec.error}</p>}
              {rec.url && <audio src={rec.url} controls className="w-full mt-2" style={{ height: 36 }} />}

              <div className="flex items-center gap-2 mt-3">
                {RECORD_SUPPORTED && (
                  <button
                    onClick={() => (rec.recording ? void rec.stop() : void rec.start())}
                    className="h-10 w-10 rounded-full grid place-items-center shrink-0 transition active:scale-95"
                    style={{
                      background: rec.recording ? '#dc2626' : 'var(--color-bg)',
                      color: rec.recording ? '#fff' : 'var(--color-accent)',
                      border: '1px solid var(--color-border)',
                    }}
                    aria-label={rec.recording ? 'Stop recording' : 'Record the idea'}
                  >
                    {rec.recording
                      ? <span className="block h-3 w-3 rounded-[2px]" style={{ background: '#fff' }} />
                      : <IconMic width={17} height={17} />}
                  </button>
                )}
                {rec.recording && (
                  <span className="text-sm font-semibold tnum" style={{ color: '#dc2626' }}>{fmtDuration(rec.elapsed)}</span>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={close}>Cancel</Button>
                  <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Capture'}</Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
