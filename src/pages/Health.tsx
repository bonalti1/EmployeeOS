import { useMemo, useState } from 'react'
import { Card, PageHeader, Button, Input, EmptyState } from '../components/ui'
import { IconPlus, IconTrash, IconHealth, IconSearch } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useConfirmDelete } from '../lib/confirmDelete'
import { putFile, getFile, delFile } from '../lib/fileStore'

type Weigh = { id: string; date: string; value: number; bodyFat?: number }
type Record_ = { id: string; date: string; kind: string; title: string; notes: string; file?: { name: string; data: string } }
type Goals = { goalWeight?: number; heightIn?: number }
// DEXA / body-composition scan. Metrics are stored in pounds; the file (PDF or
// image of the report) lives in IndexedDB keyed by this id.
type Scan = {
  id: string; date: string
  bodyFatPct?: number; leanLbs?: number; fatLbs?: number; totalLbs?: number
  hasFile?: boolean; fileName?: string; fileType?: string
}

const RECORD_KINDS = ['Doctor visit', 'Lab result', 'Prescription', 'Vaccine', 'Other']
const fieldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

const clean = (v: number | undefined): number | undefined =>
  v == null || isNaN(v) ? undefined : +v.toFixed(1)
const readAsDataURL = (file: File): Promise<string> =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(file) })

/** A signed change vs the previous scan, colored by whether it's an improvement. */
function Delta({ cur, prev, unit, goodDown }: { cur?: number; prev?: number; unit: string; goodDown?: boolean }) {
  if (cur == null || prev == null) return null
  const d = +(cur - prev).toFixed(1)
  if (d === 0) return <span className="text-xs" style={{ color: 'var(--color-muted)' }}>±0</span>
  const neutral = goodDown === undefined
  const improved = goodDown ? d < 0 : d > 0
  const color = neutral ? 'var(--color-muted)' : improved ? '#2f9266' : '#d97a7a'
  return <span className="text-xs font-semibold" style={{ color }}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}{unit}</span>
}

function WeightChart({ data, goal }: { data: Weigh[]; goal?: number }) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 1) return <div className="h-40 grid place-items-center text-sm" style={{ color: 'var(--color-muted)' }}>Log a weight to see your trend.</div>
  const w = 560, h = 180, padL = 36, padB = 20, padT = 12, padR = 10
  const vals = sorted.map((d) => d.value).concat(goal != null ? [goal] : [])
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= 5; max += 5 }
  const pad = (max - min) * 0.15; min -= pad; max += pad
  const x = (i: number) => padL + (sorted.length === 1 ? (w - padL - padR) / 2 : (i / (sorted.length - 1)) * (w - padL - padR))
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB)
  const line = sorted.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const area = `${padL},${h - padB} ${line} ${x(sorted.length - 1)},${h - padB}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 180 }}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[max, (max + min) / 2, min].map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke="var(--color-border)" strokeWidth="1" />
          <text x={4} y={y(v) + 3} fontSize="9" fill="var(--color-muted)">{Math.round(v)}</text>
        </g>
      ))}
      {goal != null && (
        <g>
          <line x1={padL} y1={y(goal)} x2={w - padR} y2={y(goal)} stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
          <text x={w - padR} y={y(goal) - 4} fontSize="9" fill="var(--color-accent)" textAnchor="end">goal {goal}</text>
        </g>
      )}
      <polygon points={area} fill="url(#wg)" />
      <polyline points={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {sorted.map((d, i) => <circle key={d.id} cx={x(i)} cy={y(d.value)} r={i === sorted.length - 1 ? 4 : 2.5} fill="var(--color-accent)" />)}
    </svg>
  )
}

export default function Health() {
  const [weights, setWeights] = useStore<Weigh[]>('health.weights', [])
  const [records, setRecords] = useStore<Record_[]>('health.records', [])
  const [goals, setGoals] = useStore<Goals>('health.goals', {})
  const [scans, setScans] = useStore<Scan[]>('health.scans', [])
  const confirmDelete = useConfirmDelete()

  const [wDate, setWDate] = useState(new Date().toISOString().slice(0, 10))
  const [wVal, setWVal] = useState('')
  const [wBf, setWBf] = useState('')
  const [rKind, setRKind] = useState(RECORD_KINDS[0])
  const [rTitle, setRTitle] = useState('')
  const [rNotes, setRNotes] = useState('')
  const [rFile, setRFile] = useState<{ name: string; data: string } | undefined>()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('All')

  // DEXA scan form state
  const [sDate, setSDate] = useState(new Date().toISOString().slice(0, 10))
  const [sBodyFat, setSBodyFat] = useState('')
  const [sLean, setSLean] = useState('')
  const [sFat, setSFat] = useState('')
  const [sTotal, setSTotal] = useState('')
  const [sFile, setSFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const sortedDesc = useMemo(() => [...weights].sort((a, b) => b.date.localeCompare(a.date)), [weights])
  const latest = sortedDesc[0] ?? null
  const prev = sortedDesc[1] ?? null
  const change = latest && prev ? +(latest.value - prev.value).toFixed(1) : null
  const toGoal = latest && goals.goalWeight != null ? +(latest.value - goals.goalWeight).toFixed(1) : null
  const bmi = latest && goals.heightIn ? +((latest.value / (goals.heightIn * goals.heightIn)) * 703).toFixed(1) : null

  const sortedScans = useMemo(() => [...scans].sort((a, b) => b.date.localeCompare(a.date)), [scans])
  const latestScan = sortedScans[0] ?? null
  const prevScan = sortedScans[1] ?? null

  // Latest body-fat % from either a weigh-in or a DEXA scan (most recent wins).
  const bodyFat = useMemo(() => {
    const entries = [
      ...weights.filter((w) => w.bodyFat != null).map((w) => ({ date: w.date, v: w.bodyFat! })),
      ...scans.filter((s) => s.bodyFatPct != null).map((s) => ({ date: s.date, v: s.bodyFatPct! })),
    ].sort((a, b) => b.date.localeCompare(a.date))
    return entries[0] ?? null
  }, [weights, scans])

  const addWeight = () => {
    const v = parseFloat(wVal)
    const bf = parseFloat(wBf)
    if (isNaN(v) && isNaN(bf)) return
    setWeights((prev) => [...prev, { id: uid('w'), date: wDate, value: isNaN(v) ? 0 : v, ...(isNaN(bf) ? {} : { bodyFat: +bf.toFixed(1) }) }])
    setWVal(''); setWBf('')
  }
  const addRecord = () => {
    if (!rTitle.trim()) return
    setRecords((prev) => [{ id: uid('r'), date: new Date().toISOString().slice(0, 10), kind: rKind, title: rTitle.trim(), notes: rNotes.trim(), file: rFile }, ...prev])
    setRTitle(''); setRNotes(''); setRFile(undefined)
  }
  const filteredRecords = records.filter((r) =>
    (kindFilter === 'All' || r.kind === kindFilter) &&
    (!query.trim() || (r.title + ' ' + r.notes + ' ' + r.kind).toLowerCase().includes(query.toLowerCase())))

  const resetScanForm = () => { setSBodyFat(''); setSLean(''); setSFat(''); setSTotal(''); setSFile(null); setScanMsg('') }

  const autoRead = async () => {
    if (!sFile) return
    setScanMsg('')
    if (!sFile.type.startsWith('image/')) {
      setScanMsg('Auto-read needs a photo or PNG/JPG. For a PDF, type the numbers below — the file is still saved.')
      return
    }
    setExtracting(true)
    try {
      const image = await readAsDataURL(sFile)
      const res = await fetch('/.netlify/functions/extract-dexa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }),
      })
      const d = (await res.json()) as { ok?: boolean; data?: Partial<Scan> & { date?: string }; message?: string }
      if (d.ok && d.data) {
        const x = d.data
        if (x.date) setSDate(x.date)
        if (x.bodyFatPct != null) setSBodyFat(String(x.bodyFatPct))
        if (x.leanLbs != null) setSLean(String(x.leanLbs))
        if (x.fatLbs != null) setSFat(String(x.fatLbs))
        if (x.totalLbs != null) setSTotal(String(x.totalLbs))
        setScanMsg('Filled from your scan — double-check the numbers and Save.')
      } else {
        setScanMsg(d.message || 'Couldn’t auto-read this one. Type the numbers below — the file is still saved.')
      }
    } catch {
      setScanMsg('Auto-read needs the site deployed with the AI key (Settings → Integrations). Type the numbers below — the file is still saved.')
    } finally {
      setExtracting(false)
    }
  }

  const addScan = async () => {
    const bf = clean(sBodyFat === '' ? undefined : parseFloat(sBodyFat))
    const lean = clean(sLean === '' ? undefined : parseFloat(sLean))
    const fat = clean(sFat === '' ? undefined : parseFloat(sFat))
    const total = clean(sTotal === '' ? undefined : parseFloat(sTotal))
    if (bf == null && lean == null && fat == null && total == null && !sFile) {
      setScanMsg('Add at least one measurement or attach the scan file.')
      return
    }
    const id = uid('dx')
    if (sFile) { try { await putFile(id, sFile) } catch { /* keep the metrics even if the file fails */ } }
    const scan: Scan = { id, date: sDate, bodyFatPct: bf, leanLbs: lean, fatLbs: fat, totalLbs: total, hasFile: !!sFile, fileName: sFile?.name, fileType: sFile?.type }
    setScans((prev) => [scan, ...prev])
    resetScanForm()
  }

  const removeScan = async (scan: Scan) => {
    if (scan.hasFile) await delFile(scan.id)
    setScans((prev) => prev.filter((x) => x.id !== scan.id))
  }

  const downloadScan = async (scan: Scan) => {
    const blob = await getFile(scan.id)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = scan.fileName || 'dexa-scan'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <div>
      <PageHeader title="Health" subtitle="Track weight, body composition and every doctor visit & lab in one place." />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Weight</p>
          <p className="text-2xl font-semibold tnum mt-1" style={{ color: 'var(--color-text)' }}>{latest ? latest.value : '—'}<span className="text-sm font-normal ml-1" style={{ color: 'var(--color-muted)' }}>lbs</span></p>
          {change != null && <p className="text-xs font-semibold mt-0.5" style={{ color: change <= 0 ? '#2f9266' : '#d97a7a' }}>{change > 0 ? '+' : ''}{change} lbs</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Body fat</p>
          <p className="text-2xl font-semibold tnum mt-1" style={{ color: 'var(--color-text)' }}>{bodyFat ? bodyFat.v : '—'}<span className="text-sm font-normal ml-0.5" style={{ color: 'var(--color-muted)' }}>{bodyFat ? '%' : ''}</span></p>
          <div className="mt-0.5"><Delta cur={latestScan?.bodyFatPct} prev={prevScan?.bodyFatPct} unit="%" goodDown /></div>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Lean mass</p>
          <p className="text-2xl font-semibold tnum mt-1" style={{ color: 'var(--color-text)' }}>{latestScan?.leanLbs != null ? latestScan.leanLbs : '—'}<span className="text-sm font-normal ml-1" style={{ color: 'var(--color-muted)' }}>{latestScan?.leanLbs != null ? 'lbs' : ''}</span></p>
          <div className="mt-0.5"><Delta cur={latestScan?.leanLbs} prev={prevScan?.leanLbs} unit=" lbs" goodDown={false} /></div>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>BMI</p>
          <p className="text-2xl font-semibold tnum mt-1" style={{ color: 'var(--color-text)' }}>{bmi ?? '—'}</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart + add */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Weight trend</h2>
            {latest && <span className="text-sm" style={{ color: 'var(--color-muted)' }}>latest {latest.date}</span>}
          </div>
          <WeightChart data={weights} goal={goals.goalWeight} />
          <form onSubmit={(e) => { e.preventDefault(); addWeight() }} className="flex gap-2 mt-4 flex-wrap">
            <Input type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} className="max-w-[150px]" />
            <Input type="number" step="0.1" value={wVal} onChange={(e) => setWVal(e.target.value)} placeholder="Weight (lbs)" />
            <Input type="number" step="0.1" value={wBf} onChange={(e) => setWBf(e.target.value)} placeholder="Body fat %" className="max-w-[130px]" />
            <Button type="submit"><IconPlus width={16} height={16} /></Button>
          </form>
          {weights.length > 0 && (
            <ul className="flex flex-col gap-1 mt-4 max-h-40 overflow-y-auto">
              {sortedDesc.map((w) => (
                <li key={w.id} className="group flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-black/5">
                  <span style={{ color: 'var(--color-muted)' }}>{w.date}</span>
                  <span className="flex-1 font-semibold" style={{ color: 'var(--color-text)' }}>{w.value} <span className="text-xs font-normal" style={{ color: 'var(--color-muted)' }}>lbs</span>{w.bodyFat != null && <span className="text-xs font-normal ml-2" style={{ color: 'var(--color-muted)' }}>· {w.bodyFat}% bf</span>}</span>
                  <button onClick={() => confirmDelete({ label: `the ${w.value} lbs entry from ${w.date}`, onConfirm: () => setWeights((p) => p.filter((x) => x.id !== w.id)) })} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={14} height={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Goals */}
        <Card className="p-5">
          <h2 className="font-bold text-lg mb-3" style={{ color: 'var(--color-text)' }}>Goals</h2>
          <label className="text-sm block mb-1" style={{ color: 'var(--color-muted)' }}>Goal weight (lbs)</label>
          <Input type="number" value={goals.goalWeight ?? ''} onChange={(e) => setGoals({ ...goals, goalWeight: e.target.value === '' ? undefined : parseFloat(e.target.value) })} placeholder="e.g. 175" />
          <label className="text-sm block mb-1 mt-4" style={{ color: 'var(--color-muted)' }}>Height (inches, for BMI)</label>
          <Input type="number" value={goals.heightIn ?? ''} onChange={(e) => setGoals({ ...goals, heightIn: e.target.value === '' ? undefined : parseFloat(e.target.value) })} placeholder="e.g. 70" />
          {toGoal != null && (
            <p className="text-sm mt-4" style={{ color: 'var(--color-text)' }}>
              {toGoal === 0 ? '🎯 At your goal!' : toGoal > 0 ? `${toGoal} lbs to go.` : `${Math.abs(toGoal)} lbs under goal.`}
            </p>
          )}
        </Card>
      </div>

      {/* Body composition (DEXA) */}
      <Card className="p-5 mt-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Body composition (DEXA)</h2>
          {latestScan && <span className="text-sm" style={{ color: 'var(--color-muted)' }}>latest {latestScan.date}</span>}
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
          Upload a DEXA scan — with the AI key connected it reads the body-fat %, lean and fat mass for you. Each scan compares against the one before it.
        </p>

        {/* Latest snapshot with deltas */}
        {latestScan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Body fat', val: latestScan.bodyFatPct, unit: '%', prev: prevScan?.bodyFatPct, goodDown: true as boolean },
              { label: 'Lean mass', val: latestScan.leanLbs, unit: ' lbs', prev: prevScan?.leanLbs, goodDown: false as boolean },
              { label: 'Fat mass', val: latestScan.fatLbs, unit: ' lbs', prev: prevScan?.fatLbs, goodDown: true as boolean },
              { label: 'Total mass', val: latestScan.totalLbs, unit: ' lbs', prev: prevScan?.totalLbs, goodDown: undefined as boolean | undefined },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{m.label}</p>
                <p className="text-xl font-semibold tnum mt-0.5" style={{ color: 'var(--color-text)' }}>
                  {m.val != null ? m.val : '—'}<span className="text-xs font-normal ml-0.5" style={{ color: 'var(--color-muted)' }}>{m.val != null ? m.unit.trim() : ''}</span>
                </p>
                {prevScan && <div className="mt-0.5"><Delta cur={m.val} prev={m.prev} unit={m.unit} goodDown={m.goodDown} /></div>}
              </div>
            ))}
          </div>
        )}

        {/* Add scan form */}
        <div className="rounded-xl p-4" style={{ background: 'var(--color-bg)' }}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Date</label>
              <Input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Body fat %</label>
              <Input type="number" step="0.1" value={sBodyFat} onChange={(e) => setSBodyFat(e.target.value)} placeholder="e.g. 18.4" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Lean mass (lbs)</label>
              <Input type="number" step="0.1" value={sLean} onChange={(e) => setSLean(e.target.value)} placeholder="e.g. 142.0" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Fat mass (lbs)</label>
              <Input type="number" step="0.1" value={sFat} onChange={(e) => setSFat(e.target.value)} placeholder="e.g. 32.0" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Total (lbs)</label>
              <Input type="number" step="0.1" value={sTotal} onChange={(e) => setSTotal(e.target.value)} placeholder="e.g. 174.0" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <label className="text-sm cursor-pointer px-3 py-2 rounded-xl" style={{ ...fieldStyle }}>
              {sFile ? `✓ ${sFile.name.length > 22 ? sFile.name.slice(0, 20) + '…' : sFile.name}` : '📎 Attach scan (PDF/image)'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSFile(f); setScanMsg('') } }} />
            </label>
            <Button variant="outline" onClick={autoRead} disabled={!sFile || extracting}>
              {extracting ? 'Reading…' : '✨ Auto-read from scan'}
            </Button>
            <Button onClick={addScan}><IconPlus width={16} height={16} /> Save scan</Button>
          </div>
          {scanMsg && <p className="text-xs mt-2" style={{ color: 'var(--color-accent)' }}>{scanMsg}</p>}
        </div>

        {/* Scan history */}
        {sortedScans.length > 0 && (
          <ul className="flex flex-col gap-2 mt-4">
            {sortedScans.map((s, i) => {
              const older = sortedScans[i + 1]
              return (
                <li key={s.id} className="group flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{s.date}</span>
                      {s.hasFile && (
                        <button onClick={() => downloadScan(s)} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>📎 {s.fileName || 'scan file'}</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
                      <span>Body fat: <b style={{ color: 'var(--color-text)' }}>{s.bodyFatPct != null ? `${s.bodyFatPct}%` : '—'}</b> <Delta cur={s.bodyFatPct} prev={older?.bodyFatPct} unit="%" goodDown /></span>
                      <span>Lean: <b style={{ color: 'var(--color-text)' }}>{s.leanLbs != null ? `${s.leanLbs} lbs` : '—'}</b> <Delta cur={s.leanLbs} prev={older?.leanLbs} unit=" lbs" goodDown={false} /></span>
                      <span>Fat: <b style={{ color: 'var(--color-text)' }}>{s.fatLbs != null ? `${s.fatLbs} lbs` : '—'}</b> <Delta cur={s.fatLbs} prev={older?.fatLbs} unit=" lbs" goodDown /></span>
                      <span>Total: <b style={{ color: 'var(--color-text)' }}>{s.totalLbs != null ? `${s.totalLbs} lbs` : '—'}</b> <Delta cur={s.totalLbs} prev={older?.totalLbs} unit=" lbs" /></span>
                    </div>
                  </div>
                  <button onClick={() => confirmDelete({ label: s.date ? `the DEXA scan from ${s.date}` : 'this scan', detail: 'This scan and its uploaded file will be removed.', onConfirm: () => { void removeScan(s) } })} className="opacity-0 group-hover:opacity-60 shrink-0" style={{ color: 'var(--color-muted)' }} aria-label="Delete scan"><IconTrash width={16} height={16} /></button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Add record */}
      <Card className="p-5 mt-6">
        <h2 className="font-bold text-lg mb-3" style={{ color: 'var(--color-text)' }}>Add a record</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={rKind} onChange={(e) => setRKind(e.target.value)} className="rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>
            {RECORD_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <input value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="Title (e.g. Annual physical)" className="rounded-xl px-3 py-2 text-sm outline-none flex-1 min-w-[160px]" style={fieldStyle} />
          <input value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="Notes / results" className="rounded-xl px-3 py-2 text-sm outline-none flex-1 min-w-[140px]" style={fieldStyle} />
          <label className="text-xs cursor-pointer px-3 py-2 rounded-xl" style={fieldStyle}>{rFile ? '✓ File' : '📎 Attach'}
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setRFile({ name: f.name, data: r.result as string }); r.readAsDataURL(f) }} />
          </label>
          <Button onClick={addRecord}><IconPlus width={16} height={16} /> Save</Button>
        </div>
      </Card>

      {/* Records */}
      <Card className="p-5 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Records</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch width={15} height={15} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search records…" className="!pl-8 w-44" />
            </div>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="rounded-xl px-2 py-2 text-sm outline-none" style={fieldStyle}>
              {['All', ...RECORD_KINDS].map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
        </div>
        {filteredRecords.length === 0 ? (
          <EmptyState icon={<IconHealth width={40} height={40} />} title={records.length ? 'No matches' : 'No records yet'} hint={records.length ? 'Try a different search.' : 'Add doctor visits, labs and prescriptions above.'} />
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredRecords.map((r) => (
              <li key={r.id} className="group flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                <span className="text-xs font-semibold px-2 py-1 rounded-md shrink-0" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>{r.kind}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{r.title}</span><span className="text-xs" style={{ color: 'var(--color-muted)' }}>{r.date}</span></div>
                  {r.notes && <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>{r.notes}</p>}
                  {r.file && <a href={r.file.data} download={r.file.name} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>📎 {r.file.name}</a>}
                </div>
                <button onClick={() => confirmDelete({ label: r.title ? `the record “${r.title}”` : 'this record', detail: 'This record and any attached file will be removed.', onConfirm: () => setRecords((p) => p.filter((x) => x.id !== r.id)) })} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={16} height={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
