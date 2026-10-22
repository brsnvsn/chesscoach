import type { Puzzle } from './types'
import generated from './generated-puzzles.json'
import { mulberry32, shuffle, type Rand } from '../chess/positions'

let extra: Puzzle[] = []
let extraLoaded = false

/** Optional bigger puzzle set built from the Lichess puzzle database (see the "puzzles" GitHub Action). Safe to be absent. */
export async function loadExtraPuzzles(): Promise<number> {
  if (extraLoaded) return extra.length
  extraLoaded = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}puzzles/lichess.json`)
    if (res.ok) {
      const data = (await res.json()) as Puzzle[]
      if (Array.isArray(data)) extra = data
    }
  } catch { /* offline or not built: generated puzzles are enough */ }
  return extra.length
}

export const allPuzzles = (): Puzzle[] => [...(generated as Puzzle[]), ...extra]
export const puzzleCount = (themes: string[]) => allPuzzles().filter(p => p.themes.some(t => themes.includes(t))).length

/**
 * Choose `count` puzzles that match any of `themes`, preferring ones the player has not seen, mixed across themes
 * (interleaving), and ordered easiest-first.
 */
export function pickPuzzles(themes: string[], count: number, seen: Set<string> = new Set(), rand: Rand = mulberry32(Date.now() & 0xffffffff)): Puzzle[] {
  const pool = allPuzzles()
  const byTheme = themes.map(t => shuffle(pool.filter(p => p.themes.includes(t)), rand))
  const out: Puzzle[] = []
  const used = new Set<string>()
  // two passes: unseen first, then anything
  for (const onlyUnseen of [true, false]) {
    let i = 0
    while (out.length < count && byTheme.some(l => l.length)) {
      const list = byTheme[i % byTheme.length]
      i++
      const idx = list.findIndex(p => !used.has(p.id) && (!onlyUnseen || !seen.has(p.id)))
      if (idx >= 0) { const [p] = list.splice(idx, 1); out.push(p); used.add(p.id) }
      else if (i > byTheme.length * 3 + 1 && byTheme.every(l => !l.some(p => !used.has(p.id) && (!onlyUnseen || !seen.has(p.id))))) break
    }
  }
  return out.sort((a, b) => a.rating - b.rating)
}

export const puzzleById = (id: string) => allPuzzles().find(p => p.id === id)
