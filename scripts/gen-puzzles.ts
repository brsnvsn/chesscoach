// Generates engine-verified tactics puzzles from human-looking random games.
//   npx tsx scripts/gen-puzzles.ts --seed 1 --minutes 20 --out tmp/gen-1.json
//   npx tsx scripts/gen-puzzles.ts --merge tmp/gen-*.json        (-> src/data/generated-puzzles.json)
// A puzzle is kept only if Stockfish agrees the solution wins (material or mate) and is clearly better than the alternatives.
import { Chess, type Move } from 'chess.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { createNodeEngine } from '../src/chess/nodeEngine'
import { cpOf } from '../src/chess/uci'
import { mulberry32, randomPosition } from '../src/chess/positions'
import { freePieces, forkFrom, linesBy, discoveredAttack, isBackRankMate, piecesOf, attackersOf, matesInOne, other, seeOn } from '../src/chess/analysis'
import { describeBest, uciToMove } from '../src/chess/explain'
import type { Puzzle } from '../src/data/types'

const args = process.argv.slice(2)
const arg = (k: string, d?: string) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }

if (args.includes('--merge')) {
  const files = args.slice(args.indexOf('--merge') + 1).filter(f => !f.startsWith('--'))
  const seen = new Set<string>()
  const all: Puzzle[] = []
  for (const f of files) for (const p of JSON.parse(readFileSync(f, 'utf8')) as Puzzle[]) { const k = p.fen + p.moves[0]; if (!seen.has(k)) { seen.add(k); all.push(p) } }
  // renumber ids and sort easiest-first inside each theme
  all.sort((a, b) => a.rating - b.rating)
  all.forEach((p, i) => { p.id = 'g' + (i + 1).toString(36) })
  writeFileSync('src/data/generated-puzzles.json', JSON.stringify(all))
  const byTheme: Record<string, number> = {}
  for (const p of all) for (const t of p.themes) byTheme[t] = (byTheme[t] ?? 0) + 1
  console.log('merged', all.length, 'puzzles', byTheme)
  process.exit(0)
}

const seed = +(arg('seed', '1')!)
const minutes = +(arg('minutes', '10')!)
const out = arg('out', `tmp/gen-${seed}.json`)!
const QUOTA: Record<string, number> = { hangingPiece: 50, mateIn1: 40, backRankMate: 20, fork: 60, pin: 40, skewer: 25, discoveredAttack: 30, mateIn2: 30, doubleCheck: 12 }
const rand = mulberry32(seed * 7919)
const engine = createNodeEngine()
const puzzles: Puzzle[] = []
const counts: Record<string, number> = {}
const seen = new Set<string>()
const t0 = Date.now()
const save = () => { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(puzzles)) }
const needs = (t: string) => (counts[t] ?? 0) < QUOTA[t]

/**
 * Theme purity matters: a "skewer" puzzle whose answer is just "take the free rook" teaches nothing about skewers.
 * So: free-piece captures are `hangingPiece` only, and the tactic themes require a move whose value comes from the tactic itself.
 */
function themesOfMove(pos: Chess, uci: string): string[] {
  const c = new Chess(pos.fen())
  const mv = c.move(uciToMove(uci))
  const me = mv.color
  if (c.isCheckmate()) return isBackRankMate(c, mv) ? ['mateIn1', 'backRankMate'] : ['mateIn1']
  if (mv.captured && freePieces(pos).some(f => f.square === mv.to && f.gain >= 3)) return ['hangingPiece']
  if (mv.captured && seeOn(pos, mv.to) > 0) return [] // wins material by an ordinary capture: not a clean tactic
  const themes: string[] = []
  const fk = forkFrom(c, mv.to, me)
  if (fk && fk.targets.filter(t => t.piece !== 'p').length >= 2) themes.push('fork')
  const before = new Set(linesBy(pos, me).map(l => `${l.slider}${l.front}${l.back}`))
  for (const l of linesBy(c, me)) if (l.slider === mv.to && !before.has(`${l.slider}${l.front}${l.back}`)) themes.push(l.kind)
  if (discoveredAttack(pos, c, mv).length) themes.push('discoveredAttack')
  if (c.isCheck()) { const k = piecesOf(c, other(me)).find(p => p.type === 'k')!.square; if (attackersOf(c, k, me).length >= 2) themes.push('doubleCheck') }
  return [...new Set(themes)]
}

/** cheap gate: does the position even contain something tactical for the side to move? */
function gate(pos: Chess): boolean {
  if (pos.isCheck()) return false
  if (freePieces(pos).some(f => f.gain >= 3) && needs('hangingPiece')) return true
  if (matesInOne(pos).length) return true
  const moves = pos.moves({ verbose: true })
  for (const m of moves) {
    const c = new Chess(pos.fen()); c.move({ from: m.from, to: m.to, promotion: m.promotion })
    if (forkFrom(c, m.to, m.color) || linesBy(c, m.color).some(l => l.slider === m.to) || discoveredAttack(pos, c, m)) return true
  }
  return false
}

async function tryPosition(p: NonNullable<ReturnType<typeof randomPosition>>) {
  const pos = p.chess
  if (!gate(pos)) return
  const fen = pos.fen()
  const res = await engine.search(fen, { depth: 11, multipv: 4 })
  if (!res.lines.length) return
  const best = res.lines[0], bestCp = cpOf(best)
  if (bestCp < 250) return
  const good = res.lines.filter(l => cpOf(l) >= bestCp - 40)
  const worse = res.lines.filter(l => cpOf(l) < bestCp - 40)
  if (worse.length && bestCp - cpOf(worse[0]) < 120 && best.mate === undefined) return
  if (good.length > 3) return
  const themes = themesOfMove(pos, best.move)
  const want = themes.filter(t => needs(t))
  if (!want.length) return
  const key = p.prevFen + p.lastMove.lan
  if (seen.has(key)) return
  seen.add(key)
  const info = describeBest(pos, best.move)
  const pieces = piecesOf(pos).length
  const puzzle: Puzzle = {
    id: `s${seed}-${puzzles.length}`, fen: p.prevFen, moves: [p.lastMove.from + p.lastMove.to + (p.lastMove.promotion ?? ''), best.move],
    themes, rating: 600 + pieces * 12 + (good.length - 1) * -40, source: 'generated', note: themes.includes('mateIn1') ? `${info.san} is checkmate.` : `${info.san} ${info.why}.`,
  }
  const alt = good.slice(1).map(l => l.move)
  if (alt.length) puzzle.alt = alt
  puzzles.push(puzzle)
  for (const t of themes) counts[t] = (counts[t] ?? 0) + 1
  if (puzzles.length % 5 === 0) save()
}

/** mate in 2 hunting: shallow engine pass on every sampled position */
async function tryMate2(p: NonNullable<ReturnType<typeof randomPosition>>) {
  if (!needs('mateIn2') || p.chess.isCheck()) return
  const fen = p.chess.fen()
  const quick = await engine.search(fen, { depth: 6, multipv: 1 })
  const q = quick.lines[0]
  if (!q || q.mate !== 2) return
  const res = await engine.search(fen, { depth: 12, multipv: 2 })
  const b = res.lines[0]
  if (!b || b.mate !== 2 || b.pv.length < 3) return
  if (res.lines[1] && res.lines[1].mate !== undefined && res.lines[1].mate > 0 && res.lines[1].mate <= 2) return // not unique
  const key = p.prevFen + p.lastMove.lan
  if (seen.has(key)) return
  seen.add(key)
  const c = new Chess(fen)
  for (const m of b.pv.slice(0, 3)) c.move(uciToMove(m))
  if (!c.isCheckmate()) return
  puzzles.push({ id: `s${seed}-${puzzles.length}`, fen: p.prevFen, moves: [p.lastMove.from + p.lastMove.to + (p.lastMove.promotion ?? ''), ...b.pv.slice(0, 3)], themes: ['mateIn2'], rating: 900 + piecesOf(p.chess).length * 12, source: 'generated', note: 'Mate in two.' })
  counts.mateIn2 = (counts.mateIn2 ?? 0) + 1
}

let scanned = 0
while ((Date.now() - t0) / 60000 < minutes && Object.keys(QUOTA).some(needs)) {
  const plies = 14 + Math.floor(rand() * 40)
  const p = randomPosition(rand, plies, 0.1)
  if (!p) continue
  scanned++
  await tryMate2(p)
  await tryPosition(p)
  if (scanned % 200 === 0) console.log(`[seed ${seed}] scanned ${scanned}, kept ${puzzles.length}`, counts, Math.round((Date.now() - t0) / 1000) + 's')
}
save()
console.log(`[seed ${seed}] done: scanned ${scanned}, kept ${puzzles.length}`, counts)
engine.terminate()
process.exit(0)
