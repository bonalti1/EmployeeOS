import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Microphone recorder with best-effort live transcription, extracted for the
 * workspace journal. Same engine as the private Journal page (MediaRecorder +
 * the browser Web Speech API), packaged as a hook so both daily prompts can
 * each own an independent recorder.
 */

interface SRAlt { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlt; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SREvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

const SRClass =
  typeof window !== 'undefined'
    ? (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    : undefined

export const RECORD_SUPPORTED = typeof window !== 'undefined' && 'MediaRecorder' in window
export const SPEECH_SUPPORTED = !!SRClass

function pickMime(): string {
  for (const o of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(o)) return o } catch { /* ignore */ }
  }
  return ''
}

export function fmtDuration(ms: number) {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * @param lang BCP-47 tag for speech recognition (e.g. 'es-MX' so a Spanish
 *             reflection transcribes in Spanish rather than being mangled).
 * @param onTranscript called with each finalized phrase, to append into a field.
 */
export function useRecorder(lang: string, onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const [blob, setBlobState] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedRef = useRef(0)
  // Keep the latest callback without re-creating the recorder each render.
  const cbRef = useRef(onTranscript)
  cbRef.current = onTranscript

  const setBlob = useCallback((b: Blob | null) => {
    blobRef.current = b
    setBlobState(b)
    setUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return b ? URL.createObjectURL(b) : null })
  }, [])

  const stopTracks = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null }

  // Release the mic if the page unmounts mid-recording.
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    try { recorderRef.current?.stop() } catch { /* ignore */ }
    stopTracks()
  }, [])

  const start = async () => {
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
    setBlob(null)
    const mime = pickMime()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
      setBlob(b)
      stopTracks()
      stopResolveRef.current?.(b)
      stopResolveRef.current = null
    }
    rec.start()
    recorderRef.current = rec

    if (SRClass) {
      const sr = new SRClass()
      sr.lang = lang
      sr.continuous = true
      sr.interimResults = true
      sr.onresult = (e: SREvent) => {
        let live = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) cbRef.current(r[0].transcript.trim())
          else live += r[0].transcript
        }
        setInterim(live)
      }
      sr.onend = () => setInterim('')
      sr.onerror = () => { /* transient — audio keeps recording regardless */ }
      try { sr.start() } catch { /* already started */ }
      recognitionRef.current = sr
    }

    startedRef.current = Date.now()
    setElapsed(0)
    setRecording(true)
    timerRef.current = window.setInterval(() => setElapsed(Date.now() - startedRef.current), 250)
  }

  /** Resolves with the finished blob, so Save works even while still recording. */
  const stop = (): Promise<Blob | null> => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    setInterim('')
    setRecording(false)
    const rec = recorderRef.current
    recorderRef.current = null
    if (!rec || rec.state === 'inactive') return Promise.resolve(blobRef.current)
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve
      try { rec.stop() } catch { stopResolveRef.current = null; resolve(blobRef.current) }
    })
  }

  const reset = () => { setBlob(null); setElapsed(0); setInterim(''); setError('') }

  return { recording, elapsed, interim, error, blob, url, start, stop, reset, blobRef }
}
