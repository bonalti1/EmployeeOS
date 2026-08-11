import { useState } from 'react'
import { Card, Button, EmptyState } from '../../components/ui'
import { IconStamp } from '../../components/icons'
import { WsShell, BrandBadge, wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import { useWorkspace, useWsTable, fmtWsDate, type WsContent } from '../../lib/workspace'

/**
 * Approval queue. Content moved to the Review stage lands here for Rolando.
 * Approve → stage becomes Approved. Request changes → back to Editing with a
 * note. Realtime sync means the assistant sees the outcome immediately.
 */

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{label}</div>
      <p className="text-sm mt-0.5 whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)' }}>{value}</p>
    </div>
  )
}

export default function WsApprovals() {
  const { role } = useWorkspace()
  const { toast } = useToast()
  const { rows, update } = useWsTable<WsContent>('ws_content')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)

  const pending = (rows ?? []).filter((c) => c.stage === 'review')
  const recent = (rows ?? [])
    .filter((c) => c.approval_status === 'approved' || c.approval_status === 'changes')
    .slice(0, 12)

  const decide = async (item: WsContent, approve: boolean) => {
    const note = (notes[item.id] || '').trim()
    if (approve) {
      await update(item.id, { stage: 'approved', approval_status: 'approved', approval_note: note } as Partial<WsContent>)
      toast(`Approved “${item.title}”`)
    } else {
      await update(item.id, { stage: 'editing', approval_status: 'changes', approval_note: note } as Partial<WsContent>)
      toast(`Changes requested on “${item.title}”`)
    }
    setNotes((n) => ({ ...n, [item.id]: '' }))
  }

  return (
    <WsShell
      title="Approvals"
      subtitle={role === 'owner'
        ? 'Content your assistant sent for review — approve or send back with a note'
        : 'What Rolando has approved or sent back'}
    >
      {pending.length === 0 ? (
        <Card className="mb-5">
          <EmptyState icon={<IconStamp width={34} height={34} />} title="Nothing waiting for review"
            hint={role === 'owner' ? 'When your assistant moves content to Review, it appears here.' : 'Move a content item to Review to send it to Rolando.'} />
        </Card>
      ) : (
        <div className="grid gap-4 mb-6">
          {pending.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <BrandBadge brand={item.brand} />
                {item.platform && <span className="text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>{item.platform}</span>}
                {item.due && <span className="text-[11px] font-semibold tnum" style={{ color: 'var(--color-accent)' }}>due {fmtWsDate(item.due)}</span>}
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, #d97706 12%, transparent)', color: '#d97706' }}>
                  Awaiting review
                </span>
              </div>
              <h2 className="text-[17px] font-semibold mt-1.5" style={{ color: 'var(--color-text)' }}>{item.title}</h2>

              <button onClick={() => setOpen(open === item.id ? null : item.id)}
                className="text-xs font-semibold mt-1" style={{ color: 'var(--color-accent)' }}>
                {open === item.id ? 'Hide details' : 'Show hook, script & caption'}
              </button>
              {open === item.id && (
                <div className="grid gap-3 mt-3 rounded-xl p-3.5" style={{ background: 'var(--color-bg)' }}>
                  <Detail label="Idea" value={item.idea} />
                  <Detail label="Hook" value={item.hook} />
                  <Detail label="Script" value={item.script} />
                  <Detail label="Caption" value={item.caption} />
                  <Detail label="Notes" value={item.notes} />
                  {item.final_link && (
                    <a href={item.final_link} target="_blank" rel="noreferrer" className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
                      ▶ Watch the final cut
                    </a>
                  )}
                  {!item.final_link && item.raw_link && (
                    <a href={item.raw_link} target="_blank" rel="noreferrer" className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
                      Open raw media
                    </a>
                  )}
                </div>
              )}

              {role === 'owner' && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <input value={notes[item.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                    placeholder="Optional note to your assistant…"
                    className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={wsField} />
                  <div className="flex gap-2">
                    <Button onClick={() => void decide(item, true)} style={{ background: '#059669' }}>Approve</Button>
                    <Button variant="outline" onClick={() => void decide(item, false)} style={{ color: '#dc2626', borderColor: 'color-mix(in srgb, #dc2626 40%, transparent)' }}>
                      Request changes
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Recent decisions</h2>
          <Card className="p-2">
            <ul className="flex flex-col">
              {recent.map((item) => (
                <li key={item.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl">
                  <BrandBadge brand={item.brand} />
                  <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>{item.title}</span>
                  {item.approval_note && <span className="text-[11px] truncate max-w-[200px]" style={{ color: 'var(--color-muted)' }}>“{item.approval_note}”</span>}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={item.approval_status === 'approved'
                      ? { background: 'color-mix(in srgb, #059669 12%, transparent)', color: '#059669' }
                      : { background: 'color-mix(in srgb, #dc2626 12%, transparent)', color: '#dc2626' }}>
                    {item.approval_status === 'approved' ? 'Approved' : 'Changes requested'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </WsShell>
  )
}
