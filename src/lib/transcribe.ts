/**
 * Server-side speech-to-text for voice notes.
 *
 * The browser's live transcription is best-effort — on iOS and inside in-app
 * browsers it is often missing, which is exactly where most voice notes get
 * recorded. So whenever the live transcript comes back empty we send the audio
 * to our own Netlify function, which does the transcription with the API key
 * that lives on the server.
 *
 * Returns the text, or null when transcription isn't available (no API key,
 * offline, file too big). Callers treat null as "keep the audio, no text".
 */

const ENDPOINT = '/.netlify/functions/transcribe'

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function transcribeBlob(blob: Blob): Promise<string | null> {
  try {
    const audio = await toBase64(blob)
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio,
        mime: blob.type || 'audio/webm',
        language: (navigator.language || 'en').split('-')[0],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string; error?: string }
    if (data.error || !data.text) return null
    return data.text.trim() || null
  } catch {
    return null
  }
}
