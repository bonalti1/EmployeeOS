import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Button, Input } from '../../components/ui'
import { IconCheck, IconPlus, IconTrash, IconFilm } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useWorkspace, useWsTable, VIDEO_CATEGORIES, ASSISTANT_NAME, type WsVideo, type WsClip } from '../../lib/workspace'
import { uploadThumb, thumbUrl } from '../../lib/wsPhotos'

/**
 * Video planner — three content pipelines on one board engine.
 *
 * The unit of planning is the WEEK, not the day: the whole point is standing
 * in week 39 and seeing weeks 40–45 already spoken for. Cards are grouped
 * under week headers, the current week is always shown even when empty (an
 * empty current week is the loudest thing on the page), and on YouTube —
 * which runs one long-form video a week — each week says plainly whether it
 * is covered. The short-form boards take as many cards a week as they get.
 *
 * A card is born as an idea (title, category, what it will be about), grows a
 * candidate thumbnail, and graduates when the final link is pasted — which
 * flips it to Published and turns the card into a one-tap door to the video.
 * YouTube cards also carry their three short-form clips (idea + Shorts +
 * Reels links), because the clips exist to feed the episode, not on their own.
 */

type BoardId = WsVideo['board']

const BOARDS: Record<BoardId, {
  title: string
  subtitle: string
  addLabel: string
  episodes: boolean       // numbered long-form episodes
  categories: boolean     // Lifestyle / Business / Construction pillars
  clips: boolean          // 3 short-form clips per card
  quota: number           // videos expected per week (0 = no quota)
}> = {
  youtube: {
    title: 'YouTube',
    subtitle: 'One video a week — planned episodes, thumbnails, and the three clips each one feeds',
    addLabel: 'Plan an episode',
    episodes: true, categories: true, clips: true, quota: 1,
  },
  stb_tiktok: {
    title: 'STB TikTok',
    subtitle: 'Short-form pipeline for STB — ideas in, links out',
    addLabel: 'Plan a video',
    episodes: false, categories: false, clips: false, quota: 0,
  },
  personal: {
    title: 'Personal Brand',
    subtitle: `Marca Personal — ${ASSISTANT_NAME}'s own pipeline`,
    addLabel: 'Plan a video',
    episodes: false, categories: false, clips: false, quota: 0,
  },
}

const STATUS: { id: WsVideo['status']; label: string; color: string }[] = [
  { id: 'planning', label: 'Planning', color: '#d97706' },
  { id: 'ready', label: 'Ready', color: '#2563eb' },
  { id: 'published', label: 'Published', color: '#16a34a' },
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

export default function WsPlanner({ board }: { board: BoardId }) {
  const cfg = BOARDS[board]
  const { role } = useWorkspace()
  const { rows, insert, update, remove } = useWsTable<WsVideo>('ws_videos')
  const confirmDelete = useConfirmDelete()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fileFor = useRef<WsVideo | null>(null)

  const thisMonday = mondayISO(new Date())
  const mine = useMemo(() => (rows ?? []).filter((v) => v.board === board), [rows, board])

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
    if (row) setExpanded(row.id)
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
      setThumbs((t) => ({ ...t, [path]: url ? `${url}` : '' }))
      patch(v, { thumb_path: path })
    }
    setUploading('')
  }

  const setClip = (v: WsVideo, i: number, values: Partial<WsClip>) => {
    const clips = (v.clips?.length ? [...v.clips] : emptyClips())
    clips[i] = { ...clips[i], ...values }
    patch(v, { clips })
  }

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

  const renderCard = (v: WsVideo) => {
    const open = expanded === v.id
    const st = statusOf(v.status)
    const img = v.thumb_path ? thumbs[v.thumb_path] : ''
    const clips = v.clips?.length ? v.clips : emptyClips()
    const posted = clips.filter(clipDone).length

    return (
      <Card key={v.id} className="overflow-hidden">
        {/* Collapsed face: thumbnail-led, readable from across the room */}
        <button onClick={() => setExpanded(open ? null : v.id)} className="w-full text-left">
          <div className="flex items-stretch gap-3">
            <div className="shrink-0 relative" style={{ width: 118, background: 'var(--color-bg)' }}>
              {img
                ? <img src={img} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} />
                : <div className="absolute inset-0 grid place-items-center" style={{ color: 'var(--color-muted)' }}><IconFilm width={20} height={20} /></div>}
            </div>
            <div className="flex-1 min-w-0 py-2.5 pr-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {cfg.episodes && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
                    EP {v.episode ?? '—'}
                  </span>
                )}
                {v.category && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: CAT_COLOR[v.category] }}>{v.category}</span>
                )}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${st.color} 14%, transparent)`, color: st.color }}>{st.label}</span>
                {cfg.clips && <span className="text-[10px] tnum" style={{ color: 'var(--color-muted)' }}>clips {posted}/3</span>}
              </div>
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
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
                ▶ Watch
              </a>
            )}
          </div>
        </button>

        {open && (
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex gap-2 mt-2">
              {cfg.episodes && (
                <div className="w-20 shrink-0">
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-muted)' }}>Episode</label>
                  <input type="number" min={1} value={v.episode ?? ''} onChange={(e) => patch(v, { episode: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg px-2 py-1.5 text-sm outline-none tnum" style={wsField} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-muted)' }}>Week</label>
                <input type="date" value={v.week_start} onChange={(e) => { if (e.target.value) patch(v, { week_start: mondayISO(fromISO(e.target.value)) }) }}
                  className="w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={wsField} />
              </div>
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

            <Input value={v.title} onChange={(e) => patch(v, { title: e.target.value })} placeholder="Possible title…" />
            <textarea value={v.description} onChange={(e) => patch(v, { description: e.target.value })} rows={3}
              placeholder="What will this video be about?"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />

            {/* Candidate thumbnail */}
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg overflow-hidden relative shrink-0" style={{ width: 128, aspectRatio: '16 / 9', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                {img
                  ? <img src={img} alt="Thumbnail" className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} />
                  : <div className="absolute inset-0 grid place-items-center text-[10px]" style={{ color: 'var(--color-muted)' }}>No thumbnail</div>}
              </div>
              <Button variant="outline" className="text-xs" onClick={() => pickThumb(v)} disabled={uploading === v.id}>
                {uploading === v.id ? 'Uploading…' : img ? 'Replace thumbnail' : 'Add thumbnail idea'}
              </Button>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-muted)' }}>Final video link — pasting it marks the card Published</label>
              {linkField(v.link, (s) => setLink(v, s), 'https://…')}
            </div>

            {cfg.clips && (
              <div>
                <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-muted)' }}>3 clips from this video → Shorts + Reels</label>
                <div className="flex flex-col gap-2 mt-1">
                  {clips.map((c, i) => (
                    <div key={i} className="rounded-xl p-2 flex flex-col gap-1.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      <div className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded grid place-items-center shrink-0"
                          style={{ background: clipDone(c) ? '#16a34a' : 'var(--color-surface)', border: clipDone(c) ? 'none' : '1.5px solid var(--color-border)' }}>
                          {clipDone(c) && <IconCheck width={10} height={10} style={{ color: '#fff' }} />}
                        </span>
                        <input value={c.idea} onChange={(e) => setClip(v, i, { idea: e.target.value })} placeholder={`Clip ${i + 1} — the hook / moment…`}
                          className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ ...wsField, background: 'var(--color-surface)' }} />
                      </div>
                      <div className="flex gap-1.5 pl-6 flex-col sm:flex-row">
                        {linkField(c.shorts, (s) => setClip(v, i, { shorts: s }), 'YouTube Shorts link')}
                        {linkField(c.reels, (s) => setClip(v, i, { reels: s }), 'Instagram Reels link')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              {STATUS.map((sOpt) => (
                <button key={sOpt.id} onClick={() => patch(v, { status: sOpt.id })}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition"
                  style={{
                    background: v.status === sOpt.id ? sOpt.color : 'var(--color-bg)',
                    color: v.status === sOpt.id ? '#fff' : 'var(--color-muted)',
                    border: `1px solid ${v.status === sOpt.id ? sOpt.color : 'var(--color-border)'}`,
                  }}>{sOpt.label}</button>
              ))}
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

  return (
    <WsShell
      title={cfg.title}
      subtitle={cfg.subtitle}
      action={<Button onClick={() => void addCard()}><IconPlus width={15} height={15} /> {cfg.addLabel}</Button>}
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void onThumbFile(e.target.files?.[0] ?? null); e.target.value = '' }} />

      {mine.length === 0 && (
        <Card className="p-6 text-center mb-4">
          <IconFilm width={28} height={28} style={{ margin: '0 auto 8px', color: 'var(--color-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Nothing planned yet. “{cfg.addLabel}” starts week {isoWeek(fromISO(thisMonday))} — plan a few weeks ahead and this becomes the record of everything published.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-5">
        {weeks.map(([weekIso, cards]) => {
          const isThisWeek = weekIso === thisMonday
          const covered = cfg.quota > 0 && cards.length >= cfg.quota
          return (
            <div key={weekIso}>
              <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                <h3 className="font-bold text-sm" style={{ color: isThisWeek ? 'var(--color-accent)' : 'var(--color-text)' }}>
                  Week {isoWeek(fromISO(weekIso))}{isThisWeek ? ' — this week' : ''}
                </h3>
                <span className="text-xs tnum" style={{ color: 'var(--color-muted)' }}>{weekLabel(weekIso)}</span>
                {cfg.quota > 0 && (
                  <span className="text-[11px] font-bold" style={{ color: covered ? '#16a34a' : '#d97706' }}>
                    {covered ? '✓ planned' : 'nothing planned'}
                  </span>
                )}
                <button onClick={() => void addCard(weekIso)} className="text-xs font-semibold ml-auto" style={{ color: 'var(--color-accent)' }}>+ Add here</button>
              </div>
              {cards.length === 0 ? (
                <Card className="p-4 text-sm" style={{ color: 'var(--color-muted)', borderStyle: 'dashed' }}>
                  Open week — nothing scheduled.
                </Card>
              ) : (
                <div className="flex flex-col gap-2.5">{cards.map(renderCard)}</div>
              )}
            </div>
          )
        })}
      </div>
    </WsShell>
  )
}
