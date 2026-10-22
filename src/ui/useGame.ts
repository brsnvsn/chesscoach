import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { checkMoveSafety, freePieces, developmentStats, listJoin, NAME, other, type MoveSafety, type DevStats } from '../chess/analysis'
import {
  cctScan, explainBotMove, explainGrade, explainUserMoveInstant, gradeMove, describeBest, msg, uciToMove,
  type CoachMsg, type Grade, type Shape, type UserMoveContext,
} from '../chess/explain'
import { chooseBotMove, botFor } from '../chess/bots'
import { cpOf, type SearchResult } from '../chess/uci'
import { getEngine } from './engineSingleton'
import { recordQuiz, type Assist } from '../store/progress'
import { sfx } from './sfx'

export interface GameStats {
  userMoves: number; blunders: number; mistakes: number; inaccuracies: number; hangs: number
  missedFree: number; offeredFree: number; quizTotal: number; quizCorrect: number; scans: number
}
export interface KeyMoment { ply: number; san: string; grade: Grade; loss: number; bestSan?: string; bestWhy?: string; fenBefore: string; bestUci?: string }
export type GameResult = 'win' | 'loss' | 'draw'
export interface Over { result: GameResult; reason: string }
export interface Judgement { passed: boolean; reasons: string[] }
/** `final` is false right after the user's move (before the engine has graded it): only fail-fast rules should fire then. */
export interface JudgeInfo { stats: GameStats; dev: DevStats; chess: Chess; userColor: Color; over: Over | null; final: boolean }

export interface Pending {
  from: Square; to: Square; promotion?: PieceSymbol; safety: MoveSafety
  mode: 'quiz' | 'warn' | 'stalemate'
  step: 'q1' | 'q2' | 'verdict'
  a1?: number; a2?: number
}

export interface GameOpts {
  botLevel: number
  userColor: Color
  startFen?: string
  assist: Assist
  stalemateGuard?: boolean
  /** called after every move; return a verdict to end the game early (boss rules) */
  judge?: (i: JudgeInfo) => Judgement | null
}

export interface MoveEntry { san: string; color: Color; grade?: Grade }

const emptyStats = (): GameStats => ({ userMoves: 0, blunders: 0, mistakes: 0, inaccuracies: 0, hangs: 0, missedFree: 0, offeredFree: 0, quizTotal: 0, quizCorrect: 0, scans: 0 })

export function useGame(opts: GameOpts) {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const chessRef = useRef(new Chess(opts.startFen))
  const statsRef = useRef<GameStats>(emptyStats())
  const momentsRef = useRef<KeyMoment[]>([])
  const analysisRef = useRef<Promise<SearchResult | null>>(Promise.resolve(null))
  const gen = useRef(0)
  const busy = useRef(false)

  const [fen, setFen] = useState(chessRef.current.fen())
  const [moves, setMoves] = useState<MoveEntry[]>([])
  const [messages, setMessages] = useState<CoachMsg[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [thinking, setThinking] = useState(false)
  const [over, setOver] = useState<Over | null>(null)
  const [judgement, setJudgement] = useState<Judgement | null>(null)
  const [stats, setStats] = useState<GameStats>(emptyStats())
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null)
  const [hoverShapes, setHoverShapes] = useState<Shape[] | null>(null)
  const [syncKey, setSyncKey] = useState(0)
  const [engineMissing, setEngineMissing] = useState(false)

  const push = useCallback((...m: CoachMsg[]) => setMessages(prev => [...prev, ...m]), [])
  const syncStats = () => setStats({ ...statsRef.current })
  const alive = (g: number) => g === gen.current

  const finish = useCallback((o: Over, j?: Judgement | null) => {
    setOver(o); setThinking(false); busy.current = false
    if (j) setJudgement(j)
  }, [])

  /** boss / scenario rules: may end the game early */
  const runJudge = useCallback((g: number, endNow: Over | null, final: boolean): boolean => {
    const j = optsRef.current.judge
    if (!j) return false
    const chess = chessRef.current
    const verdict = j({ stats: statsRef.current, dev: developmentStats(chess.history({ verbose: true }), optsRef.current.userColor), chess, userColor: optsRef.current.userColor, over: endNow, final })
    if (verdict && alive(g)) {
      finish(endNow ?? { result: verdict.passed ? 'win' : 'loss', reason: 'judged' }, verdict)
      return true
    }
    return false
  }, [finish])

  const checkEnd = useCallback((): Over | null => {
    const c = chessRef.current
    const uc = optsRef.current.userColor
    if (c.isCheckmate()) return c.turn() === uc ? { result: 'loss', reason: 'Checkmate — you were mated.' } : { result: 'win', reason: 'Checkmate — you win!' }
    if (c.isStalemate()) return { result: 'draw', reason: 'Stalemate — a draw.' }
    if (c.isInsufficientMaterial()) return { result: 'draw', reason: 'Draw by insufficient material.' }
    if (c.isThreefoldRepetition()) return { result: 'draw', reason: 'Draw by repetition.' }
    if (c.isDraw()) return { result: 'draw', reason: 'Draw.' }
    return null
  }, [])

  const randomLegal = () => { const m = chessRef.current.moves({ verbose: true }); const x = m[Math.floor(Math.random() * m.length)]; return x.from + x.to + (x.promotion ?? '') }

  const botTurn = useCallback(async (g: number) => {
    const chess = chessRef.current
    setThinking(true)
    const engine = getEngine()
    let uci: string
    // feel human: the bot "thinks" for 0.7-1.6s minimum, in parallel with the engine search
    const pause = new Promise<void>(r => setTimeout(r, 700 + Math.random() * 900))
    try { uci = engine ? await chooseBotMove(engine, chess.fen(), optsRef.current.botLevel) : randomLegal() } catch { uci = randomLegal(); setEngineMissing(true) }
    await pause
    if (!alive(g)) return
    const before = new Chess(chess.fen())
    const mv = chess.move(uciToMove(uci))
    const ply = chess.history().length
    sfx.play(mv, chess)
    setFen(chess.fen()); setLastMove([mv.from, mv.to])
    setMoves(m => [...m, { san: mv.san, color: mv.color }])
    push(...explainBotMove(before, mv, chess, optsRef.current.userColor, botFor(optsRef.current.botLevel).name, ply))
    const end = checkEnd()
    if (end) { if (!runJudge(g, end, true)) finish(end); return }
    if (runJudge(g, null, true)) return
    analysisRef.current = engine ? engine.search(chess.fen(), { depth: 10 }).catch(() => null) : Promise.resolve(null)
    setThinking(false); busy.current = false
  }, [checkEnd, finish, push, runJudge])

  // ----- start / restart -----
  useEffect(() => {
    const g = ++gen.current
    const chess = new Chess(optsRef.current.startFen)
    chessRef.current = chess
    statsRef.current = emptyStats(); momentsRef.current = []
    setFen(chess.fen()); setMoves([]); setPending(null); setOver(null); setJudgement(null); setLastMove(null); setStats(emptyStats()); setHoverShapes(null)
    const bot = botFor(optsRef.current.botLevel)
    const engine = getEngine()
    const intro: CoachMsg[] = [msg({ who: 'system', text: `Playing ${bot.name} (level ${bot.level}). ${bot.blurb}` })]
    if (optsRef.current.assist === 'quiz') intro.push(msg({ who: 'coach', tone: 'info', title: 'Safety quiz is on', text: 'Whenever you move to a square the opponent attacks, I will ask you to **count the attackers and defenders** first. That counting is the habit that stops you hanging pieces.' }))
    setMessages(intro)
    busy.current = false
    analysisRef.current = engine ? engine.search(chess.fen(), { depth: 10 }).catch(() => null) : Promise.resolve(null)
    if (!engine) setEngineMissing(true)
    if (chess.turn() !== optsRef.current.userColor) { busy.current = true; void botTurn(g) }
    return () => { gen.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- user moves -----
  const commit = useCallback(async (from: Square, to: Square, promotion: PieceSymbol | undefined, safety: MoveSafety) => {
    const g = gen.current
    const chess = chessRef.current
    const userColor = optsRef.current.userColor
    busy.current = true
    setPending(null); setHoverShapes(null)
    const before = new Chess(chess.fen())
    const freeBefore = freePieces(chess)
    const mv: Move = chess.move({ from, to, promotion })
    const ply = chess.history().length
    sfx.play(mv, chess)
    setFen(chess.fen()); setLastMove([from, to]); setSyncKey(k => k + 1)
    const idx = moves.length
    setMoves(m => [...m, { san: mv.san, color: mv.color }])
    const st = statsRef.current
    st.userMoves++
    if (safety.net <= -2 && !chess.isCheckmate()) st.hangs++
    if (freeBefore.length) st.offeredFree++
    const ctx: UserMoveContext = { before, mv, after: chess, safety, freeBefore, ply }
    push(...explainUserMoveInstant(ctx, userColor))
    syncStats()

    const end = checkEnd()
    if (end) { if (!runJudge(g, end, true)) finish(end); return }
    // fail-fast boss rules (e.g. "hang nothing") should end the attempt right away
    if (runJudge(g, null, false)) return

    setThinking(true)
    const engine = getEngine()
    if (engine) {
      try {
        const pre = await analysisRef.current
        const post = await engine.search(chess.fen(), { depth: 10 })
        if (!alive(g)) return
        if (pre?.lines[0] && post.lines[0]) {
          const uci = from + to + (promotion ?? '')
          const bestCp = cpOf(pre.lines[0])
          const playedCp = -cpOf(post.lines[0])
          const res = gradeMove(bestCp, playedCp, uci === pre.lines[0].move)
          ctx.grade = res; ctx.bestUci = pre.lines[0].move
          const gm = explainGrade(ctx, userColor)
          if (gm && res.grade !== 'good') push(gm)
          setMoves(m => m.map((e, i) => (i === idx ? { ...e, grade: res.grade } : e)))
          if (res.grade === 'blunder') st.blunders++
          else if (res.grade === 'mistake') st.mistakes++
          else if (res.grade === 'inaccuracy') st.inaccuracies++
          if (['inaccuracy', 'mistake', 'blunder'].includes(res.grade) && freeBefore.length && !freeBefore.some(f => f.square === to)) st.missedFree++
          if (res.grade === 'mistake' || res.grade === 'blunder') {
            const b = describeBest(before, pre.lines[0].move)
            momentsRef.current.push({ ply, san: mv.san, grade: res.grade, loss: res.loss, bestSan: b.san, bestWhy: b.why, fenBefore: before.fen(), bestUci: pre.lines[0].move })
            sfx.bad()
          }
          syncStats()
          if (runJudge(g, null, true)) return
        }
      } catch { /* engine hiccup: carry on without a grade */ }
    }
    if (!alive(g)) return
    await botTurn(g)
  }, [botTurn, checkEnd, finish, moves.length, push, runJudge])

  const tryMove = useCallback((from: Square, to: Square) => {
    if (busy.current || over || pending) { setSyncKey(k => k + 1); return }
    const chess = chessRef.current
    const piece = chess.get(from)
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? ('q' as PieceSymbol) : undefined
    const safety = checkMoveSafety(chess, from, to, promotion)
    if (!safety) { setSyncKey(k => k + 1); return }
    const o = optsRef.current
    let mode: Pending['mode'] | null = null
    if (o.stalemateGuard) {
      const probe = new Chess(chess.fen()); probe.move({ from, to, promotion })
      if (probe.isStalemate()) mode = 'stalemate'
    }
    if (!mode && o.assist === 'quiz') {
      if (safety.destAttackers.length > 0 || safety.newlyHanging.length > 0 || safety.allowsMate.length > 0 || Math.random() < 0.2) mode = 'quiz'
    } else if (!mode && o.assist === 'warn') {
      if (safety.losesMaterial || safety.allowsMate.length > 0) mode = 'warn'
    }
    if (mode) { busy.current = true; setPending({ from, to, promotion, safety, mode, step: mode === 'quiz' ? 'q1' : 'verdict' }); sfx.move(); return }
    void commit(from, to, promotion, safety)
  }, [commit, over, pending])

  const quizShapes = (p: Pending): Shape[] => [
    ...p.safety.destAttackers.map(a => ({ orig: a, dest: p.to, brush: 'red' as const })),
    ...p.safety.destDefenders.map(d => ({ orig: d, dest: p.to, brush: 'green' as const })),
  ]

  const answerQuiz = useCallback((n: number) => {
    setPending(p => {
      if (!p || p.mode !== 'quiz') return p
      if (p.step === 'q1') return { ...p, a1: n, step: 'q2' }
      if (p.step === 'q2') return { ...p, a2: n, step: 'verdict' }
      return p
    })
  }, [])

  // when the quiz reaches its verdict: log it, show the arrows, auto-continue if it was a safe move
  useEffect(() => {
    if (!pending || pending.step !== 'verdict') return
    const s = pending.safety
    const unsafe = s.losesMaterial || s.allowsMate.length > 0
    if (pending.mode === 'quiz') {
      const ok1 = pending.a1 === s.destAttackers.length, ok2 = pending.a2 === s.destDefenders.length
      statsRef.current.quizTotal++
      if (ok1 && ok2) statsRef.current.quizCorrect++
      recordQuiz(ok1 && ok2)
      syncStats()
      push(msg({ who: 'coach', tone: ok1 && ok2 ? 'good' : 'warn', title: 'Safety check', text: `Attackers: **${s.destAttackers.length}**, defenders: **${s.destDefenders.length}** on ${pending.to}. You said ${pending.a1} and ${pending.a2}${ok1 && ok2 ? ' — correct.' : ' — recount next time: look at every enemy piece that could capture there.'}` }))
    }
    setHoverShapes(quizShapes(pending))
    if (!unsafe && pending.mode === 'quiz') {
      const t = setTimeout(() => { if (pending) void commit(pending.from, pending.to, pending.promotion, pending.safety) }, 1100)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.step])

  const confirmPending = useCallback(() => { if (pending) void commit(pending.from, pending.to, pending.promotion, pending.safety) }, [commit, pending])
  const takeBack = useCallback(() => {
    setPending(null); setHoverShapes(null); setSyncKey(k => k + 1); busy.current = false
    push(msg({ who: 'coach', tone: 'good', text: 'Good call, taking it back. Find a safer move.' }))
  }, [push])

  const scan = useCallback(() => {
    if (busy.current || over) return
    const m = cctScan(chessRef.current)
    statsRef.current.scans++
    push(m); setHoverShapes(m.shapes ?? null)
  }, [over, push])

  const resign = useCallback(() => { if (!over) finish({ result: 'loss', reason: 'You resigned.' }) }, [finish, over])

  // while a safety quiz/warning is open, keep showing the move being questioned (not the position before it)
  const displayFen = useMemo(() => {
    if (!pending) return fen
    try { const c = new Chess(fen); c.move({ from: pending.from, to: pending.to, promotion: pending.promotion }); return c.fen() } catch { return fen }
  }, [pending, fen])

  return {
    fen, displayFen, moves, messages, pending, thinking, over, judgement, stats, lastMove: pending ? ([pending.from, pending.to] as [Square, Square]) : lastMove, syncKey, engineMissing,
    userMovable: !over && !thinking && !pending ? optsRef.current.userColor : null,
    boardShapes: hoverShapes ?? undefined,
    moments: momentsRef,
    chess: chessRef,
    tryMove, answerQuiz, confirmPending, takeBack, scan, resign, setHoverShapes,
    describePieceList: (sqs: Square[]) => listJoin(sqs.map(s => `${NAME[chessRef.current.get(s)?.type ?? 'p']} on ${s}`)),
    otherColor: other(optsRef.current.userColor),
  }
}
