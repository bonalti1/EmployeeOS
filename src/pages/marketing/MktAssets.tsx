import { Card, EmptyState } from '../../components/ui'
import { IconFolder } from '../../components/icons'
import { useMktCompany, useMktTable, fmtMktDate, type MktAsset } from '../../lib/marketing'

export default function MktAssets() {
  const { company } = useMktCompany()
  const assets = useMktTable<MktAsset>('mkt_assets', company?.id ?? null)

  if (assets.rows === null) return <Card className="p-6 text-sm" style={{ color: 'var(--color-muted)' }}>Loading assets…</Card>

  if (assets.rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={<IconFolder width={34} height={34} />} title={`No ${company?.name} creative assets yet`}
          hint="Generated images and videos land here, tied to their campaign. Approve the keepers." />
      </Card>
    )
  }

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {assets.rows.map((a) => (
        <div key={a.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          {a.type === 'image' || a.type === 'thumbnail' ? (
            <img src={a.url} alt="" className="w-full aspect-square object-cover" />
          ) : (
            <div className="w-full aspect-square grid place-items-center text-xs font-bold" style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}>
              {a.type.toUpperCase()}
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{fmtMktDate(a.created_at)}</span>
            <button onClick={() => void assets.update(a.id, { approved: !a.approved } as Partial<MktAsset>)}
              className="ml-auto text-[11px] font-bold" style={{ color: a.approved ? '#059669' : 'var(--color-accent)' }}>
              {a.approved ? '✓ Approved' : 'Approve'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
