// Builds sets of practice items (puzzles or procedural questions) for drills, warm-ups, reviews and bosses.
import { allPuzzles, pickPuzzles, puzzleById } from '../data/puzzles'
import { LEVELS, type DrillSpec } from '../data/levels'
import { makeCountQ, makePrincipleQ, makeTradeQ } from '../chess/drills'
import { mulberry32, shuffle } from '../chess/positions'
import { dueReviews, getState } from '../store/progress'
import type { Item } from './PuzzleRunner'

let uid = 0
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${uid++}`

export interface ItemSet { count: number; getItem: (i: number) => Item }

export function setForSpec(spec: DrillSpec, count: number): ItemSet {
  const rand = mulberry32((Date.now() ^ (uid++ * 2654435761)) >>> 0)
  if (spec.kind === 'trade') {
    const wants = shuffle(Array.from({ length: count }, (_, i) => (['win', 'even', 'lose'] as const)[i % 3]), rand)
    return { count, getItem: i => ({ t: 'trade', q: makeTradeQ(rand, nextId('trade'), wants[i]) }) }
  }
  if (spec.kind === 'count') return { count, getItem: () => ({ t: 'count', q: makeCountQ(rand, nextId('count')) }) }
  if (spec.kind === 'principle') return { count, getItem: () => ({ t: 'principle', q: makePrincipleQ(rand, nextId('pr')) }) }
  if (spec.kind === 'moves') {
    const seen = new Set(Object.keys(getState().seen))
    const ps = pickPuzzles(spec.themes, count, seen, rand)
    return { count: ps.length, getItem: i => ({ t: 'move', puzzle: ps[i] }) }
  }
  return { count: 0, getItem: () => { throw new Error('scenario drills are not puzzle sets') } }
}

/** Drill specs a player has already unlocked (levels up to and including `level`), excluding scenarios. */
function unlockedSpecs(level: number): DrillSpec[] {
  return LEVELS.filter(l => l.n <= level && l.drill.kind !== 'scenario').map(l => l.drill)
}

/** Daily warm-up: puzzles that are due for review first, then a mix from everything unlocked (interleaving). */
export function warmupSet(level: number, want = 5): ItemSet {
  const due = dueReviews(getState()).map(r => r.puzzle ?? puzzleById(r.id)).filter((p): p is NonNullable<typeof p> => !!p).slice(0, want)
  const items: Item[] = due.map(p => ({ t: 'move', puzzle: p }))
  const rand = mulberry32((Date.now() >>> 0) ^ 0x9e3779b9)
  const specs = unlockedSpecs(level)
  const fill = Math.max(0, Math.max(3, due.length) - items.length)
  const pool = allPuzzles().length
  for (let k = 0; k < fill; k++) {
    const spec = specs[Math.floor(rand() * specs.length)]
    if (spec.kind === 'moves' && pool > 0) {
      const ps = pickPuzzles(spec.themes, 1, new Set(Object.keys(getState().seen)), rand)
      if (ps[0]) { items.push({ t: 'move', puzzle: ps[0] }); continue }
    }
    const lazy = setForSpec(spec.kind === 'moves' ? { kind: 'count' } : spec, 1).getItem(0)
    items.push(lazy)
  }
  return { count: items.length, getItem: i => items[i] }
}

export function reviewSet(): ItemSet {
  const items: Item[] = dueReviews(getState()).map(r => r.puzzle ?? puzzleById(r.id)).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 12).map(p => ({ t: 'move' as const, puzzle: p }))
  return { count: items.length, getItem: i => items[i] }
}
