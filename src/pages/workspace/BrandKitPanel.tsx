import { useRef, useState } from 'react'
import { Card, Button, Input } from '../../components/ui'
import { wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import {
  toLogoDataUrl, extractPalette, parseKit, BRAND_LABEL,
  type BrandKey, type BrandKit,
} from '../../lib/brandKit'

/**
 * The brand kit for one company: drop in the logo and the palette is read
 * straight out of it, then fonts and a link to the full brand package sit
 * alongside. Everything here is fed to the AI as brand context, so a draft
 * comes back already speaking in the right colours and type.
 *
 * Fonts can't be recovered from a picture — those are typed in (or live in the
 * linked package), which is why they're fields rather than magic.
 */
export default function BrandKitPanel({ brand, raw, onSave, canEdit }: {
  brand: BrandKey
  raw?: string
  onSave: (value: string) => Promise<unknown>
  canEdit: boolean
}) {
  const { toast } = useToast()
  const kit = parseKit(raw)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BrandKit>(kit)

  const persist = async (next: BrandKit) => {
    await onSave(JSON.stringify(next))
  }

  const onLogo = async (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    try {
      const logo = await toLogoDataUrl(file)
      const colors = await extractPalette(file)
      const next = { ...kit, logo, colors }
      setDraft(next)
      await persist(next)
      toast(colors.length ? `Logo saved · ${colors.length} colours picked up` : 'Logo saved')
    } catch {
      toast('Could not read that image')
    }
    setBusy(false)
  }

  const rePick = async () => {
    if (!kit.logo) return
    setBusy(true)
    try {
      const colors = await extractPalette(kit.logo)
      await persist({ ...kit, colors })
      toast('Palette refreshed')
    } catch { toast('Could not read the logo') }
    setBusy(false)
  }

  return (
    <Card className="p-5 h-fit">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Brand kit</h2>
        {canEdit && (
          <button onClick={() => { setDraft(kit); setEditing(!editing) }}
            className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        {BRAND_LABEL[brand]} — logo, colours and type. Every AI draft is grounded in this.
      </p>

      {/* Logo + palette */}
      <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg grid place-items-center shrink-0"
            style={{ width: 68, height: 46, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {kit.logo
              ? <img src={kit.logo} alt="" draggable={false} style={{ maxHeight: 38, maxWidth: 60, objectFit: 'contain' }} />
              : <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>No logo</span>}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-1">
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="text-xs font-semibold text-left" style={{ color: 'var(--color-accent)' }}>
                {busy ? 'Reading…' : kit.logo ? 'Replace logo' : 'Upload logo'}
              </button>
              {kit.logo && (
                <button onClick={() => void rePick()} disabled={busy}
                  className="text-xs text-left" style={{ color: 'var(--color-muted)' }}>Re-read colours</button>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { void onLogo(e.target.files?.[0]); e.currentTarget.value = '' }} />
        </div>

        {kit.colors && kit.colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {kit.colors.map((c) => (
              <button key={c} title={`${c} — tap to copy`}
                onClick={() => { void navigator.clipboard.writeText(c); toast(`${c} copied`) }}
                className="rounded-lg overflow-hidden text-left" style={{ border: '1px solid var(--color-border)' }}>
                <span className="block" style={{ width: 54, height: 26, background: c }} />
                <span className="block text-[9px] px-1 py-0.5 tnum" style={{ color: 'var(--color-muted)' }}>{c}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Heading font
            <Input value={draft.headingFont ?? ''} onChange={(e) => setDraft({ ...draft, headingFont: e.target.value })}
              placeholder="e.g. Playfair Display" className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Body font
            <Input value={draft.bodyFont ?? ''} onChange={(e) => setDraft({ ...draft, bodyFont: e.target.value })}
              placeholder="e.g. Inter" className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Brand package link
            <Input value={draft.packageUrl ?? ''} onChange={(e) => setDraft({ ...draft, packageUrl: e.target.value })}
              placeholder="Drive/Dropbox link with fonts & assets" className="mt-1 font-normal" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Notes
            <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={3} placeholder="Tone, do's and don'ts, logo usage…"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal" style={wsField} />
          </label>
          <Button onClick={async () => { await persist({ ...kit, ...draft }); setEditing(false); toast('Brand kit saved') }}>
            Save brand kit
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[
            { label: 'Heading font', value: kit.headingFont },
            { label: 'Body font', value: kit.bodyFont },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{label}</span>
              <span className="text-sm text-right" style={{ color: value ? 'var(--color-text)' : 'var(--color-muted)' }}>{value || 'Not set'}</span>
            </div>
          ))}
          {kit.packageUrl && (
            <a href={kit.packageUrl} target="_blank" rel="noopener"
              className="text-xs font-semibold mt-1" style={{ color: 'var(--color-accent)' }}>Open brand package ↗</a>
          )}
          {kit.notes && (
            <p className="text-xs leading-relaxed mt-1 whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>{kit.notes}</p>
          )}
        </div>
      )}
    </Card>
  )
}
