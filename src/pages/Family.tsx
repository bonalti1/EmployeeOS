import { useMemo, useState } from 'react'
import { Card, PageHeader, Button, Input, EmptyState } from '../components/ui'
import { IconPlus, IconTrash, IconFamily } from '../components/icons'
import { useStore, uid } from '../lib/store'
import { useConfirmDelete } from '../lib/confirmDelete'
import { GROWTH_TOPICS, pickGrowthIdeas, type GrowthIdea } from '../lib/familyGrowth'

type Member = {
  id: string; name: string; relation: string; birthday: string
  photo?: string; allergies?: string; doctor?: string; insurance?: string; emergency?: string; notes?: string
}
type Appt = { id: string; memberId?: string; who: string; what: string; date: string; time?: string }
type Med = { id: string; memberId?: string; who: string; name: string; dose: string; schedule: string }
type Rec = { id: string; memberId: string; date: string; kind: string; title: string; notes: string; file?: { name: string; data: string } }

const REC_KINDS = ['Report card', 'Medical', 'School', 'Document', 'Other']

function ageFrom(bday: string): number | null {
  const [y, m, d] = bday.split('-').map(Number)
  if (!y || !m || !d) return null
  const t = new Date()
  let age = t.getFullYear() - y
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age--
  return age >= 0 ? age : null
}
function daysUntilBirthday(bday: string): number | null {
  const [, mm, dd] = bday.split('-').map(Number)
  if (!mm || !dd) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(now.getFullYear(), mm - 1, dd)
  if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd)
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtBday(bday: string): string {
  const [, mm, dd] = bday.split('-').map(Number)
  if (!mm || !dd) return ''
  return `${MONTHS_SHORT[mm - 1]} ${dd}`
}
/** Kids get full tracking (appointments, meds); everyone else is birthdays-only. */
const isKid = (relation: string) => /son|daughter|kid|child/i.test(relation)

const fieldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

function Avatar({ member, size = 44 }: { member: Member; size?: number }) {
  return member.photo ? (
    <img src={member.photo} alt={member.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full grid place-items-center font-bold shrink-0" style={{ width: size, height: size, background: 'var(--color-accent)', color: 'var(--color-on-accent)', fontSize: size * 0.4 }}>
      {member.name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function Family() {
  const [members, setMembers] = useStore<Member[]>('family.members', [])
  const [appts, setAppts] = useStore<Appt[]>('family.appts', [])
  const [meds, setMeds] = useStore<Med[]>('family.meds', [])
  const [records, setRecords] = useStore<Rec[]>('family.records', [])
  const confirmDelete = useConfirmDelete()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newMember, setNewMember] = useState({ name: '', relation: '', birthday: '' })

  const selected = members.find((m) => m.id === selectedId) || null

  // Kids (for personalizing growth ideas) = young members.
  const kidNames = members.filter((m) => { const a = ageFrom(m.birthday); return a != null && a <= 15 }).map((m) => m.name.split(' ')[0])
  const [growthTopic, setGrowthTopic] = useState(GROWTH_TOPICS[0].id)
  const [ideas, setIdeas] = useState<GrowthIdea[]>(() => pickGrowthIdeas(GROWTH_TOPICS[0].id, 4, kidNames))
  const pickTopic = (id: string) => { setGrowthTopic(id); setIdeas(pickGrowthIdeas(id, 4, kidNames)) }

  const upcoming = useMemo(() => members
    .map((mem) => ({ mem, days: daysUntilBirthday(mem.birthday) }))
    .filter((x) => x.days !== null)
    .sort((a, b) => a.days! - b.days!)
    .slice(0, 6), [members])

  const memberAppts = (id: string) => appts.filter((a) => a.memberId === id || (!a.memberId && a.who === selected?.name))
  const memberMeds = (id: string) => meds.filter((a) => a.memberId === id || (!a.memberId && a.who === selected?.name))
  const memberRecs = (id: string) => records.filter((r) => r.memberId === id)

  const updateMember = (id: string, patch: Partial<Member>) => setMembers((p) => p.map((m) => m.id === id ? { ...m, ...patch } : m))

  // ---------- Member list ----------
  if (!selected) {
    return (
      <div>
        <PageHeader title="Family" subtitle="Tap a person to open their profile — appointments, medicine, records and key info." />

        {upcoming.length > 0 && (
          <Card className="p-4 mb-6">
            <h2 className="font-semibold mb-2" style={{ color: 'var(--color-text)' }}>🎂 Upcoming birthdays</h2>
            <div className="flex flex-wrap gap-2">
              {upcoming.map(({ mem, days }) => (
                <span key={mem.id} className="text-sm px-3 py-1.5 rounded-full" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
                  <b>{mem.name}</b> · {fmtBday(mem.birthday)}{days === 0 ? ' · today! 🎉' : ` · in ${days} day${days === 1 ? '' : 's'}`}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Grow — the father/husband you want to be, with the "why" behind each idea */}
        {(() => {
          const topic = GROWTH_TOPICS.find((t) => t.id === growthTopic) ?? GROWTH_TOPICS[0]
          return (
            <Card className="p-5 mb-6">
              <div className="mb-4">
                <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Grow</h2>
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Pick what you want to work on — you'll get ideas and why each one matters.</p>
              </div>
              <div className="grid md:grid-cols-[190px_1fr] gap-5">
                {/* Topic picker */}
                <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
                  {GROWTH_TOPICS.map((t) => {
                    const active = t.id === growthTopic
                    return (
                      <button
                        key={t.id}
                        onClick={() => pickTopic(t.id)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left shrink-0 md:w-full transition"
                        style={{
                          background: active ? 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))' : 'var(--color-bg)',
                          border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        }}
                      >
                        <span className="text-lg shrink-0">{t.emoji}</span>
                        <span>
                          <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.label}</span>
                          <span className="hidden md:block text-[11px] leading-tight" style={{ color: 'var(--color-muted)' }}>{t.blurb}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Ideas for the chosen topic */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}><span>{topic.emoji}</span> {topic.label}</h3>
                    <Button variant="outline" onClick={() => setIdeas(pickGrowthIdeas(growthTopic, 4, kidNames))}>↻ New ideas</Button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {ideas.map((idea, i) => (
                      <div key={i} className="px-3.5 py-3 rounded-xl" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{idea.text}</p>
                        <p className="text-[13px] mt-1.5 flex gap-1.5" style={{ color: 'var(--color-muted)' }}>
                          <span className="font-semibold shrink-0" style={{ color: 'var(--color-accent)' }}>Why</span>
                          <span>{idea.why}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )
        })()}

        <Card className="p-4 mb-6">
          <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
            <Input value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} placeholder="Name" />
            <Input value={newMember.relation} onChange={(e) => setNewMember({ ...newMember, relation: e.target.value })} placeholder="Relation (e.g. Son)" />
            <Input type="date" value={newMember.birthday} onChange={(e) => setNewMember({ ...newMember, birthday: e.target.value })} />
            <Button onClick={() => {
              if (!newMember.name.trim()) return
              const mem = { id: uid('m'), name: newMember.name.trim(), relation: newMember.relation.trim(), birthday: newMember.birthday }
              setMembers((p) => [...p, mem]); setNewMember({ name: '', relation: '', birthday: '' })
            }}><IconPlus width={16} height={16} /> Add</Button>
          </div>
        </Card>

        {members.length === 0 ? (
          <EmptyState icon={<IconFamily width={44} height={44} />} title="No one added yet" hint="Add your family above, then tap a card to build their profile." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((mem) => (
              <Card key={mem.id} className="p-4 cursor-pointer transition hover:scale-[1.01]" >
                <button onClick={() => setSelectedId(mem.id)} className="w-full text-left flex items-center gap-3">
                  <Avatar member={mem} size={52} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{mem.name}</div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      {mem.relation}{mem.birthday ? ` · 🎂 ${fmtBday(mem.birthday)}` : ''}
                    </div>
                    {isKid(mem.relation) && (
                      <div className="flex gap-3 mt-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                        <span>{memberAppts(mem.id).length} appts</span>
                        <span>{memberMeds(mem.id).length} meds</span>
                      </div>
                    )}
                  </div>
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---------- Member profile ----------
  const mAppts = memberAppts(selected.id)
  const mMeds = memberMeds(selected.id)
  const mRecs = memberRecs(selected.id)

  return (
    <div>
      <button onClick={() => setSelectedId(null)} className="text-sm font-semibold mb-4 inline-flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>‹ All family</button>

      {/* Header */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-4">
          <label className="cursor-pointer relative group">
            <Avatar member={selected} size={72} />
            <span className="absolute inset-0 rounded-full grid place-items-center text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}>Photo</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return
              const r = new FileReader(); r.onload = () => updateMember(selected.id, { photo: r.result as string }); r.readAsDataURL(f)
            }} />
          </label>
          <div className="flex-1">
            <input value={selected.name} onChange={(e) => updateMember(selected.id, { name: e.target.value })} className="text-2xl font-semibold bg-transparent outline-none w-full" style={{ color: 'var(--color-text)' }} />
            <div className="flex flex-wrap gap-2 mt-1">
              <input value={selected.relation} onChange={(e) => updateMember(selected.id, { relation: e.target.value })} placeholder="Relation" className="text-sm bg-transparent outline-none" style={{ color: 'var(--color-muted)' }} />
              <span style={{ color: 'var(--color-muted)' }}>·</span>
              <input type="date" value={selected.birthday} onChange={(e) => updateMember(selected.id, { birthday: e.target.value })} className="text-sm bg-transparent outline-none" style={{ color: 'var(--color-muted)' }} />
            </div>
          </div>
          <button onClick={() => confirmDelete({ label: selected.name ? selected.name : 'this family member', detail: 'This person and all their appointments, medicine, and records will be removed.', onConfirm: () => { setMembers((p) => p.filter((m) => m.id !== selected.id)); setSelectedId(null) } })} style={{ color: 'var(--color-muted)' }}>
            <IconTrash width={18} height={18} />
          </button>
        </div>

        {/* Key info */}
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          {([['allergies', 'Allergies'], ['doctor', 'Doctor'], ['insurance', 'Insurance'], ['emergency', 'Emergency contact']] as const).map(([key, label]) => (
            <div key={key}>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>{label}</label>
              <Input value={selected[key] ?? ''} onChange={(e) => updateMember(selected.id, { [key]: e.target.value })} placeholder="—" className="mt-1" />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>Notes</label>
          <textarea value={selected.notes ?? ''} onChange={(e) => updateMember(selected.id, { notes: e.target.value })} rows={2} placeholder="Anything to remember…" className="w-full mt-1 rounded-xl px-3 py-2 text-sm outline-none resize-none" style={fieldStyle} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Appointments */}
        <Section title="Appointments">
          <AddRow onAdd={(vals) => setAppts((p) => [...p, { id: uid('a'), memberId: selected.id, who: selected.name, what: vals.what, date: vals.date, time: vals.time }].sort((x, y) => (x.date + (x.time ?? '')).localeCompare(y.date + (y.time ?? ''))))}
            fields={[{ key: 'what', placeholder: 'What (e.g. Dentist)', flex: true }, { key: 'date', placeholder: 'Date', type: 'date' }, { key: 'time', placeholder: 'Time', type: 'time' }]} />
          {mAppts.length === 0 ? <Empty /> : mAppts.map((ap) => (
            <Row key={ap.id} onDelete={() => confirmDelete({ label: ap.what ? `the appointment “${ap.what}”` : 'this appointment', onConfirm: () => setAppts((p) => p.filter((x) => x.id !== ap.id)) })}>
              <span className="text-xs font-semibold w-24 shrink-0" style={{ color: 'var(--color-accent)' }}>{ap.date || '—'}{ap.time ? ` ${ap.time}` : ''}</span>
              <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{ap.what}</span>
            </Row>
          ))}
        </Section>

        {/* Medicine */}
        <Section title="Medicine">
          <AddRow onAdd={(vals) => setMeds((p) => [...p, { id: uid('md'), memberId: selected.id, who: selected.name, name: vals.name, dose: vals.dose, schedule: vals.schedule }])}
            fields={[{ key: 'name', placeholder: 'Medicine', flex: true }, { key: 'dose', placeholder: 'Dose' }, { key: 'schedule', placeholder: 'Schedule' }]} />
          {mMeds.length === 0 ? <Empty /> : mMeds.map((md) => (
            <Row key={md.id} onDelete={() => confirmDelete({ label: md.name ? `the medicine “${md.name}”` : 'this medicine', onConfirm: () => setMeds((p) => p.filter((x) => x.id !== md.id)) })}>
              <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-text)' }}>{md.name}</span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{md.dose} {md.schedule}</span>
            </Row>
          ))}
        </Section>
      </div>

      {/* Records / report cards */}
      <RecordsSection memberId={selected.id} records={mRecs} setRecords={setRecords} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-bold text-lg mb-3" style={{ color: 'var(--color-text)' }}>{title}</h2>
      <div className="flex flex-col gap-1">{children}</div>
    </Card>
  )
}
function Empty() { return <p className="text-sm py-3 text-center" style={{ color: 'var(--color-muted)' }}>Nothing yet.</p> }
function Row({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="group flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-black/5">
      {children}
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={14} height={14} /></button>
    </div>
  )
}

function AddRow({ fields, onAdd }: { fields: { key: string; placeholder: string; type?: string; flex?: boolean }[]; onAdd: (vals: Record<string, string>) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const required = fields[0].key
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {fields.map((f) => (
        <input key={f.key} type={f.type || 'text'} value={vals[f.key] ?? ''} placeholder={f.placeholder}
          onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
          className={`rounded-xl px-3 py-2 text-sm outline-none ${f.flex ? 'flex-1 min-w-[120px]' : 'w-28'}`} style={fieldStyle} />
      ))}
      <button onClick={() => { if (!(vals[required] || '').trim()) return; onAdd(vals); setVals({}) }} className="shrink-0 rounded-xl px-3" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
        <IconPlus width={16} height={16} />
      </button>
    </div>
  )
}

function RecordsSection({ memberId, records, setRecords }: { memberId: string; records: Rec[]; setRecords: (fn: (p: Rec[]) => Rec[]) => void }) {
  const confirmDelete = useConfirmDelete()
  const [kind, setKind] = useState(REC_KINDS[0])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<{ name: string; data: string } | undefined>()
  return (
    <Card className="p-5 mt-6">
      <h2 className="font-bold text-lg mb-3" style={{ color: 'var(--color-text)' }}>Records & report cards</h2>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl px-3 py-2 text-sm outline-none" style={fieldStyle}>
          {REC_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Q1 report card)" className="rounded-xl px-3 py-2 text-sm outline-none flex-1 min-w-[160px]" style={fieldStyle} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-xl px-3 py-2 text-sm outline-none flex-1 min-w-[120px]" style={fieldStyle} />
        <label className="text-xs cursor-pointer px-3 py-2 rounded-xl" style={fieldStyle}>
          {file ? '✓ File' : '📎 Attach'}
          <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setFile({ name: f.name, data: r.result as string }); r.readAsDataURL(f) }} />
        </label>
        <button onClick={() => { if (!title.trim()) return; setRecords((p) => [{ id: uid('r'), memberId, date: new Date().toISOString().slice(0, 10), kind, title: title.trim(), notes: notes.trim(), file }, ...p]); setTitle(''); setNotes(''); setFile(undefined) }} className="rounded-xl px-3 py-2" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}><IconPlus width={16} height={16} /></button>
      </div>
      {records.length === 0 ? <Empty /> : (
        <ul className="flex flex-col gap-2">
          {records.map((r) => (
            <li key={r.id} className="group flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--color-bg)' }}>
              <span className="text-xs font-semibold px-2 py-1 rounded-md shrink-0" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>{r.kind}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{r.title}</span><span className="text-xs" style={{ color: 'var(--color-muted)' }}>{r.date}</span></div>
                {r.notes && <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>{r.notes}</p>}
                {r.file && <a href={r.file.data} download={r.file.name} className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>📎 {r.file.name}</a>}
              </div>
              <button onClick={() => confirmDelete({ label: r.title ? `the record “${r.title}”` : 'this record', detail: 'This record and any attached file will be removed.', onConfirm: () => setRecords((p) => p.filter((x) => x.id !== r.id)) })} className="opacity-0 group-hover:opacity-60" style={{ color: 'var(--color-muted)' }}><IconTrash width={16} height={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
