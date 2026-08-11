import { useEffect, useState } from 'react'
import { Card, Button } from '../../components/ui'
import { wsField } from '../../components/WorkspaceLayout'
import { useToast } from '../../lib/toast'
import { useWorkspace } from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import { useMktCompany, BRAND_SECTIONS, type BrandSectionKey } from '../../lib/marketing'

/**
 * Brand DNA editor — the single source of truth for a company's voice,
 * customer, proof and claims rules. Every generation for this company is
 * grounded in exactly this profile, fetched server-side by company_id.
 * Owner-editable (enforced by RLS); the assistant sees it read-only.
 */

type Profile = Record<BrandSectionKey, Record<string, string>>

const emptyProfile = (): Profile =>
  Object.fromEntries(BRAND_SECTIONS.map((s) => [s.key, {}])) as Profile

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
