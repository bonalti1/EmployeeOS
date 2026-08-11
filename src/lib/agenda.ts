/**
 * Aggregates everything that has a date attached so the Calendar and
 * Notifications can show a single timeline:
 *   - dated tasks from the Tasks page (master checklist `due`)
 *   - planner tasks from the Work list (each day of each saved week)
 *
 * Calendar events, family appointments and birthdays are handled where they
 * already live; this helper covers the task-shaped sources only.
 */
import { addDays, parseDate, toISO } from './dates'

export type AgendaItem = { date: string; title: string; source: string; done: boolean }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const get = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem('jess:' + key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

export function taskAgenda(): AgendaItem[] {
  const out: AgendaItem[] = []

  // Dated tasks from the master checklist.
  get<{ text: string; done: boolean; due?: string }[]>('tasks.master', []).forEach((t) => {
    if (t.due) out.push({ date: t.due, title: t.text, source: 'Task', done: t.done })
  })

  // Planner tasks (new per-week shape: { backlog, weeks: { mondayISO: { day: [] } } }).
  for (const [key, label] of [['work.home', 'Home'], ['work.work', 'Work']] as const) {
    const board = get<{ weeks?: Record<string, Record<string, { text: string; done: boolean }[]>> }>(key, {})
    const weeks = board?.weeks
    if (!weeks) continue
    for (const [mondayISO, week] of Object.entries(weeks)) {
      const monday = parseDate(mondayISO)
      if (!monday) continue
      DAYS.forEach((day, idx) => {
        ;(week[day] ?? []).forEach((i) => {
          out.push({ date: toISO(addDays(monday, idx)), title: i.text, source: label, done: i.done })
        })
      })
    }
  }

  return out
}

/** Group agenda items by their date string (YYYY-MM-DD). */
export function agendaByDate(items: AgendaItem[]): Record<string, AgendaItem[]> {
  const map: Record<string, AgendaItem[]> = {}
  for (const it of items) (map[it.date] ??= []).push(it)
  return map
}
