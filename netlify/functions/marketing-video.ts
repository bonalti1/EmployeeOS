/**
 * Marketing Studio — video generation job system (bones now, provider later).
 *
 * Paid-media flow with explicit human confirmation:
 *   prepare → creates an `awaiting_confirmation` job holding the full video
 *             brief. Either role can prepare; nothing is charged.
 *   confirm → ONLY a member with can_generate_paid_media (the owner, by
 *             default) can confirm, and only from `awaiting_confirmation`.
 *             With no provider configured this returns not_configured and
 *             charges nothing — the brief remains usable by a human editor.
 *   status  → polls the provider for a queued/processing job.
 *   cancel  → cancels an awaiting/queued job.
 *
 * VideoGenerationProvider is the adapter seam: implement submit/check for a
 * real vendor (Runway, Kling, etc.), set MARKETING_VIDEO_PROVIDER + its key
 * in Netlify env, and the rest of the system lights up unchanged. Retries are
 * always manual and re-confirmed — a failed paid job never auto-retries.
 */
import { json, authenticate, pgSelect, pgInsert, pgUpdate, fetchCompanyContext } from '../lib/mktShared'

type SubmitResult = { externalJobId: string; estimatedCost?: number; currency?: string }
type CheckResult = { status: 'queued' | 'processing' | 'completed' | 'failed'; url?: string; actualCost?: number; error?: string }

interface VideoGenerationProvider {
  name: string
  model: string
  submit(brief: Record<string, unknown>): Promise<SubmitResult>
  check(externalJobId: string): Promise<CheckResult>
}

/** Returns the configured provider adapter, or null (graceful "bones" mode). */
function getVideoProvider(): VideoGenerationProvider | null {
  const which = (process.env.MARKETING_VIDEO_PROVIDER || '').toLowerCase()
  // Adapter registry — add real vendors here as they are configured.
  // Example shape for a future adapter:
  //   if (which === 'runway' && process.env.RUNWAY_API_KEY) return runwayAdapter()
  void which
  return null
}

type JobRow = {
  id: string; company_id: string; status: string; request_payload: Record<string, unknown>
  provider: string; model: string; external_job_id: string | null; campaign_id: string | null
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req)
  if (auth instanceof Response) return auth

  let body: { action?: string; companyId?: string; campaignId?: string; versionId?: string; jobId?: string; brief?: Record<string, unknown> }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const provider = getVideoProvider()

  if (body.action === 'prepare') {
    const company = await fetchCompanyContext(auth.token, body.companyId || '')
    if (company instanceof Response) return company

    // One awaiting job per campaign version — a second click returns the
    // existing job instead of stacking duplicates.
    const versionId = body.versionId || ''
    if (versionId) {
      const existing = await pgSelect(auth.token,
        `mkt_generation_jobs?select=id,status&generation_type=eq.video&company_id=eq.${company.id}&status=eq.awaiting_confirmation&request_payload->>versionId=eq.${encodeURIComponent(versionId)}`) as JobRow[] | null
      if (existing?.[0]) return json({ job: existing[0], duplicate: true })
    }

    const rows = await pgInsert(auth.token, 'mkt_generation_jobs', {
      company_id: company.id, campaign_id: body.campaignId ?? null,
      generation_type: 'video',
      provider: provider?.name ?? '', model: provider?.model ?? '',
      status: 'awaiting_confirmation',
      request_payload: { brief: body.brief ?? {}, versionId },
      author_role: auth.role,
    }) as JobRow[] | null
    if (!rows?.[0]) return json({ error: 'db_error', message: 'Could not create the job.' }, 500)
    return json({ job: rows[0], providerConfigured: !!provider, requiresOwner: !auth.canGeneratePaidMedia })
  }

  // All remaining actions operate on an existing job, fetched as the caller.
  if (!body.jobId) return json({ error: 'bad_request', message: 'jobId required' }, 400)
  const jobs = await pgSelect(auth.token, `mkt_generation_jobs?select=*&id=eq.${body.jobId}`) as JobRow[] | null
  const job = jobs?.[0]
  if (!job) return json({ error: 'not_found', message: 'Job not found.' }, 404)

  if (body.action === 'confirm') {
    // Server-side authority: role flag AND state check — a duplicate confirm
    // (double-click, second tab) finds the job already queued and refuses.
    if (!auth.canGeneratePaidMedia) {
      return json({ error: 'owner_required', message: 'Paid video generation requires owner confirmation.' }, 403)
    }
    if (job.status !== 'awaiting_confirmation') {
      return json({ error: 'bad_state', message: `Job is ${job.status} — nothing to confirm.` }, 409)
    }
    if (!provider) {
      return json({
        error: 'not_configured',
        message: 'No video provider is configured yet. The brief is ready — set MARKETING_VIDEO_PROVIDER and its API key in Netlify to enable paid generation.',
      }, 200)
    }
    try {
      const submitted = await provider.submit((job.request_payload?.brief as Record<string, unknown>) ?? {})
      await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${job.id}&status=eq.awaiting_confirmation`, {
        status: 'queued', provider: provider.name, model: provider.model,
        external_job_id: submitted.externalJobId,
        estimated_cost: submitted.estimatedCost ?? null, currency: submitted.currency ?? null,
        confirmed_by: auth.userId, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      return json({ status: 'queued', externalJobId: submitted.externalJobId })
    } catch (err) {
      await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${job.id}`, {
        status: 'failed', error: (err as Error).message.slice(0, 300), updated_at: new Date().toISOString(),
      })
      return json({ error: 'provider_error', message: 'The provider rejected the job. It is logged as failed — retry manually.' }, 200)
    }
  }

  if (body.action === 'status') {
    if (!provider || !job.external_job_id) return json({ status: job.status })
    if (job.status !== 'queued' && job.status !== 'processing') return json({ status: job.status })
    try {
      const check = await provider.check(job.external_job_id)
      if (check.status === 'completed' && check.url) {
        const assets = await pgInsert(auth.token, 'mkt_assets', {
          company_id: job.company_id, campaign_id: job.campaign_id,
          type: 'video', url: check.url, provider: provider.name, model: provider.model,
          metadata: { jobId: job.id }, author_role: auth.role,
        }) as { id: string }[] | null
        await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${job.id}`, {
          status: 'completed', result_payload: { url: check.url, assetId: assets?.[0]?.id },
          actual_cost: check.actualCost ?? null, updated_at: new Date().toISOString(),
        })
      } else if (check.status === 'failed') {
        await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${job.id}`, {
          status: 'failed', error: (check.error || 'provider failure').slice(0, 300), updated_at: new Date().toISOString(),
        })
      } else if (check.status !== (job.status as CheckResult['status'])) {
        await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${job.id}`, {
          status: check.status, updated_at: new Date().toISOString(),
        })
      }
      return json({ status: check.status, url: check.url ?? null })
    } catch {
      return json({ status: job.status, note: 'Provider status check failed — will try again on next poll.' })
    }
  }

  if (body.action === 'cancel') {
    if (job.status !== 'awaiting_confirmation' && job.status !== 'queued') {
      return json({ error: 'bad_state', message: `Cannot cancel a ${job.status} job.` }, 409)
    }
    await pgUpdate(auth.token, `mkt_generation_jobs?id=eq.${job.id}`, {
      status: 'cancelled', updated_at: new Date().toISOString(),
    })
    return json({ status: 'cancelled' })
  }

  return json({ error: 'bad_request', message: 'Unknown action.' }, 400)
}
