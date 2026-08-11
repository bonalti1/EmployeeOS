import { useState } from 'react'
import Payments from './Payments'
import Bank from './Bank'

/** Finances hub — Bills (the yearly payments grid) and Bank live here as tabs. */
export default function Finances() {
  const [tab, setTab] = useState<'bills' | 'bank'>('bills')
  return (
    <div>
      <div className="inline-flex rounded-xl p-1 mb-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        {(['bills', 'bank'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-6 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
            style={{ background: tab === t ? 'var(--color-accent)' : 'transparent', color: tab === t ? 'var(--color-on-accent)' : 'var(--color-muted)' }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'bills' ? <Payments /> : <Bank />}
    </div>
  )
}
