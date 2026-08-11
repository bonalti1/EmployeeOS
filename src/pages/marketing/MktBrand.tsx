import { useEffect, useRef, useState } from 'react'
import { Card, Button } from '../../components/ui'
import { wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import { useWorkspace } from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import { useMktCompany, BRAND_SECTIONS, BRAND_KIT_KEYS, type BrandSectionKey, type MktCompany } from '../../lib/marketing'

/**
 * Brand DNA editor — the single source of truth for a company's voice,
 * customer, proof and claims rules. Every generation for this company is
 * grounded in exactly this profile, fetched server-side by company_id.
 * Owner-editable (enforced by RLS); the assistant sees it read-only.
 */

type Profile = Record<BrandSectionKey, Record<string, string>>

const emptyProfile = (): Profile =>
  Object.fromEntries(BRAND_SECTIONS.map((s) => [s.key, {}])) as Profile

/**
 * Brand Kit — the company's real logo and brand colors. The logo file is
 * uploaded to the marketing-assets bucket (cache-busted per upload) and its
 * public URL saved in visual_brand; colors are hex values with pickers.
 * Everything here rides into generation context like any other DNA field.
 */
function BrandKit({ company, visual, canEdit, onChange }: {
  company: MktCompany
  visual: Record<string, string>
  canEdit: boolean
  onChange: (k: string, v: string) => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const logoUrl = visual[BRAND_KIT_KEYS.logo] || ''

  const uploadLogo = async (file: File) => {
    if (!supabase) return
    if (file.size > 4 * 1024 * 1024) { toast('Logo must be under 4 MB'); return }
    setUploading(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `brand/${company.slug}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('marketing-assets').upload(path, file, { upsert: true, contentType: file.type })
    setUploading(false)
    if (error) { toast('Upload failed — check that the Marketing Studio SQL has been run'); return }
    const { data } = supabase.storage.from('marketing-assets').getPublicUrl(path)
    onChange(BRAND_KIT_KEYS.logo, data.publicUrl)
    toast('Logo uploaded — remember to Save Brand DNA')
  }

  const colors: { k: string; label: string }[] = [
    { k: BRAND_KIT_KEYS.colorPrimary, label: 'Primary' },
    { k: BRAND_KIT_KEYS.colorSecondary, label: 'Secondary' },
    { k: BRAND_KIT_KEYS.colorAccent, label: 'Accent' },
  ]

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Brand Kit — {company.name}</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
        The real logo and exact brand colors. Generated creatives follow these colors, and the logo is kept for
        overlay in editing (AI image models mangle logos, so it's never asked to draw one).
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {/* Logo */}
        <div>
          <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted)' }}>Logo</div>
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 rounded-xl grid place-items-center overflow-hidden"
              style={{ background: 'var(--color-bg)', border: '1px dashed var(--color-border)' }}>
              {logoUrl
                ? <img src={logoUrl} alt={`${company.name} logo`} className="max-h-full max-w-full object-contain p-1.5" />
                : <span className="text-[10px] text-center px-2" style={{ color: 'var(--color-muted)' }}>No logo yet</span>}
            </div>
            {canEdit && (
              <div className="flex flex-col gap-1.5">
                <Button variant="outline" className="text-xs px-2.5 py-1.5"
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoUrl && (
                  <button onClick={() => onChange(BRAND_KIT_KEYS.logo, '')} className="text-[11px] font-semibold text-left"
                    style={{ color: 'var(--color-muted)' }}>
                    Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = '' }} />
              </div>
            )}
          </div>
        </div>

        {/* Colors */}
        <div>
          <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted)' }}>Brand colors</div>
          <div className="flex gap-4">
            {colors.map(({ k, label }) => {
              const val = visual[k] || ''
              return (
                <div key={k} className="flex flex-col items-center gap-1.5">
                  <label className="relative h-12 w-12 rounded-xl overflow-hidden cursor-pointer grid place-items-center"
                    style={{ background: val || 'var(--color-bg)', border: `1px ${val ? 'solid' : 'dashed'} var(--color-border)` }}>
                    {!val && <span className="text-lg" style={{ color: 'var(--color-muted)' }}>+</span>}
                    {canEdit && (
                      <input type="color" value={val || '#888888'}
                        onChange={(e) => onChange(k, e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    )}
                  </label>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>{label}</span>
                  {val ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] tnum" style={{ color: 'var(--color-text)' }}>{val}</span>
                      {canEdit && (
                        <button onClick={() => onChange(k, '')} className="text-[10px]" style={{ color: 'var(--color-muted)' }} aria-label={`Clear ${label}`}>✕</button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>not set</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Live preview chip */}
        {(visual[BRAND_KIT_KEYS.colorPrimary] || logoUrl) && (
          <div>
            <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted)' }}>Preview</div>
            <div className="rounded-xl px-4 py-3 flex items-center gap-2.5"
              style={{
                background: visual[BRAND_KIT_KEYS.colorPrimary] || 'var(--color-bg)',
                border: '1px solid var(--color-border)', minWidth: 180,
              }}>
              {logoUrl && <img src={logoUrl} alt="" className="h-7 w-auto object-contain" />}
              <span className="text-sm font-bold" style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
                {company.name}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default function MktBrand() {
  const { role } = useWorkspace()
  const { company } = useMktCompany()
  const { toast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [open, setOpen] = useState<BrandSectionKey>('identity')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const canEdit = role === 'owner'

  useEffect(() => {
    setProfile(null)
    setDirty(false)
    if (!supabase || !company) return
    void supabase.from('mkt_brand_profiles').select('*').eq('company_id', company.id).maybeSingle()
      .then(({ data }) => {
        const base = emptyProfile()
        if (data) for (const s of BRAND_SECTIONS) base[s.key] = (data as Record<string, Record<string, string>>)[s.key] ?? {}
        setProfile(base)
      })
  }, [company])

  const setField = (section: BrandSectionKey, k: string, v: string) => {
    setProfile((p) => (p ? { ...p, [section]: { ...p[section], [k]: v } } : p))
    setDirty(true)
  }

  const save = async () => {
    if (!supabase || !company || !profile) return
    setSaving(true)
    const { error } = await supabase.from('mkt_brand_profiles').upsert({
      company_id: company.id, ...profile, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    setSaving(false)
    if (error) toast('Save failed — only the owner can edit Brand DNA')
    else { setDirty(false); toast(`${company.name} Brand DNA saved`) }
  }

  if (!profile) return <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading Brand DNA…</Card>

  const filled = BRAND_SECTIONS.map((s) => ({
    key: s.key,
    count: s.fields.filter((f) => (profile[s.key][f.k] || '').trim()).length,
    total: s.fields.length,
  }))

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm max-w-xl leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          This profile is the ground truth for every {company?.name} generation — the sharper it is, the sharper the
          campaigns. {canEdit ? 'Only fill what you know; empty fields are simply omitted.' : 'Editable by Rolando.'}
        </p>
        {canEdit && (
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Saving…' : dirty ? 'Save Brand DNA' : 'Saved'}
          </Button>
        )}
      </div>

      {company && (
        <BrandKit company={company} visual={profile.visual_brand} canEdit={canEdit}
          onChange={(k, v) => setField('visual_brand', k, v)} />
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Section rail with completeness */}
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {BRAND_SECTIONS.map((s) => {
            const f = filled.find((x) => x.key === s.key)!
            const active = open === s.key
            return (
              <button key={s.key} onClick={() => setOpen(s.key)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition text-left"
                style={{
                  background: active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-surface)',
                  color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}>
                <span className="flex-1">{s.label}</span>
                <span className="text-[10px] tnum" style={{ opacity: 0.7 }}>{f.count}/{f.total}</span>
              </button>
            )
          })}
        </div>

        {/* Active section editor */}
        {BRAND_SECTIONS.filter((s) => s.key === open).map((s) => (
          <Card key={s.key} className="p-5">
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>{s.label}</h2>
            <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--color-muted)' }}>{s.hint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.fields.map((f) => (
                <label key={f.k} className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
                  {f.label}
                  <textarea
                    value={profile[s.key][f.k] || ''}
                    onChange={(e) => setField(s.key, f.k, e.target.value)}
                    readOnly={!canEdit}
                    rows={3}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1 font-normal leading-relaxed"
                    style={{ ...wsField, opacity: canEdit ? 1 : 0.75 }}
                  />
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
