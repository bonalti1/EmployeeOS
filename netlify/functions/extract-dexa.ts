/**
 * DEXA scan reader for the Health page.
 *
 * The browser uploads an image of a DEXA / body-composition report (data URL)
 * and this function asks an OpenAI vision model to pull out the key numbers:
 * body-fat %, lean/muscle mass, fat mass, total mass — normalized to pounds.
 *
 * The API key lives only here (Netlify env), never in the browser. If the key
 * isn't set the function returns { ok:false, reason:'not_configured' } so the
 * UI can fall back to manual entry gracefully.
 *
 * Required Netlify environment variable:
 *   OPENAI_API_KEY   – your OpenAI secret key
 * Optional:
 *   OPENAI_VISION_MODEL – defaults to "gpt-4o"
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PROMPT = `You are reading a DEXA (DXA) body-composition scan report.
Extract these fields and return STRICT JSON only, no prose:
{
  "date": "YYYY-MM-DD or empty string if not shown",
  "bodyFatPct": number | null,   // total body fat percentage
  "leanLbs": number | null,      // lean / muscle mass in POUNDS
  "fatLbs": number | null,       // fat mass in POUNDS
  "totalLbs": number | null      // total mass / weight in POUNDS
}
Convert kilograms to pounds (1 kg = 2.20462 lb) if the report is metric.
Use null for any value you cannot read confidently. Return ONLY the JSON object.`

type Extracted = { date: string; bodyFatPct: number | null; leanLbs: number | null; fatLbs: number | null; totalLbs: number | null }

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ ok: false, reason: 'not_configured', message: 'Connect the AI key to auto-read scans.' })

  let payload: { image?: string }
  try { payload = await req.json() } catch { return json({ ok: false, reason: 'bad_request' }, 400) }

  const image = payload.image || ''
  if (!image.startsWith('data:image/')) {
    return json({ ok: false, reason: 'unsupported', message: 'Auto-read works with a photo or PNG/JPG of the scan.' })
  }

  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o'
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 300,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('extract-dexa OpenAI error:', res.status, detail.slice(0, 200))
      return json({ ok: false, reason: 'ai_error', message: 'Could not read the scan. Enter the numbers manually.' })
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content?.trim() || '{}'
    let parsed: Partial<Extracted>
    try { parsed = JSON.parse(content) } catch { return json({ ok: false, reason: 'parse_error' }) }

    const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
    const result: Extracted = {
      date: typeof parsed.date === 'string' ? parsed.date : '',
      bodyFatPct: num(parsed.bodyFatPct),
      leanLbs: num(parsed.leanLbs),
      fatLbs: num(parsed.fatLbs),
      totalLbs: num(parsed.totalLbs),
    }
    return json({ ok: true, data: result })
  } catch (err) {
    console.error('extract-dexa error:', (err as Error).message)
    return json({ ok: false, reason: 'ai_error', message: 'Could not read the scan. Enter the numbers manually.' })
  }
}
