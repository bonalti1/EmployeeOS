import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Button } from '../../components/ui'
import { IconSpark } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import {
  useWorkspace, useWsSettings, useWsTable, trendAgeDays, TREND_STALE_DAYS,
  type WsContent, type WsTrend,
} from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import BrandKitPanel from './BrandKitPanel'
import { BRAND_KEYS, BRAND_LABEL, kitKey, parseKit, kitSummary, toLogoDataUrl, type BrandKey } from '../../lib/brandKit'
import { listPhotos, photoToDataUrl, type WsPhoto } from '../../lib/wsPhotos'
import { composeAd } from '../../lib/composeAd'
import { composeFlyer, logoWithAlpha, type FlyerTemplate, type LogoPos } from '../../lib/adLayout'
import { MENTORS } from '../../lib/mentors'

/**
 * AI Studio — where an idea becomes finished marketing.
 *
 * Flow: pick the company (it already knows what it sells + its brand kit) →
 * pick what to make (ad script, video script, story, branding, video style) →
 * pick a mentor lens (or let the AI pick) → Generate.
 *
 * Quality loop: draft → an AI judge scores it against a rubric → if it lands
 * under the bar it revises itself and is re-scored — all BEFORE the result is
 * shown, so what you see always arrives with its scorecard. "Run another
 * pass" keeps looping on demand.
 *
 * Image and video are strictly optional buttons (they cost real money per
 * generation); video animates the generated image via Runway.
 */

const OUTPUTS = [
  { id: 'ad_script', label: 'Ad script' },
  { id: 'video_script', label: 'Video script' },
  { id: 'story', label: 'Story' },
  { id: 'branding', label: 'Branding' },
  { id: 'video_style', label: 'Video style' },
] as const
type OutputId = (typeof OUTPUTS)[number]['id']

type Score = { hook: number; clarity: number; brandFit: number; cta: number; platformFit: number; total: number; feedback: string[] }
type Viral = {
  score: number; verdict: string; why: string[]
  angles: { title: string; hook: string; format: string; whyViral: string }[]
  boosters: string[]
}
const SCORE_BAR = 85       // auto-revise below this…
const MAX_AUTO_PASSES = 2  // …but never more than this many drafts before showing

/** Ad-creative controls. An art director writes the actual image prompt from
 * the script (see the `image_brief` step) — these choose the treatment. */
type ImgStyle = 'hero' | 'ugc' | 'bold' | 'beforeafter' | 'closeup'
type ImgAspect = 'portrait' | 'square' | 'story'
type ImageBrief = { prompt: string; headline: string; subhead: string; rationale: string }

/** What to do with a real project photo:
 *  design — gpt-image-1 typesets the WHOLE flyer itself (the ChatGPT look),
 *           with input_fidelity keeping the photo pixel-faithful. Best quality.
 *  real   — the flyer is drawn locally around the untouched photo. Instant, free.
 *  ai     — the model restyles the shot (grade, light, framing). */
type PhotoMode = 'design' | 'real' | 'ai'

/** The ChatGPT-style whole-flyer prompt. The model designs and typesets the
 * entire layout — this is why ChatGPT flyers look designed rather than
 * assembled: the typography is rendered natively into the image. */
const flyerDesignPrompt = (o: {
  brandLabel: string; headline: string; subhead?: string; cta?: string
  colors?: string[]; headingFont?: string; logoPos: LogoPos
}) => {
  const corner = o.logoPos.replace(/-/g, ' ')
  return [
    `Design a premium ${o.brandLabel} marketing flyer using the supplied photograph as the hero image.`,

    'THE PHOTOGRAPH IS THE HERO. It must fill at least 60% of the canvas — a large, uncropped, dominant image, not a thin strip between coloured bars. Everything else is supporting.',

    'CRITICAL: the photographed building must stay EXACTLY as shot — same architecture, materials, colours, windows, roofline, landscaping. Do not repaint, rebuild or re-imagine any part of the photo. The layout and typography are yours to design; the house is not.',

    'Set this copy in clean, modern typography — large, perfectly spelled, legible on a phone:',
    `HEADLINE: "${o.headline}"`,
    o.subhead ? `SUPPORTING LINE: "${o.subhead}"` : '',
    o.cta
      ? `CALL TO ACTION (must appear, styled as a solid button or pill): "${o.cta}"`
      : 'CALL TO ACTION: end with a clear, simple ask styled as a solid button — e.g. "Send us a message".',

    'DO NOT WRITE THE COMPANY NAME ANYWHERE. No wordmark, no logo, no monogram, no brand icon, no "builders" lockup — none. The real logo file is composited on afterwards, and a drawn one collides with it.',
    `Instead, leave a clean, EMPTY, LIGHT-COLOURED area at the ${corner} — roughly a quarter of the width and free of text, texture and dark panels — reserved for that logo.`,

    o.colors?.length
      ? `Brand colours — use ONLY these, and use the first as the dominant one: ${o.colors.slice(0, 3).join(', ')}. Every panel, band and button must be one of these exact colours. No orange, no teal, no invented accent colours.`
      : '',
    o.headingFont ? `The headline typeface should feel like ${o.headingFont}.` : '',

    'Layout discipline: at most TWO solid colour areas total — do not stack the flyer into horizontal stripes. Generous margins, one clear focal point, strong contrast between text and its background, and real breathing room around the type.',
    'Art direction: top-agency, Fortune-500 grade — the kind of flyer a national homebuilder would run. No people, no watermarks, no fake badges, awards or star ratings, no gibberish or duplicated letters, no stock-photo collage.',
  ].filter(Boolean).join('\n')
}

const IMG_STYLES: { id: ImgStyle; label: string; hint: string }[] = [
  { id: 'hero', label: 'Hero shot', hint: 'The finished build, low angle, golden hour — magazine grade' },
  { id: 'bold', label: 'Bold poster', hint: 'The work on a brand-colour field, headline-forward' },
  { id: 'beforeafter', label: 'Before/After', hint: 'The tired before against the finished build' },
  { id: 'closeup', label: 'Craft detail', hint: 'One close-up that proves the craftsmanship' },
  { id: 'ugc', label: 'On-site', hint: 'Looks phone-shot on the jobsite, not agency-made' },
]
const IMG_ASPECTS: { id: ImgAspect; label: string; dim: string; ratio: string }[] = [
  { id: 'portrait', label: 'Flyer / Feed 2:3', dim: '1024 × 1536', ratio: '2 / 3' },
  { id: 'square', label: 'Square 1:1', dim: '1024 × 1024', ratio: '1 / 1' },
  { id: 'story', label: 'Story / Reel', dim: '1024 × 1536', ratio: '2 / 3' },
]

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * One frame in the creative studio: an empty state that invites the click, a
 * live render state (shimmering canvas, elapsed clock, a progress bar paced to
 * how long this kind of render usually takes, and the stage it is on), then the
 * finished asset with its actions. Nothing ever generates on its own.
 */
function MediaSlot({ label, dim, ratio, busy, note, url, kind, action, onGen, fileName, expectSec, icon, hero }: {
  label: string; dim: string; ratio: string; busy: boolean; note: string
  url: string; kind: 'image' | 'video'; action: string; onGen: () => void; fileName?: string
  expectSec: number; icon: string; hero?: boolean
}) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!busy) { setT(0); return }
    const iv = setInterval(() => setT((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [busy])

  // Eases toward 95% over the expected duration, then crawls — honest about
  // "nearly there" without ever claiming done before it is.
  const pct = Math.min(95, Math.round((1 - Math.exp(-2.2 * (t / expectSec))) * 95))

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${busy ? 'var(--color-accent)' : 'var(--color-border)'}`,
        boxShadow: busy ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--shadow-sm)',
        transition: 'box-shadow .25s, border-color .25s',
      }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[13px]">{icon}</span>
        <span className={`${hero ? 'text-[13px]' : 'text-xs'} font-bold truncate`} style={{ color: 'var(--color-text)' }}>{label}</span>
        <span className="text-[10px] tnum ml-auto shrink-0 px-1.5 py-0.5 rounded"
          style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>{dim}</span>
      </div>

      <div className="relative" style={{ aspectRatio: ratio, background: 'var(--color-bg)' }}>
        {url ? (
          kind === 'image'
            ? <img src={url} alt={label} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} />
            : <video src={url} controls playsInline className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', background: '#000' }} />
        ) : busy ? (
          <>
            {/* shimmering canvas */}
            <div className="absolute inset-0 animate-pulse"
              style={{ background: 'linear-gradient(115deg, var(--color-bg) 0%, color-mix(in srgb, var(--color-accent) 10%, var(--color-bg)) 45%, var(--color-bg) 90%)' }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-4 text-center">
              <span className="inline-block rounded-full animate-spin"
                style={{ width: 26, height: 26, border: '3px solid color-mix(in srgb, var(--color-accent) 25%, transparent)', borderTopColor: 'var(--color-accent)' }} />
              <p className="text-[12px] font-bold" style={{ color: 'var(--color-text)' }}>{note || 'Generating…'}</p>
              <div className="w-full max-w-[190px]">
                <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'var(--color-border)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--color-accent)', transition: 'width 1s linear' }} />
                </div>
                <div className="flex justify-between mt-1 text-[10px] tnum" style={{ color: 'var(--color-muted)' }}>
                  <span>{mmss(t)}</span>
                  <span>~{mmss(expectSec)}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <button onClick={onGen} className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 transition hover:opacity-80">
            <span className="grid place-items-center rounded-full"
              style={{ width: 46, height: 46, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)', fontSize: 20 }}>{icon}</span>
            <span className="text-[12px] font-bold" style={{ color: 'var(--color-accent)' }}>{action}</span>
            <span className="text-[10px] tnum" style={{ color: 'var(--color-muted)' }}>~{mmss(expectSec)}</span>
          </button>
        )}
      </div>

      {url && (
        <div className="flex items-center gap-3 px-3 py-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {kind === 'image'
            ? <a href={url} download={fileName || 'ai-image.png'} className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>↓ Download</a>
            : <a href={url} target="_blank" rel="noopener" className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>Open ↗</a>}
          <button onClick={onGen} className="text-[11px] font-semibold ml-auto" style={{ color: 'var(--color-muted)' }}>↻ Redo</button>
        </div>
      )}
    </div>
  )
}

/** Brand DNA voice from Marketing Studio tables when present (legacy fallback). */
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

const post = async (fn: string, body: unknown) => {
  const res = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return (await res.json()) as Record<string, unknown>
}

const scoreColor = (n: number) => (n >= SCORE_BAR ? '#16a34a' : n >= 70 ? '#d97706' : '#dc2626')

export default function WsAiStudio() {
  const { role } = useWorkspace()
  const { toast } = useToast()
  const { settings, set, loaded } = useWsSettings()
  const content = useWsTable<WsContent>('ws_content')
  const trends = useWsTable<WsTrend>('ws_trends', 'observed_on', false)
  const dnaVoices = useBrandDnaVoice()

  const [brand, setBrand] = useState<BrandKey>('STB')
  const [output, setOutput] = useState<OutputId>('ad_script')
  const [mentorId, setMentorId] = useState<string>('best')
  const [input, setInput] = useState('')
  const [fromIdea, setFromIdea] = useState(false)

  const [stage, setStage] = useState('')          // '' = idle; otherwise progress copy
  const [result, setResult] = useState('')
  const [lens, setLens] = useState('')            // "Alex Hormozi — …" when Best fit picked
  const [score, setScore] = useState<Score | null>(null)
  const [passes, setPasses] = useState(0)
  const [error, setError] = useState('')

  // Media bay: ad creative · moving image (5s) · video (10s)
  const [imgBusy, setImgBusy] = useState(false)
  const [imgUrl, setImgUrl] = useState('')
  const [imgNote, setImgNote] = useState('')
  const [imgStyle, setImgStyle] = useState<ImgStyle>('hero')
  const [srcPhoto, setSrcPhoto] = useState('')   // a real project photo to build the ad from
  const srcRef = useRef<HTMLInputElement>(null)
  const [library, setLibrary] = useState<WsPhoto[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [brandLogo, setBrandLogo] = useState(true)   // stamp the real logo on the finished ad
  const [rawImg, setRawImg] = useState('')           // pre-branding render, for restamping
  const [photoMode, setPhotoMode] = useState<PhotoMode>('design')  // what to do with a real photo
  const [template, setTemplate] = useState<FlyerTemplate>('banner')
  const [logoPos, setLogoPos] = useState<LogoPos>('bottom-right')
  const [imgAspect, setImgAspect] = useState<ImgAspect>('portrait')
  const [imgText, setImgText] = useState(true)
  const [hd, setHd] = useState(false)   // medium renders ~2x faster and reads the same on a phone
  const [brief, setBrief] = useState<ImageBrief | null>(null)
  const [motionBusy, setMotionBusy] = useState(false)
  const [motionUrl, setMotionUrl] = useState('')
  const [motionNote, setMotionNote] = useState('')
  const [vidBusy, setVidBusy] = useState(false)
  const [vidUrl, setVidUrl] = useState('')
  const [vidNote, setVidNote] = useState('')

  // Viral analysis of the idea itself
  const [viral, setViral] = useState<Viral | null>(null)
  const [viralBusy, setViralBusy] = useState(false)

  const [editingCtx, setEditingCtx] = useState(false)
  const [ctxDraft, setCtxDraft] = useState({ company: '', stb: '', alto: '' })

  // An idea sent over from the Idea Board lands pre-filled.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ai_seed')
      if (!raw) return
      sessionStorage.removeItem('ai_seed')
      const seed = JSON.parse(raw) as { text?: string; brand?: BrandKey }
      if (seed.text) { setInput(seed.text); setFromIdea(true) }
      if (seed.brand && (BRAND_KEYS as readonly string[]).includes(seed.brand)) setBrand(seed.brand)
    } catch { /* ignore */ }
  }, [])

  const activeTrends = (trends.rows ?? []).filter((t) =>
    (brand === 'STB' ? (t.brand === 'STB' || t.brand === 'Both')
      : brand === 'ALTO' ? (t.brand === 'ALTO' || t.brand === 'Both')
        : true) &&
    t.status !== 'used' && t.status !== 'passed' &&
    trendAgeDays(t.observed_on) <= TREND_STALE_DAYS,
  )

  const buildContext = () => ({
    companyContext: settings['company_context'] || '',
    brandVoice: [
      (brand === 'STB' ? dnaVoices['stb'] : brand === 'ALTO' ? dnaVoices['alto'] : '')
        || (brand === 'STB' ? settings['brand_voice_stb'] || '' : brand === 'ALTO' ? settings['brand_voice_alto'] || '' : ''),
      kitSummary(parseKit(settings[kitKey(brand)])),
    ].filter(Boolean).join('\n\n'),
    trends: activeTrends
      .map((t) => `- [${t.kind}] ${t.label}${t.notes ? ` — ${t.notes}` : ''} (observed ${t.observed_on})`)
      .join('\n'),
  })

  const mentor = MENTORS.find((m) => m.id === mentorId)

  // The brand's permanent photo library, refreshed when the brand tab changes.
  useEffect(() => {
    let alive = true
    void listPhotos(brand).then((p) => { if (alive) setLibrary(p) })
    return () => { alive = false }
  }, [brand])

  /** Pull a "LENS: …" first line off a best-fit draft. */
  const splitLens = (raw: string): { lens: string; body: string } => {
    const m = raw.match(/^LENS:\s*(.+)\n+/)
    return m ? { lens: m[1].trim(), body: raw.slice(m[0].length) } : { lens: '', body: raw }
  }

  const scoreDraft = async (draft: string): Promise<Score | null> => {
    const r = await post('studio-generate', {
      mode: 'score', output, brandLabel: BRAND_LABEL[brand], input, draft, context: buildContext(),
    })
    const s = r.score as Score | undefined
    return s && typeof s.total === 'number' ? s : null
  }

  const generate = async () => {
    const brief = input.trim()
    if (!brief) { setError('Put the idea in first — or send one over from the Idea Board.'); return }
    setError(''); setResult(''); setScore(null); setLens(''); setPasses(0)
    setImgUrl(''); setMotionUrl(''); setMotionNote(''); setVidUrl(''); setVidNote('')

    try {
      // 1) Draft
      setStage(mentorId === 'best' ? 'Picking the right mentor & drafting…' : `Drafting through ${mentor?.name}…`)
      const d = await post('studio-generate', {
        mode: 'draft', output, brandLabel: BRAND_LABEL[brand], input: brief, context: buildContext(),
        ...(mentorId === 'best'
          ? { bestFit: true, mentorRoster: MENTORS.map((m) => ({ name: m.name, why: m.why })) }
          : { mentorName: mentor?.name, mentorStyle: mentor?.style }),
      })
      if (d.error) { setStage(''); setError(d.error === 'not_configured' ? String(d.message) : 'The AI had trouble drafting — try again.'); return }
      let { lens: pickedLens, body } = splitLens(String(d.result || ''))
      let pass = 1

      // 2) Score → maybe revise → rescore (all before anything is shown)
      setStage('Judge is scoring the draft…')
      let s = await scoreDraft(body)
      while (s && s.total < SCORE_BAR && pass < MAX_AUTO_PASSES) {
        setStage(`Scored ${s.total}/100 — revising…`)
        const rv = await post('studio-generate', {
          mode: 'revise', output, brandLabel: BRAND_LABEL[brand], input: brief, draft: body,
          feedback: s.feedback, context: buildContext(),
          mentorName: mentorId === 'best' ? pickedLens.split('—')[0]?.trim() : mentor?.name,
          mentorStyle: mentor?.style,
        })
        if (rv.error || !rv.result) break
        const again = splitLens(String(rv.result))
        if (again.lens) pickedLens = again.lens
        body = again.body
        pass++
        setStage('Re-scoring the revision…')
        s = (await scoreDraft(body)) || s
      }

      setResult(body)
      setLens(pickedLens)
      setScore(s)
      setPasses(pass)
      setStage('')
    } catch {
      setStage('')
      setError('Could not reach the AI functions. (Running locally? Use `netlify dev`.)')
    }
  }

  /** Manual extra pass on demand. */
  const anotherPass = async () => {
    if (!result) return
    setStage('Revising…')
    try {
      const rv = await post('studio-generate', {
        mode: 'revise', output, brandLabel: BRAND_LABEL[brand], input: input.trim(), draft: result,
        feedback: score?.feedback || [], context: buildContext(),
        mentorName: mentorId === 'best' ? lens.split('—')[0]?.trim() : mentor?.name,
        mentorStyle: mentor?.style,
      })
      if (!rv.error && rv.result) {
        const again = splitLens(String(rv.result))
        setResult(again.body)
        setStage('Re-scoring…')
        setScore((await scoreDraft(again.body)) || score)
        setPasses((n) => n + 1)
      }
    } catch { /* keep the current result */ }
    setStage('')
  }

  /**
   * Ad creative, in two steps. First an art director reads the actual script
   * and writes a hyper-specific image prompt (subject, emotion, lens, light,
   * composition, negative space) plus the headline to render — a one-line
   * brief like "plans" can never produce an ad on its own. Then the image
   * model executes that prompt. Returns the URL so the clip makers can chain.
   */
  /** Words for the creative — reuses the art director's brief, or asks once. */
  const ensureWords = async (fresh = false): Promise<ImageBrief | null> => {
    if (brief && !fresh) return brief
    const b = await post('studio-generate', {
      mode: 'image_brief', output, brandLabel: BRAND_LABEL[brand],
      input: input.trim(), draft: result, context: buildContext(),
      imageStyle: imgStyle, aspect: imgAspect, withText: true,
      noPeople: true, fromPhoto: !!srcPhoto,
    })
    const ad = (b.brief as ImageBrief | undefined) || null
    if (ad) setBrief(ad)
    return ad
  }

  /** Compose the flyer around the untouched photo — instant, no image tokens. */
  const composeReal = async (words: ImageBrief | null, withLogo = brandLogo, pos = logoPos, tpl = template): Promise<string> => {
    const kit = parseKit(settings[kitKey(brand)])
    return composeFlyer({
      photoUrl: srcPhoto,
      headline: words?.headline || input.trim().slice(0, 48) || BRAND_LABEL[brand],
      subhead: words?.subhead || '',
      cta: kit.cta,
      eyebrow: BRAND_LABEL[brand],
      template: tpl,
      aspect: imgAspect,
      primary: kit.colors?.[0],
      accent: kit.colors?.[1] || kit.colors?.[0],
      logoUrl: withLogo ? kit.logo : undefined,
      logoPos: pos,
      headingFont: kit.headingFont,
    })
  }

  const makeImage = async (regenerate = false): Promise<string> => {
    if (imgUrl && !regenerate) return imgUrl
    const source = (result || input).trim()
    if (!source) { toast('Write the idea (or generate the script) first'); return '' }

    // Instant flyer: the house stays exactly as photographed; AI writes the
    // words, the design is drawn locally with the exact brand colours.
    if (srcPhoto && photoMode === 'real') {
      setImgBusy(true); setImgNote('Writing the headline…')
      const words = await ensureWords(regenerate)
      setImgNote('Designing your flyer…')
      try {
        const flyer = await composeReal(words)
        setRawImg(flyer); setImgUrl(flyer)
        setImgBusy(false); setImgNote('')
        return flyer
      } catch {
        setImgBusy(false); setImgNote('')
        toast('Could not compose the flyer — try another photo')
        return ''
      }
    }

    // AI-designed flyer: the model typesets the ENTIRE layout itself — the
    // same mechanism behind ChatGPT's flyers — while input_fidelity on the
    // edits endpoint keeps the photographed house pixel-faithful.
    if (srcPhoto && photoMode === 'design') {
      setImgBusy(true); setImgNote('Writing the copy…')
      const words = await ensureWords(regenerate)
      const kit = parseKit(settings[kitKey(brand)])
      const prompt = flyerDesignPrompt({
        brandLabel: BRAND_LABEL[brand],
        headline: words?.headline || input.trim().slice(0, 48) || BRAND_LABEL[brand],
        subhead: words?.subhead,
        cta: kit.cta,
        colors: kit.colors,
        headingFont: kit.headingFont,
        logoPos,
      })
      setImgNote('Designing the flyer…')
      const r = await post('studio-image', {
        prompt, aspect: imgAspect, quality: hd ? 'high' : 'medium', sourcePhoto: srcPhoto,
      })
      const url = String(r.dataUrl || r.url || '')
      if (!url) {
        setImgBusy(false); setImgNote('')
        toast(r.error === 'not_configured' ? String(r.message) : `Flyer failed: ${r.detail || r.error || 'try again'}`)
        return ''
      }
      setRawImg(url)
      const final = await brandStamp(url)
      setImgBusy(false); setImgNote('')
      setImgUrl(final)
      return final
    }

    setImgBusy(true); setImgNote('Art-directing the shot…')
    const kit = parseKit(settings[kitKey(brand)])

    const b = await post('studio-generate', {
      mode: 'image_brief', output, brandLabel: BRAND_LABEL[brand],
      input: input.trim(), draft: result, context: buildContext(),
      imageStyle: imgStyle, aspect: imgAspect, withText: imgText,
      noPeople: true, fromPhoto: !!srcPhoto,
    })
    const ad = (b.brief as ImageBrief | undefined) || null
    if (ad) setBrief(ad)

    // Everything the image model needs, in the order it weighs it.
    const prompt = [
      ad?.prompt || `Scroll-stopping advertising photograph for ${BRAND_LABEL[brand]}. ${source.slice(0, 500)}`,
      kit.colors?.length ? `Brand colour palette: ${kit.colors.slice(0, 4).join(', ')} — use these in the wardrobe, props, light or graphic elements.` : '',
      imgText && ad?.headline
        ? `Render this text INTO the image, large, bold, perfectly spelled, in the clear negative space: headline "${ad.headline}"${ad.subhead ? `, smaller supporting line "${ad.subhead}"` : ''}. Typography must be clean, modern, high-contrast and fully legible on a phone.`
        : 'No text, no lettering, no watermarks anywhere in the image.',
      'NO PEOPLE: no faces, no figures, no silhouettes, no hands anywhere in the frame — the work itself is the hero.',
      srcPhoto
        ? 'Keep the supplied photograph’s real architecture, materials and proportions exactly as they are — enhance the light, grade and framing, do not redesign the building.'
        : '',
      'Advertising-grade quality: sharp focus, professional colour grading, believable real-world detail and materials. Not a stock photo, not AI-glossy, no gibberish text.',
    ].filter(Boolean).join(' ')

    setImgNote(srcPhoto ? 'Building the ad from your photo…' : 'Rendering the creative…')
    const r = await post('studio-image', {
      prompt, aspect: imgAspect, quality: hd ? 'high' : 'medium',
      ...(srcPhoto ? { sourcePhoto: srcPhoto } : {}),
    })
    const url = String(r.dataUrl || r.url || '')
    if (!url) {
      setImgBusy(false); setImgNote('')
      toast(r.error === 'not_configured' ? String(r.message) : `Image failed: ${r.detail || r.error || 'try again'}`)
      return ''
    }

    // Brand finishing pass: stamp the REAL logo file and exact brand colour on
    // the render — an image model can only ever approximate a wordmark.
    setRawImg(url)
    const final = await brandStamp(url)
    setImgBusy(false); setImgNote('')
    setImgUrl(final)
    return final
  }

  /** Composite the actual logo + brand accent onto a finished render. The
   * logo is keyed first so a white-card PNG never stamps as a white box. */
  const brandStamp = async (url: string, enabled = brandLogo, pos = logoPos): Promise<string> => {
    const kit = parseKit(settings[kitKey(brand)])
    if (!enabled || !kit.logo) return url
    try {
      setImgNote('Applying your logo…')
      const clean = (await logoWithAlpha(kit.logo)).toDataURL('image/png')
      // A designed flyer already carries its own layout — stamp the mark
      // quietly into the space the prompt reserved; no scrim, no accent bar.
      const designed = srcPhoto !== '' && photoMode === 'design'
      return await composeAd({
        imageUrl: url,
        logoUrl: clean,
        placement: pos,
        logoScale: designed ? 0.22 : 0.28,
        accentColor: designed ? undefined : kit.colors?.[0],
        scrim: !designed,
        autoCard: designed,   // a navy mark on a navy footer needs a white card
      })
    } catch { return url }
  }

  /** Re-apply branding to the existing creative without a fresh render. */
  const rebrand = async (opts?: { logo?: boolean; pos?: LogoPos; tpl?: FlyerTemplate }) => {
    const on = opts?.logo ?? brandLogo
    const pos = opts?.pos ?? logoPos
    const tpl = opts?.tpl ?? template
    if (!imgUrl) return
    if (srcPhoto && photoMode === 'real') setImgUrl(await composeReal(brief, on, pos, tpl))
    else if (rawImg) setImgUrl(on ? await brandStamp(rawImg, true, pos) : rawImg)
    setImgNote('')
  }

  /** Moving image (5s) or video (10s) — both animate the static image. */
  const makeClip = async (duration: 5 | 10) => {
    const setBusy = duration === 5 ? setMotionBusy : setVidBusy
    const setNote = duration === 5 ? setMotionNote : setVidNote
    const setUrl = duration === 5 ? setMotionUrl : setVidUrl
    setBusy(true); setUrl(''); setNote('')
    try {
      let img = imgUrl
      if (!img) { setNote('Creating the base image…'); img = await makeImage() }
      if (!img) { setBusy(false); setNote(''); return }
      setNote('Sending to Runway…')
      const created = await post('studio-video', {
        action: 'create', imageDataUrl: img, promptText: input.trim().slice(0, 400), duration,
      })
      if (created.error) {
        setBusy(false); setNote('')
        toast(created.error === 'not_configured' ? String(created.message) : `Video failed: ${created.detail || created.error}`)
        return
      }
      const id = String(created.id)
      setNote(`Rendering ${duration}s…`)
      for (let i = 0; i < 72; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await post('studio-video', { action: 'status', id })
        if (st.status === 'SUCCEEDED' && st.url) { setUrl(String(st.url)); break }
        if (st.status === 'FAILED') { toast(`Video failed: ${st.failure || 'unknown'}`); break }
      }
    } catch { toast('Video generation hit a network problem.') }
    setBusy(false); setNote('')
  }

  /** How viral can this idea get — scored against real viral-clip mechanics. */
  const viralCheck = async () => {
    const brief = input.trim()
    if (!brief) { setError('Put the idea in first — then I can tell you how it travels.'); return }
    setViralBusy(true); setError('')
    const r = await post('studio-generate', {
      mode: 'viral', output: 'ad_script', brandLabel: BRAND_LABEL[brand], input: brief, context: buildContext(),
    })
    setViralBusy(false)
    if (r.viral) setViral(r.viral as Viral)
    else toast(r.error === 'not_configured' ? String(r.message) : 'Viral analysis failed — try again')
  }

  /** Fold a chosen viral angle into the brief so Generate builds on it. */
  const useAngle = (a: Viral['angles'][number]) => {
    setInput((prev) => `${prev.trim()}\n\nVIRAL ANGLE — ${a.title} (${a.format})\nOpen with: ${a.hook}\nMechanic: ${a.whyViral}`)
    toast(`Angle "${a.title}" added to the brief`)
  }

  const saveToContent = async () => {
    const firstLine = result.split('\n').find((l) => l.trim())?.slice(0, 90) || 'AI draft'
    await content.insert({
      title: `AI: ${firstLine}`,
      brand: brand === 'BONALTI' ? 'Internal' : brand,
      stage: 'ideas',
      idea: input.trim(),
      notes: [
        lens ? `Lens: ${lens}` : mentor ? `Lens: ${mentor.name}` : '',
        score ? `Score: ${score.total}/100 after ${passes} pass${passes === 1 ? '' : 'es'}` : '',
        '',
        result,
      ].filter((x, i) => x !== '' || i === 2).join('\n'),
    } as Partial<WsContent>)
    toast('Saved to Content → Ideas')
  }

  const busy = stage !== ''

  return (
    <WsShell
      title="AI Studio"
      subtitle="Idea in → pick the company & the mentor lens → scored, revised marketing out"
    >
      {/* Brand tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {BRAND_KEYS.map((b) => {
          const on = brand === b
          const kit = parseKit(settings[kitKey(b)])
          const accent = kit.colors?.[0]
          return (
            <button key={b} onClick={() => { setBrand(b); setResult(''); setScore(null); setError('') }}
              className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 shrink-0 transition"
              style={{
                background: on ? 'var(--color-surface)' : 'var(--color-bg)',
                border: on ? `1.5px solid ${accent || 'var(--color-accent)'}` : '1px solid var(--color-border)',
                boxShadow: on ? 'var(--shadow-sm)' : 'none',
              }}>
              {kit.logo
                ? <img src={kit.logo} alt="" draggable={false} style={{ height: 20, width: 'auto', maxWidth: 64, objectFit: 'contain' }} />
                : <span className="rounded-full" style={{ width: 10, height: 10, background: accent || 'var(--color-border)' }} />}
              <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: on ? 'var(--color-text)' : 'var(--color-muted)' }}>
                {BRAND_LABEL[b]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            {fromIdea && (
              <div className="mb-3 text-[11px] font-semibold inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}>
                💡 From the Idea Board
              </div>
            )}

            {/* What to make */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {OUTPUTS.map((o) => (
                <button key={o.id} onClick={() => setOutput(o.id)}
                  className="px-3 py-1.5 rounded-full text-[13px] font-semibold transition"
                  style={{
                    background: output === o.id ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: output === o.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>

            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4}
              placeholder="The idea — what are we making this about?"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={wsField} />

            {/* Mentor lens */}
            <div className="mt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-muted)' }}>Mentor lens</span>
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                <button onClick={() => setMentorId('best')}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold transition"
                  style={{
                    background: mentorId === 'best' ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: mentorId === 'best' ? 'var(--color-on-accent)' : 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                  }}>
                  ✨ Best fit
                </button>
                {MENTORS.map((m) => (
                  <button key={m.id} onClick={() => setMentorId(m.id)} title={m.why}
                    className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
                    style={{
                      background: mentorId === m.id ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                      color: mentorId === m.id ? 'var(--color-accent)' : 'var(--color-muted)',
                      border: mentorId === m.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                    }}>
                    {m.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] mt-1.5 min-h-[15px]" style={{ color: 'var(--color-muted)' }}>
                {mentorId === 'best' ? 'The AI picks the best mentor for this brief and tells you why.' : mentor?.why}
              </p>
            </div>

            {error && <p className="text-sm mt-2" style={{ color: '#dc2626' }}>{error}</p>}

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <Button onClick={() => void generate()} disabled={busy}>
                <IconSpark width={15} height={15} /> {busy ? stage : 'Generate (scored before you see it)'}
              </Button>
              <Button variant="outline" onClick={() => void viralCheck()} disabled={viralBusy || busy}>
                🔥 {viralBusy ? 'Analyzing…' : 'Viral check'}
              </Button>
              {!busy && (
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  Auto-revises until {SCORE_BAR}/100 (max {MAX_AUTO_PASSES} passes).
                </span>
              )}
            </div>
          </Card>

          {/* Viral analysis of the idea */}
          {viral && (
            <Card className="p-5">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>🔥 Viral potential</h2>
                <span className="text-2xl font-bold tnum" style={{ color: scoreColor(viral.score) }}>{viral.score}<span className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>/100</span></span>
                <button onClick={() => setViral(null)} className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>Dismiss</button>
              </div>
              <p className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>{viral.verdict}</p>
              {viral.why?.length > 0 && (
                <ul className="flex flex-col gap-0.5 mb-3">
                  {viral.why.map((w, i) => <li key={i} className="text-[12px]" style={{ color: 'var(--color-muted)' }}>• {w}</li>)}
                </ul>
              )}

              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--color-muted)' }}>5 angles that travel — best first</h3>
              <div className="flex flex-col gap-2 mb-3">
                {viral.angles?.map((a, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ background: 'var(--color-bg)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{i + 1}. {a.title}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>{a.format}</span>
                      <button onClick={() => useAngle(a)} className="ml-auto text-xs font-semibold shrink-0" style={{ color: 'var(--color-accent)' }}>Use this angle →</button>
                    </div>
                    <p className="text-[13px] mt-1" style={{ color: 'var(--color-text)' }}>“{a.hook}”</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{a.whyViral}</p>
                  </div>
                ))}
              </div>

              {viral.boosters?.length > 0 && (
                <>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: 'var(--color-muted)' }}>Reach boosters</h3>
                  <ul className="flex flex-col gap-0.5">
                    {viral.boosters.map((b, i) => <li key={i} className="text-[12px]" style={{ color: 'var(--color-text)' }}>⚡ {b}</li>)}
                  </ul>
                </>
              )}
            </Card>
          )}

          {result && (
            <Card className="p-5">
              {/* Scorecard */}
              {score && (
                <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--color-bg)' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-2xl font-bold tnum" style={{ color: scoreColor(score.total) }}>{score.total}<span className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>/100</span></span>
                    <div className="flex gap-3 flex-wrap text-[11px] tnum" style={{ color: 'var(--color-muted)' }}>
                      <span>Hook {score.hook}/25</span>
                      <span>Clarity {score.clarity}/20</span>
                      <span>Brand {score.brandFit}/20</span>
                      <span>CTA {score.cta}/20</span>
                      <span>Platform {score.platformFit}/15</span>
                    </div>
                    <span className="text-[11px] ml-auto" style={{ color: 'var(--color-muted)' }}>{passes} pass{passes === 1 ? '' : 'es'}</span>
                  </div>
                  {lens && <p className="text-[12px] font-semibold mt-2" style={{ color: 'var(--color-accent)' }}>Lens: {lens}</p>}
                  {score.feedback?.length > 0 && score.total < SCORE_BAR && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {score.feedback.map((f, i) => (
                        <li key={i} className="text-[11px]" style={{ color: 'var(--color-muted)' }}>→ {f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <pre className="text-sm whitespace-pre-wrap leading-relaxed mb-4" style={{ color: 'var(--color-text)', fontFamily: 'inherit' }}>{result}</pre>

              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(result); toast('Copied') }}>Copy</Button>
                <Button variant="outline" onClick={() => void saveToContent()}>Save to Content</Button>
                <Button variant="outline" onClick={() => void anotherPass()} disabled={busy}>↻ Run another pass</Button>
              </div>

              {/* Media bay — ad creative, moving image, video. Nothing runs on
                  its own; while rendering, each slot shows its dimensions. */}
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
                  <h3 className="text-[13px] font-bold" style={{ color: 'var(--color-text)' }}>Ad creative</h3>
                  <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Optional — each render costs. Clips animate the creative.</span>
                </div>

                {/* Treatment controls — an art director turns these + the script
                    into the actual image prompt. */}
                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--color-bg)' }}>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {IMG_STYLES.map((s) => (
                      <button key={s.id} onClick={() => setImgStyle(s.id)} title={s.hint}
                        className="px-2.5 py-1.5 rounded-full text-[12px] font-semibold transition"
                        style={{
                          background: imgStyle === s.id ? 'var(--color-accent)' : 'var(--color-surface)',
                          color: imgStyle === s.id ? 'var(--color-on-accent)' : 'var(--color-muted)',
                          border: '1px solid var(--color-border)',
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 flex-wrap items-center">
                    {IMG_ASPECTS.map((a) => (
                      <button key={a.id} onClick={() => setImgAspect(a.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition"
                        style={{
                          background: imgAspect === a.id ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                          color: imgAspect === a.id ? 'var(--color-accent)' : 'var(--color-muted)',
                          border: imgAspect === a.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                        }}>
                        {a.label}
                      </button>
                    ))}
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold ml-1 cursor-pointer" style={{ color: 'var(--color-muted)' }}>
                      <input type="checkbox" checked={imgText} onChange={(e) => setImgText(e.target.checked)} />
                      Headline on image (flyer)
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer" style={{ color: 'var(--color-muted)' }}
                      title="Stamps your real logo file (white background removed) onto the finished ad">
                      <input type="checkbox" checked={brandLogo}
                        onChange={(e) => { setBrandLogo(e.target.checked); void rebrand({ logo: e.target.checked }) }} />
                      Logo on ad
                    </label>
                    {brandLogo && (
                      <select value={logoPos}
                        onChange={(e) => { const pos = e.target.value as LogoPos; setLogoPos(pos); void rebrand({ pos }) }}
                        className="rounded-lg px-1.5 py-1 text-[11px] outline-none" style={wsField}>
                        <option value="bottom-right">Logo: bottom right</option>
                        <option value="bottom-left">Logo: bottom left</option>
                        <option value="bottom-center">Logo: bottom center</option>
                        <option value="top-left">Logo: top left</option>
                        <option value="top-right">Logo: top right</option>
                      </select>
                    )}
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer" style={{ color: 'var(--color-muted)' }}
                      title="HD renders sharper but takes about twice as long">
                      <input type="checkbox" checked={hd} onChange={(e) => setHd(e.target.checked)} />
                      HD (slower)
                    </label>
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: 'var(--color-muted)' }}>
                    {IMG_STYLES.find((s) => s.id === imgStyle)?.hint}
                  </p>

                  {/* Build the ad from a real project photo — always beats an
                      invented scene, and never looks fake to a local audience. */}
                  <div className="flex items-center gap-3 mt-3 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {srcPhoto ? (
                      <img src={srcPhoto} alt="Source" className="rounded-lg shrink-0" style={{ height: 46, width: 62, objectFit: 'cover', border: '1px solid var(--color-border)' }} />
                    ) : (
                      <span className="grid place-items-center rounded-lg shrink-0" style={{ height: 46, width: 62, background: 'var(--color-surface)', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 18 }}>📷</span>
                    )}
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold" style={{ color: 'var(--color-text)' }}>
                        {srcPhoto ? 'Building from your real photo' : 'Use a real project photo'}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        A home you actually built beats anything AI invents — and never looks fake.
                      </p>
                    </div>
                    <div className="flex gap-3 ml-auto items-center">
                      {library.length > 0 && (
                        <button onClick={() => setPickerOpen((v) => !v)} className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>
                          {pickerOpen ? 'Hide library' : `Library · ${library.length}`}
                        </button>
                      )}
                      <button onClick={() => srcRef.current?.click()} className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>
                        {srcPhoto ? 'Change' : 'Upload'}
                      </button>
                      {srcPhoto && (
                        <button onClick={() => setSrcPhoto('')} className="text-[11px] font-semibold" style={{ color: 'var(--color-muted)' }}>Remove</button>
                      )}
                    </div>

                    {/* With a real photo, choose how the flyer gets made. */}
                    {srcPhoto && (
                      <div className="w-full flex gap-1.5 flex-wrap items-center mt-1">
                        {([
                          ['design', '🎨 Designed flyer'],
                          ['real', '⚡ Instant flyer'],
                          ['ai', '✨ AI restyle'],
                        ] as const).map(([m, label]) => (
                          <button key={m} onClick={() => { setPhotoMode(m) }}
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-bold transition"
                            style={{
                              background: photoMode === m ? 'var(--color-accent)' : 'var(--color-surface)',
                              color: photoMode === m ? 'var(--color-on-accent)' : 'var(--color-muted)',
                              border: '1px solid var(--color-border)',
                            }}>
                            {label}
                          </button>
                        ))}
                        <span className="w-full text-[10px] -mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          {photoMode === 'design'
                            ? 'The AI designs and typesets the whole layout — magazine-grade type, your photo untouched. ~1 min per render.'
                            : photoMode === 'real'
                              ? 'Drawn locally around the untouched photo — instant, no AI image cost.'
                              : 'The AI regrades and reframes the shot itself, then the design is stamped on.'}
                        </span>
                        {!parseKit(settings[kitKey(brand)]).cta && (
                          <span className="w-full text-[10px] font-semibold" style={{ color: '#d97706' }}>
                            ⚠ No call to action set — add one in the Brand kit (e.g. “Send us a message”) so every flyer ends with an ask.
                          </span>
                        )}
                        {photoMode === 'real' && (
                          <>
                            {([['banner', 'Banner'], ['overlay', 'Overlay'], ['frame', 'Frame']] as const).map(([t, label]) => (
                              <button key={t} onClick={() => { setTemplate(t); void rebrand({ tpl: t }) }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition"
                                style={{
                                  background: template === t ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                                  color: template === t ? 'var(--color-accent)' : 'var(--color-muted)',
                                  border: template === t ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                                }}>
                                {label}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {/* Pick from the brand's permanent library */}
                    {pickerOpen && (
                      <div className="w-full grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-1">
                        {library.map((p) => (
                          <button key={p.path} title={p.name}
                            onClick={async () => {
                              try { setSrcPhoto(await photoToDataUrl(p.url)); setPickerOpen(false); toast('Photo selected') }
                              catch { toast('Could not load that photo') }
                            }}
                            className="rounded-lg overflow-hidden" style={{ aspectRatio: '4 / 3', border: '1px solid var(--color-border)' }}>
                            <img src={p.url} alt="" className="w-full h-full" style={{ objectFit: 'cover' }} />
                          </button>
                        ))}
                      </div>
                    )}
                    <input ref={srcRef} type="file" accept="image/*" className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        e.currentTarget.value = ''
                        if (!f) return
                        try { setSrcPhoto(await toLogoDataUrl(f, 1024)) } catch { toast('Could not read that photo') }
                      }} />
                  </div>
                </div>

                {/* Hero creative on the left, the two clips stacked beside it */}
                <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-3 items-start">
                  <MediaSlot hero
                    icon="🖼"
                    label={imgText ? 'Ad creative / flyer' : 'Ad creative'}
                    dim={IMG_ASPECTS.find((a) => a.id === imgAspect)!.dim}
                    ratio={IMG_ASPECTS.find((a) => a.id === imgAspect)!.ratio}
                    busy={imgBusy} note={imgNote} url={imgUrl} kind="image"
                    action="Generate creative" onGen={() => void makeImage(!!imgUrl)}
                    fileName={`${brand.toLowerCase()}-ad.png`}
                    expectSec={srcPhoto && photoMode === 'real' ? 8
                      : srcPhoto && photoMode === 'design' ? (hd ? 90 : 60)
                        : hd ? 55 : 25} />
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                    <MediaSlot icon="✨" label="Moving image · 5s" dim="768 × 1280" ratio="3 / 5"
                      busy={motionBusy} note={motionNote} url={motionUrl} kind="video"
                      action="Animate it" onGen={() => void makeClip(5)} expectSec={90} />
                    <MediaSlot icon="🎬" label="Video · 10s" dim="768 × 1280" ratio="3 / 5"
                      busy={vidBusy} note={vidNote} url={vidUrl} kind="video"
                      action="Generate video" onGen={() => void makeClip(10)} expectSec={180} />
                  </div>
                </div>

                {(brief?.headline || brief?.rationale) && (
                  <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--color-bg)' }}>
                    {brief.headline && (
                      <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                        “{brief.headline}”{brief.subhead ? <span className="font-normal" style={{ color: 'var(--color-muted)' }}> — {brief.subhead}</span> : null}
                      </p>
                    )}
                    {brief.rationale && <p className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>Why it stops the scroll: {brief.rationale}</p>}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-5">
          <BrandKitPanel
            brand={brand}
            raw={settings[kitKey(brand)]}
            canEdit={role === 'owner'}
            onSave={(value) => set(kitKey(brand), value)}
          />

          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Trends in play</h2>
              <Link to="/workspace/trends" className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Trend Board</Link>
            </div>
            {activeTrends.length === 0 ? (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                Nothing fresh logged for {BRAND_LABEL[brand]} yet. Log findings on the Trend Board and every draft here gets sharper.
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

          {/* Brand context — the written ground truth the AI uses */}
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
