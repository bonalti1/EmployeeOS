/**
 * AI Studio — draft / score / revise, one step per call.
 *
 * The quality loop runs client-side (draft → score → revise → score) so each
 * function call stays comfortably inside Netlify's sync timeout and the app
 * can narrate progress ("Drafting… Scoring 82/100… Revising…"). The API key
 * lives only here.
 *
 * Modes:
 *   draft  { output, brandLabel, mentorName?, mentorStyle?, bestFit?, input, context }
 *          → { result }  (bestFit drafts open with "LENS: <name> — <why>")
 *   score  { output, brandLabel, input, draft }
 *          → { score: { hook, clarity, brandFit, cta, platformFit, total, feedback[] } }
 *   revise { output, brandLabel, mentorName?, mentorStyle?, input, draft, feedback[] }
 *          → { result }
 *
 * Env: OPENAI_API_KEY (required), OPENAI_MODEL (default gpt-4o-mini).
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const OUTPUTS: Record<string, string> = {
  ad_script:
    'Write a direct-response AD SCRIPT for social (Facebook/Instagram/TikTok). Structure: HOOK (first 3 seconds, spoken + on-screen text), PROBLEM, OFFER/SOLUTION with proof, CTA. Give a 30–45s main version plus a 15s cutdown. Mark spoken lines vs. on-screen text vs. b-roll.',
  video_script:
    'Write an organic VIDEO SCRIPT with time-coded beats (0:00, 0:03, …). For each beat: spoken line, b-roll/visual, on-screen text. Retention-first: payoff stated up front, re-hooks at likely drop-offs, tight ending with CTA. Include a title + thumbnail concept.',
  story:
    'Write a STORY piece — a narrative the brand can post as a caption, voiceover or email. Real-feeling arc: a specific character, tension, turn, resolution where the brand is the guide (not the hero). End with one soft CTA. Give a short title and a 1-line teaser version.',
  branding:
    'Write a BRANDING piece: the positioning angle in one sentence, 5 tagline options, a short brand manifesto paragraph (~120 words) in the brand voice, and 3 content pillars this brand should own. This is brand-building, not direct response — no hard sell.',
  video_style:
    'Write a VIDEO STYLE direction (art direction) for this idea: overall visual style and mood, 6–10 specific shots, pacing and cut rhythm, music direction, on-screen text style (reference the brand fonts/colours if provided), color grading notes, and 3 reference-style descriptions. No dialogue script — this is the look.',
}

type Ctx = { companyContext?: string; brandVoice?: string; trends?: string }

function baseContext(brandLabel: string, ctx: Ctx): string {
  return [
    `BRAND: ${brandLabel}`,
    `COMPANY CONTEXT:\n${(ctx.companyContext || '(not provided)').slice(0, 4000)}`,
    `BRAND VOICE & KIT:\n${(ctx.brandVoice || '(not provided)').slice(0, 4000)}`,
    (ctx.trends || '').trim()
      ? `RESEARCHED TRENDS (hand-logged; each line ends with its observed date):\n${(ctx.trends || '').slice(0, 3000)}`
      : 'RESEARCHED TRENDS: none logged — do not invent trends.',
  ].join('\n\n')
}

async function chat(apiKey: string, model: string, system: string, user: string, jsonMode = false): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: jsonMode ? 0.2 : 0.8,
      max_tokens: 1400,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw Object.assign(new Error('provider_error'), { detail: detail.slice(0, 300), status: res.status })
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content || '').trim()
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'not_configured', message: 'Add OPENAI_API_KEY in Netlify to enable AI Studio.' }, 200)
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  let p: {
    mode?: string; output?: string; brandLabel?: string
    mentorName?: string; mentorStyle?: string; bestFit?: boolean
    input?: string; draft?: string; feedback?: string[]
    context?: Ctx
    mentorRoster?: { name: string; why: string }[]
  }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }

  const output = OUTPUTS[p.output || '']
  if (!output) return json({ error: 'unknown_output' }, 400)
  const brandLabel = (p.brandLabel || 'the brand').slice(0, 80)
  const input = (p.input || '').trim().slice(0, 6000)
  const ctx = baseContext(brandLabel, p.context || {})

  try {
    if (p.mode === 'draft') {
      const lens = p.bestFit
        ? `MENTOR LENS: Choose the single best-fitting mentor from this roster for THIS brief and write through their lens:\n${(p.mentorRoster || []).map((m) => `- ${m.name}: ${m.why}`).join('\n')}\nStart your response with exactly one line: "LENS: <mentor name> — <why they fit this brief, max 12 words>" followed by a blank line, then the piece.`
        : `MENTOR LENS: ${p.mentorName || 'none'}. ${p.mentorStyle || ''}`
      const system =
        'You are an elite marketing creative director. You write scroll-stopping, conversion-aware content that stays rigorously on-brand. Never invent facts, prices, offers or trends that are not in the provided context. Plain text only — no markdown headers.'
      const user = [`TASK:\n${output}`, lens, ctx, `THE IDEA / BRIEF:\n${input || '(none — work from the brand context)'}`].join('\n\n')
      const result = await chat(apiKey, model, system, user)
      return json({ result })
    }

    if (p.mode === 'score') {
      const system =
        'You are a brutally honest marketing quality judge. You score drafts against a rubric and return STRICT JSON only.'
      const user = [
        `Score this ${p.output} draft for ${brandLabel} against the brief and context. Rubric (integers): hook (0-25) — would it stop the scroll in 3s; clarity (0-20) — one idea, instantly understood; brandFit (0-20) — voice, colours/type references, what the company actually sells; cta (0-20) — clear, low-friction next step (for branding pieces judge memorability instead); platformFit (0-15) — right length/format for the platform. total = sum. Also return feedback: an array of 2-4 blunt, specific fixes that would raise the score most.`,
        ctx,
        `THE BRIEF:\n${input || '(none)'}`,
        `THE DRAFT:\n${(p.draft || '').slice(0, 8000)}`,
        'Return JSON: {"hook":n,"clarity":n,"brandFit":n,"cta":n,"platformFit":n,"total":n,"feedback":["…"]}',
      ].join('\n\n')
      const raw = await chat(apiKey, model, system, user, true)
      try {
        const score = JSON.parse(raw) as Record<string, unknown>
        return json({ score })
      } catch {
        return json({ error: 'bad_score' }, 200)
      }
    }

    if (p.mode === 'revise') {
      const system =
        'You are an elite marketing creative director revising your own draft after notes from a quality judge. Keep everything that works; fix exactly what the notes call out. Never invent facts not in the context. Plain text only.'
      const user = [
        `TASK (unchanged):\n${output}`,
        p.mentorStyle ? `MENTOR LENS: ${p.mentorName}. ${p.mentorStyle}` : '',
        ctx,
        `THE BRIEF:\n${input || '(none)'}`,
        `CURRENT DRAFT:\n${(p.draft || '').slice(0, 8000)}`,
        `JUDGE'S NOTES TO FIX:\n${(p.feedback || []).map((f) => `- ${f}`).join('\n') || '- tighten the hook'}`,
        'Return the full revised piece (not a diff). If the draft opened with a "LENS:" line, keep it.',
      ].filter(Boolean).join('\n\n')
      const result = await chat(apiKey, model, system, user)
      return json({ result })
    }

    if (p.mode === 'viral') {
      const system =
        'You are a short-form virality analyst. You have internalized the mechanics of clips that actually went viral: a sub-3-second pattern interrupt, a curiosity gap the viewer must close, high relatability or high stakes, an emotion strong enough to share (awe, outrage, humor, pride), a payoff that rewards watching, and platform-native format. You are blunt about weak ideas. STRICT JSON only.'
      const user = [
        `Analyze this idea for ${brandLabel} for viral potential on short-form platforms (TikTok / Reels / Shorts).`,
        ctx,
        `THE IDEA:\n${input || '(none)'}`,
        'Return JSON: {"score": 0-100 viral potential as-is, "verdict": one blunt sentence, "why": [2-4 short reasons it can or cannot travel], "angles": [exactly 5 items, ranked best first, each {"title": short name, "hook": the literal first 3 seconds (spoken or on-screen), "format": e.g. POV / before-after / stitch-bait / challenge / storytime / cost-breakdown, "whyViral": which viral mechanic it exploits, in one line}], "boosters": [2-3 concrete things that would multiply reach, e.g. a caption bait, a duet target, a posting time]}',
      ].join('\n\n')
      const raw = await chat(apiKey, model, system, user, true)
      try { return json({ viral: JSON.parse(raw) }) } catch { return json({ error: 'bad_viral' }, 200) }
    }

    return json({ error: 'unknown_mode' }, 400)
  } catch (e) {
    const err = e as Error & { detail?: string; status?: number }
    return json({ error: 'provider_error', detail: err.detail || String(err).slice(0, 200) }, 200)
  }
}
