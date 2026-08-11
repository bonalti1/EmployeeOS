/**
 * One-time data migrations for returning visitors.
 *
 * Everything is stored in the browser's localStorage, and the app keeps
 * whatever a visitor has already saved — so when a *default* changes, or we want
 * to seed a starting set (non-negotiables, goals, kids), an existing browser
 * would otherwise never see it. Each versioned step runs exactly once and never
 * overwrites data the user has genuinely entered.
 *
 * Runs before React renders (see main.tsx), so the store reads migrated values.
 */
import { PRESETS, DEFAULT_PRESET, type Theme } from './theme'

const PREFIX = 'jess:'
const VERSION_KEY = 'migrations.version'
const CURRENT = 7

// v6 remaps the old task categories onto the new set (Task / Misc / Legal).
const CAT_REMAP: Record<string, string> = { Home: 'Task', Work: 'Task', Errands: 'Task', Someday: 'Misc' }
// v7 renames the "Misc" category to "Home improvement".
const CAT_REMAP_V7: Record<string, string> = { Misc: 'Home improvement' }

const LEGACY_ACCENTS = new Set(['#b9a8ff', '#8b7fb8', '#e8b4be', '#9d8df1'])
const LEGACY_DEFAULT_NAMES = new Set(['Jessica', 'Jessica Peña', 'Rolando'])

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* ignore */ }
}

// Rolando's weekday/weekend non-negotiables (scope: week | weekend | all).
const SEED_NONNEG = [
  { id: 'nn_sleep', text: 'Sleep — at least 7 hours', scope: 'all' },
  { id: 'nn_deep', text: 'Deep work or relaxation (morning)', scope: 'week' },
  { id: 'nn_school', text: 'Get the kids ready & to school', scope: 'week' },
  { id: 'nn_gym', text: 'Gym / exercise', scope: 'week' },
  { id: 'nn_needle', text: 'Move the needle — 1 task to grow the business', scope: 'week' },
  { id: 'nn_home', text: 'Clear one home task from the backlog', scope: 'week' },
  { id: 'nn_family', text: 'Family time with the kids (evening)', scope: 'week' },
  { id: 'nn_wend_activity', text: 'Family activity — bike ride or outing', scope: 'weekend' },
  { id: 'nn_wend_move', text: 'Move / exercise', scope: 'weekend' },
  { id: 'nn_wend_relax', text: 'Relax & recharge', scope: 'weekend' },
  { id: 'nn_wend_plan', text: 'Plan the week ahead', scope: 'weekend' },
]

// Goals grouped by category (Health, Business, Family, Non-negotiables).
const SEED_GOALS = [
  { id: 'g_h_bodyfat', text: '12% body fat', category: 'Health' },
  { id: 'g_h_train', text: 'Train / exercise consistently', category: 'Health' },
  { id: 'g_h_muscle', text: 'Build muscle, drop fat', category: 'Health' },
  { id: 'g_b_100k', text: '$100K / month', category: 'Business' },
  { id: 'g_b_1m', text: '$1M+ / month (long-term)', category: 'Business' },
  { id: 'g_b_10homes', text: '10 homes / month', category: 'Business' },
  { id: 'g_b_grow', text: 'Grow the company', category: 'Business' },
  { id: 'g_b_team', text: 'Build the team', category: 'Business' },
  { id: 'g_f_time', text: 'Daily present time with Noah & Natalia', category: 'Family' },
  { id: 'g_f_school', text: 'Own the school mornings & evenings', category: 'Family' },
  { id: 'g_f_trips', text: 'Family trips & adventures', category: 'Family' },
  { id: 'g_n_sleep', text: 'Sleep 7+ hours', category: 'Non-negotiables' },
  { id: 'g_n_deep', text: 'Deep work daily', category: 'Non-negotiables' },
  { id: 'g_n_needle', text: 'Move the needle daily', category: 'Non-negotiables' },
  { id: 'g_n_home', text: 'One home task daily', category: 'Non-negotiables' },
].map((g) => ({ ...g, done: false }))

// The original flat goal ids (v2 seed) that v4 replaces with the grouped set.
const LEGACY_GOAL_IDS = Array.from({ length: 9 }, (_, i) => `goal_${i}`)

const SEED_KIDS = [
  { id: 'kid_noe', name: 'Noah', relation: 'Son', birthday: '2017-11-07' },
  { id: 'kid_natalia', name: 'Natalia', relation: 'Daughter', birthday: '2020-07-12' },
]

export function runMigrations(): void {
  let version = 0
  try { version = read<number>(VERSION_KEY) ?? 0 } catch { version = 0 }
  if (version >= CURRENT) return

  // v1 — retire the original purple theme and the single-word default name.
  if (version < 1) {
    const theme = read<Theme>('theme')
    if (theme && theme.accent && LEGACY_ACCENTS.has(theme.accent.toLowerCase())) {
      write('theme', PRESETS[DEFAULT_PRESET])
    }
    const profile = read<{ name?: string }>('profile')
    if (profile && (profile.name === undefined || LEGACY_DEFAULT_NAMES.has(profile.name))) {
      write('profile', { ...profile, name: 'Rolando Joan' })
    }
  }

  // v2 — day-aware non-negotiables + seed goals & kids once.
  // Append the seed set unless it's already present (matched by seed id), so an
  // existing browser gets Rolando's plan without losing anything already added.
  if (version < 2) {
    const hasSeed = (list: { id?: string }[], seeds: { id: string }[]) =>
      list.some((x) => seeds.some((s) => s.id === x.id))

    // Existing non-negotiables predate scoping — default them to "every day".
    const nn = (read<{ id?: string; scope?: string }[]>('home.nonneg') ?? []).map((n) => ({ ...n, scope: n.scope ?? 'all' }))
    write('home.nonneg', hasSeed(nn, SEED_NONNEG) ? nn : [...nn, ...SEED_NONNEG])

    const goals = read<{ id?: string }[]>('journal.goals') ?? []
    write('journal.goals', hasSeed(goals, SEED_GOALS) ? goals : [...goals, ...SEED_GOALS])

    const members = read<{ id?: string }[]>('family.members') ?? []
    write('family.members', hasSeed(members, SEED_KIDS) ? members : [...members, ...SEED_KIDS])
  }

  // v3 — correct the seeded son's name from "Noe" to "Noah".
  if (version < 3) {
    const members = read<{ id?: string; name?: string }[]>('family.members') ?? []
    let changed = false
    const updated = members.map((m) => {
      if (m.id === 'kid_noe' && m.name === 'Noe') { changed = true; return { ...m, name: 'Noah' } }
      return m
    })
    if (changed) write('family.members', updated)
  }

  // v4 — replace the original flat goals with the categorized set, keeping any
  // goals the user added themselves.
  if (version < 4) {
    const legacy = new Set(LEGACY_GOAL_IDS)
    const goals = (read<{ id?: string }[]>('journal.goals') ?? []).filter((g) => !(g.id && legacy.has(g.id)))
    const has = goals.some((g) => SEED_GOALS.some((s) => s.id === g.id))
    write('journal.goals', has ? goals : [...goals, ...SEED_GOALS])
  }

  // v5 — upgrade the old charcoal-grey default to the new Azure default. Only
  // touches browsers still on that exact default, never a chosen custom theme.
  if (version < 5) {
    const theme = read<Theme>('theme')
    if (theme && theme.accent && theme.accent.toLowerCase() === '#4b5563') {
      write('theme', PRESETS[DEFAULT_PRESET])
    }
  }

  // Remap task categories across both planner boards using the given table.
  const remapBoardCats = (table: Record<string, string>) => {
    const remapItem = (it: { cat?: string }) => (it.cat && table[it.cat] ? { ...it, cat: table[it.cat] } : it)
    for (const boardKey of ['work.home', 'work.work']) {
      const board = read<{ backlog?: { cat?: string }[]; weeks?: Record<string, Record<string, { cat?: string }[]>> }>(boardKey)
      if (!board) continue
      const backlog = (board.backlog ?? []).map(remapItem)
      const weeks: Record<string, Record<string, { cat?: string }[]>> = {}
      for (const [wk, days] of Object.entries(board.weeks ?? {})) {
        weeks[wk] = {}
        for (const [day, items] of Object.entries(days ?? {})) weeks[wk][day] = (items ?? []).map(remapItem)
      }
      write(boardKey, { ...board, backlog, weeks })
    }
  }

  // v6 — the Home-tasks / Work-tasks categories became Task / Misc / Legal.
  if (version < 6) remapBoardCats(CAT_REMAP)
  // v7 — "Misc" renamed to "Home improvement".
  if (version < 7) remapBoardCats(CAT_REMAP_V7)

  write(VERSION_KEY, CURRENT)
}
