/**
 * AI Studio — optional video generation via Runway (image → video).
 *
 * Two actions, because rendering takes a minute or more and the client polls:
 *   create { imageDataUrl, promptText }  → { id }
 *   status { id }                        → { status, url? }
 *
 * Disabled gracefully until RUNWAY_API_KEY is set in Netlify — the app shows
 * the button with an "add key to enable" notice instead of failing.
 *
 * Env: RUNWAY_API_KEY (required), RUNWAY_MODEL (default gen3a_turbo).
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const API = 'https://api.dev.runwayml.com/v1'
const VERSION = '2024-11-06'

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const apiKey = process.env.RUNWAY_API_KEY
  if (!apiKey) return json({ error: 'not_configured', message: 'Add RUNWAY_API_KEY in Netlify to enable video.' }, 200)

  let p: { action?: string; imageDataUrl?: string; promptText?: string; id?: string; duration?: number }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Runway-Version': VERSION,
  }

  try {
    if (p.action === 'create') {
      if (!p.imageDataUrl) return json({ error: 'no_image', message: 'Generate an image first — the video animates it.' }, 200)
      const res = await fetch(`${API}/image_to_video`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: process.env.RUNWAY_MODEL || 'gen3a_turbo',
          promptImage: p.imageDataUrl,
          promptText: (p.promptText || '').slice(0, 500),
          // Runway accepts 5s (the "moving image") or 10s (the fuller video).
          duration: p.duration === 10 ? 10 : 5,
          ratio: '768:1280',
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        return json({ error: 'provider_error', detail: detail.slice(0, 300) }, 200)
      }
      const data = (await res.json()) as { id?: string }
      return json({ id: data.id })
    }

    if (p.action === 'status') {
      if (!p.id) return json({ error: 'no_id' }, 400)
      const res = await fetch(`${API}/tasks/${p.id}`, { headers })
      if (!res.ok) {
        const detail = await res.text()
        return json({ error: 'provider_error', detail: detail.slice(0, 300) }, 200)
      }
      const data = (await res.json()) as { status?: string; output?: string[]; failure?: string }
      return json({
        status: data.status || 'UNKNOWN',
        url: data.output?.[0],
        failure: data.failure,
      })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    return json({ error: 'network', detail: String(e).slice(0, 200) }, 200)
  }
}
