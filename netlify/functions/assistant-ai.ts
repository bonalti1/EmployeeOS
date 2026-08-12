/**
 * AI Studio endpoint for the Assistant Workspace.
 *
 * The assistant's browser sends a tool name, their input, and the shared brand
 * context (company context + brand voice — all editable by Rolando inside the
 * workspace, none of it private Personal OS data). We forward it to the LLM
 * and return drafted content. The API key lives only here in Netlify env vars.
 *
 * Required Netlify environment variable:
 *   OPENAI_API_KEY   – reused from the existing dashboard AI setup
 * Optional:
 *   OPENAI_MODEL     – defaults to "gpt-4o-mini"
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const TOOLS: Record<string, string> = {
  brainstorm: 'Brainstorm 10 concrete short-form content ideas. For each: a working title and one sentence on the angle. Number them.',
  hooks: 'Write 10 scroll-stopping opening hooks (first line of a short-form video) for the given topic. Keep each under 15 words. Number them.',
  script: 'Draft a short-form video script (30–60 seconds) for the given idea. Structure it as HOOK / BODY / CTA with clear spoken lines, plus brief b-roll suggestions in [brackets].',
  caption: 'Draft 3 caption options for the given content, each with a different tone. Include a natural call to action and 5–8 relevant hashtags per option.',
  repurpose: 'Take the given content and repurpose it: suggest 5 other formats/angles (e.g. carousel, before/after, FAQ clip, testimonial cut, photo post) with a short outline for each.',
  transcript: 'Read the given transcript or description of footage and extract 8–12 content ideas from it. For each: a working title, the moment/quote to build on, and the suggested format. Number them.',
  trends: 'Using the RESEARCHED TRENDS listed below, propose 8 content ideas that ride them for this brand. For each: which trend it uses, the working title, the hook, and the format. Only use trends that genuinely fit the brand — say plainly which ones you skipped and why.',
}

const SYSTEM = `You are the content co-pilot inside a private workspace for a Personal Assistant / Content Creator who works for Rolando.
The team creates content for two companies:
- South Texas Builders (STB) — construction/building.
- ALTO Pro — real estate.
Use the COMPANY CONTEXT and BRAND VOICE provided below as ground truth; if a section says "EDIT ME" treat it as unspecified and use a sensible neutral professional voice.
Be concrete and immediately usable — the assistant should be able to copy your output straight into the content pipeline.
You have NO live access to TikTok, Instagram, or any platform data, and no browsing. Never claim to know what is currently trending on your own.
The one exception is the RESEARCHED TRENDS section, when present: those were logged by hand by the team, each with the date it was observed. Treat them as dated human observations, not live data — and if a trend looks old relative to the dates given, say so rather than assuming it still applies.
Otherwise base suggestions on timeless content principles and the provided context.
Reply in plain text (no markdown headers).`

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: {
    tool?: string; brand?: string; brandLabel?: string; input?: string
    context?: { companyContext?: string; brandVoice?: string; trends?: string }
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const tool = payload.tool || ''
  const instruction = TOOLS[tool]
  if (!instruction) return json({ error: 'Unknown tool' }, 400)
  const input = (payload.input || '').trim().slice(0, 8000)
  // The trends tool works off the logged research, so a free-text brief is optional there.
  if (!input && tool !== 'trends') return json({ error: 'Missing input' }, 400)
  if (tool === 'trends' && !(payload.context?.trends || '').trim()) {
    return json({ error: 'no_trends', message: 'No fresh trends are logged yet — add some on the Trend Board first.' }, 200)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'not_configured', message: 'The AI key is not set up yet.' }, 200)
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  // The client's brand tabs are the source of truth for the name; the older
  // STB/ALTO mapping stays as a fallback for callers that don't send a label.
  const brand = (payload.brandLabel || '').trim()
    || (payload.brand === 'ALTO' ? 'ALTO Pro' : payload.brand === 'STB' ? 'South Texas Builders (STB)' : 'both brands')
  const ctx = payload.context || {}
  const trends = (ctx.trends || '').trim().slice(0, 4000)
  const user = [
    `TASK: ${instruction}`,
    `TARGET BRAND: ${brand}`,
    `TODAY'S DATE: ${new Date().toISOString().slice(0, 10)}`,
    `COMPANY CONTEXT:\n${(ctx.companyContext || '(not provided)').slice(0, 4000)}`,
    `BRAND VOICE:\n${(ctx.brandVoice || '(not provided)').slice(0, 4000)}`,
    trends
      ? `RESEARCHED TRENDS (logged by hand by the team; each line ends with the date it was observed):\n${trends}`
      : 'RESEARCHED TRENDS: none logged — do not speculate about what is trending.',
    `ASSISTANT'S INPUT:\n${input || '(none — work from the trends above)'}`,
  ].join('\n\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 1200,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('assistant-ai upstream error:', res.status, detail.slice(0, 300))
      return json({ error: 'ai_error', message: 'The AI had trouble responding.' }, 200)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const result = data.choices?.[0]?.message?.content?.trim()
    if (!result) return json({ error: 'ai_error', message: 'Empty response.' }, 200)
    return json({ result })
  } catch (err) {
    console.error('assistant-ai error:', (err as Error).message)
    return json({ error: 'ai_error', message: 'The AI had trouble responding.' }, 200)
  }
}
