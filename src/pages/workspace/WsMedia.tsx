import { useState } from 'react'
import { Card, Button, Input, EmptyState } from '../../components/ui'
import { IconPlus, IconTrash, IconFolder, IconLink } from '../../components/icons'
import { WsShell, wsField } from '../../components/WorkspaceLayout'
import { useConfirmDelete } from '../../lib/confirmDelete'
import { useWsTable, ASSISTANT_NAME, type WsMediaLink } from '../../lib/workspace'

/**
 * Media hub — LINKS ONLY. Video files live in Google Drive; the app never
 * stores media in localStorage or the database, just the folder/file URLs.
 */

/** One Drive folder per publishing channel — the same three pipelines as the
 * sidebar, so "where is that link?" is answered by where the video ships. */
const CHANNELS: { title: string; hint: string; brand: WsMediaLink['brand'] }[] = [
  { title: 'YouTube — Creando en ALTO', hint: 'The channel’s Drive folder — episodes, thumbnails, clips.', brand: 'YouTube' },
  { title: 'STB TikTok', hint: 'South Texas Builders short-form Drive folder.', brand: 'STB' },
  { title: 'Personal Brand — Marca Personal', hint: 'Carlos’s pipeline Drive folder.', brand: 'Personal' },
]

function LinkRow({ link, onEdit, onRemove }: { link: WsMediaLink; onEdit: () => void; onRemove: () => void }) {
  return (
    <li className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ background: 'var(--color-bg)' }}>
      <span style={{ color: 'var(--color-accent)' }}><IconLink width={15} height={15} /></span>
      <div className="flex-1 min-w-0">
        {link.url ? (
          <a href={link.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline block truncate" style={{ color: 'var(--color-text)' }}>
            {link.label}
          </a>
        ) : (
          <button onClick={onEdit} className="text-sm font-medium block truncate text-left" style={{ color: 'var(--color-muted)' }}>
            {link.label} <span className="text-xs">(no link yet — tap to add)</span>
          </button>
        )}
        {link.notes && <p className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>{link.notes}</p>}
      </div>
      <button onClick={onEdit} className="text-xs font-semibold opacity-0 group-hover:opacity-100 shrink-0" style={{ color: 'var(--color-accent)' }}>Edit</button>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-60 shrink-0" style={{ color: 'var(--color-muted)' }} aria-label="Delete">
        <IconTrash width={13} height={13} />
      </button>
    </li>
  )
}

export default function WsMedia() {
  const confirmDelete = useConfirmDelete()
  const { rows, insert, update, remove } = useWsTable<WsMediaLink>('ws_media_links', 'created_at', true)
  const [editing, setEditing] = useState<WsMediaLink | null>(null)
  const [adding, setAdding] = useState<{ brand: WsMediaLink['brand']; kind: WsMediaLink['kind'] } | null>(null)
  const [draft, setDraft] = useState({ label: '', url: '', notes: '' })

  // Everything that isn't a channel slot lands here — including any links from
  // the old raw/finished layout, so nothing saved before the redesign is lost.
  const others = (rows ?? []).filter((l) => l.kind !== 'channel')

  const saveNew = async () => {
    if (!adding || !draft.label.trim()) return
    await insert({ ...adding, label: draft.label.trim(), url: draft.url.trim(), notes: draft.notes.trim() } as Partial<WsMediaLink>)
    setAdding(null)
    setDraft({ label: '', url: '', notes: '' })
  }

  return (
    <WsShell
      title="Media"
      subtitle="Google Drive links for raw footage and finished content — files stay in Drive, only links live here"
      action={<Button onClick={() => { setAdding({ brand: 'General', kind: 'other' }); setDraft({ label: '', url: '', notes: '' }) }}><IconPlus width={15} height={15} /> Add link</Button>}
    >
      <div className="grid gap-5 md:grid-cols-3">
        {CHANNELS.map((g) => {
          // One slot per channel: the first channel-kind link for this brand.
          const link = (rows ?? []).find((l) => l.kind === 'channel' && l.brand === g.brand)
          return (
            <Card key={g.title} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <span style={{ color: 'var(--color-accent)' }}><IconFolder width={17} height={17} /></span>
                <h2 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--color-text)' }}>{g.title}</h2>
              </div>
              {link ? (
                <ul className="flex flex-col gap-1.5">
                  <LinkRow link={link} onEdit={() => setEditing(link)}
                    onRemove={() => confirmDelete({ label: `“${link.label}”`, onConfirm: () => void remove(link.id) })} />
                </ul>
              ) : (
                <button
                  onClick={() => { setAdding({ brand: g.brand, kind: 'channel' }); setDraft({ label: `${g.title} — Drive folder`, url: '', notes: '' }) }}
                  className="w-full rounded-xl px-3 py-4 text-sm text-left"
                  style={{ border: '1.5px dashed var(--color-border)', color: 'var(--color-muted)' }}>
                  + Add the Google Drive link
                  <span className="block text-xs mt-0.5">{g.hint}</span>
                </button>
              )}
            </Card>
          )
        })}

        <Card className="p-5 md:col-span-3">
          <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Other links</h2>
          {others.length === 0 ? (
            <EmptyState icon={<IconFolder width={30} height={30} />} title="No other links" hint={`Brand kits, logo folders, music libraries — anything else ${ASSISTANT_NAME} needs.`} />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {others.map((l) => (
                <LinkRow key={l.id} link={l} onEdit={() => setEditing(l)}
                  onRemove={() => confirmDelete({ label: `“${l.label}”`, onConfirm: () => void remove(l.id) })} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Add / edit modals share the same small form */}
      {(adding || editing) && (
        <div className="fixed inset-0 z-40 grid place-items-center px-4" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { setAdding(null); setEditing(null) }}>
          <Card className="w-full max-w-md p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{editing ? 'Edit link' : 'Add link'}</h2>
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Label
                <Input autoFocus value={editing ? editing.label : draft.label}
                  onChange={(e) => editing ? setEditing({ ...editing, label: e.target.value }) : setDraft({ ...draft, label: e.target.value })}
                  className="mt-1 font-normal" placeholder="e.g. STB — March kitchen remodel raw clips" />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>URL
                <Input value={editing ? editing.url : draft.url}
                  onChange={(e) => editing ? setEditing({ ...editing, url: e.target.value }) : setDraft({ ...draft, url: e.target.value })}
                  className="mt-1 font-normal" placeholder="https://drive.google.com/…" />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Notes
                <textarea value={editing ? editing.notes : draft.notes}
                  onChange={(e) => editing ? setEditing({ ...editing, notes: e.target.value }) : setDraft({ ...draft, notes: e.target.value })}
                  rows={2} className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setAdding(null); setEditing(null) }}>Cancel</Button>
                <Button onClick={async () => {
                  if (editing) { await update(editing.id, { label: editing.label, url: editing.url, notes: editing.notes } as Partial<WsMediaLink>); setEditing(null) }
                  else await saveNew()
                }}>Save</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </WsShell>
  )
}
