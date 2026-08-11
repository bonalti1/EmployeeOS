import { useMemo, useState } from 'react'
import { Card, PageHeader, Button, Input, IntegrationNote, EmptyState } from '../components/ui'
import { IconPlus, IconTrash, IconBank } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useConfirmDelete } from '../lib/confirmDelete'
import { money } from '../lib/format'

type Account = { id: string; name: string; type: string; balance: number }
type Deposit = { id: string; month: string; amount: number; note: string } // month = YYYY-MM
const TYPES = ['Checking', 'Savings', 'Cash', 'Investment', 'Credit']

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function Bank() {
  const [accounts, setAccounts] = useStore<Account[]>('bank.accounts', [])
  const [deposits, setDeposits] = useStore<Deposit[]>('bank.deposits', [])
  const confirmDelete = useConfirmDelete()
  const [draft, setDraft] = useState({ name: '', type: 'Checking', balance: '' })
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [dep, setDep] = useState({ month: monthKey(now), amount: '', note: '' })

  const assets = accounts.filter((a) => a.type !== 'Credit').reduce((s, a) => s + a.balance, 0)
  const debts = accounts.filter((a) => a.type === 'Credit').reduce((s, a) => s + a.balance, 0)
  const netWorth = assets - debts

  const depByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    deposits.forEach((d) => { map[d.month] = (map[d.month] ?? 0) + d.amount })
    return map
  }, [deposits])
  const depositedLastMonth = depByMonth[monthKey(lastMonth)] ?? 0
  const depositedThisMonth = depByMonth[monthKey(now)] ?? 0

  return (
    <div>
      <PageHeader title="Bank" subtitle="Net worth, balances, and what's hitting your account each month." />

      {/* Summary */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Net worth</p>
          <p className="text-3xl font-semibold mt-1 tnum" style={{ color: netWorth >= 0 ? 'var(--color-accent)' : '#d97a7a' }}>{money(netWorth)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{money(assets)} assets · {money(debts)} owed</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Deposited last month</p>
          <p className="text-3xl font-semibold mt-1 tnum" style={{ color: 'var(--color-text)' }}>{money(depositedLastMonth)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{monthLabel(monthKey(lastMonth))}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Deposited this month</p>
          <p className="text-3xl font-semibold mt-1 tnum" style={{ color: 'var(--color-accent)' }}>{money(depositedThisMonth)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{monthLabel(monthKey(now))}</p>
        </Card>
      </div>

      <div className="mb-6">
        <IntegrationNote title="Connect a real bank with Plaid">
          To pull live balances and deposits automatically, we'll connect <b>Plaid</b> (the service that
          securely links banks to apps) — it needs a free Plaid account and a small backend. This page is
          built so it drops in when you're ready. For now, balances and deposits are entered manually.
        </IntegrationNote>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Accounts */}
        <Card className="p-5">
          <h2 className="font-bold text-lg mb-3" style={{ color: 'var(--color-text)' }}>Accounts</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Account name" className="flex-1 min-w-[120px]" />
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className="rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <Input value={draft.balance} onChange={(e) => setDraft({ ...draft, balance: e.target.value })} placeholder="Balance" type="number" className="max-w-[120px]" />
            <Button onClick={() => {
              const balance = parseFloat(draft.balance)
              if (!draft.name.trim() || isNaN(balance)) return
              setAccounts((p) => [...p, { id: uid('acct'), name: draft.name.trim(), type: draft.type, balance }])
              setDraft({ name: '', type: 'Checking', balance: '' })
            }}><IconPlus width={16} height={16} /></Button>
          </div>
          {accounts.length === 0 ? (
            <EmptyState icon={<IconBank width={40} height={40} />} title="No accounts yet" hint="Add one to start tracking balances." />
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li key={a.id} className="group flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
                  <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--color-surface)' }}>
                    <IconBank width={20} height={20} style={{ color: a.type === 'Credit' ? '#d97a7a' : 'var(--color-accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{a.name}</div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{a.type}</div>
                  </div>
                  <input type="number" value={a.balance} onChange={(e) => setAccounts((p) => p.map((x) => x.id === a.id ? { ...x, balance: parseFloat(e.target.value) || 0 } : x))}
                    className="w-28 text-right font-bold bg-transparent outline-none tnum" style={{ color: a.type === 'Credit' ? '#d97a7a' : 'var(--color-text)' }} />
                  <button onClick={() => confirmDelete({ label: a.name ? `the “${a.name}” account` : 'this account', detail: 'This account and its balance will be removed.', onConfirm: () => setAccounts((p) => p.filter((x) => x.id !== a.id)) })} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={16} height={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Deposits */}
        <Card className="p-5">
          <h2 className="font-bold text-lg mb-3" style={{ color: 'var(--color-text)' }}>Deposits</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <input type="month" value={dep.month} onChange={(e) => setDep({ ...dep, month: e.target.value })} className="rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
            <Input value={dep.amount} onChange={(e) => setDep({ ...dep, amount: e.target.value })} placeholder="Amount" type="number" className="max-w-[110px]" />
            <Input value={dep.note} onChange={(e) => setDep({ ...dep, note: e.target.value })} placeholder="Note (e.g. paycheck)" className="flex-1 min-w-[120px]" />
            <Button onClick={() => {
              const amount = parseFloat(dep.amount)
              if (isNaN(amount) || !dep.month) return
              setDeposits((p) => [{ id: uid('dep'), month: dep.month, amount, note: dep.note.trim() }, ...p])
              setDep({ month: monthKey(now), amount: '', note: '' })
            }}><IconPlus width={16} height={16} /></Button>
          </div>
          {deposits.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--color-muted)' }}>Log paychecks and deposits to see monthly totals.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {[...deposits].sort((a, b) => b.month.localeCompare(a.month)).map((d) => (
                <li key={d.id} className="group flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-black/5">
                  <span className="text-xs font-semibold w-24 shrink-0" style={{ color: 'var(--color-accent)' }}>{monthLabel(d.month)}</span>
                  <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{d.note || 'Deposit'}</span>
                  <span className="font-semibold tnum" style={{ color: 'var(--color-text)' }}>{money(d.amount)}</span>
                  <button onClick={() => confirmDelete({ label: `the ${money(d.amount)} deposit from ${monthLabel(d.month)}`, onConfirm: () => setDeposits((p) => p.filter((x) => x.id !== d.id)) })} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={14} height={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
