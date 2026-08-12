/**
 * Speech-to-text for workspace voice notes (idea captures, journal recaps).
 *
 * The browser's live transcription (Web Speech API) is unreliable — it is
 * missing or restricted on iOS/in-app browsers, which is exactly where Carlos
 * records. So the audio itself is posted here and transcribed server-side, and
 * the result is written back onto the idea. The API key stays in Netlify env
 * vars and is never exposed to the browser.
 *
 * Request:  POST { audio: "<base64>", mime?: "audio/webm", language?: "en" }
 * Response: { text: "…" }  |  { error: "not_configured" | "…" }
 *
 * Required Netlify environment variable:
 *   OPENAI_API_KEY      – your OpenAI secret key
 * Optional:
 *   OPENAI_STT_MODEL    – defaults to "whisper-1"
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Netlify functions cap request bodies at ~6 MB; a base64 payload is ~1.37×
// the raw bytes, so refuse anything that clearly won't fit rather than failing
// deep inside the upload.
const MAX_BASE64 = 5_500_000

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'not_configured' }, 200)

  let body: { audio?: string; mime?: string; language?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const base64 = (body.audio || '').replace(/^data:[^;]+;base64,/, '')
  if (!base64) return json({ error: 'no_audio' }, 400)
  if (base64.length > MAX_BASE64) return json({ error: 'too_large' }, 413)

  const mime = (body.mime || 'audio/webm').split(';')[0]
  const ext = EXT[mime] || 'webm'

  let bytes: Uint8Array
  try {
    const bin = atob(base64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return json({ error: 'bad_audio' }, 400)
  }

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), `note.${ext}`)
  form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1')
  if (body.language) form.append('language', body.language)

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!res.ok) {
      const detail = await res.text()
      return json({ error: 'upstream', status: res.status, detail: detail.slice(0, 400) }, 200)
    }
    const data = (await res.json()) as { text?: string }
    return json({ text: (data.text || '').trim() })
  } catch (e) {
    return json({ error: 'network', detail: String(e).slice(0, 200) }, 200)
  }
}
