// Turns exact board facts into short, plain-English coach messages with arrows to draw on the board.
import { Chess, type Move, type Color, type Square, type PieceSymbol } from 'chess.js'
import {
  NAME, VALUE, other, piecesOf, threatsAgainst, freePieces, mateThreatsAgainst, forkFrom, linesBy, discoveredAttack,
  isBackRankMate, listJoin, matesInOne, type MoveSafety, type Threat, type FreePiece,
} from './analysis'
import { winPct } from './uci'

export type Tone = 'good' | 'warn' | 'bad' | 'info'
export interface Shape { orig: Square; dest?: Square; brush: 'green' | 'red' | 'yellow' | 'blue' }
export interface CoachMsg {
  id: number
  who: 'coach' | 'bot' | 'you' | 'system'
  text: string
  title?: string
  tone?: Tone
  shapes?: Shape[]
  /** half-move number this message belongs to (for jumping around) */
  ply?: number
}

let nextId = 1
export const msg = (m: Omit<CoachMsg, 'id'>): CoachMsg => ({ id: nextId++, ...m })

const a = (p: PieceSymbol) => NAME[p]
const chessPieceAt = (chess: Chess, sq: Square): PieceSymbol => chess.get(sq)!.type
const the = (chess: Chess, sq: Square) => `${a(chess.get(sq)!.type)} on ${sq}`

export const uciToMove = (uci: string) => ({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] || undefined) as PieceSymbol | undefined })

export function uciToSan(fen: string, uci: string): string {
  try { return new Chess(fen).move(uciToMove(uci)).san } catch { return uci }
}

// ---------- grading ----------

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
export const GRADE_LABEL: Record<Grade, string> = { best: 'Best move', good: 'Good move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' }
export const GRADE_ICON: Record<Grade, string> = { best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' }

/** Both scores are centipawns from the mover's point of view. */
export function gradeMove(bestCp: number, playedCp: number, playedIsBest: boolean): { grade: Grade; loss: number } {
  const loss = Math.max(0, winPct(bestCp) - winPct(playedCp))
  if (playedIsBest || loss < 1) return { grade: 'best', loss }
  if (loss < 4) return { grade: 'good', loss }
  if (loss < 9) return { grade: 'inaccuracy', loss }
  if (loss < 20) return { grade: 'mistake', loss }
  return { grade: 'blunder', loss }
}

// ---------- phrases ----------

const sqList = (chess: Chess, sqs: Square[]) => listJoin(sqs.map(s => `the ${the(chess, s)}`))

function threatSentence(chess: Chess, t: Threat, mine: boolean): string {
  const who = mine ? 'Your' : 'Their'
  const att = sqList(chess, t.attackers)
  if (t.kind === 'hanging') return `${who} ${the(chess, t.square)} is attacked by ${att} and nothing defends it.`
  if (t.kind === 'trade-up') return `${who} ${the(chess, t.square)} is attacked by ${att} — a cheaper piece, so it would win material even though it is defended.`
  return `${who} ${the(chess, t.square)} is attacked ${t.attackers.length}× but defended only ${t.defenders.length}×, so the exchange loses material.`
}

function freeSentence(chess: Chess, f: FreePiece): string {
  const cheapest = [...f.by].sort((x, y) => VALUE[chess.get(x)!.type] - VALUE[chess.get(y)!.type])[0]
  const how = f.kind === 'hanging' ? 'and nothing defends it' : f.kind === 'trade-up' ? 'and your piece is worth less, so you win the trade' : 'and you have more attackers than they have defenders'
  return `Free material: your ${the(chess, cheapest)} can take their ${the(chess, f.square)} ${how}.`
}

function arrows(from: Square[], to: Square, brush: Shape['brush']): Shape[] { return from.slice(0, 2).map(f => ({ orig: f, dest: to, brush })) }

/** What a move does, in one line. */
export function describeMove(before: Chess, mv: Move, after: Chess, ply: number): string {
  if (after.isCheckmate()) return isBackRankMate(after, mv) ? 'Back-rank checkmate!' : 'Checkmate!'
  const bits: string[] = []
  if (mv.flags.includes('k') || mv.flags.includes('q')) bits.push('castles — king to safety and rook into play')
  else if (mv.captured) bits.push(`takes the ${a(mv.captured)} on ${mv.to}`)
  else if (mv.promotion) bits.push(`promotes to a ${a(mv.promotion)}`)
  else if (ply <= 14 && (mv.piece === 'n' || mv.piece === 'b') && ['1', '8'].includes(mv.from[1])) bits.push(`develops the ${a(mv.piece)}`)
  else if (ply <= 14 && mv.piece === 'p' && ['d', 'e'].includes(mv.from[0])) bits.push('stakes a claim in the centre')
  else if (ply <= 14 && mv.piece === 'q') bits.push('brings the queen out early — it can be chased by minor pieces')
  if (after.isCheck()) bits.push('and gives check')
  return bits.length ? bits.join(' ') : ''
}

// ---------- after the bot moves: what does it threaten, what is on offer? ----------

export function explainBotMove(before: Chess, mv: Move, after: Chess, userColor: Color, botName: string, ply: number): CoachMsg[] {
  const out: CoachMsg[] = []
  const d = describeMove(before, mv, after, ply)
  out.push(msg({ who: 'bot', text: `**${botName}** played **${mv.san}**${d ? ` — ${d}.` : '.'}`, ply, shapes: [{ orig: mv.from, dest: mv.to, brush: 'blue' }] }))
  if (after.isGameOver()) return out

  if (after.isCheck()) {
    const checkers = after.attackers(piecesOf(after, userColor).find(p => p.type === 'k')!.square, other(userColor))
    out.push(msg({ who: 'coach', tone: 'warn', title: 'You are in check', ply, text: 'Get out of check: **move the king**, **block** the line, or **capture** the checking piece. Those are your only options.', shapes: checkers.map(c => ({ orig: c, brush: 'red' as const })) }))
    return out
  }

  const mates = mateThreatsAgainst(after, userColor)
  if (mates.length) out.push(msg({ who: 'coach', tone: 'bad', title: 'Mate threat', ply, text: `They threaten checkmate with **${mates[0].san}**. Deal with this before anything else.`, shapes: [{ orig: mates[0].from, dest: mates[0].to, brush: 'red' }] }))

  const fork = forkFrom(after, mv.to, other(userColor))
  if (fork && !mates.length) out.push(msg({ who: 'coach', tone: 'bad', title: 'Fork', ply, text: `Their ${the(after, mv.to)} attacks your ${listJoin(fork.targets.map(t => `${a(t.piece)} on ${t.square}`))} at once.`, shapes: fork.targets.map(t => ({ orig: mv.to, dest: t.square, brush: 'red' as const })) }))

  const threats = threatsAgainst(after, userColor)
  for (const t of threats.slice(0, 2)) {
    out.push(msg({ who: 'coach', tone: 'warn', title: 'Your piece is in danger', ply, text: threatSentence(after, t, true), shapes: [...arrows(t.attackers, t.square, 'red'), ...(t.defenders.length ? arrows(t.defenders, t.square, 'green') : [])] }))
  }

  const pins = linesBy(after, other(userColor)).filter(l => l.slider === mv.to || l.front === mv.to)
  if (pins.length && !fork) {
    const p = pins[0]
    out.push(msg({ who: 'coach', tone: 'info', title: p.kind === 'pin' ? 'Pin' : 'Skewer', ply, text: p.kind === 'pin'
      ? `Your ${the(after, p.front)} is pinned to your ${a(p.backPiece)} on ${p.back}${p.absolute ? ' — it cannot legally move' : ' — moving it would expose the more valuable piece'}.`
      : `Your ${the(after, p.front)} is attacked and must move, exposing the ${a(p.backPiece)} behind it on ${p.back}.`, shapes: [{ orig: p.slider, dest: p.back, brush: 'red' }] }))
  }

  const free = freePieces(after)
  for (const f of free.slice(0, 2)) {
    out.push(msg({ who: 'coach', tone: 'good', title: 'Opportunity', ply, text: freeSentence(after, f), shapes: arrows(f.by, f.square, 'green') }))
  }
  return out
}

// ---------- after the user moves: how was that? ----------

export interface UserMoveContext {
  before: Chess
  mv: Move
  after: Chess
  safety: MoveSafety
  freeBefore: FreePiece[]
  grade?: { grade: Grade; loss: number }
  bestUci?: string
  /** the opponent's best answer to the move actually played */
  replyUci?: string
  ply: number
}

/** Rule-based part, available instantly (before the engine finishes). */
export function explainUserMoveInstant(c: UserMoveContext, userColor: Color): CoachMsg[] {
  const out: CoachMsg[] = []
  const { safety: s, mv, after } = c
  if (after.isCheckmate()) return [msg({ who: 'coach', tone: 'good', title: 'Checkmate!', ply: c.ply, text: isBackRankMate(after, mv) ? 'Back-rank mate — the king was boxed in by its own pawns.' : 'You delivered checkmate. Well played.' })]
  if (s.allowsMate.length) out.push(msg({ who: 'coach', tone: 'bad', title: 'Careful', ply: c.ply, text: `That allows checkmate in one: **${s.allowsMate[0].san}**.`, shapes: [{ orig: s.allowsMate[0].from, dest: s.allowsMate[0].to, brush: 'red' }] }))
  if (s.movedPiece && s.losesMaterial) {
    const t = s.movedPiece
    out.push(msg({ who: 'coach', tone: 'bad', title: 'Unsafe square', ply: c.ply, text: `You moved to **${mv.to}**, where your ${a(t.piece)} is attacked by ${sqList(after, t.attackers)} and defended ${t.defenders.length === 0 ? 'by nothing' : `${t.defenders.length}×`}. The count was ${t.attackers.length} attacker${t.attackers.length > 1 ? 's' : ''} vs ${t.defenders.length} defender${t.defenders.length === 1 ? '' : 's'}.`, shapes: [...arrows(t.attackers, t.square, 'red'), ...arrows(t.defenders, t.square, 'green')] }))
  }
  for (const t of s.newlyHanging.slice(0, 1)) out.push(msg({ who: 'coach', tone: 'bad', title: 'You left something hanging', ply: c.ply, text: threatSentence(after, t, true), shapes: arrows(t.attackers, t.square, 'red') }))
  for (const t of s.ignored.slice(0, 1)) out.push(msg({ who: 'coach', tone: 'warn', title: 'Still under attack', ply: c.ply, text: `Your ${the(after, t.square)} was already in danger and still is. ${threatSentence(after, t, true)}`, shapes: arrows(t.attackers, t.square, 'red') }))
  const tookFree = c.freeBefore.find(f => f.square === mv.to)
  if (tookFree) out.push(msg({ who: 'coach', tone: 'good', title: 'Free piece taken', ply: c.ply, text: `You grabbed the free ${a(tookFree.piece)}. Spotting these is worth more rating points than anything else at your level.` }))
  const fork = forkFrom(after, mv.to, userColor)
  if (fork) out.push(msg({ who: 'coach', tone: 'good', title: 'Fork', ply: c.ply, text: `Your ${the(after, mv.to)} attacks ${listJoin(fork.targets.map(t => `the ${a(t.piece)} on ${t.square}`))} at once.`, shapes: fork.targets.map(t => ({ orig: mv.to, dest: t.square, brush: 'green' as const })) }))
  const disc = discoveredAttack(c.before, after, mv)
  if (disc.length) out.push(msg({ who: 'coach', tone: 'good', title: 'Discovered attack', ply: c.ply, text: `Moving the ${a(mv.piece)} opened the line for your ${the(after, disc[0].slider)}, which now attacks the ${a(disc[0].targetPiece)} on ${disc[0].target}.`, shapes: [{ orig: disc[0].slider, dest: disc[0].target, brush: 'green' }] }))
  return out
}

/** What the engine's preferred move does, for "better was ..." explanations. */
export function describeBest(before: Chess, uci: string): { san: string; why: string; shapes: Shape[] } {
  const probe = new Chess(before.fen())
  let mv: Move
  try { mv = probe.move(uciToMove(uci)) } catch { return { san: uci, why: 'was stronger', shapes: [] } }
  const shapes: Shape[] = [{ orig: mv.from, dest: mv.to, brush: 'green' }]
  const free = freePieces(before).find(f => f.square === mv.to)
  let why = ''
  if (probe.isCheckmate()) why = 'is checkmate'
  else if (matesInOne(probe).length === 0 && probe.moves().length === 0) why = 'ends the game'
  else if (free) why = `wins a free ${a(free.piece)}`
  else if (mv.captured) why = `wins the ${a(mv.captured)} on ${mv.to}`
  else if (mv.flags.includes('k') || mv.flags.includes('q')) why = 'castles your king to safety'
  else {
    const fk = forkFrom(probe, mv.to, mv.color)
    const known = new Set(linesBy(before, mv.color).map(l => `${l.slider}${l.front}${l.back}`))
    const newLine = linesBy(probe, mv.color).find(l => l.slider === mv.to && !known.has(`${l.slider}${l.front}${l.back}`))
    const disc = discoveredAttack(before, probe, mv)
    if (fk) { why = `forks ${listJoin(fk.targets.map(t => `the ${a(t.piece)} on ${t.square}`))}`; shapes.push(...fk.targets.map(t => ({ orig: mv.to, dest: t.square, brush: 'yellow' as const }))) }
    else if (newLine) {
      why = newLine.kind === 'pin'
        ? `pins the ${a(newLine.frontPiece)} on ${newLine.front} to the ${a(newLine.backPiece)} on ${newLine.back}`
        : `skewers the ${a(newLine.frontPiece)} on ${newLine.front}: when it moves, the ${a(newLine.backPiece)} on ${newLine.back} falls`
      shapes.push({ orig: newLine.front, dest: newLine.back, brush: 'yellow' })
    }
    else if (disc.length) { why = `uncovers an attack: the ${a(chessPieceAt(probe, disc[0].slider))} on ${disc[0].slider} now hits the ${a(disc[0].targetPiece)} on ${disc[0].target}`; shapes.push({ orig: disc[0].slider, dest: disc[0].target, brush: 'yellow' }) }
    else if (probe.isCheck()) why = 'gives check and keeps the initiative'
    else if (mv.piece === 'n' || mv.piece === 'b') { const th = threatsAgainst(probe, other(mv.color)); if (th.length) why = `attacks the ${a(th[0].piece)} on ${th[0].square}` }
  }
  return { san: mv.san, why, shapes }
}

/** How the opponent punishes the move just played, e.g. "Black can answer **Nxe4**, which wins the bishop on e4." */
export function describePunish(after: Chess, replyUci: string): string {
  const side = after.turn() === 'w' ? 'White' : 'Black'
  const r = describeBest(after, replyUci)
  const why = r.why.replace('castles your king to safety', 'castles').replace(/\byour\b/g, 'their')
  return why ? `${side} can answer **${r.san}**, which ${why}.` : `${side}'s strong answer is **${r.san}**.`
}

/** The engine-verdict message (arrives a moment after the move). */
export function explainGrade(c: UserMoveContext, userColor: Color): CoachMsg | null {
  if (!c.grade) return null
  const { grade, loss } = c.grade
  const label = `${GRADE_ICON[grade]} ${GRADE_LABEL[grade]}`
  if (grade === 'best') return msg({ who: 'coach', tone: 'good', title: label, ply: c.ply, text: `${c.mv.san} is what the engine would play too.` })
  if (grade === 'good') return msg({ who: 'coach', tone: 'good', title: label, ply: c.ply, text: `${c.mv.san} is fine.` })
  const best = c.bestUci ? describeBest(c.before, c.bestUci) : null
  const missed = c.freeBefore.length && !c.freeBefore.some(f => f.square === c.mv.to)
    ? ` You also had a free ${a(c.freeBefore[0].piece)} on ${c.freeBefore[0].square} to take.` : ''
  const betterTxt = best ? (best.why ? ` Better was **${best.san}**, which ${best.why}.` : ` Better was **${best.san}**.`) : ''
  const punish = c.replyUci && grade !== 'inaccuracy' ? ` ${describePunish(c.after, c.replyUci)}` : ''
  const word = grade === 'inaccuracy' ? 'a small slip' : grade === 'mistake' ? 'it gives away a real advantage' : 'it likely loses material or the game'
  void userColor
  return msg({ who: 'coach', tone: grade === 'inaccuracy' ? 'warn' : 'bad', title: label, ply: c.ply, text: `${c.mv.san} — ${word} (about ${Math.round(loss)}% of your winning chances).${punish}${missed}${betterTxt}`, shapes: best?.shapes })
}

// ---------- the Checks / Captures / Threats scan ----------

export function cctScan(chess: Chess): CoachMsg {
  const me = chess.turn()
  const moves = chess.moves({ verbose: true })
  const checks = moves.filter(m => m.san.includes('+') || m.san.includes('#'))
  const caps = moves.filter(m => m.captured)
  const free = freePieces(chess)
  const threats = threatsAgainst(chess, me)
  const lines: string[] = []
  lines.push(`**Checks:** ${checks.length ? listJoin(checks.slice(0, 5).map(m => m.san)) : 'none'}`)
  lines.push(`**Captures:** ${caps.length ? listJoin(caps.slice(0, 6).map(m => m.san)) : 'none'}${free.length ? ` — free material: ${listJoin(free.map(f => `${a(f.piece)} on ${f.square}`))}` : ''}`)
  lines.push(`**Threats against you:** ${threats.length ? listJoin(threats.map(t => `${a(t.piece)} on ${t.square}`)) : 'nothing is hanging'}`)
  const shapes: Shape[] = [
    ...free.slice(0, 2).flatMap(f => arrows(f.by, f.square, 'green')),
    ...threats.slice(0, 2).flatMap(t => arrows(t.attackers, t.square, 'red')),
  ]
  return msg({ who: 'coach', tone: 'info', title: 'Checks · Captures · Threats', text: lines.join('\n'), shapes })
}
