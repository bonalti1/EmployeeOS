import { useEffect, useMemo, useState } from 'react'
import { Card, Button } from '../../components/ui'
import { wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import { supabase } from '../../lib/supabase'
import {
  mktApi, CAMPAIGN_SECTIONS, useMktTable,
  type MktCompany, type MktCampaign, type MktVersion, type MktAsset, type MktJob,
} from '../../lib/marketing'

/**
 * Renders one campaign version as editable section tabs — a production
 * workspace, not a chat transcript. Edits are kept in `edited_output` (the
 * original generation is never touched); "Save as new version" snapshots the
 * edits as an immutable manual_edit version.
 */

type Output = Record<string, unknown>

const label = (k: string) =>
  k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** Recursive editor for the structured output. */
function ValueEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (typeof value === 'string') {
    return (
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
        rows={Math.min(10, Math.max(2, Math.ceil(value.length / 90)))}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none leading-relaxed" style={wsField} />
    )
  }
  if (typeof value === 'number') {
    return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-xl px-3 py-1.5 text-sm outline-none w-28" style={wsField} />
  }
  if (typeof value === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {value ? 'Yes' : 'No'}
      </label>
    )
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) {
      return (
        <textarea value={(value as string[]).join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n'))}
          rows={Math.min(10, Math.max(2, value.length + 1))}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none leading-relaxed" style={wsField}
          placeholder="One per line" />
      )
    }
    return (
      <div className="flex flex-col gap-2.5">
        {value.map((item, i) => (
          <div key={i} className="rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <ValueEditor value={item} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
          </div>
        ))}
      </div>
    )
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return (
      <div className="grid gap-2.5">
        {Object.entries(obj).map(([k, v]) => (
          <label key={k} className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
            {label(k)}
            <div className="mt-1 font-normal"><ValueEditor value={v} onChange={(nv) => onChange({ ...obj, [k]: nv })} /></div>
          </label>
        ))}
      </div>
    )
  }
  return null
}

/** Flatten a section to readable plain text for the clipboard. */
function toText(value: unknown, indent = ''): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return `${value}`
  if (Array.isArray(value)) return value.map((v, i) => `${indent}${typeof v === 'object' ? `— item ${i + 1} —\n` : ''}${toText(v, indent)}`).join('\n')
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${indent}${label(k)}: ${typeof v === 'object' ? '\n' + toText(v, indent + '  ') : toText(v)}`)
      .join('\n')
  }
  return ''
}

export default function MktCampaignView({ company, campaign, version, imageConfigured, videoConfigured, canPaidMedia, onSavedVersion }: {
  company: MktCompany
  campaign: MktCampaign
  version: MktVersion
  imageConfigured: boolean
  videoConfigured: boolean
  canPaidMedia: boolean
  onSavedVersion: () => void
}) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<Output>(() => (version.edited_output ?? version.structured_output) as Output)
  const [tab, setTab] = useState('strategy')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [videoModal, setVideoModal] = useState<{ jobId: string; requiresOwner: boolean } | null>(null)

  const assets = useMktTable<MktAsset>('mkt_assets', company.id, { filter: ['campaign_id', campaign.id] })
  const jobs = useMktTable<MktJob>('mkt_generation_jobs', company.id, { filter: ['campaign_id', campaign.id] })

  useEffect(() => {
    setDraft((version.edited_output ?? version.structured_output) as Output)
    setDirty(false)
  }, [version.id, version.edited_output, version.structured_output])

  const tabs = useMemo(() => {
    const extra = [{ key: '_image', label: 'Image' }, { key: '_video', label: 'Video' }]
    return [...CAMPAIGN_SECTIONS.filter((s) => draft[s.key] !== undefined), ...extra]
  }, [draft])

  const patchSection = (key: string, v: unknown) => { setDraft((d) => ({ ...d, [key]: v })); setDirty(true) }

  const saveEdits = async () => {
    if (!supabase) return
    setBusy('save')
    const { error } = await supabase.from('mkt_campaign_versions')
      .update({ edited_output: draft }).eq('id', version.id).eq('company_id', company.id)
    setBusy('')
    if (error) toast('Save failed')
    else { setDirty(false); toast('Edits saved to this version'); onSavedVersion() }
  }

  const saveAsNewVersion = async () => {
    if (!supabase) return
    setBusy('newversion')
    const { data: maxRows } = await supabase.from('mkt_campaign_versions')
      .select('version_number').eq('campaign_id', campaign.id).order('version_number', { ascending: false }).limit(1)
    const next = ((maxRows?.[0]?.version_number as number) ?? 0) + 1
    const { error } = await supabase.from('mkt_campaign_versions').insert({
      campaign_id: campaign.id, company_id: company.id, version_number: next,
      generation_mode: 'manual_edit', marketing_lens: version.marketing_lens,
      structured_output: draft,
    })
    setBusy('')
    if (error) toast('Could not create version')
    else { toast(`Saved as v${next}`); onSavedVersion() }
  }

  const approve = async () => {
    if (!supabase) return
    await supabase.from('mkt_campaign_versions').update({ approved: !version.approved }).eq('id', version.id).eq('company_id', company.id)
    await supabase.from('mkt_campaigns').update({ status: version.approved ? 'generated' : 'approved', current_version_id: version.id })
      .eq('id', campaign.id).eq('company_id', company.id)
    toast(version.approved ? 'Approval removed' : `v${version.version_number} approved`)
    onSavedVersion()
  }

  const regenSection = async (key: string) => {
    setBusy(`regen:${key}`)
    const res = await mktApi<{ output?: Output }>('marketing-generate', {
      mode: 'section', section: key, companyId: company.id, ideaId: campaign.idea_id,
      lensSlug: campaign.selected_lens, currentOutput: draft,
      settings: {
        objective: campaign.objective, audience: campaign.audience, funnelStage: campaign.funnel_stage,
        channels: campaign.channels, videoLength: campaign.video_length, tone: campaign.tone, cta: campaign.cta_preference,
      },
    })
    setBusy('')
    if (res.error || !res.output) { toast(res.message || 'Regeneration failed'); return }
    const section = (res.output as Output)[key]
    if (section !== undefined) { patchSection(key, section); toast(`${label(key)} regenerated — review and save`) }
  }

  const copySection = (key: string) => {
    void navigator.clipboard.writeText(toText(draft[key]))
    toast('Copied')
  }

  const sendToPipeline = async () => {
    if (!supabase) return
    const hooks = draft.hooks as Record<string, string> | undefined
    const script = draft.script ? toText(draft.script) : ''
    const captions = draft.captions as Record<string, string> | undefined
    const { error } = await supabase.from('ws_content').insert({
      title: campaign.title || 'Marketing campaign',
      brand: company.slug === 'alto' ? 'ALTO' : 'STB',
      stage: 'ideas',
      platform: campaign.channels.join(', '),
      hook: hooks?.primary || '',
      script,
      caption: captions?.platformCaption || '',
      idea: toText((draft.strategy as Record<string, unknown>)?.strategicAngle ?? ''),
      notes: `From Marketing Studio — ${company.name}, v${version.version_number} (${version.marketing_lens || version.generation_mode}).`,
    })
    toast(error ? 'Could not send to Content Pipeline' : 'Sent to Content Pipeline → Ideas')
  }

  // ---- Image generation ----------------------------------------------------
  const generateImage = async () => {
    setBusy('image')
    const res = await mktApi<{ asset?: { url: string } }>('marketing-image', {
      companyId: company.id, campaignId: campaign.id, versionId: version.id,
      staticAd: draft.staticAd ?? {}, requestKey: `${version.id}:${Date.now()}`,
    })
    setBusy('')
    if (res.error) toast(res.message || 'Image generation failed')
    else { toast('Image generated'); void assets.refresh() }
  }

  // ---- Video ---------------------------------------------------------------
  const videoBrief = useMemo(() => ({
    company: company.name,
    aspectRatio: '9:16',
    duration: campaign.video_length || '30 sec',
    script: draft.script ?? null,
    shotList: draft.shotList ?? null,
    editing: draft.editing ?? null,
    hooks: draft.hooks ?? null,
    cta: draft.cta ?? null,
    visualBrand: 'fetched server-side from Brand DNA at generation time',
  }), [company.name, campaign.video_length, draft])

  const prepareVideo = async () => {
    setBusy('video')
    const res = await mktApi<{ job?: { id: string }; requiresOwner?: boolean }>('marketing-video', {
      action: 'prepare', companyId: company.id, campaignId: campaign.id, versionId: version.id, brief: videoBrief,
    })
    setBusy('')
    if (res.error || !res.job) { toast(res.message || 'Could not prepare the video job'); return }
    setVideoModal({ jobId: res.job.id, requiresOwner: !canPaidMedia })
  }

  const confirmVideo = async () => {
    if (!videoModal) return
    setBusy('videoconfirm')
    const res = await mktApi<{ status?: string }>('marketing-video', { action: 'confirm', jobId: videoModal.jobId })
    setBusy('')
    setVideoModal(null)
    if (res.error === 'not_configured') toast('No video provider configured — the brief is saved and ready.')
    else if (res.error) toast(res.message || 'Confirmation failed')
    else toast('Video job queued')
    void jobs.refresh()
  }

  const pollJob = async (jobId: string) => {
    const res = await mktApi<{ status?: string }>('marketing-video', { action: 'status', jobId })
    toast(`Job status: ${res.status || 'unknown'}`)
    void jobs.refresh()
    void assets.refresh()
  }

  const videoJobs = (jobs.rows ?? []).filter((j) => j.generation_type === 'video')
  const images = (assets.rows ?? []).filter((a) => a.type === 'image')

  return (
    <Card className="p-5">
      {/* Version header + actions */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-[13px] font-bold" style={{ color: 'var(--color-text)' }}>
          v{version.version_number} · {version.generation_mode === 'council' ? 'Marketing Council' : version.generation_mode === 'manual_edit' ? 'Edited' : version.marketing_lens}
        </span>
        {version.approved && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, #059669 12%, transparent)', color: '#059669' }}>
            Approved
          </span>
        )}
        <span className="ml-auto flex gap-2 flex-wrap">
          <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void sendToPipeline()}>→ Content Pipeline</Button>
          <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void approve()}>
            {version.approved ? 'Unapprove' : 'Mark approved'}
          </Button>
          <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void saveAsNewVersion()} disabled={busy === 'newversion'}>
            Save as new version
          </Button>
          <Button className="text-xs px-2.5 py-1.5" onClick={() => void saveEdits()} disabled={!dirty || busy === 'save'}>
            {busy === 'save' ? 'Saving…' : dirty ? 'Save edits' : 'Saved'}
          </Button>
        </span>
      </div>

      {/* Council summary, if this version came from the council */}
      {version.generation_mode === 'council' && version.council_analyses && (
        <details className="mb-4 rounded-xl p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
          <summary className="text-[13px] font-semibold cursor-pointer" style={{ color: 'var(--color-accent)' }}>
            Council synthesis & individual analyses
          </summary>
          <pre className="text-xs mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)', fontFamily: 'inherit' }}>
            {toText(version.council_analyses)}
          </pre>
        </details>
      )}

      {/* Section tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: tab === t.key ? 'var(--color-accent)' : 'var(--color-surface)',
              color: tab === t.key ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Active section */}
      {tab !== '_image' && tab !== '_video' && draft[tab] !== undefined && (
        <div>
          <div className="flex gap-2 mb-3">
            <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => copySection(tab)}>Copy</Button>
            <Button variant="outline" className="text-xs px-2.5 py-1.5" onClick={() => void regenSection(tab)} disabled={busy === `regen:${tab}`}>
              {busy === `regen:${tab}` ? 'Regenerating…' : 'Regenerate section'}
            </Button>
          </div>
          <ValueEditor value={draft[tab]} onChange={(v) => patchSection(tab, v)} />
        </div>
      )}

      {/* Image tab */}
      {tab === '_image' && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Button onClick={() => void generateImage()} disabled={busy === 'image' || !imageConfigured}>
              {busy === 'image' ? 'Generating…' : images.length ? 'Generate alternative' : 'Generate Static Ad'}
            </Button>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {imageConfigured
                ? 'Uses the Static Ad brief + this company’s Visual Brand. Images are drafts until you approve them.'
                : 'Image provider not configured — set OPENAI_API_KEY in Netlify.'}
            </span>
          </div>
          {images.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No images yet for this campaign.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((a) => (
                <div key={a.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <img src={a.url} alt="" className="w-full aspect-square object-cover" />
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{a.model}</span>
                    <button
                      onClick={() => void assets.update(a.id, { approved: !a.approved } as Partial<MktAsset>)}
                      className="ml-auto text-[11px] font-bold"
                      style={{ color: a.approved ? '#059669' : 'var(--color-accent)' }}>
                      {a.approved ? '✓ Approved' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Video tab */}
      {tab === '_video' && (
        <div>
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <p className="text-[13px] font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              Video brief ready
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Built from this version's script, shot list and edit plan plus {company.name}'s Visual Brand.
              {videoConfigured ? '' : ' No AI video provider is configured yet — the brief works as a handoff to a human editor, and paid generation lights up once a provider is added.'}
            </p>
            <div className="flex gap-2 mt-3">
              <Button onClick={() => void prepareVideo()} disabled={busy === 'video'}>
                {busy === 'video' ? 'Preparing…' : 'Generate Video'}
              </Button>
              <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(toText(videoBrief)); toast('Brief copied') }}>
                Copy brief
              </Button>
            </div>
          </div>

          {videoJobs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {videoJobs.map((j) => (
                <li key={j.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 flex-wrap" style={{ background: 'var(--color-bg)' }}>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                    style={{
                      background: `color-mix(in srgb, ${j.status === 'completed' ? '#059669' : j.status === 'failed' ? '#dc2626' : '#d97706'} 12%, transparent)`,
                      color: j.status === 'completed' ? '#059669' : j.status === 'failed' ? '#dc2626' : '#d97706',
                    }}>
                    {j.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(j.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {j.provider && ` · ${j.provider}`}
                    {j.actual_cost != null && ` · $${j.actual_cost}`}
                  </span>
                  {j.error && <span className="text-xs" style={{ color: '#dc2626' }}>{j.error}</span>}
                  <span className="ml-auto flex gap-2">
                    {j.status === 'awaiting_confirmation' && canPaidMedia && (
                      <button onClick={() => setVideoModal({ jobId: j.id, requiresOwner: false })}
                        className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>Review & confirm</button>
                    )}
                    {j.status === 'awaiting_confirmation' && !canPaidMedia && (
                      <span className="text-[11px] font-semibold" style={{ color: '#d97706' }}>Owner approval required</span>
                    )}
                    {(j.status === 'queued' || j.status === 'processing') && (
                      <button onClick={() => void pollJob(j.id)} className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>Check status</button>
                    )}
                    {j.status === 'failed' && canPaidMedia && (
                      <button onClick={() => void prepareVideo()} className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>Retry (new confirmation)</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Paid-video confirmation modal — the cost gate */}
      {videoModal && (
        <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setVideoModal(null)}>
          <Card className="w-full max-w-md p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Generate AI Video?</h2>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-muted)' }}>
                AI video generation may incur API charges. This action will create a paid generation request.
              </p>
              <div className="rounded-xl p-3 text-xs mb-4" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
                Duration: {campaign.video_length || '30 sec'} · Aspect: 9:16 ·
                Provider: {videoConfigured ? 'configured' : 'not configured (nothing will be charged)'} ·
                Estimated cost: {videoConfigured ? 'provider-dependent' : '$0'}
              </div>
              {videoModal.requiresOwner ? (
                <>
                  <p className="text-sm font-semibold mb-4" style={{ color: '#d97706' }}>
                    Paid video generation requires Rolando's confirmation. The request has been saved to the job
                    queue — he can review and confirm it from this campaign.
                  </p>
                  <div className="flex justify-end">
                    <Button onClick={() => setVideoModal(null)}>Got it</Button>
                  </div>
                </>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setVideoModal(null)}>Cancel</Button>
                  <Button onClick={() => void confirmVideo()} disabled={busy === 'videoconfirm'}>
                    {busy === 'videoconfirm' ? 'Submitting…' : 'Yes, Generate Video'}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}
