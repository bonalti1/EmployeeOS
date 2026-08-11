import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Button, Input } from '../../components/ui'
import { IconSpark } from '../../components/icons'
import { wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import { supabase } from '../../lib/supabase'
import {
  useMktCompany, useMktTable, useMktLenses, mktApi,
  IDEA_STATUSES, MKT_OBJECTIVES, MKT_CHANNELS, MKT_FUNNEL, MKT_LENGTHS, MKT_TONES,
  type MktIdea, type MktCampaign, type MktVersion,
} from '../../lib/marketing'
import MktCampaignView from './MktCampaignView'

/**
 * Idea Studio — where one idea becomes a campaign. Original idea on top
 * (never overwritten by AI), then the lens picker, generation settings, and
 * the versioned campaign workspace.
 */

type Config = { imageConfigured: boolean; videoConfigured: boolean; canGeneratePaidMedia: boolean }

export default function MktIdeaStudio() {
  const { ideaId } = useParams()
  const { toast } = useToast()
  const { company, companies, setCompanyId } = useMktCompany()
  const lenses = useMktLenses()

  const [idea, setIdea] = useState<MktIdea | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [ideaDirty, setIdeaDirty] = useState(false)
  const [config, setConfig] = useState<Config>({ imageConfigured: false, videoConfigured: false, canGeneratePaidMedia: false })

  // Lens + settings state
  const [mode, setMode] = useState<'single' | 'council'>('single')
  const [lensSlug, setLensSlug] = useState('')
  const [councilSlugs, setCouncilSlugs] = useState<string[]>([])
  const [settings, setSettings] = useState({
    objective: 'Leads', audience: '', funnelStage: '', channels: ['Instagram Reel'] as string[],
    videoLength: '30 sec', tone: 'Brand DNA default', cta: '',
  })
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const campaigns = useMktTable<MktCampaign>('mkt_campaigns', company?.id ?? null, { filter: ['idea_id', ideaId ?? ''] })
  const campaign = campaigns.rows?.[0] ?? null
  const versions = useMktTable<MktVersion>('mkt_campaign_versions', company?.id ?? null,
    { filter: ['campaign_id', campaign?.id ?? '00000000-0000-0000-0000-000000000000'], orderBy: 'version_number', ascending: false })
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const version = (versions.rows ?? []).find((v) => v.id === selectedVersionId) ?? versions.rows?.[0] ?? null

  // Load the idea; align the company context with the idea's company.
  useEffect(() => {
    if (!supabase || !ideaId) return
    void supabase.from('mkt_ideas').select('*').eq('id', ideaId).maybeSingle().then(({ data }) => {
      if (!data) { setNotFound(true); return }
      setIdea(data as MktIdea)
    })
  }, [ideaId])

  useEffect(() => {
    if (idea && company && idea.company_id !== company.id) {
      const owner = companies.find((c) => c.id === idea.company_id)
      if (owner) setCompanyId(owner.id)
    }
  }, [idea, company, companies, setCompanyId])

  useEffect(() => {
    void mktApi<Config>('marketing-config', {}).then((c) => {
      if (!c.error) setConfig({ imageConfigured: !!c.imageConfigured, videoConfigured: !!c.videoConfigured, canGeneratePaidMedia: !!c.canGeneratePaidMedia })
    })
  }, [])

  const patchIdea = (values: Partial<MktIdea>) => {
    setIdea((i) => (i ? { ...i, ...values } : i))
    setIdeaDirty(true)
  }

  const saveIdea = async () => {
    if (!supabase || !idea) return
    const { id, created_at, company_id, author_role, ...rest } = idea
    void created_at; void author_role
    await supabase.from('mkt_ideas').update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id).eq('company_id', company_id)
    setIdeaDirty(false)
    toast('Idea saved')
  }

  const toggleChannel = (ch: string) =>
    setSettings((s) => ({ ...s, channels: s.channels.includes(ch) ? s.channels.filter((c) => c !== ch) : [...s.channels, ch] }))

  const toggleCouncil = (slug: string) =>
    setCouncilSlugs((c) => c.includes(slug) ? c.filter((s) => s !== slug) : c.length >= 5 ? c : [...c, slug])

  const generate = async () => {
    if (!company || !idea || generating) return
    if (mode === 'single' && !lensSlug) { setGenError('Pick a marketing lens first.'); return }
    if (mode === 'council' && councilSlugs.length < 2) { setGenError('Pick 2–5 lenses for the council.'); return }
    setGenError('')
    setGenerating(true)

    const res = await mktApi<{ output?: Record<string, unknown>; council?: Record<string, unknown> }>('marketing-generate', {
      mode: mode === 'council' ? 'council' : 'campaign',
      companyId: company.id, ideaId: idea.id, campaignId: campaign?.id,
      lensSlug, lensSlugs: councilSlugs, settings,
    })

    if (res.error || !res.output) {
      setGenerating(false)
      setGenError(res.message || 'Generation failed — nothing was saved.')
      return
    }

    // Persist: campaign (create on first run) + a new immutable version.
    let camp = campaign
    if (!camp) {
      camp = await campaigns.insert({
        idea_id: idea.id, title: idea.title || idea.raw_idea.slice(0, 80),
        objective: settings.objective, audience: settings.audience, funnel_stage: settings.funnelStage,
        channels: settings.channels, video_length: settings.videoLength, tone: settings.tone,
        cta_preference: settings.cta, selected_lens: mode === 'single' ? lensSlug : '',
        council_lenses: mode === 'council' ? councilSlugs : null, status: 'generated',
      } as Partial<MktCampaign>)
    } else {
      await campaigns.update(camp.id, {
        objective: settings.objective, channels: settings.channels, video_length: settings.videoLength,
        tone: settings.tone, funnel_stage: settings.funnelStage, cta_preference: settings.cta,
        selected_lens: mode === 'single' ? lensSlug : camp.selected_lens, status: 'generated',
      } as Partial<MktCampaign>)
    }
    if (!camp) { setGenerating(false); setGenError('Could not save the campaign.'); return }

    const nextNumber = ((versions.rows?.[0]?.version_number as number) ?? 0) + 1
    const lensName = mode === 'council' ? 'Marketing Council' : (lenses?.find((l) => l.slug === lensSlug)?.name ?? lensSlug)
    const { data: created } = await supabase!.from('mkt_campaign_versions').insert({
      campaign_id: camp.id, company_id: company.id, version_number: nextNumber,
      generation_mode: mode, marketing_lens: lensName,
      structured_output: res.output, council_analyses: res.council ?? null,
    }).select().single()

    await supabase!.from('mkt_campaigns').update({ current_version_id: (created as MktVersion)?.id ?? null })
      .eq('id', camp.id).eq('company_id', company.id)
    if (idea.status === 'idea') { patchIdea({ status: 'developing' }); void supabase!.from('mkt_ideas').update({ status: 'developing' }).eq('id', idea.id) }

    await campaigns.refresh()
    await versions.refresh()
    if (created) setSelectedVersionId((created as MktVersion).id)
    setGenerating(false)
    toast(`Campaign v${nextNumber} generated (${lensName})`)
  }

  const lensCards = useMemo(() => lenses ?? [], [lenses])

  if (notFound) {
    return (
      <Card className="p-6">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Idea not found. <Link to=".." className="font-semibold" style={{ color: 'var(--color-accent)' }}>Back to Marketing Studio</Link>
        </p>
      </Card>
    )
  }
  if (!idea || !company) {
    return <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading idea…</Card>
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link to=".." className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>← {company.name} ideas</Link>
      </div>

      {/* A. Original idea — editable, never overwritten by AI */}
      <Card className="p-5 mb-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}>
            {company.name}
          </span>
          <select value={idea.status} onChange={(e) => patchIdea({ status: e.target.value as MktIdea['status'] })}
            className="rounded-lg px-2 py-1 text-[11px] font-bold outline-none" style={wsField}>
            {IDEA_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={idea.priority} onChange={(e) => patchIdea({ priority: e.target.value as MktIdea['priority'] })}
            className="rounded-lg px-2 py-1 text-[11px] font-bold outline-none" style={wsField}>
            {['Low', 'Medium', 'High'].map((p) => <option key={p} value={p}>{p} priority</option>)}
          </select>
          <Button className="ml-auto text-xs px-3 py-1.5" onClick={() => void saveIdea()} disabled={!ideaDirty}>
            {ideaDirty ? 'Save idea' : 'Saved'}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Title
            <Input value={idea.title} onChange={(e) => patchIdea({ title: e.target.value })} className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Original idea (the raw thought — AI never edits this)
            <textarea value={idea.raw_idea} onChange={(e) => patchIdea({ raw_idea: e.target.value })} rows={3}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal leading-relaxed" style={wsField} />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Product / service
            <Input value={idea.product} onChange={(e) => patchIdea({ product: e.target.value })} className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Known offer
            <Input value={idea.offer} onChange={(e) => patchIdea({ offer: e.target.value })} className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Source / inspiration link
            <Input value={idea.source_url} onChange={(e) => patchIdea({ source_url: e.target.value })} className="mt-1 font-normal" placeholder="https://…" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Tags (comma-separated)
            <Input value={idea.tags.join(', ')} onChange={(e) => patchIdea({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Notes
            <textarea value={idea.notes} onChange={(e) => patchIdea({ notes: e.target.value })} rows={2}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
          </label>
        </div>
      </Card>

      {/* B. Bring this idea to life */}
      <h2 className="text-[16px] font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Bring This Idea to Life</h2>

      {/* Lens picker */}
      <div className="flex gap-1.5 mb-3">
        {(['single', 'council'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className="px-3 py-1.5 rounded-full text-[12px] font-bold transition"
            style={{
              background: mode === m ? 'var(--color-accent)' : 'var(--color-surface)',
              color: mode === m ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {m === 'single' ? 'One lens' : 'Marketing Council'}
          </button>
        ))}
        {mode === 'council' && (
          <span className="self-center text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Pick 2–5 · each analyzes independently, then a Creative Director synthesizes · {councilSlugs.length} selected
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-4">
        {lensCards.map((lens) => {
          const active = mode === 'single' ? lensSlug === lens.slug : councilSlugs.includes(lens.slug)
          return (
            <button key={lens.slug}
              onClick={() => (mode === 'single' ? setLensSlug(lens.slug) : toggleCouncil(lens.slug))}
              className="text-left rounded-2xl p-3.5 transition"
              style={{
                background: active ? 'color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))' : 'var(--color-surface)',
                border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              }}>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', color: 'var(--color-accent)' }}>
                  {lens.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                </span>
                <span className="text-[13px] font-bold" style={{ color: 'var(--color-text)' }}>{lens.name}</span>
              </div>
              <p className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--color-muted)' }}>{lens.description}</p>
              <p className="text-[10px] mt-1.5 font-semibold" style={{ color: 'var(--color-accent)' }}>
                Best for: {(lens.best_for ?? []).slice(0, 3).join(' · ')}
              </p>
            </button>
          )
        })}
      </div>

      {/* Generation settings */}
      <Card className="p-4 mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Objective
            <select value={settings.objective} onChange={(e) => setSettings({ ...settings, objective: e.target.value })}
              className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
              {MKT_OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Awareness stage
            <select value={settings.funnelStage} onChange={(e) => setSettings({ ...settings, funnelStage: e.target.value })}
              className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
              <option value="">Let the lens decide</option>
              {MKT_FUNNEL.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Video length
            <select value={settings.videoLength} onChange={(e) => setSettings({ ...settings, videoLength: e.target.value })}
              className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
              {MKT_LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Tone
            <select value={settings.tone} onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
              className="w-full rounded-xl px-2.5 py-2 text-sm outline-none mt-1 font-normal" style={wsField}>
              {MKT_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>Audience (blank = Brand DNA default)
            <Input value={settings.audience} onChange={(e) => setSettings({ ...settings, audience: e.target.value })} className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--color-muted)' }}>CTA (blank = let the lens recommend)
            <Input value={settings.cta} onChange={(e) => setSettings({ ...settings, cta: e.target.value })} className="mt-1 font-normal" />
          </label>
        </div>
        <div className="mt-3">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Deliverables</span>
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            {MKT_CHANNELS.map((ch) => (
              <button key={ch} onClick={() => toggleChannel(ch)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition"
                style={{
                  background: settings.channels.includes(ch) ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                  color: settings.channels.includes(ch) ? 'var(--color-accent)' : 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}>
                {ch}
              </button>
            ))}
          </div>
        </div>
        {genError && <p className="text-sm mt-3" style={{ color: '#dc2626' }}>{genError}</p>}
        <div className="flex items-center gap-3 mt-4">
          <Button onClick={() => void generate()} disabled={generating}>
            <IconSpark width={15} height={15} />
            {generating ? (mode === 'council' ? 'Council in session… (up to a minute)' : 'Generating campaign…') : 'Generate Campaign'}
          </Button>
          <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Grounded in {company.name}'s Brand DNA only. Each run saves a new version — nothing is overwritten.
          </span>
        </div>
      </Card>

      {/* C. Versions + campaign workspace */}
      {(versions.rows ?? []).length > 0 && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
            {(versions.rows ?? []).map((v) => (
              <button key={v.id} onClick={() => setSelectedVersionId(v.id)}
                className="px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition"
                style={{
                  background: version?.id === v.id ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: version?.id === v.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}>
                v{v.version_number} · {v.generation_mode === 'council' ? 'Council' : v.generation_mode === 'manual_edit' ? 'Edited' : v.marketing_lens}
                {v.approved ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {campaign && version && (
            <MktCampaignView
              company={company} campaign={campaign} version={version}
              imageConfigured={config.imageConfigured} videoConfigured={config.videoConfigured}
              canPaidMedia={config.canGeneratePaidMedia}
              onSavedVersion={() => void versions.refresh()}
            />
          )}
        </>
      )}
    </div>
  )
}
