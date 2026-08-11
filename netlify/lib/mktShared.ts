/**
 * Shared server-side helpers for the Marketing Studio Netlify functions.
 *
 * Security model:
 *  • The browser sends the user's Supabase access token (Authorization: Bearer).
 *  • We verify it against Supabase Auth, then look up the caller's workspace
 *    role — via PostgREST *using the caller's own token*, so RLS applies.
 *  • Brand DNA and other generation context are fetched HERE, server-side,
 *    by company_id — never accepted from the browser. That is the company-
 *    isolation guarantee: an ALTO request cannot receive STB context because
 *    the server looks the context up itself.
 *  • No service-role key anywhere: every DB call runs as the caller, so the
 *    database's RLS is the final authority even if a function has a bug.
 *
 * This file lives outside netlify/functions so it is bundled as a module,
 * not deployed as an endpoint.
 */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const SUPA_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPA_ANON = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

export type AuthedUser = {
  token: string
  userId: string
  role: 'owner' | 'assistant'
  canGeneratePaidMedia: boolean
}

/** Verify the caller's Supabase session and workspace membership. */
export async function authenticate(req: Request): Promise<AuthedUser | Response> {
  const url = SUPA_URL()
  const anon = SUPA_ANON()
  if (!url || !anon) return json({ error: 'not_configured', message: 'Supabase is not configured on the server.' }, 500)

  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return json({ error: 'unauthorized', message: 'Sign in required.' }, 401)

  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) return json({ error: 'unauthorized', message: 'Session invalid or expired.' }, 401)
  const user = (await userRes.json()) as { id?: string }
  if (!user.id) return json({ error: 'unauthorized', message: 'Session invalid.' }, 401)

  const memberRows = await pgSelect(token,
    `workspace_members?select=role,can_generate_paid_media&user_id=eq.${user.id}`) as
    { role?: string; can_generate_paid_media?: boolean }[] | null
  const member = memberRows?.[0]
  if (!member || (member.role !== 'owner' && member.role !== 'assistant')) {
    return json({ error: 'forbidden', message: 'Not a workspace member.' }, 403)
  }

  return {
    token,
    userId: user.id,
    role: member.role,
    canGeneratePaidMedia: !!member.can_generate_paid_media,
  }
}

/** PostgREST SELECT as the caller (RLS enforced). Returns null on error. */
export async function pgSelect(token: string, pathAndQuery: string): Promise<unknown[] | null> {
  const res = await fetch(`${SUPA_URL()}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SUPA_ANON(), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as unknown[]
}

/** PostgREST INSERT as the caller. Returns the created row(s) or null. */
export async function pgInsert(token: string, table: string, rows: unknown): Promise<unknown[] | null> {
  const res = await fetch(`${SUPA_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_ANON(), Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) return null
  return (await res.json()) as unknown[]
}

/** PostgREST PATCH as the caller. */
export async function pgUpdate(token: string, pathAndQuery: string, values: unknown): Promise<boolean> {
  const res = await fetch(`${SUPA_URL()}/rest/v1/${pathAndQuery}`, {
    method: 'PATCH',
    headers: { apikey: SUPA_ANON(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  return res.ok
}

/** Upload a binary to the marketing-assets bucket as the caller. */
export async function storageUpload(token: string, path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const res = await fetch(`${SUPA_URL()}/storage/v1/object/marketing-assets/${path}`, {
    method: 'POST',
    headers: { apikey: SUPA_ANON(), Authorization: `Bearer ${token}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes as unknown as BodyInit,
  })
  return res.ok
}

export function publicAssetUrl(path: string): string {
  return `${SUPA_URL()}/storage/v1/object/public/marketing-assets/${path}`
}

// ---------------------------------------------------------------------------
// Company-scoped generation context
// ---------------------------------------------------------------------------

export type CompanyContext = {
  id: string
  name: string
  slug: string
  brand: Record<string, Record<string, string>>
}

/**
 * Fetch a company + its Brand DNA by id, as the caller. Returns a Response
 * (error) if the company doesn't exist or isn't visible to this user.
 */
export async function fetchCompanyContext(token: string, companyId: string): Promise<CompanyContext | Response> {
  if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) {
    return json({ error: 'bad_request', message: 'Invalid company id.' }, 400)
  }
  const companies = await pgSelect(token, `mkt_companies?select=id,name,slug,active&id=eq.${companyId}`) as
    { id: string; name: string; slug: string; active: boolean }[] | null
  const company = companies?.[0]
  if (!company || !company.active) return json({ error: 'not_found', message: 'Company not found.' }, 404)

  const profiles = await pgSelect(token,
    `mkt_brand_profiles?select=identity,customer,positioning,voice,proof,offers,safety_claims,visual_brand&company_id=eq.${companyId}`) as
    Record<string, Record<string, string>>[] | null
  const profile = profiles?.[0] ?? {}

  return { id: company.id, name: company.name, slug: company.slug, brand: profile }
}

/** Render Brand DNA jsonb sections into a compact text block for prompts. */
export function brandDnaText(ctx: CompanyContext): string {
  const SECTION_LABELS: Record<string, string> = {
    identity: 'IDENTITY', customer: 'CUSTOMER', positioning: 'POSITIONING', voice: 'VOICE',
    proof: 'PROOF WE ACTUALLY HAVE', offers: 'OFFERS', safety_claims: 'CLAIMS RULES', visual_brand: 'VISUAL BRAND',
  }
  const parts: string[] = [`COMPANY: ${ctx.name}`]
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    const section = ctx.brand[key]
    if (!section || typeof section !== 'object') continue
    const lines = Object.entries(section)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => `  ${k.replace(/_/g, ' ')}: ${String(v).slice(0, 1200)}`)
    if (lines.length) parts.push(`${label}:\n${lines.join('\n')}`)
  }
  const text = parts.join('\n\n')
  return text.length > 12000 ? text.slice(0, 12000) + '\n…(truncated)' : text
}

// ---------------------------------------------------------------------------
// OpenAI chat helper (strict-JSON responses)
// ---------------------------------------------------------------------------

export function marketingModel(): string {
  return process.env.MARKETING_MODEL || 'gpt-4o'
}

export async function chatJSON(opts: {
  system: string
  user: string
  model?: string
  maxTokens?: number
  temperature?: number
}): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw Object.assign(new Error('not_configured'), { code: 'not_configured' })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model || marketingModel(),
      response_format: { type: 'json_object' },
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4000,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    console.error('marketing chatJSON upstream error:', res.status, detail.slice(0, 300))
    throw new Error('ai_error')
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content || '{}'
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    // Strip accidental fences and retry the parse before giving up.
    const cleaned = raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim()
    return JSON.parse(cleaned) as Record<string, unknown>
  }
}

/** Hard rules injected into every marketing generation, for every company. */
export const MARKETING_GUARDRAILS = `HARD RULES (non-negotiable):
- Use ONLY the Brand DNA provided for THIS company. Never reference or borrow from any other company.
- Never invent testimonials, statistics, review counts, credentials, guarantees, or factual claims. Where proof is needed but not present in the Brand DNA, write exactly "Proof needed" and state what evidence should be gathered.
- Respect the CLAIMS RULES section: never make a claim it forbids; flag topics it marks as requiring owner approval.
- Marketing lens names refer to frameworks of publicly documented principles. Never state or imply that any real person endorsed, reviewed, or created this campaign, and never write output "in the voice of" a real person.
- No manipulative or deceptive tactics: no fake scarcity, fake urgency, fabricated social proof, or misleading claims.
- All output is a DRAFT for human review — write nothing that presumes automatic publication.`
