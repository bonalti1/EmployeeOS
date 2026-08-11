/**
 * Marketing Studio — static ad image generation.
 *
 * Authenticated; company context fetched server-side (see mktShared).
 * Provider abstraction: `generateImageWithProvider` is the seam — today it
 * implements OpenAI Images with the existing OPENAI_API_KEY; swapping or
 * adding providers touches only that function.
 *
 * Every attempt writes an mkt_generation_jobs row (who, what, model, error),
 * and completed images are copied into the marketing-assets bucket — provider
 * URLs expire, our storage doesn't. Duplicate-click protection: the client
 * passes a requestKey; if a job with that key already exists we return it
 * instead of paying twice.
 */
import {
  json, authenticate, pgSelect, pgInsert, pgUpdate, storageUpload, publicAssetUrl,
  fetchCompanyContext, brandDnaText, MARKETING_GUARDRAILS,
} from '../lib/mktShared'

type ImageResult = { bytes: Uint8Array; contentType: string; model: string }

async function generateImageWithProvider(prompt: string): Promise<ImageResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw Object.assign(new Error('not_configured'), { code: 'not_configured' })
  const model = process.env.MARKETING_IMAGE_MODEL || 'gpt-image-1'

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt: prompt.slice(0, 4000), size: '1024x1024', n: 1 }),
  })
  if (!res.ok) {
    const detail = await res.text()
    console.error('marketing-image upstream error:', res.status, detail.slice(0, 300))
    throw new Error('provider_error')
  }
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const first = data.data?.[0]
  if (first?.b64_json) {
    return { bytes: Uint8Array.from(atob(first.b64_json), (c) => c.charCodeAt(0)), contentType: 'image/png', model }
  }
  if (first?.url) {
    const img = await fetch(first.url)
    return { bytes: new Uint8Array(await img.arrayBuffer()), contentType: img.headers.get('content-type') || 'image/png', model }
  }
  throw new Error('provider_error')
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req)
  if (auth instanceof Response) return auth

  let body: {
    companyId?: string
    campaignId?: string
    versionId?: string
    staticAd?: { headline?: string; subheadline?: string; visualConcept?: string; imageBrief?: string; layout?: string }
    requestKey?: string
  }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const company = await fetchCompanyContext(auth.token, body.companyId || '')
  if (company instanceof Response) return company

  // Duplicate-click / double-submit protection.
  const requestKey = (body.requestKey || '').slice(0, 80)
  if (requestKey) {
    const dupes = await pgSelect(auth.token,
      `mkt_generation_jobs?select=id,status,result_payload&generation_type=eq.image&company_id=eq.${company.id}&request_payload->>requestKey=eq.${encodeURIComponent(requestKey)}`) as
      { id: string; status: string; result_payload?: { assetId?: string; url?: string } }[] | null
    const existing = dupes?.[0]
    if (existing) return json({ duplicate: true, job: existing })
  }

  const ad = body.staticAd || {}
  const visual = company.brand.visual_brand || {}
  // Exact brand palette from the Brand Kit — hex values steer the model far
  // better than color names.
  const palette = [
    visual.color_primary && `primary ${visual.color_primary}`,
    visual.color_secondary && `secondary ${visual.color_secondary}`,
    visual.color_accent && `accent ${visual.color_accent}`,
  ].filter(Boolean).join(', ')
  const prompt = [
    `Professional static marketing ad image for ${company.name}.`,
    ad.visualConcept ? `Visual concept: ${ad.visualConcept}` : '',
    ad.imageBrief ? `Brief: ${ad.imageBrief}` : '',
    ad.layout ? `Layout: ${ad.layout}` : '',
    ad.headline ? `Leave clean space for a headline that will read: "${ad.headline}"` : '',
    visual.image_style ? `Image style: ${visual.image_style}` : '',
    visual.photography_style ? `Photography style: ${visual.photography_style}` : '',
    palette ? `Use this exact brand color palette prominently: ${palette}.` : '',
    visual.avoid ? `Do NOT produce: ${visual.avoid}` : '',
    visual.logo_url
      ? 'Reserve a clean, uncluttered corner area where the company logo will be overlaid in editing — do NOT attempt to draw the logo itself.'
      : '',
    'No gibberish text, no fake or invented logos, no watermarks. Photorealistic unless the style says otherwise.',
    MARKETING_GUARDRAILS,
  ].filter(Boolean).join('\n')

  // Log the job first so failures are visible in the UI.
  const jobs = await pgInsert(auth.token, 'mkt_generation_jobs', {
    company_id: company.id, campaign_id: body.campaignId ?? null,
    generation_type: 'image', provider: 'openai', model: process.env.MARKETING_IMAGE_MODEL || 'gpt-image-1',
    status: 'processing', request_payload: { requestKey, staticAd: ad, versionId: body.versionId ?? null },
    author_role: auth.role,
  }) as { id: string }[] | null
  const jobId = jobs?.[0]?.id

  try {
    const result = await generateImageWithProvider(prompt)
    const path = `${company.slug}/${body.campaignId || 'general'}/${Date.now()}.png`
    const uploaded = await storageUpload(auth.token, path, result.bytes, result.contentType)
    if (!uploaded) throw new Error('storage_error')
    const url = publicAssetUrl(path)

    const assets = await pgInsert(auth.token, 'mkt_assets', {
      company_id: company.id, campaign_id: body.campaignId ?? null, campaign_version_id: body.versionId ?? null,
      type: 'image', url, storage_path: path, provider: 'openai', model: result.model,
      metadata: { prompt: prompt.slice(0, 2000) }, author_role: auth.role,
    }) as { id: string }[] | null

    if (jobId) {
      await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${jobId}`, {
        status: 'completed', result_payload: { assetId: assets?.[0]?.id, url }, updated_at: new Date().toISOString(),
      })
    }
    return json({ asset: { id: assets?.[0]?.id, url }, jobId })
  } catch (err) {
    const e = err as Error & { code?: string }
    if (jobId) {
      await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${jobId}`, {
        status: 'failed', error: e.code || e.message || 'unknown', updated_at: new Date().toISOString(),
      })
    }
    if (e.code === 'not_configured') return json({ error: 'not_configured', message: 'OPENAI_API_KEY is not set in Netlify.' }, 200)
    console.error('marketing-image error:', e.message)
    return json({ error: 'image_error', message: 'Image generation failed. The job is logged — retry manually.' }, 200)
  }
}
