/**
 * Frontend AI helper. Builds a compact snapshot of everything the user has saved
 * locally and sends it, with their question, to the Netlify function at
 * /.netlify/functions/ask. The function holds the OpenAI key — never the browser.
 */

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

const get = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem('jess:' + key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Build a readable, bounded text snapshot of the user's data for the model. */
export function buildContext(): string {
  const parts: string[] = []

  const tasks = get<{ text: string; done: boolean }[]>('tasks.master', [])
  if (tasks.length) parts.push('TASKS:\n' + tasks.map((t) => `- [${t.done ? 'done' : 'open'}] ${t.text}`).join('\n'))

  const dump = get<{ text: string }[]>('tasks.dump', [])
  if (dump.length) parts.push('BRAIN DUMP:\n' + dump.map((d) => `- ${d.text}`).join('\n'))

  for (const board of ['home', 'work'] as const) {
    const data = get<Record<string, { text: string; done: boolean }[]>>(`work.${board}`, {})
    const lines = Object.entries(data)
      .filter(([, items]) => items.length)
      .map(([day, items]) => `${day}: ${items.map((i) => `${i.text}${i.done ? ' (done)' : ''}`).join(', ')}`)
    if (lines.length) parts.push(`${board.toUpperCase()} WEEK:\n` + lines.join('\n'))
  }

  // Payments
  const bills = get<{ id: string; name: string; amount: number }[]>('pay.bills', [])
  const paid = get<Record<string, boolean>>('pay.paid', {})
  const income = get<Record<string, number>>('pay.income', {})
  const year = get<number>('pay.year', new Date().getFullYear())
  if (bills.length) {
    const billLines = bills.map((b) => {
      const months = MONTHS.map((m, i) => (paid[`${year}:${b.id}:${i}`] ? m : null)).filter(Boolean)
      return `- ${b.name}: $${b.amount}/mo. Paid in ${year}: ${months.length ? months.join(', ') : 'none'}`
    })
    const incomeLine = MONTHS.map((m, i) => (income[`${year}:${i}`] ? `${m} $${income[`${year}:${i}`]}` : null))
      .filter(Boolean)
      .join(', ')
    parts.push(`BILLS (${year}):\n${billLines.join('\n')}${incomeLine ? `\nIncome: ${incomeLine}` : ''}`)
  }

  const accounts = get<{ name: string; type: string; balance: number }[]>('bank.accounts', [])
  if (accounts.length) parts.push('BANK:\n' + accounts.map((a) => `- ${a.name} (${a.type}): $${a.balance}`).join('\n'))

  const events = get<{ date: string; title: string }[]>('calendar.events', [])
  if (events.length)
    parts.push('CALENDAR:\n' + events.map((e) => `- ${e.date}: ${e.title}`).join('\n'))

  const weights = get<{ date: string; value: number }[]>('health.weights', [])
  if (weights.length) parts.push('WEIGHT LOG:\n' + weights.map((w) => `- ${w.date}: ${w.value}`).join('\n'))

  const records = get<{ date: string; kind: string; title: string; notes: string }[]>('health.records', [])
  if (records.length)
    parts.push('HEALTH RECORDS:\n' + records.map((r) => `- ${r.date} [${r.kind}] ${r.title}${r.notes ? ` — ${r.notes}` : ''}`).join('\n'))

  const members = get<{ name: string; relation: string; birthday: string }[]>('family.members', [])
  if (members.length)
    parts.push('FAMILY:\n' + members.map((m) => `- ${m.name} (${m.relation})${m.birthday ? `, birthday ${m.birthday}` : ''}`).join('\n'))

  const appts = get<{ date: string; who: string; what: string }[]>('family.appts', [])
  if (appts.length)
    parts.push('FAMILY APPOINTMENTS:\n' + appts.map((a) => `- ${a.date}: ${a.who} — ${a.what}`).join('\n'))

  const meds = get<{ who: string; name: string; dose: string; schedule: string }[]>('family.meds', [])
  if (meds.length)
    parts.push('MEDICINE:\n' + meds.map((m) => `- ${m.who}: ${m.name} ${m.dose} ${m.schedule}`).join('\n'))

  const text = parts.join('\n\n')
  return text.length > 14000 ? text.slice(0, 14000) + '\n…(truncated)' : text
}

export type AskResult =
  | { ok: true; answer: string }
  | { ok: false; reason: 'not_configured' | 'error' | 'offline' }

/** Ask the AI. Returns a typed result so the UI can fall back gracefully. */
export async function askAI(question: string, history: ChatMessage[]): Promise<AskResult> {
  try {
    const res = await fetch('/.netlify/functions/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: buildContext(), history }),
    })
    if (!res.ok) return { ok: false, reason: 'error' }
    const data = (await res.json()) as { answer?: string; error?: string }
    if (data.error === 'not_configured') return { ok: false, reason: 'not_configured' }
    if (data.error || !data.answer) return { ok: false, reason: 'error' }
    return { ok: true, answer: data.answer }
  } catch {
    // Function not reachable (e.g. running `vite dev` without `netlify dev`).
    return { ok: false, reason: 'offline' }
  }
}
