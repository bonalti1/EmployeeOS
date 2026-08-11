import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

/**
 * Marketing Studio data layer.
 *
 * Company isolation, client side: every read goes through useMktTable, which
 * appends `company_id=eq.<selected>` to the actual database query — rows for
 * the other company never even arrive in the browser. (RLS + the server-side
 * context fetch in the Netlify functions are the real enforcement; this keeps
 * the UI honest too.)
 */

export type MktCompany = { id: string; name: string; slug: string; active: boolean }

export type BrandSectionKey =
  | 'identity' | 'customer' | 'positioning' | 'voice'
  | 'proof' | 'offers' | 'safety_claims' | 'visual_brand'

export type MktBrandProfile = { company_id: string; updated_at: string } &
  Record<BrandSectionKey, Record<string, string>>

export type MktIdeaStatus = 'idea' | 'developing' | 'ready' | 'approved' | 'published' | 'archived'

export type MktIdea = {
  id: string
  company_id: string
  title: string
  raw_idea: string
  objective: string
  audience: string
  product: string
  offer: string
  source_url: string
  notes: string
  priority: 'Low' | 'Medium' | 'High'
  status: MktIdeaStatus
  tags: string[]
  author_role: 'owner' | 'assistant'
  created_at: string
  updated_at: string
}

export type MktLens = {
  id: string
  slug: string
  name: string
  description: string
  principles: string[]
  questions: string[]
  best_for: string[]
  limitations: string[]
  active: boolean
  sort: number
}

export type MktCampaign = {
  id: string
  company_id: string
  idea_id: string | null
  title: string
  objective: string
  audience: string
  funnel_stage: string
  channels: string[]
  video_length: string
  tone: string
  cta_preference: string
  selected_lens: string
  council_lenses: string[] | null
  current_version_id: string | null
  status: 'draft' | 'generated' | 'approved' | 'published' | 'archived'
  author_role: 'owner' | 'assistant'
  created_at: string
}

export type MktVersion = {
  id: string
  campaign_id: string
  company_id: string
  version_number: number
  generation_mode: 'single' | 'council' | 'manual_edit'
  marketing_lens: string
  structured_output: Record<string, unknown>
  edited_output: Record<string, unknown> | null
  council_analyses: Record<string, unknown> | null
  approved: boolean
  author_role: 'owner' | 'assistant'
  created_at: string
}

export type MktAsset = {
  id: string
  company_id: string
  campaign_id: string | null
  campaign_version_id: string | null
  type: 'image' | 'video' | 'thumbnail' | 'reference'
  url: string
  provider: string
  model: string
  approved: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export type MktJob = {
  id: string
  company_id: string
  campaign_id: string | null
  generation_type: 'text' | 'image' | 'video'
  provider: string
  model: string
  status: 'draft' | 'awaiting_confirmation' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  request_payload: Record<string, unknown>
  result_payload: Record<string, unknown> | null
  estimated_cost: number | null
  actual_cost: number | null
  error: string | null
  author_role: 'owner' | 'assistant'
  created_at: string
}

export const IDEA_STATUSES: { id: MktIdeaStatus; label: string }[] = [
  { id: 'idea', label: 'New' },
  { id: 'developing', label: 'Developing' },
  { id: 'ready', label: 'Ready' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
]

export const MKT_OBJECTIVES = [
  'Awareness', 'Engagement', 'Leads', 'Booked appointments', 'Sales', 'Product education',
  'Retargeting', 'Trust', 'Recruiting', 'Launch', 'Announcement',
]

export const MKT_CHANNELS = [
  'TikTok', 'Instagram Reel', 'Facebook Reel', 'YouTube Short', 'Long-form YouTube',
  'Meta static ad', 'Instagram static post', 'Carousel', 'Email', 'Landing page', 'Sales message', 'General campaign',
]

export const MKT_FUNNEL = ['Unaware', 'Problem aware', 'Solution aware', 'Product aware', 'Most aware']
export const MKT_LENGTHS = ['15 sec', '30 sec', '60 sec', '90 sec', 'Long form']
export const MKT_TONES = [
  'Brand DNA default', 'Educational', 'Direct', 'Story', 'Premium', 'Controversial-but-credible',
  'Humorous', 'Documentary', 'Founder-led', 'Customer-story', 'Jobsite/demo',
]

/** Brand DNA editor field map — sections and their fields (stored as jsonb). */
export const BRAND_SECTIONS: { key: BrandSectionKey; label: string; hint: string; fields: { k: string; label: string }[] }[] = [
  {
    key: 'identity', label: 'Identity', hint: 'Who this company is',
    fields: [
      { k: 'description', label: 'Short description' }, { k: 'what_we_do', label: 'What we do' },
      { k: 'market', label: 'Primary market / location' }, { k: 'mission', label: 'Mission' },
      { k: 'values', label: 'Values' }, { k: 'brand_promise', label: 'Brand promise' },
    ],
  },
  {
    key: 'customer', label: 'Customer', hint: 'Who we serve and what they feel',
    fields: [
      { k: 'primary_audience', label: 'Primary audience' }, { k: 'secondary_audiences', label: 'Secondary audiences' },
      { k: 'ideal_customer', label: 'Ideal customer profile' }, { k: 'problems', label: 'Customer problems' },
      { k: 'desired_outcomes', label: 'Desired outcomes' }, { k: 'fears', label: 'Fears' },
      { k: 'objections', label: 'Objections' }, { k: 'common_questions', label: 'Common questions' },
      { k: 'buying_triggers', label: 'Buying triggers' },
    ],
  },
  {
    key: 'positioning', label: 'Positioning', hint: 'The spot we own in their mind',
    fields: [
      { k: 'category', label: 'Category' }, { k: 'known_for', label: 'What we want to be known for' },
      { k: 'differentiators', label: 'Key differentiators' }, { k: 'competitors', label: 'Competitors / alternatives' },
      { k: 'why_us', label: 'Why customers choose us' }, { k: 'why_hesitate', label: 'Why customers hesitate' },
    ],
  },
  {
    key: 'voice', label: 'Voice', hint: 'How this company talks',
    fields: [
      { k: 'tone', label: 'Tone' }, { k: 'personality', label: 'Personality' },
      { k: 'vocabulary_liked', label: 'Vocabulary we like' }, { k: 'vocabulary_avoided', label: 'Vocabulary we avoid' },
      { k: 'phrases', label: 'Phrases we commonly use' }, { k: 'cta_style', label: 'CTA style' },
    ],
  },
  {
    key: 'proof', label: 'Proof', hint: 'ONLY real, verifiable proof — the AI is forbidden from inventing any',
    fields: [
      { k: 'testimonials', label: 'Testimonials' }, { k: 'case_studies', label: 'Case studies' },
      { k: 'statistics', label: 'Statistics' }, { k: 'experience', label: 'Years of experience' },
      { k: 'certifications', label: 'Certifications' }, { k: 'projects', label: 'Notable projects' },
      { k: 'outcomes', label: 'Customer outcomes' },
    ],
  },
  {
    key: 'offers', label: 'Offers', hint: 'What we sell and the next step',
    fields: [
      { k: 'core_offers', label: 'Core offers' }, { k: 'promotions', label: 'Current promotions' },
      { k: 'lead_magnets', label: 'Lead magnets' }, { k: 'guarantees', label: 'Guarantees (if real)' },
      { k: 'financing', label: 'Financing (if offered)' }, { k: 'conversion_goal', label: 'Next step / conversion goal' },
    ],
  },
  {
    key: 'safety_claims', label: 'Claims Rules', hint: 'The legal guardrails every generation obeys',
    fields: [
      { k: 'allowed_claims', label: 'Claims AI may make' }, { k: 'forbidden_claims', label: 'Claims AI must NOT make' },
      { k: 'legal_notes', label: 'Legal / compliance notes' }, { k: 'owner_approval_topics', label: 'Topics requiring owner approval' },
    ],
  },
  {
    key: 'visual_brand', label: 'Visual Brand', hint: 'Feeds image generation',
    fields: [
      { k: 'logo_urls', label: 'Logo URLs' }, { k: 'colors', label: 'Colors' }, { k: 'fonts', label: 'Fonts' },
      { k: 'image_style', label: 'Image style' }, { k: 'photography_style', label: 'Photography style' },
      { k: 'approved_examples', label: 'Examples of approved creative' }, { k: 'avoid', label: 'Creative we do NOT want' },
    ],
  },
]

/** Campaign output sections, in display order (drives the tab UI). */
export const CAMPAIGN_SECTIONS: { key: string; label: string }[] = [
  { key: 'strategy', label: 'Strategy' },
  { key: 'hooks', label: 'Hooks' },
  { key: 'adStructure', label: 'Structure' },
  { key: 'script', label: 'Script' },
  { key: 'shotList', label: 'Shot List' },
  { key: 'broll', label: 'B-roll' },
  { key: 'editing', label: 'Edit Plan' },
  { key: 'cta', label: 'CTA' },
  { key: 'captions', label: 'Copy' },
  { key: 'staticAd', label: 'Static Ad' },
  { key: 'thumbnail', label: 'Thumbnail' },
  { key: 'longform', label: 'Long-form' },
  { key: 'repurposing', label: 'Repurpose' },
  { key: 'abTests', label: 'A/B Tests' },
]

// ---------------------------------------------------------------------------
// Selected-company context (persisted per browser)
// ---------------------------------------------------------------------------

type CompanyCtx = {
  companies: MktCompany[]
  company: MktCompany | null
  setCompanyId: (id: string) => void
  loading: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<CompanyCtx>({ companies: [], company: null, setCompanyId: () => {}, loading: true, refresh: async () => {} })

export function MktCompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<MktCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyIdState] = useState<string>(() => localStorage.getItem('jess:mkt.company') || '')

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data, error } = await supabase.from('mkt_companies').select('*').eq('active', true).order('created_at')
    if (!error) setCompanies((data ?? []) as MktCompany[])
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const setCompanyId = (id: string) => {
    setCompanyIdState(id)
    try { localStorage.setItem('jess:mkt.company', id) } catch { /* ignore */ }
  }

  const company = companies.find((c) => c.id === companyId) ?? companies[0] ?? null

  return <Ctx.Provider value={{ companies, company, setCompanyId, loading, refresh }}>{children}</Ctx.Provider>
}

export function useMktCompany() {
  return useContext(Ctx)
}

// ---------------------------------------------------------------------------
// Company-scoped table hook — the .eq('company_id') is in the DB query itself
// ---------------------------------------------------------------------------

export function useMktTable<T extends { id: string }>(
  table: string,
  companyId: string | null,
  opts?: { orderBy?: string; ascending?: boolean; filter?: [string, string] },
) {
  const [rows, setRows] = useState<T[] | null>(null)
  const orderBy = opts?.orderBy ?? 'created_at'
  const ascending = opts?.ascending ?? false
  const filterKey = opts?.filter ? `${opts.filter[0]}:${opts.filter[1]}` : ''

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) { setRows([]); return }
    let q = supabase.from(table).select('*').eq('company_id', companyId).order(orderBy, { ascending })
    if (opts?.filter) q = q.eq(opts.filter[0], opts.filter[1])
    const { data, error } = await q
    if (!error) setRows((data ?? []) as T[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, companyId, orderBy, ascending, filterKey])

  useEffect(() => {
    setRows(null)
    if (!supabase || !companyId) { setRows([]); return }
    void refresh()
    const channel = supabase
      .channel(`mkt_${table}_${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `company_id=eq.${companyId}` }, () => { void refresh() })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [table, companyId, refresh])

  const insert = useCallback(async (values: Partial<T>) => {
    if (!supabase || !companyId) return null
    const { data, error } = await supabase.from(table)
      .insert({ ...values, company_id: companyId } as Record<string, unknown>).select().single()
    if (error) return null
    void refresh()
    return data as T
  }, [table, companyId, refresh])

  const update = useCallback(async (id: string, values: Partial<T>) => {
    if (!supabase || !companyId) return
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, ...values } : row)) ?? null)
    // company_id in the WHERE clause: even a bugged id can't touch another company's row.
    await supabase.from(table).update(values as Record<string, unknown>).eq('id', id).eq('company_id', companyId)
  }, [table, companyId])

  const remove = useCallback(async (id: string) => {
    if (!supabase || !companyId) return
    setRows((r) => r?.filter((row) => row.id !== id) ?? null)
    await supabase.from(table).delete().eq('id', id).eq('company_id', companyId)
  }, [table, companyId])

  return { rows, refresh, insert, update, remove }
}

/** Lenses are system-level (not per-company). */
export function useMktLenses() {
  const [lenses, setLenses] = useState<MktLens[] | null>(null)
  useEffect(() => {
    if (!supabase) { setLenses([]); return }
    void supabase.from('mkt_lenses').select('*').eq('active', true).order('sort')
      .then(({ data, error }) => { if (!error) setLenses((data ?? []) as MktLens[]) })
  }, [])
  return lenses
}

// ---------------------------------------------------------------------------
// Authenticated calls to the marketing Netlify functions
// ---------------------------------------------------------------------------

export async function mktApi<T = Record<string, unknown>>(fn: string, body: Record<string, unknown>): Promise<T & { error?: string; message?: string }> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  if (!token) return { error: 'unauthorized', message: 'Sign in required.' } as T & { error: string; message: string }
  try {
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return (await res.json()) as T & { error?: string; message?: string }
  } catch {
    return { error: 'offline', message: 'Could not reach the server (running locally without netlify dev?).' } as T & { error: string; message: string }
  }
}

export const fmtMktDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
