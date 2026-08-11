/**
 * Read-only Google Calendar (or any iCal) import.
 *
 * The browser sends the calendar's **secret iCal URL**; this function fetches
 * the .ics server-side (avoids browser CORS, keeps the URL out of the client
 * bundle), parses the events — including simple DAILY/WEEKLY recurrences — and
 * returns a compact list for a window around today. Nothing is stored server
 * side; the URL lives only in the user's browser and is sent per request.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type GEvent = { date: string; time?: string; title: string; location?: string; allDay?: boolean }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Parse an iCal DTSTART/DTEND value + its params into a normalized shape. */
function parseWhen(value: string, params: string): { date: Date; time?: string; allDay: boolean } {
  const dateOnly = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(value)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/)
  if (!m) return { date: new Date(NaN), allDay: true }
  const [, y, mo, d, hh, mm] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d))
  if (dateOnly || hh === undefined) return { date, allDay: true }
  return { date, time: `${hh}:${mm}`, allDay: false }
}

/** Expand a VEVENT into concrete dates within [start, end]. Handles single
 *  events and simple DAILY/WEEKLY RRULEs; other freqs yield the base date. */
function expand(startDate: Date, rrule: string | undefined, winStart: Date, winEnd: Date): Date[] {
  const inWin = (d: Date) => d >= winStart && d <= winEnd
  if (!rrule) return inWin(startDate) ? [startDate] : []

  const parts: Record<string, string> = {}
  rrule.split(';').forEach((p) => { const [k, v] = p.split('='); if (k) parts[k.toUpperCase()] = v })
  const freq = parts.FREQ
  const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10))
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : Infinity
  let until = winEnd
  if (parts.UNTIL) { const u = parseWhen(parts.UNTIL, '').date; if (!isNaN(u.getTime())) until = u < winEnd ? u : winEnd }
  const byDay = parts.BYDAY ? parts.BYDAY.split(',').map((x) => BYDAY[x.trim().slice(-2).toUpperCase()]).filter((n) => n !== undefined) : []

  const out: Date[] = []
  const cap = 400
  const push = (d: Date) => { if (inWin(d) && out.length < cap) out.push(new Date(d)) }

  if (freq === 'DAILY') {
    const cur = new Date(startDate); let n = 0
    while (cur <= until && n < count && out.length < cap) { push(cur); cur.setUTCDate(cur.getUTCDate() + interval); n++ }
  } else if (freq === 'WEEKLY') {
    const days = byDay.length ? byDay : [startDate.getUTCDay()]
    // Walk week-by-week from the start's week; emit matching weekdays.
    const weekStart = new Date(startDate); weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
    let n = 0
    for (let w = 0; w < 260 && out.length < cap; w++) {
      const base = new Date(weekStart); base.setUTCDate(base.getUTCDate() + w * 7 * interval)
      if (base > until) break
      for (const wd of days) {
        const occ = new Date(base); occ.setUTCDate(occ.getUTCDate() + wd)
        if (occ >= startDate && occ <= until && n < count) { push(occ); n++ }
      }
    }
  } else {
    // MONTHLY/YEARLY or unknown — show the base occurrence only.
    push(startDate)
  }
  return out
}

function parseIcs(text: string, now: Date): GEvent[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const winStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 31))
  const winEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 120))
  const events: GEvent[] = []

  const blocks = unfolded.split('BEGIN:VEVENT').slice(1)
  for (const block of blocks) {
    const body = block.split('END:VEVENT')[0]
    const props: Record<string, { params: string; value: string }> = {}
    for (const line of body.split('\n')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const left = line.slice(0, idx)
      const value = line.slice(idx + 1).trim()
      const semi = left.indexOf(';')
      const name = (semi === -1 ? left : left.slice(0, semi)).toUpperCase().trim()
      const params = semi === -1 ? '' : left.slice(semi + 1)
      if (name) props[name] = { params, value }
    }
    if (!props.DTSTART || !props.SUMMARY) continue
    const when = parseWhen(props.DTSTART.value, props.DTSTART.params)
    if (isNaN(when.date.getTime())) continue
    const title = props.SUMMARY.value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').trim()
    const location = props.LOCATION?.value.replace(/\\,/g, ',').trim() || undefined
    const dates = expand(when.date, props.RRULE?.value, winStart, winEnd)
    for (const d of dates) {
      events.push({ date: ymd(d), time: when.time, title, location, allDay: when.allDay })
      if (events.length >= 600) break
    }
    if (events.length >= 600) break
  }
  events.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  return events
}

function isSafeUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'webcal:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  return true
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)
  let payload: { url?: string }
  try { payload = await req.json() } catch { return json({ ok: false, reason: 'bad_request' }, 400) }

  let url = (payload.url || '').trim()
  if (url.startsWith('webcal://')) url = 'https://' + url.slice('webcal://'.length)
  if (!isSafeUrl(url)) return json({ ok: false, reason: 'bad_url', message: 'Paste a valid https iCal link.' })

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'RolandoDashboard/1.0 (+calendar-import)' } })
    if (!res.ok) return json({ ok: false, reason: 'fetch_failed', message: `Calendar returned ${res.status}. Double-check the secret iCal link.` })
    const text = (await res.text()).slice(0, 4_000_000)
    if (!/BEGIN:VCALENDAR/i.test(text)) return json({ ok: false, reason: 'not_ical', message: "That link didn't return a calendar. Use the *Secret address in iCal format*." })
    const events = parseIcs(text, new Date())
    return json({ ok: true, events, count: events.length })
  } catch (err) {
    console.error('calendar-ics error:', (err as Error).message)
    return json({ ok: false, reason: 'error', message: 'Could not fetch that calendar.' })
  }
}
