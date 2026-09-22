import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Button, Input } from '../../components/ui'
import { IconCheck, IconPlus, IconTrash, IconFilm, IconPlay } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useWorkspace, useWsTable, useWsSettings, VIDEO_CATEGORIES, ASSISTANT_NAME, type WsVideo, type WsClip } from '../../lib/workspace'
import { uploadThumb, thumbUrl } from '../../lib/wsPhotos'

/**
 * Video planner — three content pipelines on one board engine.
 *
 * The unit of planning is the WEEK, not the day: the whole point is standing
 * in week 39 and seeing weeks 40–45 already spoken for. YouTube runs one
 * long-form video a week, so there the week IS the card — a full open
 * dossier (thumbnail · episode brief · links) with nothing hidden behind a
 * tap, because this page is where the planning session actually happens. The
 * short-form boards take as many cards a week as they get, so they stay
 * compact and expand one at a time.
 *
 * A card is born as an idea, grows a candidate thumbnail, and graduates when
 * the final link is pasted — which flips it to Published and turns the card
 * into a one-tap door to the video. YouTube cards carry their three
 * short-form clips (idea + Shorts + Reels links), because the clips exist to
 * feed the episode, not on their own.
 */

type BoardId = WsVideo['board']

const BOARDS: Record<BoardId, {
  title: string
  subtitle: string
  episodes: boolean       // numbered long-form episodes, week-sized cards
  categories: boolean     // Lifestyle / Business / Construction pillars
  clips: boolean          // 3 short-form clips per card
  quota: number           // videos expected per week (0 = no quota)
}> = {
  youtube: {
    title: 'YouTube',
    subtitle: 'Plan your weekly episodes, thumbnails, links and short-form clips',
    episodes: true, categories: true, clips: true, quota: 1,
  },
  stb_tiktok: {
    title: 'STB TikTok',
    subtitle: 'Short-form pipeline for STB — ideas in, links out',
    episodes: false, categories: false, clips: false, quota: 0,
  },
  personal: {
    title: 'Personal Brand',
    subtitle: `Marca Personal — ${ASSISTANT_NAME}'s own pipeline`,
    episodes: false, categories: false, clips: false, quota: 0,
  },
}

const STATUS: { id: WsVideo['status']; label: string; color: string }[] = [
  { id: 'planned', label: 'Planned', color: '#6b7280' },
  { id: 'in_progress', label: 'In Progress', color: '#d97706' },
  { id: 'ready', label: 'Ready to Publish', color: '#16a34a' },
  { id: 'published', label: 'Published', color: '#dc2626' },
]
const statusOf = (id: WsVideo['status']) => STATUS.find((s) => s.id === id) ?? STATUS[0]

const CAT_COLOR: Record<string, string> = { Lifestyle: '#7c3aed', Business: '#0e7490', Construction: '#b45309' }

// ---- Week helpers (local time, Monday-anchored — same math as WsTasks) -----
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromISO = (iso: string) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
const mondayISO = (d: Date) => toISO(startOfWeek(d))
const monthShort = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
const isoWeek = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
}
const weekLabel = (iso: string) => {
  const mon = fromISO(iso)
  const sun = addDays(mon, 6)
  return `${monthShort(mon)} ${mon.getDate()} – ${monthShort(sun)} ${sun.getDate()}`
}

const emptyClips = (): WsClip[] => [
  { idea: '', shorts: '', reels: '' },
  { idea: '', shorts: '', reels: '' },
  { idea: '', shorts: '', reels: '' },
]
const clipDone = (c: WsClip) => !!(c.shorts.trim() || c.reels.trim())

const labelCls = 'text-[10px] font-bold uppercase tracking-[0.06em]'
const labelStyle = { color: 'var(--color-muted)' } as const

export default function WsPlanner({ board }: { board: BoardId }) {
  const cfg = BOARDS[board]
  const { role } = useWorkspace()
  const { rows, insert, update, remove } = useWsTable<WsVideo>('ws_videos')
  const { settings, set: setSetting } = useWsSettings()
  const confirmDelete = useConfirmDelete()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState('')
  const [editChannel, setEditChannel] = useState(false)
  const [chName, setChName] = useState('')
  const [chUrl, setChUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fileFor = useRef<WsVideo | null>(null)

  const thisMonday = mondayISO(new Date())
  const mine = useMemo(() => (rows ?? []).filter((v) => v.board === board), [rows, board])

  // The one channel all episodes go to — its name shows on every card, its
  // link lives behind "Channel ↗". Stored in ws_settings, so only the owner
  // can change it (same rule as brand kits).
  const channel = useMemo<{ name: string; url: string }>(() => {
    try { return { name: '', url: '', ...JSON.parse(settings['yt_channel'] || '{}') } } catch { return { name: '', url: '' } }
  }, [settings])

  // Group by week, newest week first; the current week always renders, even
  // empty — that gap is exactly what the planner exists to make visible.
  const weeks = useMemo(() => {
    const map = new Map<string, WsVideo[]>()
    map.set(thisMonday, [])
    for (const v of mine) {
      const arr = map.get(v.week_start) ?? []
      arr.push(v)
      map.set(v.week_start, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0) || a.created_at.localeCompare(b.created_at))
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [mine, thisMonday])

  // Signed URLs for every visible thumbnail, fetched once per path.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const v of mine) {
        if (!v.thumb_path || thumbs[v.thumb_path] !== undefined) continue
        const url = await thumbUrl(v.thumb_path)
        if (cancelled) return
        setThumbs((t) => ({ ...t, [v.thumb_path]: url }))
      }
    })()
    return () => { cancelled = true }
  }, [mine, thumbs])

  const nextEpisode = useMemo(
    () => mine.reduce((max, v) => Math.max(max, v.episode ?? 0), 0) + 1,
    [mine],
  )

  /** New card lands on the first week that still has room (YouTube's quota),
   * or on the current week for the free-form boards. */
  const addCard = async (weekIso?: string) => {
    let week = weekIso ?? thisMonday
    if (!weekIso && cfg.quota > 0) {
      const planned = new Set(mine.map((v) => v.week_start))
      let probe = thisMonday
      while (planned.has(probe)) probe = toISO(addDays(fromISO(probe), 7))
      week = probe
    }
    const row = await insert({
      board,
      week_start: week,
      episode: cfg.episodes ? nextEpisode : null,
      clips: cfg.clips ? emptyClips() : [],
      author_role: role ?? 'assistant',
    } as Partial<WsVideo>)
    if (row && !cfg.episodes) setExpanded(row.id)
  }

  const patch = (v: WsVideo, values: Partial<WsVideo>) => void update(v.id, values)

  /** Pasting the final link is the moment of truth — the card flips to
   * Published on its own. Clearing the link drops it back to Ready. */
  const setLink = (v: WsVideo, link: string) => {
    patch(v, { link, status: link.trim() ? 'published' : v.status === 'published' ? 'ready' : v.status })
  }

  const pickThumb = (v: WsVideo) => { fileFor.current = v; fileRef.current?.click() }
  const onThumbFile = async (file: File | null) => {
    const v = fileFor.current
    fileFor.current = null
    if (!file || !v) return
    setUploading(v.id)
    const path = await uploadThumb(v.id, file)
    if (path) {
      const url = await thumbUrl(path)
      setThumbs((t) => ({ ...t, [path]: url }))
      patch(v, { thumb_path: path })
    }
    setUploading('')
  }

  const setClip = (v: WsVideo, i: number, values: Partial<WsClip>) => {
    const clips = (v.clips?.length ? [...v.clips] : emptyClips())
    clips[i] = { ...clips[i], ...values }
    patch(v, { clips })
  }

  const statusPill = (v: WsVideo) => {
    const st = statusOf(v.status)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{ background: `color-mix(in srgb, ${st.color} 13%, transparent)`, color: st.color }}>
        <span className="rounded-full" style={{ width: 7, height: 7, background: st.color }} />
        {st.label}
      </span>
    )
  }

  const statusChips = (v: WsVideo) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STATUS.map((sOpt) => (
        <button key={sOpt.id} onClick={() => patch(v, { status: sOpt.id })}
          className="px-2.5 py-1 rounded-full text-[11px] font-bold transition"
          style={{
            background: v.status === sOpt.id ? sOpt.color : 'var(--color-bg)',
            color: v.status === sOpt.id ? '#fff' : 'var(--color-muted)',
            border: `1px solid ${v.status === sOpt.id ? sOpt.color : 'var(--color-border)'}`,
          }}>{sOpt.label}</button>
      ))}
    </div>
  )

  const linkField = (value: string, onChange: (s: string) => void, placeholder: string) => (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs outline-none" style={wsField} />
      {value.trim() && (
        <a href={value} target="_blank" rel="noreferrer" className="text-xs font-bold shrink-0 px-2 py-1.5 rounded-lg"
          style={{ background: 'var(--color-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}>↗</a>
      )}
    </div>
  )

  const thumbBox = (v: WsVideo, big: boolean) => {
    const img = v.thumb_path ? thumbs[v.thumb_path] : ''
    return (
      <div>
        <div className="rounded-xl overflow-hidden relative" style={{ aspectRatio: '16 / 9', background: 'var(--color-bg)', border: img ? 'none' : '1.5px dashed var(--color-border)' }}>
          {img ? (
            <img src={img} alt="Thumbnail" className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} />
          ) : (
            <button onClick={() => pickThumb(v)} className="absolute inset-0 grid place-items-center text-center" style={{ color: 'var(--color-muted)' }}>
              <span>
                <IconFilm width={20} height={20} style={{ margin: '0 auto 4px' }} />
                <span className="block text-xs font-semibold">Add thumbnail</span>
                {big && <span className="block text-[10px] mt-0.5">Recommended 1280 × 720</span>}
              </span>
            </button>
          )}
          {img && cfg.episodes && (
            <span className="absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(0,0,0,0.72)', color: '#fff' }}>
              EP.{v.episode ?? '—'}
            </span>
          )}
        </div>
        {img && (
          <Button variant="outline" className="text-xs w-full justify-center mt-2" onClick={() => pickThumb(v)} disabled={uploading === v.id}>
            {uploading === v.id ? 'Uploading…' : 'Change thumbnail'}
          </Button>
        )}
      </div>
    )
  }

  const clipRows = (v: WsVideo) => {
    const clips = v.clips?.length ? v.clips : emptyClips()
    return (
      <div className="flex flex-col gap-2">
        {clips.map((c, i) => (
          <div key={i} className="rounded-xl p-2 flex flex-col gap-1.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-md grid place-items-center shrink-0"
                style={{ background: clipDone(c) ? '#16a34a' : 'var(--color-accent)', color: '#fff' }}>
                {clipDone(c) ? <IconCheck width={11} height={11} /> : <IconPlay width={12} height={12} />}
              </span>
              <input value={c.idea} onChange={(e) => setClip(v, i, { idea: e.target.value })} placeholder={`Clip ${i + 1} — the hook / moment…`}
                className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none" style={{ ...wsField, background: 'var(--color-surface)' }} />
            </div>
            <div className="flex gap-1.5 pl-7 flex-col sm:flex-row">
              {linkField(c.shorts, (s) => setClip(v, i, { shorts: s }), 'YouTube Shorts link')}
              {linkField(c.reels, (s) => setClip(v, i, { reels: s }), 'Instagram Reels link')}
            </div>
          </div>
        ))}
      </div>
    )
  }

  /** The YouTube week card: a full open dossier — header row (week · dates ·
   * status · action), then thumbnail | episode brief | links. */
  const episodeCard = (v: WsVideo) => (
    <Card key={v.id} className="p-4">
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <span className="rounded-lg px-2.5 py-1 text-sm font-bold" style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}>
          Week {isoWeek(fromISO(v.week_start))}
        </span>
        <span className="text-xs tnum" style={{ color: 'var(--color-muted)' }}>{weekLabel(v.week_start)}</span>
        {statusPill(v)}
        <div className="ml-auto flex items-center gap-2">
          {v.status === 'ready' && (
            <Button className="text-xs px-3 py-1.5" onClick={() => patch(v, { status: 'published' })}>Mark as Published</Button>
          )}
          {v.link.trim() && (
            <a href={v.link} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-1.5 text-xs font-bold"
              style={{ background: '#dc2626', color: '#fff' }}>▶ Watch</a>
          )}
          <button
            onClick={() => confirmDelete({ label: `“${v.title || `Episode ${v.episode ?? ''}`}”`, onConfirm: () => void remove(v.id) })}
            style={{ color: 'var(--color-muted)' }} aria-label="Delete">
            <IconTrash width={15} height={15} />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_1fr] items-start">
        {/* Thumbnail + week mover */}
        <div className="flex flex-col gap-2">
          {thumbBox(v, true)}
          <div>
            <label className={labelCls} style={labelStyle}>Week of</label>
            <input type="date" value={v.week_start} onChange={(e) => { if (e.target.value) patch(v, { week_start: mondayISO(fromISO(e.target.value)) }) }}
              className="w-full rounded-lg px-2 py-1.5 text-xs outline-none tnum" style={wsField} />
          </div>
        </div>

        {/* Episode brief */}
        <div className="flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>Episode</h3>
            <input type="number" min={1} value={v.episode ?? ''} onChange={(e) => patch(v, { episode: e.target.value ? Number(e.target.value) : null })}
              className="w-16 rounded-lg px-2 py-1 text-sm font-bold outline-none tnum" style={wsField} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Channel</label>
            <p className="text-sm font-semibold" style={{ color: channel.name ? 'var(--color-text)' : 'var(--color-muted)' }}>
              {channel.name || 'Set the channel name up top'}
            </p>
          </div>
          {cfg.categories && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {VIDEO_CATEGORIES.map((c) => {
                const on = v.category === c
                return (
                  <button key={c} onClick={() => patch(v, { category: on ? '' : c })}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold transition"
                    style={{
                      background: on ? CAT_COLOR[c] : 'var(--color-bg)',
                      color: on ? '#fff' : 'var(--color-muted)',
                      border: `1px solid ${on ? CAT_COLOR[c] : 'var(--color-border)'}`,
                    }}>{c}</button>
                )
              })}
            </div>
          )}
          <div>
            <label className={labelCls} style={labelStyle}>Proposed title</label>
            <Input value={v.title} onChange={(e) => patch(v, { title: e.target.value })} placeholder="Working title…" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Description / talking points</label>
            <textarea value={v.description} onChange={(e) => patch(v, { description: e.target.value })} rows={5}
              placeholder={'What will this video be about?\nOne talking point per line…'}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none leading-relaxed" style={wsField} />
          </div>
          {statusChips(v)}
        </div>

        {/* Links */}
        <div className="flex flex-col gap-2.5 min-w-0">
          <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>Links</h3>
          <div>
            <label className={labelCls} style={labelStyle}>YouTube video link — pasting it marks the episode Published</label>
            {linkField(v.link, (s) => setLink(v, s), 'https://youtu.be/…')}
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Short-form clips (3) → Shorts + Reels</label>
            <div className="mt-1">{clipRows(v)}</div>
          </div>
        </div>
      </div>
    </Card>
  )

  /** Compact card for the short-form boards — tap to open, like Tasks. */
  const compactCard = (v: WsVideo) => {
    const open = expanded === v.id
    const img = v.thumb_path ? thumbs[v.thumb_path] : ''
    return (
      <Card key={v.id} className="overflow-hidden">
        <button onClick={() => setExpanded(open ? null : v.id)} className="w-full text-left">
          <div className="flex items-stretch gap-3">
            <div className="shrink-0 relative" style={{ width: 104, background: 'var(--color-bg)' }}>
              {img
                ? <img src={img} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} />
                : <div className="absolute inset-0 grid place-items-center" style={{ color: 'var(--color-muted)' }}><IconFilm width={18} height={18} /></div>}
            </div>
            <div className="flex-1 min-w-0 py-2.5 pr-3">
              <div className="flex items-center gap-1.5 flex-wrap">{statusPill(v)}</div>
              <p className="text-sm font-semibold mt-1 leading-snug" style={{ color: v.title ? 'var(--color-text)' : 'var(--color-muted)' }}>
                {v.title || 'Untitled — tap to plan'}
              </p>
              {!open && v.description && (
                <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-muted)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.description}</p>
              )}
            </div>
            {v.link.trim() && (
              <a href={v.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                className="self-center shrink-0 mr-3 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>▶ Watch</a>
            )}
          </div>
        </button>

        {open && (
          <div className="px-3 pb-3 pt-2 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-border)' }}>
            <Input value={v.title} onChange={(e) => patch(v, { title: e.target.value })} placeholder="Idea / title…" />
            <textarea value={v.description} onChange={(e) => patch(v, { description: e.target.value })} rows={3}
              placeholder="What is this video? Hook, angle, notes…"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
            <div className="flex items-center gap-2.5">
              <div className="w-32 shrink-0">{thumbBox(v, false)}</div>
              <div className="flex-1 min-w-0">
                <label className={labelCls} style={labelStyle}>Video link — pasting it marks it Published</label>
                {linkField(v.link, (s) => setLink(v, s), 'https://…')}
                <label className={`${labelCls} block mt-2`} style={labelStyle}>Week of</label>
                <input type="date" value={v.week_start} onChange={(e) => { if (e.target.value) patch(v, { week_start: mondayISO(fromISO(e.target.value)) }) }}
                  className="rounded-lg px-2 py-1.5 text-xs outline-none tnum" style={wsField} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {statusChips(v)}
              <button
                onClick={() => confirmDelete({ label: `“${v.title || 'this video'}”`, onConfirm: () => { void remove(v.id); setExpanded(null) } })}
                className="ml-auto" style={{ color: 'var(--color-muted)' }} aria-label="Delete">
                <IconTrash width={15} height={15} />
              </button>
            </div>
          </div>
        )}
      </Card>
    )
  }

  const saveChannel = async () => {
    await setSetting('yt_channel', JSON.stringify({ name: chName.trim(), url: chUrl.trim() }))
    setEditChannel(false)
  }

  return (
    <WsShell
      title={cfg.title}
      subtitle={cfg.subtitle}
      action={
        <div className="flex items-center gap-2">
          {board === 'youtube' && channel.url && (
            <a href={channel.url} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-border)' }}>
              Channel ↗
            </a>
          )}
          {board === 'youtube' && role === 'owner' && (
            <Button variant="outline" className="text-sm px-3" onClick={() => { setChName(channel.name); setChUrl(channel.url); setEditChannel(!editChannel) }}>
              {channel.name ? '✎' : 'Set channel'}
            </Button>
          )}
          <Button onClick={() => void addCard()}><IconPlus width={15} height={15} /> Plan a video</Button>
        </div>
      }
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void onThumbFile(e.target.files?.[0] ?? null); e.target.value = '' }} />

      {editChannel && (
        <Card className="p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={chName} onChange={(e) => setChName(e.target.value)} placeholder="Channel name (e.g. Creando en ALTO)" />
            <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder="Channel URL (https://youtube.com/@…)" />
            <Button onClick={() => void saveChannel()}>Save</Button>
          </div>
        </Card>
      )}

      {mine.length === 0 && (
        <Card className="p-6 text-center mb-4">
          <IconFilm width={28} height={28} style={{ margin: '0 auto 8px', color: 'var(--color-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Nothing planned yet. “Plan a video” starts week {isoWeek(fromISO(thisMonday))} — plan a few weeks ahead and this becomes the record of everything published.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {weeks.map(([weekIso, cards]) => {
          const isThisWeek = weekIso === thisMonday

          // YouTube: the week is the card. An uncovered current week renders
          // as a dashed invitation rather than a bare header.
          if (cfg.episodes) {
            if (cards.length === 0) {
              return (
                <Card key={weekIso} className="p-4" style={{ borderStyle: 'dashed' }}>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="rounded-lg px-2.5 py-1 text-sm font-bold" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
                      Week {isoWeek(fromISO(weekIso))}{isThisWeek ? ' — this week' : ''}
                    </span>
                    <span className="text-xs tnum" style={{ color: 'var(--color-muted)' }}>{weekLabel(weekIso)}</span>
                    <span className="text-[11px] font-bold" style={{ color: '#d97706' }}>nothing planned</span>
                    <button onClick={() => void addCard(weekIso)} className="text-xs font-semibold ml-auto" style={{ color: 'var(--color-accent)' }}>+ Plan this week</button>
                  </div>
                </Card>
              )
            }
            return cards.map(episodeCard)
          }

          // Short-form boards: week header + compact cards.
          return (
            <div key={weekIso}>
              <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                <h3 className="font-bold text-sm" style={{ color: isThisWeek ? 'var(--color-accent)' : 'var(--color-text)' }}>
                  Week {isoWeek(fromISO(weekIso))}{isThisWeek ? ' — this week' : ''}
                </h3>
                <span className="text-xs tnum" style={{ color: 'var(--color-muted)' }}>{weekLabel(weekIso)}</span>
                <button onClick={() => void addCard(weekIso)} className="text-xs font-semibold ml-auto" style={{ color: 'var(--color-accent)' }}>+ Add here</button>
              </div>
              {cards.length === 0 ? (
                <Card className="p-4 text-sm" style={{ color: 'var(--color-muted)', borderStyle: 'dashed' }}>
                  Open week — nothing scheduled.
                </Card>
              ) : (
                <div className="flex flex-col gap-2.5">{cards.map(compactCard)}</div>
              )}
            </div>
          )
        })}
      </div>
    </WsShell>
  )
}
