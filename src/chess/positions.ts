// Random but human-looking positions (for procedural drills and the puzzle generator). No engine needed.
import { Chess, type Move, type Square, type PieceSymbol } from 'chess.js'
import { VALUE, piecesOf, other, seeOn, attackersOf, withTurn } from './analysis'

export type Rand = () => number

/** Small deterministic RNG so generated puzzles are reproducible. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T,>(xs: T[], rand: Rand): T => xs[Math.floor(rand() * xs.length)]
export function shuffle<T>(xs: T[], rand: Rand): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Pick a move (as SAN) the way a keen-but-careless club player might: develop, castle, take stuff, sometimes blunder. */
export function humanishMove(chess: Chess, rand: Rand, blunderRate = 0.06): string {
  const sans = chess.moves()
  if (rand() < blunderRate) return pick(sans, rand)
  const ply = chess.history().length
  const me = chess.turn()
  const home = me === 'w' ? '1' : '8'
  const weights = sans.map(san => {
    if (san.endsWith('#')) return 40
    let w = 1
    if (san.startsWith('O-O')) return 9
    const piece = /^[NBRQK]/.test(san) ? san[0].toLowerCase() : 'p'
    const dest = /([a-h][1-8])(?:=[QRBN])?[+#]?$/.exec(san)![1] as Square
    const capture = san.includes('x')
    const attacked = attackersOf(chess, dest, other(me)).length > 0
    const defended = attackersOf(chess, dest, me).length >= 2 // the mover itself is one of them
    if (capture) {
      const cap = chess.get(dest)
      const capVal = cap ? VALUE[cap.type] : 1
      w *= capVal - (attacked ? VALUE[piece as PieceSymbol] : 0) > 0 ? 3.5 : 0.7
    } else if (attacked && !defended) w *= 0.12
    if (ply < 24 && (piece === 'n' || piece === 'b') && dest[1] !== home) w *= 2.2
    if (ply < 12 && piece === 'p' && !capture && ['d', 'e'].includes(dest[0])) w *= 2
    if (piece === 'k') w *= 0.15
    if (piece === 'q' && ply < 14) w *= 0.4
    if (san.includes('+')) w *= 1.4
    if (piece === 'p' && (dest[0] === 'a' || dest[0] === 'h') && !capture) w *= 0.6
    return w
  })
  let r = rand() * weights.reduce((x, y) => x + y, 0)
  for (let i = 0; i < sans.length; i++) { r -= weights[i]; if (r <= 0) return sans[i] }
  return sans[sans.length - 1]
}

export interface RandomPos { chess: Chess; prevFen: string; lastMove: Move; plies: number }

/** Play `plies` half-moves of humanish chess from the start; returns the final position and the move that led to it. */
export function randomPosition(rand: Rand, plies: number, blunderRate = 0.06): RandomPos | null {
  const chess = new Chess()
  let prevFen = chess.fen()
  let last: Move | null = null
  for (let i = 0; i < plies; i++) {
    if (chess.isGameOver()) return null
    prevFen = chess.fen()
    last = chess.move(humanishMove(chess, rand, blunderRate))
  }
  if (chess.isGameOver() || !last) return null
  return { chess, prevFen, lastMove: last, plies }
}

/** True if removing every direct attacker/defender of `sq` reveals more attackers (x-ray / battery): ambiguous for counting drills. */
export function hasXray(chess: Chess, sq: Square): boolean {
  const probe = new Chess(chess.fen())
  const target = probe.get(sq)
  if (!target) return false
  const direct = [...attackersOf(probe, sq, 'w'), ...attackersOf(probe, sq, 'b')]
  if (!direct.length) return false
  for (const s of direct) probe.remove(s)
  return attackersOf(probe, sq, 'w').length + attackersOf(probe, sq, 'b').length > 0
}

export { piecesOf, seeOn, withTurn }
