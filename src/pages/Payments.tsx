import { useMemo, useRef, useState } from 'react'
import { Card, PageHeader, Button, Input } from '../components/ui'
import { IconPlus, IconTrash, IconCheck } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useToast } from '../lib/toast'
import { useConfirmDelete } from '../lib/confirmDelete'
import { money } from '../lib/format'

type Bill = { id: string; name: string; amount: number; dueDay?: number }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 1 → "1st", 2 → "2nd", 15 → "15th". */
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/**
 * The payment date for a bill — the day of the month it's due. Reads as
 * "Due 5th"; click to set or change it. Used in both Year and Month views.
 */
function DueChip({ day, onSet }: { day?: number; onSet: (d: number | undefined) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => { const d = parseInt(draft, 10); onSet(d >= 1 && d <= 31 ? d : undefined); setEditing(false) }
  if (editing) return (
    <input
      autoFocus type="number" min={1} max={31} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      placeholder="day"
      className="w-16 text-center rounded-full px-1 py-0.5 outline-none tnum text-xs"
      style={{ background: 'var(--color-surface)', border: '2px solid var(--color-accent)', color: 'var(--color-text)' }}
    />
  )
  return (
    <button
      onClick={() => { setDraft(day ? String(day) : ''); setEditing(true) }}
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 tnum transition"
      style={day
        ? { background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))', color: 'var(--color-accent)', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' }
        : { background: 'var(--color-bg)', color: 'var(--color-muted)', border: '1px dashed var(--color-border)' }}
      title="Payment date — the day of the month this bill is due"
    >
      {day ? `Due ${ordinal(day)}` : '+ Due date'}
    </button>
  )
}

/**
 * One month cell.
 *   • single tap → toggle paid/unpaid (fills the bill's usual amount)
 *   • double tap → edit the amount for that month
 * A short click-timer keeps single and double taps from fighting, and
 * touch-action:manipulation disables mobile double-tap-zoom so it stays crisp.
 */
function PaidCell({ value, expected, onToggle, onSet }: {
  value: number | undefined
  expected: number
  onToggle: () => void
  onSet: (v: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const timer = useRef<number | null>(null)
  const paid = value !== undefined

  const onClick = () => {
    if (timer.current) return
    timer.current = window.setTimeout(() => { timer.current = null; onToggle() }, 230)
  }
  const onDouble = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setDraft(String(value ?? expected ?? ''))
    setEditing(true)
  }
  const commit = () => {
    onSet(draft.trim() === '' ? null : parseFloat(draft))
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="h-7 w-[54px] text-center rounded-lg outline-none mx-auto text-xs"
        style={{ background: 'var(--color-surface)', border: '2px solid var(--color-accent)', color: 'var(--color-text)', fontWeight: 500 }}
      />
    )
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDouble}
      title={paid ? 'Tap to undo · double-tap to edit the amount' : 'Tap to mark paid · double-tap to set a custom amount'}
      className="h-7 w-[54px] text-center rounded-lg mx-auto transition-colors text-xs"
      style={{
        touchAction: 'manipulation',
        background: paid ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-bg)',
        border: `1px solid ${paid ? 'color-mix(in srgb, var(--color-accent) 35%, transparent)' : 'var(--color-border)'}`,
        color: paid ? 'var(--color-text)' : 'var(--color-muted)',
        fontWeight: paid ? 500 : 400,
      }}
    >
      {paid ? money(value!) : <span style={{ opacity: 0.45 }}>{expected ? money(expected) : ''}</span>}
    </button>
  )
}

const DEFAULT_BILLS: Bill[] = [
  { id: uid('b'), name: 'Mortgage / Rent', amount: 1800 },
  { id: uid('b'), name: 'Electric', amount: 140 },
  { id: uid('b'), name: 'Water', amount: 60 },
  { id: uid('b'), name: 'Internet', amount: 80 },
  { id: uid('b'), name: 'Car payment', amount: 420 },
  { id: uid('b'), name: 'Phone', amount: 110 },
]

export default function Payments() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useStore<number>('pay.year', thisYear)
  const [bills, setBills] = useStore<Bill[]>('pay.bills', DEFAULT_BILLS)
  // Per-cell amount actually paid: key `${year}:${billId}:${monthIndex}` -> number.
  // Presence of a value means "paid"; the value is how much (can differ each month).
  const [cells, setCells] = useStore<Record<string, number>>('pay.cells', {})
  const [income, setIncome] = useStore<Record<string, number>>('pay.income', {})

  const { removeWithUndo, toast } = useToast()
  const confirmDelete = useConfirmDelete()
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newDue, setNewDue] = useState('')
  const [view, setView] = useState<'year' | 'month'>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'month' : 'year'))
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth())

  const key = (billId: string, m: number) => `${year}:${billId}:${m}`

  const setCell = (billId: string, m: number, value: number | null) =>
    setCells((prev) => {
      const next = { ...prev }
      if (value === null || isNaN(value)) delete next[key(billId, m)]
      else next[key(billId, m)] = value
      return next
    })

  const addBill = () => {
    const name = newName.trim()
    const amount = parseFloat(newAmount)
    const dueDay = parseInt(newDue, 10)
    if (!name) return
    setBills((prev) => [...prev, { id: uid('b'), name, amount: isNaN(amount) ? 0 : amount, ...(dueDay >= 1 && dueDay <= 31 ? { dueDay } : {}) }])
    setNewName(''); setNewAmount(''); setNewDue('')
  }
  const removeBill = (id: string) => {
    const bill = bills.find((b) => b.id === id)
    if (!bill) return
    const idx = bills.findIndex((b) => b.id === id)
    removeWithUndo(
      `${bill.name} removed`,
      () => setBills((prev) => prev.filter((b) => b.id !== id)),
      () => setBills((prev) => { const next = [...prev]; next.splice(idx, 0, bill); return next }),
    )
  }
  const editBaseAmount = (id: string, amount: number) =>
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, amount } : b)))
  const editBillDue = (id: string, dueDay: number | undefined) =>
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, dueDay } : b)))

  // Mark/clear a whole bill for the year.
  const fillRow = (bill: Bill) => setCells((prev) => {
    const next = { ...prev }
    MONTHS.forEach((_, m) => { next[`${year}:${bill.id}:${m}`] = bill.amount || 0 })
    return next
  })
  const clearRow = (bill: Bill) => setCells((prev) => {
    const next = { ...prev }
    MONTHS.forEach((_, m) => delete next[`${year}:${bill.id}:${m}`])
    return next
  })

  // Import bills from a CSV ("name,amount" per line; header optional).
  const importCSV = (text: string) => {
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const added: Bill[] = []
    for (const row of rows) {
      const parts = row.split(',')
      const name = (parts[0] || '').replace(/^"|"$/g, '').trim()
      if (!name || /^(bill|name|item)$/i.test(name)) continue
      const amt = parseFloat((parts[1] || '').replace(/[^0-9.]/g, ''))
      added.push({ id: uid('b'), name, amount: isNaN(amt) ? 0 : amt })
    }
    if (added.length) { setBills((prev) => [...prev, ...added]); toast(`Imported ${added.length} bill${added.length === 1 ? '' : 's'}`) }
    else toast('No bills found in that file')
  }

  const expectedMonthly = useMemo(() => bills.reduce((s, b) => s + b.amount, 0), [bills])

  // Order bills by payment date, earliest first (bills with no date go last),
  // so the list reads down the month from the 1st.
  const sortedBills = useMemo(
    () => [...bills].sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99)),
    [bills],
  )

  // Shade the current month's column, but only while viewing the current year.
  const curMonth = year === new Date().getFullYear() ? new Date().getMonth() : -1
  const monthColBg = 'color-mix(in srgb, var(--color-accent) 9%, transparent)'

  const rowTotal = (billId: string) =>
    MONTHS.reduce((s, _, m) => s + (cells[key(billId, m)] ?? 0), 0)

  const colTotals = useMemo(
    () => MONTHS.map((_, m) => bills.reduce((s, b) => s + (cells[key(b.id, m)] ?? 0), 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bills, cells, year],
  )

  const yearPaid = colTotals.reduce((s, n) => s + n, 0)
  const yearIncome = MONTHS.reduce((s, _, m) => s + (income[`${year}:${m}`] ?? 0), 0)
  const incomeTotal = yearIncome

  return (
    <div>
      <PageHeader
        title="Bills"
        subtitle="Ordered by payment date. Set each bill's Due date, tap a cell to mark it paid, double-tap to edit the amount."
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" onClick={() => setYear((y) => y - 1)}>‹</Button>
            <span className="font-semibold text-lg tnum px-1" style={{ color: 'var(--color-text)' }}>{year}</span>
            <Button variant="outline" onClick={() => setYear((y) => y + 1)}>›</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Expected / month</p>
          <p className="text-2xl font-semibold mt-1 tnum" style={{ color: 'var(--color-text)' }}>{money(expectedMonthly)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Paid in {year}</p>
          <p className="text-2xl font-semibold mt-1 tnum" style={{ color: 'var(--color-accent)' }}>{money(yearPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Income in {year}</p>
          <p className="text-2xl font-semibold mt-1 tnum" style={{ color: 'var(--color-text)' }}>{money(incomeTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Net</p>
          <p className="text-2xl font-semibold mt-1 tnum" style={{ color: yearIncome - yearPaid >= 0 ? 'var(--color-accent)' : '#e08a8a' }}>
            {money(yearIncome - yearPaid)}
          </p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          {(['year', 'month'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className="px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition"
              style={{ background: view === v ? 'var(--color-accent)' : 'transparent', color: view === v ? 'var(--color-on-accent)' : 'var(--color-muted)' }}>{v} view</button>
          ))}
        </div>
        <label className="text-sm cursor-pointer px-3 py-2 rounded-xl font-semibold" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
          Import CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then(importCSV); e.currentTarget.value = '' }} />
        </label>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>CSV format: <code>name,amount</code> per line</span>
      </div>

      {/* Spend chart */}
      {yearPaid > 0 && (() => {
        const max = Math.max(...colTotals, 1)
        const compact = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`
        const avg = yearPaid / colTotals.filter((v) => v > 0).length
        return (
          <Card className="p-5 mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Paid each month · {year}</p>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Total <span className="font-semibold tnum" style={{ color: 'var(--color-accent)' }}>{money(yearPaid)}</span> · avg <span className="font-semibold tnum" style={{ color: 'var(--color-text)' }}>{money(avg || 0)}</span>/mo</p>
            </div>
            <div className="flex gap-1.5" style={{ height: 150 }}>
              {colTotals.map((v, m) => (
                <div key={m} className="flex-1 flex flex-col items-center justify-end gap-1 cursor-pointer h-full" onClick={() => { setView('month'); setViewMonth(m) }} title={money(v)}>
                  <span className="text-[9px] tnum font-semibold" style={{ color: v > 0 ? 'var(--color-text)' : 'transparent' }}>{v > 0 ? compact(v) : '·'}</span>
                  <div className="w-full rounded-t-md transition-all" style={{ height: `${(v / max) * 96}px`, minHeight: v > 0 ? 4 : 0, background: m === new Date().getMonth() ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 45%, transparent)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{MONTHS[m]}</span>
                </div>
              ))}
            </div>
          </Card>
        )
      })()}

      {view === 'month' && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" onClick={() => setViewMonth((m) => (m + 11) % 12)}>‹</Button>
              <span className="font-semibold text-lg px-1" style={{ color: 'var(--color-text)' }}>{MONTHS[viewMonth]} {year}</span>
              <Button variant="outline" onClick={() => setViewMonth((m) => (m + 1) % 12)}>›</Button>
            </div>
            <span className="text-sm tnum font-semibold" style={{ color: 'var(--color-accent)' }}>{money(colTotals[viewMonth])} paid</span>
          </div>
          <ul className="flex flex-col gap-2">
            {sortedBills.map((b) => {
              const val = cells[key(b.id, viewMonth)]
              const paid = val !== undefined
              return (
                <li key={b.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                  <button onClick={() => setCell(b.id, viewMonth, paid ? null : (b.amount || 0))} className="h-6 w-6 rounded-md grid place-items-center shrink-0"
                    style={{ border: '2px solid var(--color-accent)', background: paid ? 'var(--color-accent)' : 'transparent' }}>
                    {paid && <IconCheck width={14} height={14} style={{ color: 'var(--color-on-accent)' }} />}
                  </button>
                  <span className="flex-1 min-w-0 truncate font-medium" style={{ color: 'var(--color-text)', opacity: paid ? 1 : 0.7 }}>{b.name}</span>
                  <DueChip day={b.dueDay} onSet={(d) => editBillDue(b.id, d)} />
                  <input type="number" value={val ?? ''} placeholder={String(b.amount || 0)} onChange={(e) => setCell(b.id, viewMonth, e.target.value === '' ? null : parseFloat(e.target.value))}
                    className="w-24 text-right rounded-lg px-2 py-1 outline-none tnum" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: paid ? 'var(--color-text)' : 'var(--color-muted)', fontWeight: paid ? 600 : 400 }} />
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {view === 'year' && (
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm tnum">
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                <th className="sticky left-0 z-10 text-left px-4 py-3 font-semibold" style={{ background: 'var(--color-bg)', color: 'var(--color-text)', minWidth: 240 }}>Bill</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className="px-2 py-3 font-semibold text-center" style={{ color: i === curMonth ? 'var(--color-accent)' : 'var(--color-muted)', background: i === curMonth ? monthColBg : undefined, minWidth: 58 }}>{m}</th>
                ))}
                <th className="px-3 py-3 font-semibold text-right sticky right-0 z-10" style={{ background: 'var(--color-bg)', color: 'var(--color-text)', minWidth: 90 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedBills.map((b) => (
                <tr key={b.id} className="group" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="sticky left-0 z-10 px-4 py-2.5" style={{ background: 'var(--color-surface)' }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            value={b.name}
                            onChange={(e) => setBills((prev) => prev.map((x) => x.id === b.id ? { ...x, name: e.target.value } : x))}
                            className="font-medium bg-transparent outline-none flex-1 min-w-0"
                            style={{ color: 'var(--color-text)' }}
                          />
                          <DueChip day={b.dueDay} onSet={(d) => editBillDue(b.id, d)} />
                        </div>
                        <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          <span>usually $</span>
                          <input
                            type="number"
                            value={b.amount || ''}
                            placeholder="0"
                            onChange={(e) => editBaseAmount(b.id, parseFloat(e.target.value) || 0)}
                            title="Default amount — fills in when you mark a month paid"
                            className="w-12 bg-transparent outline-none"
                            style={{ color: 'var(--color-muted)' }}
                          />
                          <button onClick={() => fillRow(b)} className="opacity-0 group-hover:opacity-100 font-semibold ml-1" style={{ color: 'var(--color-accent)' }} title="Mark all 12 months paid">Fill yr</button>
                          <button onClick={() => clearRow(b)} className="opacity-0 group-hover:opacity-100" style={{ color: 'var(--color-muted)' }} title="Clear all months">Clear</button>
                        </div>
                      </div>
                      <button onClick={() => confirmDelete({ label: b.name ? `the “${b.name}” bill` : 'this bill', detail: 'This bill and its payment history will be removed.', onConfirm: () => removeBill(b.id) })} className="opacity-0 group-hover:opacity-60 shrink-0 self-start mt-1" style={{ color: 'var(--color-muted)' }}>
                        <IconTrash width={14} height={14} />
                      </button>
                    </div>
                  </td>
                  {MONTHS.map((_, m) => {
                    const val = cells[key(b.id, m)]
                    return (
                      <td key={m} className="px-1 py-1 text-center" style={{ background: m === curMonth ? monthColBg : undefined }}>
                        <PaidCell
                          value={val}
                          expected={b.amount}
                          onToggle={() => setCell(b.id, m, val === undefined ? (b.amount || 0) : null)}
                          onSet={(v) => setCell(b.id, m, v)}
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-semibold sticky right-0 z-10" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>
                    {money(rowTotal(b.id))}
                  </td>
                </tr>
              ))}

              {/* Income row */}
              <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <td className="sticky left-0 z-10 px-4 py-2 font-semibold" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>Income</td>
                {MONTHS.map((_, m) => (
                  <td key={m} className="px-1 py-1 text-center" style={{ background: m === curMonth ? monthColBg : undefined }}>
                    <input
                      type="number"
                      value={income[`${year}:${m}`] ?? ''}
                      placeholder="0"
                      onChange={(e) => setIncome((prev) => {
                        const next = { ...prev }
                        if (e.target.value === '') delete next[`${year}:${m}`]
                        else next[`${year}:${m}`] = parseFloat(e.target.value) || 0
                        return next
                      })}
                      className="h-8 w-14 text-center rounded-lg outline-none bg-transparent text-xs"
                      style={{ color: 'var(--color-text)' }}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold sticky right-0 z-10" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>{money(yearIncome)}</td>
              </tr>

              {/* Column totals */}
              <tr style={{ borderTop: '1px solid var(--color-border)' }}>
                <td className="sticky left-0 z-10 px-4 py-3 font-semibold" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Total paid</td>
                {colTotals.map((amt, m) => (
                  <td key={m} className="px-1 py-3 text-center text-xs font-semibold" style={{ color: amt > 0 ? 'var(--color-accent)' : 'var(--color-muted)', background: m === curMonth ? monthColBg : undefined }}>
                    {amt > 0 ? money(amt) : '—'}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-bold sticky right-0 z-10" style={{ background: 'var(--color-surface)', color: 'var(--color-accent)' }}>{money(yearPaid)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {/* Add bill (always available) */}
      <Card className="p-4 mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New bill name" className="max-w-xs" />
          <Input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="Expected amount" type="number" className="max-w-[150px]" />
          <Input value={newDue} onChange={(e) => setNewDue(e.target.value)} placeholder="Due day (1–31)" type="number" className="max-w-[140px]" />
          <Button onClick={addBill}><IconPlus width={16} height={16} /> Add bill</Button>
        </div>
      </Card>

      <p className="text-xs mt-3" style={{ color: 'var(--color-muted)' }}>
        {view === 'year'
          ? 'Tap a month cell to mark it paid (it fills the usual amount) — tap again to undo. Double-tap a cell to edit the amount. Hover a bill name to fill or clear the whole year.'
          : 'Tap the checkbox to mark a bill paid this month, or type the exact amount. Switch to Year view for the full grid.'}
      </p>
    </div>
  )
}
