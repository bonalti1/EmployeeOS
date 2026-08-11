import { useState, type SVGProps } from 'react'
import { Card, PageHeader } from '../components/ui'
import { useStore } from '../lib/store'
import { addDays, parseDate, toISO, todayISO } from '../lib/dates'

/**
 * Home Care — light-touch household upkeep for the house in Rio Grande City.
 * A seasonal lawn-care guide and an A/C filter tracker that remembers when you
 * last changed it and works out when it's due again. Product links point to
 * Home Depot searches; the notify preference is saved for when push is wired up.
 */
const CITY = 'Rio Grande City'
const HD = (q: string) => `https://www.homedepot.com/s/${encodeURIComponent(q)}`

const fmt = (iso: string) => { const d = parseDate(iso); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }
const fmtShort = (iso: string) => { const d = parseDate(iso); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—' }

// --- season icons ---
const IconLeaf = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 10-6 16-9 16Z" /><path d="M4 20c3-4 6-6 10-7" /></svg>)
const IconSun = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>)
const IconMaple = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2 10.5 6 7 5l1.5 3.5L4 9l3 3-2 2 4 .5L8 18l3.5-1L12 22l.5-5L16 18l-1-3.5 4-.5-2-2 3-3-4.5-.5L14 5l-3.5 1L12 2Z" /></svg>)
const IconSnow = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2v20M2 12h20M4.5 4.5l15 15M19.5 4.5l-15 15M12 5l-2.5 2.5M12 5l2.5 2.5M12 19l-2.5-2.5M12 19l2.5 2.5M5 12l2.5-2.5M5 12l2.5 2.5M19 12l-2.5-2.5M19 12l-2.5 2.5" /></svg>)
const IconGrass = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20V10M12 14c-2-1-3-4-3-7 2 1 3 4 3 7ZM12 14c2-1 3-4 3-7-2 1-3 4-3 7ZM7 20c0-3 1-6 2-8M17 20c0-3-1-6-2-8M4 20h16" /></svg>)
const IconFilter = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 8h16M4 13h16M4 18h16M9 3v18M15 3v18" /></svg>)
const IconExternal = (p: SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} {...p}><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>)

type Season = { key: string; name: string; range: string; months: number[]; tint: string; color: string; Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element; tips: string[]; why: string }
const SEASONS: Season[] = [
  { key: 'spring', name: 'Spring', range: 'Mar–May', months: [2, 3, 4], tint: '#e9f7ec', color: '#16a34a', Icon: IconLeaf, tips: ['Start mowing weekly', 'Apply fertilizer', 'Use pre-emergent weed control'], why: 'Warm-season grass wakes up and weeds begin competing.' },
  { key: 'summer', name: 'Summer', range: 'Jun–Aug', months: [5, 6, 7], tint: '#fdf1dc', color: '#e0902a', Icon: IconSun, tips: ['Water deeply 1–2x/week', 'Raise mower height', 'Watch for pests and heat stress'], why: 'Deeper watering and taller grass help protect roots from intense heat.' },
  { key: 'fall', name: 'Fall', range: 'Sep–Oct', months: [8, 9], tint: '#fbe9df', color: '#d9622b', Icon: IconMaple, tips: ['Fertilize early fall', 'Spot-treat weeds', 'Reduce watering slightly'], why: 'Strengthens the lawn before cooler months and helps control late weeds.' },
  { key: 'winter', name: 'Winter', range: 'Nov–Feb', months: [10, 11, 0, 1], tint: '#e6eefb', color: '#3b82f6', Icon: IconSnow, tips: ['Mow only as needed', 'Clean up debris', 'Prep for spring'], why: 'Slower growth means lower maintenance, but cleanup keeps the lawn healthy.' },
]
const LAWN_PRODUCTS = [
  { name: 'Lawn fertilizer', q: 'lawn fertilizer' },
  { name: 'Pre-emergent weed control', q: 'pre-emergent weed control' },
  { name: 'Sprinkler hose or lawn spreader', q: 'lawn spreader' },
]

type CareState = { filterSize: string; lastChanged: string; changeEveryDays: number; notify: boolean; notifyWhen: '7d' | 'due' }

function ProductLink({ name, q, Icon }: { name: string; q: string; Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <span className="grid place-items-center h-8 w-8 rounded-lg shrink-0" style={{ background: 'var(--color-surface)', color: 'var(--color-accent)' }}><Icon width={18} height={18} /></span>
      <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-text)' }}>{name}</span>
      <a href={HD(q)} target="_blank" rel="noreferrer" className="text-xs font-semibold inline-flex items-center gap-1 shrink-0" style={{ color: 'var(--color-accent)' }}>View at Home Depot <IconExternal /></a>
    </div>
  )
}

export default function HomeCare() {
  const [tab, setTab] = useState<'lawn' | 'filter'>('lawn')
  const [care, setCare] = useStore<CareState>('home.care', { filterSize: '', lastChanged: '', changeEveryDays: 60, notify: true, notifyWhen: '7d' })
  const set = (patch: Partial<CareState>) => setCare((prev) => ({ ...prev, ...patch }))

  const nextDue = care.lastChanged ? toISO(addDays(parseDate(care.lastChanged)!, care.changeEveryDays)) : ''
  const daysLeft = nextDue ? Math.round((parseDate(nextDue)!.getTime() - parseDate(todayISO())!.getTime()) / 86400000) : null
  const overdue = daysLeft != null && daysLeft < 0
  const curMonth = new Date().getMonth()

  return (
    <div>
      <PageHeader title="Home Care" subtitle={`Simple household upkeep for ${CITY}.`} />

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([['lawn', 'Lawn Care'], ['filter', 'Filter Change']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2 rounded-xl text-sm font-semibold transition" style={tab === v ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)' } : { background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>{label}</button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Main column */}
        <div className="flex flex-col gap-6">
          {tab === 'lawn' ? (
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="grid place-items-center h-11 w-11 rounded-full shrink-0" style={{ background: '#e9f7ec', color: '#16a34a' }}><IconGrass width={24} height={24} /></span>
                <div>
                  <h2 className="font-bold text-xl" style={{ color: 'var(--color-text)' }}>Lawn Care</h2>
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Seasonal suggestions for {CITY}</p>
                </div>
              </div>

              <div className="flex flex-col">
                {SEASONS.map((s, i) => {
                  const isNow = s.months.includes(curMonth)
                  return (
                    <div key={s.key} className="grid sm:grid-cols-[150px_1fr_1fr] gap-4 sm:gap-6 py-5" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
                      <div className="flex items-start gap-3">
                        <span className="grid place-items-center h-10 w-10 rounded-full shrink-0" style={{ background: s.tint, color: s.color }}><s.Icon width={22} height={22} /></span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold" style={{ color: 'var(--color-text)' }}>{s.name}</span>
                            {isNow && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Now</span>}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{s.range}</div>
                        </div>
                      </div>
                      <ul className="flex flex-col gap-1.5">
                        {s.tips.map((t) => (
                          <li key={t} className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />{t}
                          </li>
                        ))}
                      </ul>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-muted)' }}>Why</p>
                        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{s.why}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
                <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-text)' }}>Recommended products</p>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  {LAWN_PRODUCTS.map((p) => (
                    <a key={p.name} href={HD(p.q)} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{p.name}</p>
                      <span className="text-xs font-semibold inline-flex items-center gap-1 mt-1" style={{ color: 'var(--color-accent)' }}>View at Home Depot <IconExternal /></span>
                    </a>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="grid place-items-center h-11 w-11 rounded-full shrink-0" style={{ background: '#e6eefb', color: 'var(--color-accent)' }}><IconFilter width={22} height={22} /></span>
                <div>
                  <h2 className="font-bold text-xl" style={{ color: 'var(--color-text)' }}>Changing your A/C filter</h2>
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>A 5-minute job that keeps the system running clean.</p>
                </div>
              </div>
              <ol className="flex flex-col gap-3">
                {['Turn the thermostat / A/C off.', 'Find the filter slot (return-air vent or the air handler) and note the size printed on the old filter’s edge.', 'Slide the old filter out; note the airflow arrow direction.', 'Slide the new filter in with the arrow pointing toward the unit.', 'Turn the A/C back on and log the date on the right so you get reminded next time.'].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid place-items-center h-6 w-6 rounded-full shrink-0 text-xs font-bold" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>{i + 1}</span>
                    <span className="text-sm pt-0.5" style={{ color: 'var(--color-text)' }}>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
                <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-text)' }}>Recommended products</p>
                <div className="flex flex-col gap-2.5">
                  <ProductLink name="Pleated A/C filter" q="pleated air filter" Icon={IconFilter} />
                  <ProductLink name="Air filter multipack" q="air filter multipack" Icon={IconFilter} />
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Air Filter tracker (always shown) */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="grid place-items-center h-11 w-11 rounded-full shrink-0" style={{ background: '#e6eefb', color: 'var(--color-accent)' }}><IconFilter width={22} height={22} /></span>
            <h2 className="font-bold text-xl" style={{ color: 'var(--color-text)' }}>Air Filter</h2>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Filter size</span>
              <input value={care.filterSize} onChange={(e) => set({ filterSize: e.target.value })} placeholder="e.g. 20x25x1" className="w-32 text-right rounded-lg px-2 py-1 text-sm outline-none tnum" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Change every</span>
              <span className="text-sm tnum" style={{ color: 'var(--color-muted)' }}>{care.changeEveryDays} days <span className="opacity-60">(60–90 typical)</span></span>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Last changed</span>
              <input type="date" value={care.lastChanged} onChange={(e) => set({ lastChanged: e.target.value })} className="rounded-lg px-2 py-1 text-sm outline-none tnum" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Next due</span>
              <span className="text-sm font-bold tnum" style={{ color: overdue ? '#c0504d' : care.lastChanged ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                {nextDue ? fmtShort(nextDue) : 'Set a date'}{daysLeft != null && (overdue ? ' · overdue' : ` · ${daysLeft}d`)}
              </span>
            </div>
            <button onClick={() => set({ lastChanged: todayISO() })} className="mt-1 w-full rounded-xl py-2 text-sm font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>✓ Mark changed today</button>
            {care.lastChanged && <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>Last done {fmt(care.lastChanged)}</p>}
          </div>

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-sm font-bold mb-2.5" style={{ color: 'var(--color-text)' }}>Recommended products</p>
            <div className="flex flex-col gap-2.5">
              <ProductLink name="Pleated A/C filter" q="pleated air filter" Icon={IconFilter} />
              <ProductLink name="Air filter multipack" q="air filter multipack" Icon={IconFilter} />
            </div>
          </div>

          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <button onClick={() => set({ notify: !care.notify })} className="h-5 w-5 rounded-md grid place-items-center shrink-0" style={{ border: '2px solid var(--color-accent)', background: care.notify ? 'var(--color-accent)' : 'transparent' }} aria-label="Toggle notify">
                {care.notify && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
              </button>
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Notify me before it's due</span>
            </label>
            {care.notify && (
              <div className="flex gap-4 mt-2.5 pl-7">
                {([['7d', '7 days before'], ['due', 'On due date']] as const).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-text)' }}>
                    <span className="h-4 w-4 rounded-full grid place-items-center shrink-0" style={{ border: `2px solid ${care.notifyWhen === v ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                      {care.notifyWhen === v && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent)' }} />}
                    </span>
                    <input type="radio" className="hidden" checked={care.notifyWhen === v} onChange={() => set({ notifyWhen: v })} />{label}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))', border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)' }}>
              <span className="text-sm shrink-0" style={{ color: 'var(--color-accent)' }}>ⓘ</span>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>During heavy A/C season (our long South Texas summers), check the filter monthly — it clogs faster.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
