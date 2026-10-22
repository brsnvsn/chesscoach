// Rule-based board analysis: the "is it safe?" counting, hanging pieces, forks, pins, mates.
// Everything here is exact (built on chess.js legal moves), so the coach never guesses about the board.
import { Chess, type Color, type PieceSymbol, type Square, type Move } from 'chess.js'

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
export const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black')

const FILES = 'abcdefgh'
export const sqFile = (s: Square) => FILES.indexOf(s[0])
export const sqRank = (s: Square) => parseInt(s[1], 10) - 1
export const toSq = (file: number, rank: number): Square | null =>
  file < 0 || file > 7 || rank < 0 || rank > 7 ? null : ((FILES[file] + (rank + 1)) as Square)

export interface PieceOn { square: Square; type: PieceSymbol; color: Color }

export function piecesOf(chess: Chess, color?: Color): PieceOn[] {
  const out: PieceOn[] = []
  for (const row of chess.board()) for (const p of row) if (p && (!color || p.color === color)) out.push({ square: p.square, type: p.type, color: p.color })
  return out
}

/** The same position with a different side to move (en passant cleared). Null if chess.js rejects it. */
export function withTurn(chess: Chess, color: Color): Chess | null {
  const parts = chess.fen().split(' ')
  parts[1] = color
  parts[3] = '-'
  try { return new Chess(parts.join(' ')) } catch { return null }
}

/** Pieces of `by` that can capture/land on `square` right now (direct attackers; x-rays are not included). */
export const attackersOf = (chess: Chess, square: Square, by: Color): Square[] => chess.attackers(square, by)

export interface CaptureOn { san: string; piece: PieceSymbol; captured: PieceSymbol; promotion?: PieceSymbol }

/**
 * Legal captures landing on `sq`, derived from SAN. (chess.js verbose moves cost ~5ms each call because they
 * build FEN strings; plain SAN lists are ~15x cheaper, and this runs inside tight loops.)
 */
export function capturesOn(chess: Chess, sq: Square): CaptureOn[] {
  const target = chess.get(sq)
  if (!target || target.type === 'k') return []
  const out: CaptureOn[] = []
  for (const san of chess.moves()) {
    if (!san.includes('x' + sq)) continue
    const piece = (/^[NBRQK]/.test(san) ? san[0].toLowerCase() : 'p') as PieceSymbol
    const promo = /=([QRBN])/.exec(san)
    out.push({ san, piece, captured: target.type, promotion: promo ? (promo[1].toLowerCase() as PieceSymbol) : undefined })
  }
  return out
}

/**
 * Static exchange: the material the side to move wins by capturing on `sq`, assuming both sides keep
 * recapturing with their cheapest piece and may stop at any time. Uses real legal moves, so pins and x-rays count.
 */
export function seeOn(chess: Chess, sq: Square): number {
  const caps = capturesOn(chess, sq)
  if (!caps.length) return 0
  caps.sort((a, b) => VALUE[a.piece] - VALUE[b.piece])
  const m = caps[0]
  chess.move(m.san)
  const gain = VALUE[m.captured] + (m.promotion ? VALUE[m.promotion] - 1 : 0) - seeOn(chess, sq)
  chess.undo()
  return Math.max(0, gain)
}

export type ThreatKind = 'hanging' | 'trade-up' | 'outnumbered'
export interface Threat {
  square: Square
  piece: PieceSymbol
  color: Color
  attackers: Square[]
  defenders: Square[]
  /** material the attacker nets by taking it (pawns = 1) */
  netLoss: number
  kind: ThreatKind
}

/** Which of `victim`'s pieces could the opponent win material from, if it were the opponent's turn? */
export function threatsAgainst(chess: Chess, victim: Color): Threat[] {
  if (chess.isCheck() && chess.turn() === victim) return []
  const opp = chess.turn() === other(victim) ? chess : withTurn(chess, other(victim))
  if (!opp) return []
  const out: Threat[] = []
  for (const p of piecesOf(chess, victim)) {
    if (p.type === 'k') continue
    const attackers = attackersOf(chess, p.square, other(victim))
    if (!attackers.length) continue
    const netLoss = seeOn(opp, p.square)
    if (netLoss <= 0) continue
    const defenders = attackersOf(chess, p.square, victim)
    const cheapest = Math.min(...attackers.map(a => VALUE[chess.get(a)!.type]))
    const kind: ThreatKind = defenders.length === 0 ? 'hanging' : cheapest < VALUE[p.type] ? 'trade-up' : 'outnumbered'
    out.push({ square: p.square, piece: p.type, color: victim, attackers, defenders, netLoss, kind })
  }
  return out.sort((a, b) => b.netLoss - a.netLoss)
}

export interface FreePiece { square: Square; piece: PieceSymbol; gain: number; by: Square[]; kind: ThreatKind }

/** Enemy pieces the side to move can win material from right now ("free pieces"). */
export function freePieces(chess: Chess): FreePiece[] {
  const me = chess.turn()
  if (chess.isGameOver()) return []
  const out: FreePiece[] = []
  for (const p of piecesOf(chess, other(me))) {
    if (p.type === 'k') continue
    const by = attackersOf(chess, p.square, me)
    if (!by.length) continue
    const gain = seeOn(chess, p.square)
    if (gain <= 0) continue
    const def = attackersOf(chess, p.square, other(me))
    const cheapest = Math.min(...by.map(a => VALUE[chess.get(a)!.type]))
    out.push({ square: p.square, piece: p.type, gain, by, kind: def.length === 0 ? 'hanging' : cheapest < VALUE[p.type] ? 'trade-up' : 'outnumbered' })
  }
  return out.sort((a, b) => b.gain - a.gain)
}

/** Moves that give checkmate for the side to move. */
export const matesInOne = (chess: Chess): Move[] => chess.moves({ verbose: true }).filter(m => m.san.endsWith('#'))

/** Does `victim` face a mate in one if the opponent were to move? Returns the mating moves. */
export function mateThreatsAgainst(chess: Chess, victim: Color): Move[] {
  if (chess.isGameOver()) return []
  const opp = chess.turn() === other(victim) ? chess : withTurn(chess, other(victim))
  return opp ? matesInOne(opp) : []
}

/** Count of material (excluding kings) for a colour, pawns = 1. */
export function material(chess: Chess, color: Color): number {
  return piecesOf(chess, color).reduce((s, p) => s + (p.type === 'k' ? 0 : VALUE[p.type]), 0)
}

// ---------- the "is my move safe?" check ----------

export interface MoveSafety {
  move: Move
  /** destination attacked by the enemy at all? (what the quiz asks about) */
  destAttackers: Square[]
  destDefenders: Square[]
  /** the moved piece itself can be won */
  movedPiece: Threat | null
  /** other pieces that become/are en prise after the move (excluding the moved piece) */
  newlyHanging: Threat[]
  /** pieces that were already en prise before the move and still are (ignored threats) */
  ignored: Threat[]
  /** material the mover wins with the move itself (capture) */
  captured: number
  /** worst-case static material result for the mover: captured - worst enemy gain */
  net: number
  /** true when the move loses material by static exchange */
  losesMaterial: boolean
  /** the enemy gets mate in one after this move */
  allowsMate: Move[]
}

export function checkMoveSafety(chess: Chess, from: Square, to: Square, promotion?: PieceSymbol): MoveSafety | null {
  const mover = chess.turn()
  const before = threatsAgainst(chess, mover)
  const probe = new Chess(chess.fen())
  let move: Move
  try { move = probe.move({ from, to, promotion }) } catch { return null }
  const after = threatsAgainst(probe, mover)
  const movedPiece = after.find(t => t.square === to) ?? null
  const rest = after.filter(t => t.square !== to)
  const beforeKeys = new Set(before.map(t => t.square + t.piece))
  const ignored = rest.filter(t => beforeKeys.has(t.square + t.piece))
  const newlyHanging = rest.filter(t => !beforeKeys.has(t.square + t.piece))
  const captured = move.captured ? VALUE[move.captured] : 0
  const worst = after.length ? after[0].netLoss : 0
  const allowsMate = probe.isGameOver() ? [] : matesInOne(probe)
  return {
    move,
    destAttackers: attackersOf(probe, to, other(mover)),
    destDefenders: attackersOf(probe, to, mover),
    movedPiece, newlyHanging, ignored,
    captured, net: captured - worst,
    losesMaterial: worst > captured && !probe.isCheckmate(),
    allowsMate,
  }
}

// ---------- tactics detectors ----------

export interface ForkInfo { square: Square; piece: PieceSymbol; targets: { square: Square; piece: PieceSymbol }[] }

/** After a move by `color`, does the piece now on `sq` attack two or more valuable/loose enemy pieces? */
export function forkFrom(chess: Chess, sq: Square, color: Color): ForkInfo | null {
  const me = chess.get(sq)
  if (!me || me.color !== color) return null
  const targets: ForkInfo['targets'] = []
  for (const e of piecesOf(chess, other(color))) {
    if (!attackersOf(chess, e.square, color).includes(sq)) continue
    const defended = attackersOf(chess, e.square, other(color)).length > 0
    const worthy = e.type === 'k' || VALUE[e.type] > VALUE[me.type] || !defended
    if (worthy && (e.type !== 'p' || !defended)) targets.push({ square: e.square, piece: e.type })
  }
  return targets.length >= 2 ? { square: sq, piece: me.type, targets } : null
}

export interface LineInfo { kind: 'pin' | 'skewer'; absolute: boolean; slider: Square; front: Square; back: Square; frontPiece: PieceSymbol; backPiece: PieceSymbol }

const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Pins and skewers that `by` currently has on the opponent's pieces. */
export function linesBy(chess: Chess, by: Color): LineInfo[] {
  const out: LineInfo[] = []
  for (const s of piecesOf(chess, by)) {
    const dirs = s.type === 'b' ? BISHOP_DIRS : s.type === 'r' ? ROOK_DIRS : s.type === 'q' ? [...BISHOP_DIRS, ...ROOK_DIRS] : []
    for (const [df, dr] of dirs) {
      let f = sqFile(s.square) + df, r = sqRank(s.square) + dr
      let first: PieceOn | null = null
      while (true) {
        const q = toSq(f, r)
        if (!q) break
        const p = chess.get(q)
        if (p) {
          const po = { square: q, type: p.type, color: p.color }
          if (!first) { if (p.color === by) break; first = po } else {
            if (p.color !== by) {
              const vf = VALUE[first.type], vb = VALUE[po.type]
              if (po.type === 'k' && first.type !== 'k') out.push({ kind: 'pin', absolute: true, slider: s.square, front: first.square, back: po.square, frontPiece: first.type, backPiece: po.type })
              else if (vb > vf && first.type !== 'k') out.push({ kind: 'pin', absolute: false, slider: s.square, front: first.square, back: po.square, frontPiece: first.type, backPiece: po.type })
              else if (vf > vb && po.type !== 'k') out.push({ kind: 'skewer', absolute: first.type === 'k', slider: s.square, front: first.square, back: po.square, frontPiece: first.type, backPiece: po.type })
            }
            break
          }
        }
        f += df; r += dr
      }
    }
  }
  return out
}

/** Pieces of `color` (other than the mover) that now attack something they did not attack before a move. */
export function discoveredAttack(before: Chess, after: Chess, mv: Move): { slider: Square; target: Square; targetPiece: PieceSymbol }[] {
  const color = mv.color
  const out: { slider: Square; target: Square; targetPiece: PieceSymbol }[] = []
  for (const s of piecesOf(after, color)) {
    if (s.square === mv.to || !['b', 'r', 'q'].includes(s.type)) continue
    for (const e of piecesOf(after, other(color))) {
      const wasAttacked = attackersOf(before, e.square, color).includes(s.square) && before.get(e.square)?.type === e.type
      const isAttacked = attackersOf(after, e.square, color).includes(s.square)
      if (!wasAttacked && isAttacked && (e.type === 'k' || VALUE[e.type] >= 3)) out.push({ slider: s.square, target: e.square, targetPiece: e.type })
    }
  }
  return out
}

/** Back-rank mate: rook/queen checks along the back rank from a distance, and the king is boxed in by its own pieces. */
export function isBackRankMate(chess: Chess, mv: Move): boolean {
  if (!mv.san.endsWith('#') || !['r', 'q'].includes(mv.piece)) return false
  const victim = other(mv.color)
  const king = piecesOf(chess, victim).find(p => p.type === 'k')
  if (!king) return false
  const back = victim === 'w' ? 0 : 7
  if (sqRank(king.square) !== back || sqRank(mv.to) !== back) return false
  if (Math.abs(sqFile(king.square) - sqFile(mv.to)) < 2) return false
  const fwd = victim === 'w' ? 1 : 6
  for (const df of [-1, 0, 1]) {
    const q = toSq(sqFile(king.square) + df, fwd)
    if (q && chess.get(q)?.color !== victim) return false
  }
  return true
}

// ---------- opening checklist (used by the Captain boss and the debrief) ----------

export interface DevStats { castled: boolean; minorsDeveloped: number; centerPawn: boolean; earlyQueen: boolean }

export function developmentStats(history: Move[], color: Color): DevStats {
  const mine = history.filter(m => m.color === color)
  const castled = mine.some(m => m.flags.includes('k') || m.flags.includes('q'))
  const home = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8']
  const movedFrom = new Set<string>()
  for (const m of mine) if (home.includes(m.from) && (m.piece === 'n' || m.piece === 'b')) movedFrom.add(m.from)
  const centerPawn = mine.some(m => m.piece === 'p' && (m.from[0] === 'e' || m.from[0] === 'd') && Math.abs(parseInt(m.to[1]) - parseInt(m.from[1])) >= 1)
  let earlyQueen = false
  let minors = 0
  const seen = new Set<string>()
  for (const m of mine) {
    if (m.piece === 'q' && minors < 2) { earlyQueen = true; break }
    if (home.includes(m.from) && (m.piece === 'n' || m.piece === 'b') && !seen.has(m.from)) { seen.add(m.from); minors++ }
  }
  return { castled, minorsDeveloped: movedFrom.size, centerPawn, earlyQueen }
}

// ---------- plain-English helpers ----------

export const pieceWithSquare = (t: PieceSymbol, sq: Square) => `${NAME[t]} on ${sq}`
export const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1])

export function describeSquarePieces(chess: Chess, squares: Square[]): string[] {
  return squares.map(s => pieceWithSquare(chess.get(s)!.type, s))
}
