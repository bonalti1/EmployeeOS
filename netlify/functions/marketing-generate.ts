/**
 * Marketing Studio — campaign text generation.
 *
 * Authenticated + company-scoped: the caller sends ids; this function fetches
 * the company's Brand DNA, the idea, and the lens definitions from the
 * database itself (as the caller, so RLS applies). The browser never supplies
 * generation context, which is what guarantees STB/ALTO isolation.
 *
 * The full campaign is too large for one reliable strict-JSON completion, so
 * it is generated in three sequenced calls (strategy → production →
 * distribution) and stitched. Council mode runs per-lens analyses, a
 * Creative-Director synthesis, then the campaign guided by that synthesis.
 *
 * Modes:
 *   campaign — single-lens full generation
 *   council  — 3–5 lens analyses + synthesis + full generation
 *   section  — regenerate one section of an existing output
 */
import {
  json, authenticate, pgSelect, pgInsert, fetchCompanyContext, brandDnaText,
  chatJSON, marketingModel, MARKETING_GUARDRAILS,
} from '../lib/mktShared'

type Settings = {
  objective?: string
  audience?: string
  funnelStage?: string
  channels?: string[]
  videoLength?: string
  tone?: string
  cta?: string
}

type LensRow = { slug: string; name: string; prompt_instructions: string; active: boolean }

const SCHEMA_STRATEGY = `{
 "strategy": {"strategicAngle": str, "whyThisMatters": str, "customerInsight": str, "awarenessStage": str, "corePromise": str, "positioning": str, "offer": str, "proofRequired": [str], "objections": [str]},
 "hooks": {"primary": str, "alternatives": [str x5], "visualHook": str, "firstFrame": str, "openingText": str},
 "adStructure": {"hook": str, "body": str, "proof": str, "offer": str, "cta": str},
 "cta": {"primary": str, "alternatives": [str x3]},
 "explanation": {"whyThisDirection": str, "principlesUsed": [str], "whatToTest": str, "whatCouldFail": str}
}`

const SCHEMA_PRODUCTION = `{
 "script": {"durationTarget": str, "scenes": [{"scene": int, "timecode": str, "dialogue": str, "onScreenText": str, "visualDirection": str, "beat": str}]},
 "shotList": [{"shot": int, "duration": str, "framing": str, "action": str, "location": str, "brollNeeded": bool, "onScreenText": str, "editNote": str}],
 "broll": {"required": [str], "optional": [str], "likelyHave": [str], "needToCapture": [str]},
 "editing": {"pacing": str, "cuts": str, "captions": str, "graphics": str, "music": str, "patternInterrupts": str, "transitions": str, "brandPlacement": str}
}`

const SCHEMA_DISTRIBUTION = `{
 "captions": {"platformCaption": str, "shortCaption": str, "longCaption": str, "headline": str, "description": str, "hashtags": [str]},
 "staticAd": {"headline": str, "subheadline": str, "body": str, "cta": str, "layout": str, "visualConcept": str, "imageBrief": str},
 "thumbnail": {"concept": str, "headline": str, "composition": str, "emotionalCue": str},
 "longform": {"angle": str, "outline": [str], "titleOptions": [str]},
 "repurposing": {"reel": str, "carousel": str, "static": str, "email": str, "followUp": str, "faq": str},
 "abTests": [{"variable": str, "variantA": str, "variantB": str, "hypothesis": str}]
}`

const SCHEMA_ANALYSIS = `{
 "positioning": str, "hook": str, "offer": str, "proofAngle": str, "cta": str,
 "videoFormat": str, "brandRisk": str, "keyInsight": str
}`

const SCHEMA_SYNTHESIS = `{
 "agreements": [str], "disagreements": [str],
 "strongestPositioning": str, "strongestHook": str, "strongestOffer": str,
 "strongestProofAngle": str, "strongestCta": str, "recommendedVideoFormat": str,
 "majorBrandRisk": str, "recommendedDirection": str, "alternativeDirection": str
}`

const SECTION_SCHEMAS: Record<string, string> = {
  strategy: '{"strategy": {"strategicAngle": str, "whyThisMatters": str, "customerInsight": str, "awarenessStage": str, "corePromise": str, "positioning": str, "offer": str, "proofRequired": [str], "objections": [str]}}',
  hooks: '{"hooks": {"primary": str, "alternatives": [str x5], "visualHook": str, "firstFrame": str, "openingText": str}}',
  adStructure: '{"adStructure": {"hook": str, "body": str, "proof": str, "offer": str, "cta": str}}',
  script: '{"script": {"durationTarget": str, "scenes": [{"scene": int, "timecode": str, "dialogue": str, "onScreenText": str, "visualDirection": str, "beat": str}]}}',
  shotList: '{"shotList": [{"shot": int, "duration": str, "framing": str, "action": str, "location": str, "brollNeeded": bool, "onScreenText": str, "editNote": str}]}',
  broll: '{"broll": {"required": [str], "optional": [str], "likelyHave": [str], "needToCapture": [str]}}',
  editing: '{"editing": {"pacing": str, "cuts": str, "captions": str, "graphics": str, "music": str, "patternInterrupts": str, "transitions": str, "brandPlacement": str}}',
  cta: '{"cta": {"primary": str, "alternatives": [str x3]}}',
  captions: '{"captions": {"platformCaption": str, "shortCaption": str, "longCaption": str, "headline": str, "description": str, "hashtags": [str]}}',
  staticAd: '{"staticAd": {"headline": str, "subheadline": str, "body": str, "cta": str, "layout": str, "visualConcept": str, "imageBrief": str}}',
  thumbnail: '{"thumbnail": {"concept": str, "headline": str, "composition": str, "emotionalCue": str}}',
  longform: '{"longform": {"angle": str, "outline": [str], "titleOptions": [str]}}',
  repurposing: '{"repurposing": {"reel": str, "carousel": str, "static": str, "email": str, "followUp": str, "faq": str}}',
  abTests: '{"abTests": [{"variable": str, "variantA": str, "variantB": str, "hypothesis": str}]}',
}

function systemPrompt(lensInstructions: string): string {
  return `You are the campaign engine inside a private Marketing Studio. You produce structured, immediately actionable marketing campaigns for ONE company at a time, for a small in-house team (a founder and one content creator) that films and edits its own content.

MARKETING LENS FOR THIS GENERATION:
${lensInstructions}

${MARKETING_GUARDRAILS}

Respond with VALID JSON only, exactly matching the schema you are given. "str" means a string, "[str]" an array of strings, "int" a number. Be concrete and specific to THIS company and THIS idea — no generic filler.`
}

function briefText(company: string, idea: Record<string, string>, s: Settings): string {
  return [
    `IDEA (${company}):`,
    idea.title ? `Title: ${idea.title}` : '',
    `Raw idea: ${idea.raw_idea}`,
    idea.notes ? `Notes: ${idea.notes}` : '',
    idea.product ? `Product/service: ${idea.product}` : '',
    idea.offer ? `Known offer: ${idea.offer}` : '',
    '',
    'CAMPAIGN SETTINGS:',
    `Objective: ${s.objective || 'not specified'}`,
    `Audience: ${s.audience || idea.audience || 'use the Brand DNA default audience'}`,
    s.funnelStage ? `Awareness stage: ${s.funnelStage}` : '',
    `Channels: ${(s.channels ?? []).join(', ') || 'general'}`,
    s.videoLength ? `Video length: ${s.videoLength}` : '',
    `Tone: ${s.tone || 'use the Brand DNA default voice'}`,
    s.cta ? `CTA preference: ${s.cta}` : 'CTA: recommend the best CTA',
  ].filter(Boolean).join('\n')
}

async function generateFullCampaign(sys: string, dna: string, brief: string, directive?: string) {
  const base = `${dna}\n\n${brief}${directive ? `\n\nCREATIVE DIRECTION (follow this):\n${directive}` : ''}`
  const part1 = await chatJSON({ system: sys, user: `${base}\n\nProduce JSON matching:\n${SCHEMA_STRATEGY}` })
  const part2 = await chatJSON({
    system: sys,
    user: `${base}\n\nSTRATEGY ALREADY CHOSEN (build on it, do not contradict it):\n${JSON.stringify(part1.strategy)}\nPrimary hook: ${JSON.stringify((part1.hooks as Record<string, unknown>)?.primary)}\n\nProduce JSON matching:\n${SCHEMA_PRODUCTION}`,
  })
  const part3 = await chatJSON({
    system: sys,
    user: `${base}\n\nSTRATEGY: ${JSON.stringify(part1.strategy)}\nHOOK: ${JSON.stringify((part1.hooks as Record<string, unknown>)?.primary)}\nOFFER/CTA: ${JSON.stringify(part1.cta)}\n\nProduce JSON matching:\n${SCHEMA_DISTRIBUTION}`,
  })
  return { ...part1, ...part2, ...part3 }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req)
  if (auth instanceof Response) return auth

  let body: {
    mode?: 'campaign' | 'council' | 'section'
    companyId?: string
    ideaId?: string
    campaignId?: string
    lensSlug?: string
    lensSlugs?: string[]
    settings?: Settings
    section?: string
    currentOutput?: Record<string, unknown>
  }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const mode = body.mode || 'campaign'
  const settings = body.settings || {}

  // --- Company context, fetched server-side by id (the isolation boundary) --
  const company = await fetchCompanyContext(auth.token, body.companyId || '')
  if (company instanceof Response) return company
  const dna = `BRAND DNA — ${company.name} (use ONLY this):\n${brandDnaText(company)}`

  // --- Idea, fetched scoped to the company: a mismatched pair 404s ---------
  if (!body.ideaId) return json({ error: 'bad_request', message: 'ideaId required' }, 400)
  const ideas = await pgSelect(auth.token,
    `mkt_ideas?select=*&id=eq.${body.ideaId}&company_id=eq.${company.id}`) as Record<string, string>[] | null
  const idea = ideas?.[0]
  if (!idea) return json({ error: 'not_found', message: 'Idea not found in this company.' }, 404)

  const brief = briefText(company.name, idea, settings)

  // --- Lenses, from the database (owner-editable) --------------------------
  const allLenses = (await pgSelect(auth.token,
    'mkt_lenses?select=slug,name,prompt_instructions,active&active=eq.true&order=sort')) as LensRow[] | null
  if (!allLenses?.length) return json({ error: 'not_configured', message: 'No marketing lenses found — run the Marketing Studio SQL.' }, 500)
  const lensBySlug = new Map(allLenses.map((l) => [l.slug, l]))

  try {
    if (mode === 'section') {
      const section = body.section || ''
      const schema = SECTION_SCHEMAS[section]
      if (!schema) return json({ error: 'bad_request', message: 'Unknown section.' }, 400)
      const lens = lensBySlug.get(body.lensSlug || '')
      const sys = systemPrompt(lens ? `${lens.name} framework: ${lens.prompt_instructions}` : 'Use sound, evidence-based marketing principles.')
      const context = body.currentOutput
        ? `\n\nEXISTING CAMPAIGN (regenerate ONLY the requested section; stay consistent with the rest):\n${JSON.stringify(body.currentOutput).slice(0, 6000)}`
        : ''
      const out = await chatJSON({ system: sys, user: `${dna}\n\n${brief}${context}\n\nProduce JSON matching:\n${schema}` })
      return json({ output: out, model: marketingModel() })
    }

    if (mode === 'council') {
      const requested = (body.lensSlugs ?? []).filter((s) => lensBySlug.has(s)).slice(0, 5)
      if (requested.length < 2) return json({ error: 'bad_request', message: 'Pick 2–5 lenses for the council.' }, 400)

      // Step 1 — independent analyses (sequential keeps us inside function limits).
      const analyses: Record<string, unknown>[] = []
      for (const slug of requested) {
        const lens = lensBySlug.get(slug)!
        const out = await chatJSON({
          system: systemPrompt(`${lens.name} framework: ${lens.prompt_instructions}`),
          user: `${dna}\n\n${brief}\n\nAnalyze this idea strictly through this framework. Produce JSON matching:\n${SCHEMA_ANALYSIS}`,
          maxTokens: 1200,
        })
        analyses.push({ lens: lens.name, slug, ...out })
      }

      // Step 2 — Creative Director synthesis.
      const synthesis = await chatJSON({
        system: systemPrompt('You are the Creative Director synthesizing several independent strategic analyses. Judge on the merits; do not average — pick the strongest elements and say why.'),
        user: `${dna}\n\n${brief}\n\nINDEPENDENT ANALYSES:\n${JSON.stringify(analyses)}\n\nCompare them. Produce JSON matching:\n${SCHEMA_SYNTHESIS}`,
        maxTokens: 1800,
      })

      // Step 3 — full campaign guided by the synthesis.
      const sys = systemPrompt('Marketing Council synthesis: execute the agreed creative direction faithfully.')
      const output = await generateFullCampaign(sys, dna, brief,
        `${synthesis.recommendedDirection}\nStrongest hook: ${synthesis.strongestHook}\nStrongest offer: ${synthesis.strongestOffer}\nStrongest CTA: ${synthesis.strongestCta}\nAvoid this risk: ${synthesis.majorBrandRisk}`)

      await pgInsert(auth.token, 'mkt_generation_jobs', {
        company_id: company.id, idea_id: idea.id, campaign_id: body.campaignId ?? null,
        generation_type: 'text', provider: 'openai', model: marketingModel(), status: 'completed',
        request_payload: { mode, lensSlugs: requested, settings }, author_role: auth.role,
      })
      return json({ output, council: { analyses, synthesis }, model: marketingModel() })
    }

    // Default: single-lens full campaign.
    const lens = lensBySlug.get(body.lensSlug || '')
    if (!lens) return json({ error: 'bad_request', message: 'Unknown marketing lens.' }, 400)
    const output = await generateFullCampaign(
      systemPrompt(`${lens.name} framework: ${lens.prompt_instructions}`), dna, brief)

    await pgInsert(auth.token, 'mkt_generation_jobs', {
      company_id: company.id, idea_id: idea.id, campaign_id: body.campaignId ?? null,
      generation_type: 'text', provider: 'openai', model: marketingModel(), status: 'completed',
      request_payload: { mode, lensSlug: lens.slug, settings }, author_role: auth.role,
    })
    return json({ output, model: marketingModel() })
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === 'not_configured') return json({ error: 'not_configured', message: 'OPENAI_API_KEY is not set in Netlify.' }, 200)
    console.error('marketing-generate error:', e.message)
    return json({ error: 'ai_error', message: 'Generation failed — nothing was saved. Try again.' }, 200)
  }
}
