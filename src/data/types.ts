import type { Square } from 'chess.js'

/**
 * Same shape as a Lichess puzzle: `fen` is the position BEFORE the first move; `moves[0]` is played automatically
 * (the opponent's move that creates the puzzle), then the player must find moves[1], and so on.
 * Set `setup: false` when `fen` is already the position to solve (puzzles made from your own games).
 */
export interface Puzzle {
  id: string
  fen: string
  moves: string[]
  themes: string[]
  rating: number
  setup?: boolean
  /** other first moves that are just as good */
  alt?: string[]
  source?: 'generated' | 'lichess' | 'game'
  /** short explanation shown after solving */
  note?: string
}

export type DrillKind = 'moves' | 'count' | 'trade' | 'principle'

export interface CountQ { kind: 'count'; id: string; fen: string; target: Square; attackers: number; defenders: number; safe: boolean; explain: string }
export interface TradeQ { kind: 'trade'; id: string; fen: string; from: Square; to: Square; verdict: 'win' | 'even' | 'lose'; explain: string; themes: string[] }
export interface PrincipleQ { kind: 'principle'; id: string; fen: string; options: { uci: string; san: string }[]; correct: string; explain: string }
