/**
 * AI Studio — optional image generation. One prompt in, one image back as a
 * data URL. Uses the same OPENAI_API_KEY; never called automatically — the
 * user explicitly clicks, because images cost real money per generation.
 *
 * Env: OPENAI_API_KEY (required), STUDIO_IMAGE_MODEL (default gpt-image-1;
 * falls back to dall-e-3 automatically if the account lacks gpt-image-1).
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function generate(apiKey: string, model: string, prompt: string) {
  return fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, 3800),
      size: '1024x1024',
      n: 1,
      // gpt-image-1 renders 2-4x faster (and cheaper) below full quality —
      // right for social drafts. dall-e-3 uses its own quality vocabulary.
      ...(model === 'gpt-image-1' ? { quality: process.env.STUDIO_IMAGE_QUALITY || 'medium' } : {}),
    }),
  })
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'not_configured', message: 'Add OPENAI_API_KEY in Netlify to enable images.' }, 200)

  let p: { prompt?: string }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
  const prompt = (p.prompt || '').trim()
  if (!prompt) return json({ error: 'no_prompt' }, 400)

  const primary = process.env.STUDIO_IMAGE_MODEL || 'gpt-image-1'
  try {
    let res = await generate(apiKey, primary, prompt)
    // Accounts without gpt-image-1 access get a 4xx — retry once on dall-e-3.
    if (!res.ok && primary === 'gpt-image-1') res = await generate(apiKey, 'dall-e-3', prompt)
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
