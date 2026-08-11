import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Button } from '../../components/ui'
import { IconSpark } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import { useEffect } from 'react'
import {
  useWorkspace, useWsSettings, useWsTable, trendAgeDays, TREND_STALE_DAYS,
  type WsContent, type WsTrend,
} from '../../lib/workspace'
import { supabase } from '../../lib/supabase'

/**
 * Brand voice source of truth: if Marketing Studio's Brand DNA has a voice
 * section for a company, it wins; the legacy ws_settings fields remain the
 * fallback so nothing breaks before the marketing SQL is run.
 */
function useBrandDnaVoice() {
  const [voices, setVoices] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const { data: companies, error } = await supabase!.from('mkt_companies').select('id, slug')
      if (error || !companies?.length) return
      const { data: profiles } = await supabase!.from('mkt_brand_profiles').select('company_id, identity, voice')
      if (!profiles) return
      const out: Record<string, string> = {}
      for (const c of companies) {
        const p = profiles.find((x) => x.company_id === c.id) as { identity?: Record<string, string>; voice?: Record<string, string> } | undefined
        if (!p) continue
        const parts: string[] = []
        for (const [k, v] of Object.entries({ ...(p.identity ?? {}), ...(p.voice ?? {}) })) {
          if (typeof v === 'string' && v.trim()) parts.push(`${k.replace(/_/g, ' ')}: ${v}`)
        }
        if (parts.length) out[c.slug] = parts.join('\n')
      }
      setVoices(out)
    })()
  }, [])
  return voices
}

/**
 * AI Studio — drafting tools for the assistant. Calls the Netlify function
 * (/.netlify/functions/assistant-ai) which holds the API key server-side.
 * The AI only ever sees the shared brand context below — never Rolando's
 * private Personal OS data. It has NO live trend/social research access.
 */

const TOOLS = [
  { id: 'brainstorm', label: 'Brainstorm ideas', hint: 'Topic or theme to explore', placeholder: 'e.g. kitchen remodels, first-time home buyers, day-in-the-life…' },
  { id: 'hooks', label: 'Generate hooks', hint: 'The topic or idea to hook viewers on', placeholder: 'e.g. why custom homes cost less than you think' },
  { id: 'script', label: 'Draft a script', hint: 'The idea to script (paste the hook too if you have one)', placeholder: 'e.g. 45-second walkthrough of a finished ALTO listing…' },
  { id: 'caption', label: 'Draft captions', hint: 'What the post shows', placeholder: 'e.g. before/after of the Garcia backyard patio build' },
  { id: 'repurpose', label: 'Repurpose content', hint: 'The existing content to repurpose', placeholder: 'Paste the script/caption of a piece that performed well…' },
  { id: 'transcript', label: 'Transcript → ideas', hint: 'Paste a transcript or describe the footage', placeholder: 'Paste a video transcript, or describe what was filmed…' },
  { id: 'trends', label: 'Ride a trend', hint: 'Optional steer — otherwise it works straight from the Trend Board', placeholder: 'e.g. focus on the cost-breakdown angle, or leave blank…' },
] as const

type ToolId = (typeof TOOLS)[number]['id']

export default function WsAiStudio() {
  const { role } = useWorkspace()
  const { toast } = useToast()
  const { settings, set, loaded } = useWsSettings()
  const content = useWsTable<WsContent>('ws_content')
  const trends = useWsTable<WsTrend>('ws_trends', 'observed_on', false)
  const dnaVoices = useBrandDnaVoice()

  const [tool, setTool] = useState<ToolId>('brainstorm')
  const [brand, setBrand] = useState<'STB' | 'ALTO'>('STB')
  const [input, setInput] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingCtx, setEditingCtx] = useState(false)
  const [ctxDraft, setCtxDraft] = useState({ company: '', stb: '', alto: '' })

  const activeTool = TOOLS.find((t) => t.id === tool)!

  /**
   * Trends handed to the model: current brand, not stale, not already used or
   * passed. Each line carries its observed date so the model can judge age
   * rather than assume everything is live.
   */
  const activeTrends = (trends.rows ?? []).filter((t) =>
    (t.brand === brand || t.brand === 'Both') &&
    t.status !== 'used' && t.status !== 'passed' &&
    trendAgeDays(t.observed_on) <= TREND_STALE_DAYS,
  )

  const trendContext = activeTrends
    .map((t) => `- [${t.kind}] ${t.label}${t.notes ? ` — ${t.notes}` : ''} (observed ${t.observed_on})`)
    .join('\n')

  const run = async () => {
    const text = input.trim()
    if (!text && tool !== 'trends') { setError('Describe what you need first.'); return }
    if (tool === 'trends' && activeTrends.length === 0) {
      setError('No fresh trends logged for this brand yet — add some on the Trend Board first.')
      return
    }
    setBusy(true)
    setError('')
    setResult('')
    try {
      const res = await fetch('/.netlify/functions/assistant-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool,
          brand,
          input: text,
          context: {
            companyContext: settings['company_context'] || '',
            // Marketing Studio Brand DNA wins when it exists; legacy fields otherwise.
            brandVoice: (brand === 'STB' ? dnaVoices['stb'] : dnaVoices['alto'])
              || (brand === 'STB' ? settings['brand_voice_stb'] || '' : settings['brand_voice_alto'] || ''),
            trends: trendContext,
          },
        }),
      })
      const data = (await res.json()) as { result?: string; error?: string; message?: string }
      if (data.error === 'not_configured') setError('The AI key isn’t set up yet — add OPENAI_API_KEY in Netlify (same key as the Journal AI).')
      else if (data.error === 'no_trends') setError(data.message || 'No fresh trends logged yet.')
      else if (data.error || !data.result) setError(data.message || 'The AI had trouble responding. Try again.')
      else setResult(data.result)
    } catch {
      setError('Couldn’t reach the AI function. (Running locally? Use `netlify dev`.)')
    }
    setBusy(false)
  }

  const saveAsIdea = async () => {
    const firstLine = result.split('\n').find((l) => l.trim())?.slice(0, 90) || 'AI draft'
    await content.insert({
      title: `AI draft: ${firstLine}`,
      brand,
      stage: 'ideas',
      idea: input.trim(),
      notes: result,
    } as Partial<WsContent>)
    toast('Saved to Content → Ideas')
  }

  return (
    <WsShell
      title="AI Studio"
      subtitle="Drafting help for ideas, hooks, scripts and captions — grounded in your brand voice"
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          {/* Tool picker */}
          <div className="flex gap-1.5 flex-wrap">
            {TOOLS.map((t) => (
              <button key={t.id} onClick={() => { setTool(t.id); setResult(''); setError('') }}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold transition"
                style={{
                  background: tool === t.id ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: tool === t.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>For:</span>
              {(['STB', 'ALTO'] as const).map((b) => (
                <button key={b} onClick={() => setBrand(b)}
                  className="px-3 py-1 rounded-full text-[12px] font-bold transition"
                  style={{
                    background: brand === b ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                    color: brand === b ? 'var(--color-accent)' : 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                  }}>
                  {b === 'STB' ? 'South Texas Builders' : 'ALTO Pro'}
                </button>
              ))}
            </div>
            <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>{activeTool.hint}</label>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5}
              placeholder={activeTool.placeholder}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mt-1.5" style={wsField} />
            {error && <p className="text-sm mt-2" style={{ color: '#dc2626' }}>{error}</p>}
            <div className="flex items-center gap-3 mt-3">
              <Button onClick={() => void run()} disabled={busy}>
                <IconSpark width={15} height={15} /> {busy ? 'Thinking…' : activeTool.label}
              </Button>
              <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                {activeTrends.length > 0
                  ? `Using your brand context + ${activeTrends.length} researched trend${activeTrends.length === 1 ? '' : 's'}. No live platform data.`
                  : 'Using your brand context. No live platform data — log findings on the Trend Board to feed it real research.'}
              </span>
            </div>
          </Card>

          {result && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Result</h2>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(result); toast('Copied') }}>Copy</Button>
                  <Button variant="outline" onClick={() => void saveAsIdea()}>Save to Ideas</Button>
                </div>
              </div>
              <pre className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)', fontFamily: 'inherit' }}>{result}</pre>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
        {/* What research is actually in play right now */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Trends in play</h2>
            <Link to="/workspace/trends" className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Trend Board</Link>
          </div>
          {activeTrends.length === 0 ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Nothing fresh logged for {brand === 'STB' ? 'South Texas Builders' : 'ALTO Pro'} yet. Spend 15 minutes on
              the Trend Board and every tool here gets sharper.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activeTrends.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--color-bg)' }}>
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded uppercase shrink-0 mt-0.5"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>{t.kind}</span>
                  <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>{t.label}</span>
                  <span className="text-[10px] shrink-0 tnum" style={{ color: 'var(--color-muted)' }}>{trendAgeDays(t.observed_on)}d</span>
                </li>
              ))}
              {activeTrends.length > 6 && (
                <li className="text-[11px] px-2" style={{ color: 'var(--color-muted)' }}>+{activeTrends.length - 6} more</li>
              )}
            </ul>
          )}
        </Card>

        {/* Brand context — the ground truth the AI uses */}
        <Card className="p-5 h-fit">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Brand context</h2>
            {role === 'owner' && (
              <button onClick={() => {
                setEditingCtx(!editingCtx)
                setCtxDraft({ company: settings['company_context'] || '', stb: settings['brand_voice_stb'] || '', alto: settings['brand_voice_alto'] || '' })
              }} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                {editingCtx ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Every AI draft is grounded in this context{role === 'owner' ? ' — keep it sharp and the drafts get sharp' : ' (editable by Rolando)'}.
          </p>
          {!loaded ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
          ) : editingCtx ? (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Company context
                <textarea value={ctxDraft.company} onChange={(e) => setCtxDraft({ ...ctxDraft, company: e.target.value })}
                  rows={5} className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>STB brand voice
                <textarea value={ctxDraft.stb} onChange={(e) => setCtxDraft({ ...ctxDraft, stb: e.target.value })}
                  rows={4} className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>ALTO Pro brand voice
                <textarea value={ctxDraft.alto} onChange={(e) => setCtxDraft({ ...ctxDraft, alto: e.target.value })}
                  rows={4} className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
              </label>
              <Button onClick={async () => {
                await set('company_context', ctxDraft.company)
                await set('brand_voice_stb', ctxDraft.stb)
                await set('brand_voice_alto', ctxDraft.alto)
                setEditingCtx(false)
                toast('Brand context saved')
              }}>Save context</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {[
                { label: 'Company context', value: settings['company_context'] },
                { label: 'STB brand voice', value: settings['brand_voice_stb'] },
                { label: 'ALTO Pro brand voice', value: settings['brand_voice_alto'] },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: 'var(--color-bg)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>{label}</div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: value?.startsWith('EDIT ME') ? 'var(--color-muted)' : 'var(--color-text)' }}>
                    {value || 'Not set yet.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
        </div>
      </div>
    </WsShell>
  )
}
