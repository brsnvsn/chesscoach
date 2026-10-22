import { Chess } from 'chess.js'
import { cpOf, type UciEngine } from './uci'

export interface BotLevel {
  level: number
  name: string
  blurb: string
  depth: number
  multipv: number
  /** softmax temperature in centipawns: higher = more random among the candidate moves */
  temp: number
  /** chance of playing a completely random legal move */
  randomPct: number
}

// Tuned so Level 1 regularly hangs pieces (so you can practise taking them) and Level 6 is a real opponent.
export const BOTS: BotLevel[] = [
  { level: 1, name: 'Rookie Randy', blurb: 'Plays fast and drops pieces for free. Great for practising free captures.', depth: 2, multipv: 12, temp: 700, randomPct: 0.4 },
  { level: 2, name: 'Casual Cleo', blurb: 'Makes sensible moves but often leaves things undefended.', depth: 3, multipv: 10, temp: 380, randomPct: 0.18 },
  { level: 3, name: 'Club Kofi', blurb: 'Knows the basics. Punishes hanging pieces most of the time.', depth: 5, multipv: 6, temp: 220, randomPct: 0.05 },
  { level: 4, name: 'Sharp Sana', blurb: 'Rarely blunders and sets simple traps.', depth: 7, multipv: 4, temp: 110, randomPct: 0 },
  { level: 5, name: 'Strong Stefan', blurb: 'A solid player. Beating this one means something.', depth: 10, multipv: 3, temp: 50, randomPct: 0 },
  { level: 6, name: 'Full Stockfish', blurb: 'No mercy.', depth: 13, multipv: 1, temp: 1, randomPct: 0 },
]

export const botFor = (level: number) => BOTS[Math.max(0, Math.min(BOTS.length - 1, level - 1))]

/** Pick a move (UCI string) for the side to move at the given bot level. */
export async function chooseBotMove(engine: UciEngine, fen: string, level: number, rand: () => number = Math.random): Promise<string> {
  const cfg = botFor(level)
  const game = new Chess(fen)
  const legal = game.moves({ verbose: true })
  if (!legal.length) throw new Error('no legal moves')
  const uci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '')
  if (rand() < cfg.randomPct) return uci(legal[Math.floor(rand() * legal.length)])
  const res = await engine.search(fen, { depth: cfg.depth, multipv: Math.min(cfg.multipv, legal.length) })
  if (!res.lines.length) return res.best
  const cands = res.lines.map(l => ({ move: l.pv[0], score: Math.max(-1500, Math.min(1500, cpOf(l))) }))
  const top = cands[0].score
  const w = cands.map(c => Math.exp((c.score - top) / cfg.temp))
  const total = w.reduce((a, b) => a + b, 0)
  let r = rand() * total
  for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) return cands[i].move }
  return cands[0].move
}
