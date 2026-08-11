import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, PageHeader, Button, Input } from '../components/ui'
import { IconPlus, IconTrash, IconSearch, IconCheck } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useToast } from '../lib/toast'
import { useConfirmDelete } from '../lib/confirmDelete'
import { COMPANIES, companyById, type CompanyId } from '../lib/companies'

type Dept = { id: string; name: string }
type Status = 'green' | 'yellow' | 'red'
type Level = 'High' | 'Med' | 'Low'
type Rating = 'good' | 'needs' | 'bad'
type Member = { id: string; name: string; role: string; status?: Status; photo?: string }
type ListItem = {
  id: string; text: string; level?: Level
  fix?: string          // how we'll fix it / resolution
  owner?: string        // person responsible
  due?: string          // due date (YYYY-MM-DD)
  fixed?: boolean
  fixedOn?: string      // date it was fixed (YYYY-MM-DD)
  carry?: boolean       // carry forward to the next quarter until resolved
}
type Metrics = { goal?: number; onTime?: number; quality?: number; satisfaction?: number }
type Review = {
  status?: Status
  broken?: string; fixing?: string; owner?: string; due?: string; notes?: string
  description?: string
  leadName?: string; leadRole?: string; leadPhoto?: string
  feedback?: Rating; leadNotes?: string
  cost?: number; headcount?: number
  metrics?: Metrics
  summary?: string
  bottlenecks?: ListItem[]
  problems?: ListItem[]
  team?: Member[]
  hiring?: 'no' | 'maybe' | 'yes'
  sop?: string; costsNotes?: string; goals?: string
}

const SEED_DEPTS: Dept[] = [
  'Content', 'Ad spend', 'GHL', 'Appointment setter', 'Closer', 'Mortgage', 'Drafting',
  'Construction loans', 'T/C', 'Client communication', 'Permits, draws & payroll',
  'Scheduling / selections', 'QC / Runner', 'Accountant',
].map((name, i) => ({ id: `d${i}`, name }))

// One-time starting roster for South Texas Builders (names/roles only — photos
// get added in-app). Matched to departments by name; only fills empty leads.
const SEED_VERSION = 2 // bump to re-run the seed (e.g. after adding photos)
type SeedPerson = { name: string; role: string; photo?: string }
const SEED_LEADS: Partial<Record<CompanyId, Record<string, SeedPerson>>> = {
  stb: {
    'Appointment setter': { name: 'Graciela Leal', role: 'Appointment Setter Lead', photo: '/team/graciela-leal.jpg' },
    'Drafting': { name: 'Leeroy Flores', role: 'Drafting Team Lead', photo: '/team/leroy-flores.jpg' },
    'Scheduling / selections': { name: 'Ramiro Lerma', role: 'Scheduling Lead', photo: '/team/ramiro-lerma.jpg' },
    'Permits, draws & payroll': { name: 'Orlando Pena', role: 'Permits & Payroll Lead', photo: '/team/orlando-pena.jpg' },
    'T/C': { name: 'Nadia Benavides', role: 'T/C Lead', photo: '/team/nadia-benavides.jpg' },
  },
}
const SEED_TEAM: Partial<Record<CompanyId, Record<string, SeedPerson[]>>> = {
  stb: {
    'Mortgage': [
      { name: 'Andres Richarte', role: 'Mortgage Collaborator', photo: '/team/andres-richarte.jpg' },
      { name: 'Claudia Garza', role: 'Mortgage Collaborator', photo: '/team/claudia-garza.jpg' },
    ],
  },
}

const STATUS_META: Record<Status, { dot: string; label: string }> = {
  green: { dot: '#22c55e', label: 'On track' },
  yellow: { dot: '#eab308', label: 'Needs work' },
  red: { dot: '#ef4444', label: 'Broken' },
}
const STATUS_ORDER: Status[] = ['green', 'yellow', 'red']
// Company-picker stat tiles: department counts framed as On Track / Bottlenecks / Issues.
const PICKER_TILES: { status: Status; label: string }[] = [
  { status: 'green', label: 'On Track' },
  { status: 'yellow', label: 'Bottlenecks' },
  { status: 'red', label: 'Issues' },
]
const LEVELS: Level[] = ['High', 'Med', 'Low']
const levelColor: Record<Level, string> = { High: '#dc2626', Med: '#f59e0b', Low: '#ca8a04' }

const currentQuarter = () => { const d = new Date(); return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` }
const quarterLabel = (q: string) => q.replace('-', ' ')
const nextQuarter = (q: string) => { const [y, qq] = q.split('-Q').map(Number); return qq === 4 ? `${y + 1}-Q1` : `${y}-Q${qq + 1}` }
const fieldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }
const initials = (name: string) => (name || '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '+'
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDate = (iso?: string) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }

/** Downscale/center-crop any image blob to a small square JPEG data URL for avatars. */
async function toAvatarDataUrl(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const size = 240
  const scale = Math.max(size / bmp.width, size / bmp.height)
  const w = bmp.width * scale, h = bmp.height * scale
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h)
  bmp.close?.()
  return canvas.toDataURL('image/jpeg', 0.82)
}

/** Round avatar you can fill by uploading a saved file or pasting a copied image. */
function AvatarUpload({ src, name, size, onChange, actions }: { src?: string; name: string; size: number; onChange: (v: string) => void; actions?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const handle = async (blob?: Blob | null) => { if (blob && blob.type.startsWith('image/')) onChange(await toAvatarDataUrl(blob)) }
  const paste = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { await handle(await it.getType(t)); return } }
    } catch { /* clipboard blocked — use Upload instead */ }
  }
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <button onClick={() => ref.current?.click()} className="rounded-full overflow-hidden grid place-items-center" style={{ width: size, height: size, background: src ? 'transparent' : 'var(--color-accent)', color: 'var(--color-on-accent)', border: '1px solid var(--color-border)' }} title="Upload a photo">
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <span className="font-bold" style={{ fontSize: size * 0.38 }}>{initials(name)}</span>}
      </button>
      {actions && (
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <button onClick={() => ref.current?.click()} style={{ color: 'var(--color-accent)' }}>Upload</button>
          <button onClick={paste} style={{ color: 'var(--color-accent)' }}>Paste</button>
          {src && <button onClick={() => onChange('')} style={{ color: 'var(--color-muted)' }}>Remove</button>}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { void handle(e.target.files?.[0]); e.currentTarget.value = '' }} />
    </div>
  )
}
function fmtAgo(ts: number): string {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`
  return new Date(ts).toLocaleDateString()
}

/** Compact single status dropdown: dot + label + arrow. */
function StatusSelect({ value, onChange, compact }: { value?: Status; onChange: (s?: Status) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const cur = value ? STATUS_META[value] : null
  const openMenu = () => {
    const el = btnRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const width = Math.max(r.width, 160)
      const menuH = 8 + STATUS_ORDER.length * 34
      const below = window.innerHeight - r.bottom
      const top = below < menuH + 12 ? r.top - menuH - 4 : r.bottom + 4
      setPos({ left: Math.min(r.left, window.innerWidth - width - 8), top, width })
    }
    setOpen(true)
  }
  return (
    <>
      <button ref={btnRef} onClick={() => (open ? setOpen(false) : openMenu())} className={`inline-flex items-center justify-between gap-1.5 rounded-lg text-sm ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5 w-full'}`} style={fieldStyle}>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cur ? cur.dot : 'var(--color-border)' }} />
          <span className="truncate" style={{ color: cur ? 'var(--color-text)' : 'var(--color-muted)' }}>{cur ? cur.label : 'Set status'}</span>
        </span>
        <span className="text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>▾</span>
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed z-[70] rounded-lg p-1" style={{ left: pos.left, top: pos.top, width: pos.width, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
            {STATUS_ORDER.map((s) => (
              <button key={s} onClick={() => { onChange(value === s ? undefined : s); setOpen(false) }} className="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2" style={{ background: value === s ? 'var(--color-bg)' : 'transparent', color: 'var(--color-text)' }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[s].dot }} /> {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Toggle({ on, onClick }: { on?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative shrink-0 rounded-full transition" style={{ width: 34, height: 20, background: on ? 'var(--color-accent)' : 'var(--color-border)' }} aria-pressed={!!on}>
      <span className="absolute top-0.5 rounded-full transition-all" style={{ width: 16, height: 16, background: '#fff', left: on ? 16 : 2 }} />
    </button>
  )
}

const fieldSm = { ...fieldStyle, borderRadius: 8 }
const miniLabel = 'text-[11px] font-semibold uppercase tracking-[0.08em] mb-1 block'

/** A textarea that grows to fit its content so long descriptions stay readable. */
function GrowTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }, [value])
  return (
    <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`resize-none overflow-hidden rounded-lg px-2.5 py-1.5 text-sm outline-none leading-snug ${className ?? ''}`} style={fieldSm} />
  )
}

function ListEditor({ items, onChange }: { items?: ListItem[]; onChange: (items: ListItem[]) => void }) {
  const list = items ?? []
  const upd = (id: string, patch: Partial<ListItem>) => onChange(list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const toggleFixed = (it: ListItem) => upd(it.id, it.fixed ? { fixed: false } : { fixed: true, fixedOn: it.fixedOn ?? todayISO() })
  return (
    <div className="flex flex-col gap-3">
      {list.map((it, i) => {
        return (
          <div key={it.id} className="rounded-xl p-3" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            {/* What it is + severity */}
            <div className="flex items-start gap-2">
              <span className="text-sm tnum w-4 shrink-0 pt-1.5" style={{ color: 'var(--color-muted)' }}>{i + 1}</span>
              <GrowTextarea value={it.text} onChange={(v) => upd(it.id, { text: v })} placeholder="Describe it…" className="flex-1 min-w-0" />
              <div className="flex gap-1 shrink-0 pt-0.5">
                {LEVELS.map((lv) => (
                  <button key={lv} onClick={() => upd(it.id, { level: lv })} className="text-[11px] font-semibold px-2 py-1 rounded-md" style={it.level === lv ? { background: `color-mix(in srgb, ${levelColor[lv]} 16%, var(--color-surface))`, color: levelColor[lv], border: `1px solid ${levelColor[lv]}` } : { background: 'var(--color-bg)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{lv}</button>
                ))}
              </div>
              <button onClick={() => onChange(list.filter((x) => x.id !== it.id))} title="Remove" className="shrink-0 rounded-md p-1 mt-0.5" style={{ color: 'var(--color-muted)' }}><IconTrash width={14} height={14} /></button>
            </div>

            {/* Plan */}
            <div className="mt-3 pl-6">
              <label className={miniLabel} style={{ color: 'var(--color-muted)' }}>{it.fixed ? 'Resolution' : 'How we’ll fix it'}</label>
              <GrowTextarea value={it.fix ?? ''} onChange={(v) => upd(it.id, { fix: v })} placeholder={it.fixed ? 'What fixed it…' : 'The plan…'} className="w-full" />
            </div>

            {/* Fixed toggle + carry forward */}
            <div className="flex items-center justify-between gap-3 mt-3 pl-6 flex-wrap">
              <button onClick={() => toggleFixed(it)} className="inline-flex items-center gap-2 text-sm">
                <span className="h-5 w-5 rounded-md grid place-items-center shrink-0" style={{ border: it.fixed ? '2px solid #16a34a' : '2px solid var(--color-border)', background: it.fixed ? '#16a34a' : 'transparent' }}>
                  {it.fixed && <IconCheck width={12} height={12} style={{ color: '#fff' }} />}
                </span>
                {it.fixed
                  ? <span className="font-semibold" style={{ color: '#16a34a' }}>Fixed{it.fixedOn ? ` on ${fmtDate(it.fixedOn)}` : ''}</span>
                  : <span style={{ color: 'var(--color-muted)' }}>Mark fixed</span>}
              </button>
              <label className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                <span>Carry to next quarter</span>
                <Toggle on={it.carry} onClick={() => upd(it.id, { carry: !it.carry })} />
              </label>
            </div>
          </div>
        )
      })}
      <button onClick={() => onChange([...list, { id: uid('li'), text: '', level: 'Med' }])} className="text-sm font-semibold self-start inline-flex items-center gap-1 mt-1" style={{ color: 'var(--color-accent)' }}><IconPlus width={14} height={14} /> Add</button>
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <h3 className="text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-muted)' }}>{title}</h3>
    {children}
  </div>
)
const TextArea = (p: { value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <textarea value={p.value ?? ''} onChange={(e) => p.onChange(e.target.value)} rows={p.rows ?? 5} placeholder={p.placeholder} className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-y" style={fieldStyle} />
)

export default function Companies() {
  const { toast } = useToast()
  const confirmDelete = useConfirmDelete()
  // Departments are per-company (deleting one from a company no longer affects
  // the others). `companies.depts` was the old shared list — kept only to
  // migrate/restore from.
  const [deptsByCompany, setDeptsByCompany] = useStore<Record<string, Dept[]>>('companies.deptsByCompany', {})
  const [legacyDepts] = useStore<Dept[]>('companies.depts', SEED_DEPTS)
  const [deptsMigrated, setDeptsMigrated] = useStore<number>('companies.deptsMigrated', 0)
  const [reviews, setReviews] = useStore<Record<string, Review>>('companies.reviews', {})
  const [quarters, setQuarters] = useStore<string[]>('companies.quarters', [currentQuarter()])
  const [savedAt, setSavedAt] = useStore<number>('companies.savedAt', 0)

  const [seeded, setSeeded] = useStore<Record<string, number>>('companies.seeded', {})
  const [selected, setSelected] = useState<CompanyId | null>(null)
  const [quarter, setQuarter] = useState<string>(quarters[0] ?? currentQuarter())
  const [deptSel, setDeptSel] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editDepts, setEditDepts] = useState(false)
  const [newDept, setNewDept] = useState('')
  const [, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t) }, [])

  // The department list for a given company (falls back to the original set).
  const deptsFor = (co: CompanyId): Dept[] => deptsByCompany[co] ?? SEED_DEPTS
  const depts = selected ? deptsFor(selected) : SEED_DEPTS
  const setDepts = (updater: (prev: Dept[]) => Dept[]) => {
    if (!selected) return
    setDeptsByCompany((prev) => ({ ...prev, [selected]: updater(prev[selected] ?? SEED_DEPTS) }))
  }

  // One-time restore: give every company its own department list, seeded with
  // all the original departments. Reviews are keyed by the stable department id
  // (d0…d13), so restoring a previously-deleted department reconnects the data
  // that was saved under it. Any custom-added departments and renames are kept.
  const DEPTS_MIGRATION = 1
  useEffect(() => {
    if (deptsMigrated >= DEPTS_MIGRATION) return
    const base = legacyDepts && legacyDepts.length ? legacyDepts : SEED_DEPTS
    const byId = Object.fromEntries(base.map((d) => [d.id, d]))
    const restored: Dept[] = [
      ...SEED_DEPTS.map((s) => byId[s.id] ?? s),                                  // all originals (renames kept)
      ...base.filter((d) => !SEED_DEPTS.some((s) => s.id === d.id)),             // custom additions
    ]
    setDeptsByCompany((prev) => {
      const next = { ...prev }
      for (const c of COMPANIES) {
        const existing = next[c.id]
        if (!existing || existing.length === 0) {
          next[c.id] = restored.map((d) => ({ ...d }))
        } else {
          const have = new Set(existing.map((d) => d.id))
          const merged = [...existing]
          for (const s of SEED_DEPTS) if (!have.has(s.id)) merged.push({ ...s })
          next[c.id] = merged
        }
      }
      return next
    })
    setDeptsMigrated(DEPTS_MIGRATION)
    setSavedAt(Date.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptsMigrated])

  // Seed the starting roster once per company (only fills empty fields).
  useEffect(() => {
    if (!selected || (Number(seeded[selected]) || 0) >= SEED_VERSION) return
    const leads = SEED_LEADS[selected]
    const teams = SEED_TEAM[selected]
    if (!leads && !teams) return
    setReviews((prev) => {
      const next = { ...prev }
      for (const d of depts) {
        const k = `${selected}|${quarter}|${d.id}`
        const cur = next[k] ?? {}
        const lead = leads?.[d.name]
        const team = teams?.[d.name]
        let patched = cur
        if (lead) {
          if (!cur.leadName) patched = { ...patched, leadName: lead.name, leadRole: lead.role }
          if (!cur.leadPhoto && lead.photo) patched = { ...patched, leadPhoto: lead.photo }
        }
        if (team) {
          if (!cur.team || cur.team.length === 0) {
            patched = { ...patched, team: team.map((m) => ({ id: uid('m'), name: m.name, role: m.role, photo: m.photo })) }
          } else {
            const byName = Object.fromEntries(team.map((m) => [m.name, m]))
            const updated = cur.team.map((x) => (!x.photo && byName[x.name]?.photo ? { ...x, photo: byName[x.name].photo } : x))
            if (updated.some((x, i) => x !== cur.team![i])) patched = { ...patched, team: updated }
          }
        }
        if (patched !== cur) next[k] = patched
      }
      return next
    })
    setSeeded((prev) => ({ ...prev, [selected]: SEED_VERSION }))
    setSavedAt(Date.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const sortedQuarters = useMemo(() => [...quarters].sort((a, b) => b.localeCompare(a)), [quarters])
  const key = (co: CompanyId, q: string, d: string) => `${co}|${q}|${d}`
  const getReview = (co: CompanyId, q: string, d: string): Review => reviews[key(co, q, d)] ?? {}
  const setReview = (d: string, patch: Review) => {
    if (!selected) return
    setReviews((prev) => ({ ...prev, [key(selected, quarter, d)]: { ...prev[key(selected, quarter, d)], ...patch } }))
    setSavedAt(Date.now())
  }
  const counts = (co: CompanyId, q: string) => {
    const c = { green: 0, yellow: 0, red: 0 }
    for (const d of deptsFor(co)) { const s = getReview(co, q, d.id).status; if (s) c[s]++ }
    return c
  }
  // A new quarter inherits the roster (lead, team, photos, headcount) so you
  // never re-upload people, plus any bottleneck/problem flagged "carry to next
  // quarter" that isn't fixed yet — so open issues follow you until resolved.
  // The rest of the assessment (status, feedback, goals, summary) starts blank
  // so each quarter is a fresh evaluation you can compare against the last.
  const carryList = (items?: ListItem[]): ListItem[] =>
    (items ?? [])
      .filter((x) => x.carry && !x.fixed && x.text.trim())
      .map((x) => ({ id: uid('li'), text: x.text, level: x.level, fix: x.fix, owner: x.owner, due: x.due, carry: true }))
  const carryOver = (r: Review): Review => {
    const out: Review = {}
    if (r.leadName) out.leadName = r.leadName
    if (r.leadRole) out.leadRole = r.leadRole
    if (r.leadPhoto) out.leadPhoto = r.leadPhoto
    if (r.headcount) out.headcount = r.headcount
    if (r.cost) out.cost = r.cost
    if (r.team && r.team.length) out.team = r.team.map((m) => ({ id: uid('m'), name: m.name, role: m.role, photo: m.photo }))
    const bl = carryList(r.bottlenecks); if (bl.length) out.bottlenecks = bl
    const pl = carryList(r.problems); if (pl.length) out.problems = pl
    return out
  }
  const addQuarter = () => {
    const latest = sortedQuarters[0] ?? currentQuarter()
    const q = nextQuarter(latest)
    if (quarters.includes(q)) { setQuarter(q); return }
    if (selected) {
      let carried = false
      setReviews((prev) => {
        const next = { ...prev }
        for (const d of depts) {
          const src = prev[key(selected, latest, d.id)]
          if (src) { next[key(selected, q, d.id)] = carryOver(src); carried = true }
        }
        return next
      })
      if (carried) toast(`Carried the team & leads over from ${quarterLabel(latest)}`)
    }
    setQuarters((prev) => [...prev, q])
    setQuarter(q)
    setSavedAt(Date.now())
  }
  const addDept = () => { const n = newDept.trim(); if (!n) return; const id = uid('d'); setDepts((prev) => [...prev, { id, name: n }]); setNewDept(''); setDeptSel(id); setSavedAt(Date.now()) }

  // ---------- Company picker ----------
  if (!selected) {
    return (
      <div>
        <PageHeader title="Companies" subtitle="A quarterly operating review for each company — evaluate every department and leader, then decide what to fix, staff, or grow." />
        <div className="grid sm:grid-cols-2 gap-5">
          {COMPANIES.map((c) => {
            const cnt = counts(c.id, quarter)
            return (
              <Card key={c.id} className="p-5 cursor-pointer transition hover:scale-[1.01]">
                <button onClick={() => { setSelected(c.id); setDeptSel(depts[0]?.id ?? null) }} className="w-full text-left">
                  <div className="flex items-center gap-3 mb-5">
                    <img src={c.logo} alt={c.name} className="object-contain shrink-0" style={{ height: 44, width: 'auto', maxWidth: 72 }} draggable={false} />
                    <div className="min-w-0">
                      <div className="text-xl font-bold leading-tight truncate" style={{ color: 'var(--color-text)' }}>{c.name}</div>
                      <div className="text-base" style={{ color: 'var(--color-muted)' }}>{quarterLabel(quarter)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {PICKER_TILES.map(({ status, label }) => (
                      <div key={status} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: STATUS_META[status].dot }} />
                        <div className="min-w-0">
                          <div className="text-xl font-bold leading-none tnum" style={{ color: STATUS_META[status].dot }}>{cnt[status]}</div>
                          <div className="text-xs mt-1 truncate" style={{ color: 'var(--color-muted)' }}>{label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold" style={{ border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>Open review →</span>
                </button>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- Company operating review ----------
  const co = companyById(selected)!
  const cnt = counts(selected, quarter)
  const visibleDepts = depts.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
  const activeId = deptSel ?? depts[0]?.id ?? null
  const dept = depts.find((d) => d.id === activeId) ?? null
  const r: Review = dept ? getReview(selected, quarter, dept.id) : {}
  const set = (patch: Review) => { if (dept) setReview(dept.id, patch) }
  const leadFirst = (r.leadName || '').split(' ')[0]

  return (
    <div>
      {/* Header */}
      <Card className="px-5 py-4 mb-4 flex items-center gap-4 flex-wrap">
        <button onClick={() => setSelected(null)} className="text-sm font-semibold inline-flex items-center gap-1 shrink-0" style={{ color: 'var(--color-accent)' }}>‹</button>
        <img src={co.logo} alt={co.name} className="object-contain" style={{ height: 30, width: 'auto', maxWidth: 120 }} draggable={false} />
        <h1 className="text-xl font-semibold leading-tight flex-1 min-w-[120px]" style={{ color: 'var(--color-text)' }}>{co.name}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="rounded-xl px-3 py-2 text-sm outline-none font-semibold" style={fieldStyle}>
            {sortedQuarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
          </select>
          <Button variant="outline" onClick={addQuarter}><IconPlus width={15} height={15} /> New quarter</Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3 px-1">
        <div className="flex items-center gap-4 text-sm">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--color-text)' }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[s].dot }} />{cnt[s]} <span className="font-normal" style={{ color: 'var(--color-muted)' }}>{STATUS_META[s].label}</span>
            </span>
          ))}
        </div>
        {savedAt > 0 && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Last saved {fmtAgo(savedAt)}</span>}
      </div>

      <div className="grid lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_290px] gap-4 items-start">
        {/* Department sidebar */}
        <Card className="p-2 lg:sticky lg:top-3">
          <div className="relative mb-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }}><IconSearch width={14} height={14} /></span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search departments…" className="w-full rounded-lg pl-8 pr-2 py-2 text-sm outline-none" style={fieldStyle} />
          </div>
          <ul className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
            {visibleDepts.map((d) => {
              const st = getReview(selected, quarter, d.id).status
              const active = d.id === activeId
              return (
                <li key={d.id}>
                  <button onClick={() => setDeptSel(d.id)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm" style={{ background: active ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : 'transparent', color: 'var(--color-text)', fontWeight: active ? 600 : 450 }}>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: st ? STATUS_META[st].dot : 'var(--color-border)' }} />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>›</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 pt-2 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex gap-1.5">
              <input value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addDept() }} placeholder="Add department…" className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm outline-none" style={fieldStyle} />
              <button onClick={addDept} className="shrink-0 rounded-lg px-2" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}><IconPlus width={15} height={15} /></button>
            </div>
            <button onClick={() => setEditDepts((v) => !v)} className="text-xs font-semibold text-left px-1" style={{ color: 'var(--color-accent)' }}>{editDepts ? 'Done editing' : 'Edit / delete departments'}</button>
            {editDepts && (
              <ul className="flex flex-col gap-1 mt-1">
                {depts.map((d) => (
                  <li key={d.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg" style={{ background: 'var(--color-bg)' }}>
                    <input value={d.name} onChange={(e) => { setDepts((prev) => prev.map((x) => x.id === d.id ? { ...x, name: e.target.value } : x)); setSavedAt(Date.now()) }} placeholder="Department name" className="flex-1 min-w-0 bg-transparent text-xs outline-none" style={{ color: 'var(--color-text)' }} />
                    <button onClick={() => confirmDelete({ label: d.name ? `the “${d.name}” department` : 'this department', detail: 'This department and its review will be removed.', onConfirm: () => { setDepts((prev) => prev.filter((x) => x.id !== d.id)); if (activeId === d.id) setDeptSel(null); setSavedAt(Date.now()) } })} title="Delete department" aria-label="Delete department" className="shrink-0 rounded-md p-1 transition" style={{ color: '#dc2626', background: 'color-mix(in srgb, #dc2626 12%, var(--color-surface))' }}><IconTrash width={14} height={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Main detail */}
        {!dept ? (
          <Card className="p-8 text-center" style={{ color: 'var(--color-muted)' }}>Add a department to start the review.</Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{dept.name}</h2>
              <div className="flex items-center gap-2">
                <div className="w-[160px]"><StatusSelect value={r.status} onChange={(s) => set({ status: s })} /></div>
                <button onClick={() => confirmDelete({ label: dept.name ? `the “${dept.name}” department` : 'this department', detail: 'This department and its review will be removed.', onConfirm: () => { setDepts((prev) => prev.filter((x) => x.id !== dept.id)); setDeptSel(null); setSavedAt(Date.now()) } })} title="Delete department" aria-label="Delete department" className="shrink-0 rounded-lg p-2 transition" style={{ color: '#dc2626', background: 'color-mix(in srgb, #dc2626 10%, var(--color-surface))' }}><IconTrash width={16} height={16} /></button>
              </div>
            </div>
            <Section title="Bottlenecks"><ListEditor items={r.bottlenecks} onChange={(items) => set({ bottlenecks: items })} /></Section>
            <Section title="Problems"><ListEditor items={r.problems} onChange={(items) => set({ problems: items })} /></Section>

            <Section title="Goals for the quarter"><TextArea value={r.goals} onChange={(v) => set({ goals: v })} rows={6} placeholder="What this department must achieve…" /></Section>

            <Section title="Quick summary">
              <TextArea value={r.summary} onChange={(v) => set({ summary: v })} rows={3} placeholder="Key takeaways this quarter…" />
            </Section>
          </Card>
        )}

        {/* Right rail: leader, team, hiring */}
        {dept && (
          <div className="flex flex-col gap-4 xl:sticky xl:top-3">
            <Card className="p-4">
              <h3 className="font-bold mb-3" style={{ color: 'var(--color-text)' }}>Department lead</h3>
              <div className="flex items-start gap-3 mb-2">
                <AvatarUpload src={r.leadPhoto} name={r.leadName ?? ''} size={56} onChange={(v) => set({ leadPhoto: v || undefined })} actions />
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <Input value={r.leadName ?? ''} onChange={(e) => set({ leadName: e.target.value })} placeholder="Lead name" />
                  <Input value={r.leadRole ?? ''} onChange={(e) => set({ leadRole: e.target.value })} placeholder="Role (e.g. Content Lead)" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm mb-2" style={{ color: 'var(--color-muted)' }}>How is {leadFirst || 'the lead'} doing?</p>
                <div className="grid grid-cols-3 gap-2">
                  {([['good', '👍', 'Good', '#16a34a'], ['needs', '😐', 'Needs work', '#d97706'], ['bad', '👎', 'Bad', '#dc2626']] as const).map(([val, emoji, label, color]) => (
                    <button key={val} onClick={() => set({ feedback: r.feedback === val ? undefined : val })} className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition" style={r.feedback === val ? { background: `color-mix(in srgb, ${color} 14%, var(--color-surface))`, border: `1px solid ${color}`, color } : { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                      <span className="text-lg leading-none">{emoji}</span><span className="text-[11px] font-semibold">{label}</span>
                    </button>
                  ))}
                </div>
                <textarea value={r.leadNotes ?? ''} onChange={(e) => set({ leadNotes: e.target.value })} rows={3} placeholder={`Notes about ${leadFirst || 'the lead'}…`} className="w-full mt-3 rounded-xl px-3 py-2 text-sm outline-none resize-y" style={fieldStyle} />
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-bold mb-3" style={{ color: 'var(--color-text)' }}>Team ({(r.team ?? []).length})</h3>
              <ul className="flex flex-col gap-2">
                {(r.team ?? []).map((m) => (
                  <li key={m.id} className="group flex items-center gap-2">
                    <AvatarUpload src={m.photo} name={m.name} size={34} onChange={(v) => set({ team: (r.team ?? []).map((x) => x.id === m.id ? { ...x, photo: v || undefined } : x) })} />
                    <div className="flex-1 min-w-0">
                      <input value={m.name} onChange={(e) => set({ team: (r.team ?? []).map((x) => x.id === m.id ? { ...x, name: e.target.value } : x) })} placeholder="Name" className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: 'var(--color-text)' }} />
                      <input value={m.role} onChange={(e) => set({ team: (r.team ?? []).map((x) => x.id === m.id ? { ...x, role: e.target.value } : x) })} placeholder="Role" className="w-full bg-transparent text-xs outline-none" style={{ color: 'var(--color-muted)' }} />
                    </div>
                    <div className="w-[130px] shrink-0"><StatusSelect value={m.status} onChange={(s) => set({ team: (r.team ?? []).map((x) => x.id === m.id ? { ...x, status: s } : x) })} compact /></div>
                    <button onClick={() => set({ team: (r.team ?? []).filter((x) => x.id !== m.id) })} className="opacity-0 group-hover:opacity-60 shrink-0" style={{ color: 'var(--color-muted)' }}><IconTrash width={13} height={13} /></button>
                  </li>
                ))}
              </ul>
              <button onClick={() => set({ team: [...(r.team ?? []), { id: uid('m'), name: '', role: '' }] })} className="text-sm font-semibold inline-flex items-center gap-1 mt-3" style={{ color: 'var(--color-accent)' }}><IconPlus width={14} height={14} /> Add team member</button>
            </Card>

            <Card className="p-4">
              <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>Hiring need</h3>
              <p className="text-sm mb-3" style={{ color: 'var(--color-muted)' }}>Do you need to hire for this department?</p>
              <div className="grid grid-cols-3 gap-2">
                {([['no', 'No need'], ['maybe', 'Maybe'], ['yes', 'Yes, hire']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => set({ hiring: r.hiring === val ? undefined : val })} className="py-2 rounded-xl text-sm font-semibold transition" style={r.hiring === val ? (val === 'yes' ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' } : { background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }) : { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>{label}</button>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
