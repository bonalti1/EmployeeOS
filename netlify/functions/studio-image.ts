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

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'not_configured', message: 'Add OPENAI_API_KEY in Netlify to enable images.' }, 200)

  let p: { prompt?: string; aspect?: string; quality?: string }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
  const prompt = (p.prompt || '').trim()
  if (!prompt) return json({ error: 'no_prompt' }, 400)

  const size = SIZES[p.aspect || 'square'] || SIZES.square
  const quality = p.quality || process.env.STUDIO_IMAGE_QUALITY || 'high'
  const primary = process.env.STUDIO_IMAGE_MODEL || 'gpt-image-1'

  try {
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
