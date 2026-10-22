// Procedural, engine-free drills: count attackers/defenders, judge a trade, pick the opening-principle move.
import { Chess, type Move, type Square, type PieceSymbol } from 'chess.js'
import { VALUE, NAME, other, piecesOf, attackersOf, seeOn, withTurn, listJoin, checkMoveSafety, capturesOn } from './analysis'
import { randomPosition, hasXray, pick, shuffle, type Rand } from './positions'
import type { CountQ, TradeQ, PrincipleQ } from '../data/types'

const pc = (chess: Chess, sq: Square) => `${NAME[chess.get(sq)!.type]} on ${sq}`

export interface ExchangeStep { san: string; piece: PieceSymbol; captured: PieceSymbol }
interface Exchange { gain: number; line: ExchangeStep[] }
/** Best sequence of captures on `sq` for the side to move (cheapest piece first), stopping when it no longer pays. */
export function bestExchange(chess: Chess, sq: Square): Exchange {
  const caps = capturesOn(chess, sq)
  if (!caps.length) return { gain: 0, line: [] }
  caps.sort((x, y) => VALUE[x.piece] - VALUE[y.piece])
  const m = caps[0]
  chess.move(m.san)
  const sub = bestExchange(chess, sq)
  chess.undo()
  const gain = VALUE[m.captured] - sub.gain
  return gain > 0 ? { gain, line: [{ san: m.san, piece: m.piece, captured: m.captured }, ...sub.line] } : { gain: 0, line: [] }
}

export function makeCountQ(rand: Rand, id: string): CountQ {
  for (let tries = 0; tries < 400; tries++) {
    const pos = randomPosition(rand, 12 + Math.floor(rand() * 28), 0.1)
    if (!pos || pos.chess.isCheck()) continue
    const chess = pos.chess
    const cands = piecesOf(chess).filter(p => {
      if (p.type === 'k') return false
      const att = attackersOf(chess, p.square, other(p.color)).length
      const def = attackersOf(chess, p.square, p.color).length
      return att >= 1 && att <= 3 && def <= 3 && !hasXray(chess, p.square)
    })
    if (!cands.length) continue
    const t = pick(cands, rand)
    const att = attackersOf(chess, t.square, other(t.color))
    const def = attackersOf(chess, t.square, t.color)
    const opp = chess.turn() === other(t.color) ? chess : withTurn(chess, other(t.color))
    if (!opp) continue
    const safe = seeOn(opp, t.square) <= 0
    const cheapest = Math.min(...att.map(s => VALUE[chess.get(s)!.type]))
    const attNames = listJoin(att.map(s => pc(chess, s)))
    const defNames = def.length ? listJoin(def.map(s => pc(chess, s))) : 'nobody'
    const explain = `Attackers (${att.length}): ${attNames}. Defenders (${def.length}): ${defNames}. ` + (safe
      ? (def.length >= att.length ? 'It is defended at least as often as it is attacked, and no cheap attacker can profit, so it is safe.' : 'Even though there are more attackers, capturing would cost them more than they gain, so it is safe.')
      : (def.length === 0 ? 'Nothing defends it, so it can simply be taken.' : cheapest < VALUE[t.type] ? 'The cheapest attacker is worth less than the piece, so capturing wins material even though it is defended.' : 'They have more attackers than there are defenders, so the exchange wins material for them.'))
    return { kind: 'count', id, fen: chess.fen(), target: t.square, attackers: att.length, defenders: def.length, safe, explain }
  }
  throw new Error('could not build count question')
}

export function makeTradeQ(rand: Rand, id: string, want?: 'win' | 'even' | 'lose'): TradeQ {
  for (let tries = 0; tries < 800; tries++) {
    const pos = randomPosition(rand, 10 + Math.floor(rand() * 30), 0.08)
    if (!pos || pos.chess.isCheck()) continue
    const chess = pos.chess
    const caps = shuffle(chess.moves({ verbose: true }).filter(m => m.captured && !m.flags.includes('e') && !m.promotion), rand)
    for (const m of caps) {
      const probe = new Chess(chess.fen())
      probe.move({ from: m.from, to: m.to })
      if (probe.isGameOver()) continue
      const reply = bestExchange(probe, m.to)
      const net = VALUE[m.captured!] - reply.gain
      const verdict: TradeQ['verdict'] = net > 0 ? 'win' : net === 0 ? 'even' : 'lose'
      if (want && verdict !== want) continue
      const steps = [`You take the ${NAME[m.captured!]} (+${VALUE[m.captured!]}) with your ${NAME[m.piece]}.`]
      let sum = VALUE[m.captured!]
      let youTurn = false
      for (const r of reply.line) {
        steps.push(`${youTurn ? 'You' : 'They'} take${youTurn ? '' : ''} back the ${NAME[r.captured!]} with a ${NAME[r.piece]} (${youTurn ? '+' : '−'}${VALUE[r.captured!]}).`)
        sum += (youTurn ? 1 : -1) * VALUE[r.captured!]
        youTurn = !youTurn
      }
      if (!reply.line.length) steps.push('Nothing can take back.')
      const txt = verdict === 'win' ? `Net +${net}: you come out ahead.` : verdict === 'even' ? 'Net 0: an even trade.' : `Net ${net}: you lose material.`
      void sum
      return { kind: 'trade', id, fen: chess.fen(), from: m.from, to: m.to, verdict, explain: `${steps.join(' ')} ${txt}`, themes: ['trade'] }
    }
  }
  throw new Error('could not build trade question')
}

export function makePrincipleQ(rand: Rand, id: string): PrincipleQ {
  for (let tries = 0; tries < 600; tries++) {
    const plies = 3 + Math.floor(rand() * 10)
    const pos = randomPosition(rand, plies, 0.0)
    if (!pos) continue
    const chess = pos.chess
    if (chess.isCheck()) continue
    const me = chess.turn()
    const moves = chess.moves({ verbose: true })
    const safe = (m: Move) => { const s = checkMoveSafety(chess, m.from, m.to, m.promotion); return !!s && !s.losesMaterial && !s.allowsMate.length }
    const castle = moves.filter(m => (m.flags.includes('k') || m.flags.includes('q')) && safe(m))
    const home = me === 'w' ? '1' : '8'
    const develop = moves.filter(m => (m.piece === 'n' || m.piece === 'b') && m.from[1] === home && !m.captured && safe(m))
    const center = moves.filter(m => m.piece === 'p' && ['d', 'e'].includes(m.from[0]) && !m.captured && Math.abs(+m.to[1] - +m.from[1]) === 2 && safe(m))
    let good: Move | null = null
    let why = ''
    if (castle.length && plies >= 6) { good = castle[0]; why = 'Castling tucks the king away and brings a rook into the game — do it early.' }
    else if (develop.length) { good = pick(develop, rand); why = `Developing a ${NAME[good.piece]} gets it off the back rank and into play. Aim to develop every minor piece before attacking.` }
    else if (center.length) { good = pick(center, rand); why = 'A centre pawn grabs space and opens lines for your bishops and queen.' }
    if (!good) continue
    const bad: { m: Move; why: string }[] = []
    const edge = moves.filter(m => m.piece === 'p' && (m.from[0] === 'a' || m.from[0] === 'h') && !m.captured)
    if (edge.length) bad.push({ m: pick(edge, rand), why: 'an edge pawn move does nothing for the centre or your development' })
    const early = moves.filter(m => m.piece === 'q' && !m.captured)
    if (early.length && plies < 10) bad.push({ m: pick(early, rand), why: 'bringing the queen out early lets the opponent attack it with minor pieces and gain time' })
    const again = moves.filter(m => (m.piece === 'n' || m.piece === 'b') && m.from[1] !== home && !m.captured)
    if (again.length) bad.push({ m: pick(again, rand), why: 'moving a piece a second time while others are still at home wastes time' })
    const king = moves.filter(m => m.piece === 'k' && !m.flags.includes('k') && !m.flags.includes('q'))
    if (king.length) bad.push({ m: pick(king, rand), why: 'walking the king around forfeits castling and exposes it' })
    if (bad.length < 2) continue
    const chosen = shuffle(bad, rand).slice(0, 2)
    const san = (m: Move) => m.san
    const options = shuffle([good, ...chosen.map(b => b.m)], rand).map(m => ({ uci: m.from + m.to + (m.promotion ?? ''), san: san(m) }))
    const explain = `${san(good)}: ${why} Not ${chosen.map(b => `${san(b.m)} (${b.why})`).join(', nor ')}.`
    return { kind: 'principle', id, fen: chess.fen(), options, correct: good.from + good.to + (good.promotion ?? ''), explain }
  }
  throw new Error('could not build principle question')
}
