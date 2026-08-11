import { useMemo, useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconPlus, IconTrash, IconBook } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useWsTable, type WsSop } from '../../lib/workspace'

export const SOP_CATEGORIES = [
  'Daily Operations', 'STB Content', 'ALTO Content', 'Editing',
  'Publishing', 'File Management', 'Brand Voice', 'Approvals',
]

export default function WsSops() {
  const confirmDelete = useConfirmDelete()
  const { rows, insert, update, remove } = useWsTable<WsSop>('ws_sops', 'sort', true)
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<WsSop | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', category: SOP_CATEGORIES[0] })

  const categories = useMemo(() => {
    const used = new Set((rows ?? []).map((s) => s.category))
    return ['All', ...SOP_CATEGORIES, ...[...used].filter((c) => !SOP_CATEGORIES.includes(c))]
  }, [rows])

  const visible = (rows ?? []).filter((s) => category === 'All' || s.category === category)

  const add = async () => {
    if (!draft.title.trim()) return
    const created = await insert({
      title: draft.title.trim(),
      category: draft.category,
      body: 'PLACEHOLDER — write the procedure here.',
      sort: (rows?.length ?? 0) + 1,
    } as Partial<WsSop>)
    setAdding(false)
    setDraft({ title: '', category: SOP_CATEGORIES[0] })
    if (created) { setSelected(created); setEditing(true) }
  }

  return (
    <WsShell
      title="SOPs"
      subtitle="How we do things — the assistant's internal playbook"
      action={<Button onClick={() => setAdding(true)}><IconPlus width={15} height={15} /> New SOP</Button>}
    >
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition"
            style={{
              background: category === c ? 'var(--color-accent)' : 'var(--color-surface)',
              color: category === c ? 'var(--color-on-accent)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}>
            {c}
          </button>
        ))}
      </div>

      {adding && (
        <Card className="p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="rounded-xl px-3 py-2 text-sm outline-none" style={wsField}>
              {SOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="SOP title…" />
            <Button onClick={() => void add()}>Create</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {visible.length === 0 ? (
        <Card><EmptyState icon={<IconBook width={34} height={34} />} title="No SOPs here yet" hint="Create one — clear procedures are what make delegation work." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <Card key={s.id} className="p-4 cursor-pointer transition hover:-translate-y-0.5" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <button onClick={() => { setSelected(s); setEditing(false) }} className="w-full text-left">
                <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-accent)' }}>{s.category}</div>
                <p className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{s.title}</p>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.body}
                </p>
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Reader / editor */}
      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-center px-4 py-6" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-2 mb-1">
                <div className="flex-1">
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <select value={selected.category} onChange={(e) => setSelected({ ...selected, category: e.target.value })}
                        className="rounded-xl px-2.5 py-1.5 text-xs outline-none w-fit" style={wsField}>
                        {SOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <Input value={selected.title} onChange={(e) => setSelected({ ...selected, title: e.target.value })} className="font-semibold" />
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>{selected.category}</div>
                      <h2 className="text-lg font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>{selected.title}</h2>
                    </>
                  )}
                </div>
                <button
                  onClick={() => confirmDelete({ label: `“${selected.title}”`, onConfirm: () => { void remove(selected.id); setSelected(null) } })}
                  style={{ color: 'var(--color-muted)' }} aria-label="Delete"><IconTrash width={16} height={16} /></button>
              </div>

              {editing ? (
                <textarea value={selected.body} onChange={(e) => setSelected({ ...selected, body: e.target.value })}
                  rows={16} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mt-3 leading-relaxed" style={wsField} />
              ) : (
                <pre className="text-sm mt-3 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)', fontFamily: 'inherit' }}>{selected.body}</pre>
              )}

              <div className="flex justify-end gap-2 mt-4">
                {editing ? (
                  <>
                    <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={async () => {
                      await update(selected.id, { category: selected.category, title: selected.title, body: selected.body } as Partial<WsSop>)
                      setEditing(false)
                    }}>Save</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                    <Button onClick={() => setSelected(null)}>Close</Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </WsShell>
  )
}
