/**
 * AI Studio — ad creative generation.
 *
 * The caller sends a fully art-directed prompt (written by the `image_brief`
 * step in studio-generate) plus the format. Never called automatically — the
 * user clicks, because every render costs real money.
 *
 * Ad creatives default to HIGH quality: this is the asset that has to stop a
 * thumb, so it earns the extra seconds. Set STUDIO_IMAGE_QUALITY to 'medium'
 * or 'low' to trade quality for speed and cost.
 *
 * Env: OPENAI_API_KEY (required), STUDIO_IMAGE_MODEL (default gpt-image-1;
 * falls back to dall-e-3 automatically if the account lacks gpt-image-1).
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// gpt-image-1 sizes; portrait/story both use the tall frame ads live in.
const SIZES: Record<string, string> = {
  square: '1024x1024',
  portrait: '1024x1536',
  story: '1024x1536',
}

async function generate(apiKey: string, model: string, prompt: string, size: string, quality: string) {
  return fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, 3800),
      size,
      n: 1,
      ...(model === 'gpt-image-1' ? { quality } : {}),
    }),
  })
}

/**
 * Build the ad FROM a real photo (a house they actually built) instead of
 * inventing one. gpt-image-1's edit endpoint keeps the real subject and
 * applies the art direction — grade, crop, headline — around it. This is what
 * makes a creative believable to a local audience.
 */
async function editFromPhoto(apiKey: string, prompt: string, size: string, quality: string, dataUrl: string) {
  const [, mime = 'image/png', b64 = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || []
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('image', new Blob([bytes], { type: mime }), `source.${ext}`)
  form.append('prompt', prompt.slice(0, 3800))
  form.append('size', size)
  form.append('quality', quality)
  form.append('n', '1')

  return fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'not_configured', message: 'Add OPENAI_API_KEY in Netlify to enable images.' }, 200)

  let p: { prompt?: string; aspect?: string; quality?: string; sourcePhoto?: string }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
  const prompt = (p.prompt || '').trim()
  if (!prompt) return json({ error: 'no_prompt' }, 400)

  const size = SIZES[p.aspect || 'square'] || SIZES.square
  const quality = p.quality || process.env.STUDIO_IMAGE_QUALITY || 'high'
  const primary = process.env.STUDIO_IMAGE_MODEL || 'gpt-image-1'

  try {
    // A real project photo always wins over an invented scene.
    if (p.sourcePhoto?.startsWith('data:')) {
      const edit = await editFromPhoto(apiKey, prompt, size, quality, p.sourcePhoto)
      if (edit.ok) {
        const data = (await edit.json()) as { data?: { b64_json?: string; url?: string }[] }
        const first = data.data?.[0]
        if (first?.b64_json) return json({ dataUrl: `data:image/png;base64,${first.b64_json}`, fromPhoto: true })
        if (first?.url) return json({ url: first.url, fromPhoto: true })
      }
      const detail = await edit.text().catch(() => '')
      return json({ error: 'edit_failed', detail: detail.slice(0, 300) }, 200)
    }

    let res = await generate(apiKey, primary, prompt, size, quality)
    // Accounts without gpt-image-1 access get a 4xx — retry once on dall-e-3.
    if (!res.ok && primary === 'gpt-image-1') {
      res = await generate(apiKey, 'dall-e-3', prompt, size === '1024x1536' ? '1024x1792' : '1024x1024', quality)
    }
    if (!res.ok) {
      const detail = await res.text()
      return json({ error: 'provider_error', detail: detail.slice(0, 300) }, 200)
    }
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
    const first = data.data?.[0]
    if (first?.b64_json) return json({ dataUrl: `data:image/png;base64,${first.b64_json}` })
    if (first?.url) return json({ url: first.url })
    return json({ error: 'empty' }, 200)
  } catch (e) {
    return json({ error: 'network', detail: String(e).slice(0, 200) }, 200)
  }
}
