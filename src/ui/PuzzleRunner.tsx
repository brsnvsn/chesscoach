import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chess, type Square, type PieceSymbol } from 'chess.js'
import { Board } from './Board'
import { Md } from './Md'
import type { Shape } from '../chess/explain'
import { uciToMove } from '../chess/explain'
import type { Puzzle, CountQ, TradeQ, PrincipleQ } from '../data/types'
import { bump, recordPuzzle, useProgress, todayRecord } from '../store/progress'
import { sfx } from './sfx'

export type Item =
  | { t: 'move'; puzzle: Puzzle }
  | { t: 'count'; q: CountQ }
  | { t: 'trade'; q: TradeQ }
  | { t: 'principle'; q: PrincipleQ }

export interface Resolved { solved: boolean; clean: boolean }
export type RunMode = 'drill' | 'review' | 'warmup' | 'boss'
export interface RunSummary { correct: number; total: number; passed?: boolean; seconds: number }

interface ItemProps { item: Item; header: ReactNode; strict: boolean; onResolved: (r: Resolved) => void; onNext: () => void; isLast: boolean }

const toKeyShapes = (s: Shape[]) => s

// ======================= move puzzle =======================
function MoveItem({ item, header, strict, onResolved, onNext, isLast }: ItemProps & { item: { t: 'move'; puzzle: Puzzle } }) {
  const p = item.puzzle
  const chess = useRef(new Chess(p.fen))
  const [fen, setFen] = useState(p.fen)
  const [idx, setIdx] = useState(0)
  const [status, setStatus] = useState<'setup' | 'solving' | 'solved' | 'failed'>('setup')
  const [attempts, setAttempts] = useState(0)
  const [hints, setHints] = useState(0)
  const [note, setNote] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null)
  const [last, setLast] = useState<[Square, Square] | null>(null)
  const [sync, setSync] = useState(0)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [circles, setCircles] = useState<{ sq: Square }[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }
  const firstUser = p.setup === false ? 0 : 1
  const resolved = useRef(false)

  useEffect(() => {
    // test hook: only active with ?debug in the URL
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __puzzle?: Puzzle }).__puzzle = p
    const c = chess.current
    if (p.setup === false) { setIdx(0); setStatus('solving') }
    else later(() => {
      const m = c.move(uciToMove(p.moves[0]))
      setFen(c.fen()); setLast([m.from, m.to]); setIdx(1); setStatus('solving'); sfx.play(m, c)
    }, 450)
    return () => timers.current.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = (solved: boolean) => {
    if (resolved.current) return
    resolved.current = true
    onResolved({ solved, clean: solved && attempts === 0 && hints === 0 })
  }

  const showSolution = () => {
    const c = new Chess(chess.current.fen())
    const exp = p.moves[idx]
    try { const m = c.move(uciToMove(exp)); setShapes(toKeyShapes([{ orig: m.from, dest: m.to, brush: 'green' }])) } catch { /* ignore */ }
  }

  const onMove = (from: Square, to: Square) => {
    if (status !== 'solving') return
    const c = chess.current
    const piece = c.get(from)
    const promo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? ('q' as PieceSymbol) : undefined
    const uci = from + to + (promo ?? '')
    const exp = p.moves[idx]
    const probe = new Chess(c.fen())
    let mate = false
    try { probe.move({ from, to, promotion: promo }); mate = probe.isCheckmate() } catch { setSync(k => k + 1); return }
    const ok = uci === exp || (idx === firstUser && !!p.alt?.includes(uci)) || (mate && p.themes.some(t => t.startsWith('mate')))
    if (ok) {
      const played = c.move({ from, to, promotion: promo })
      setFen(c.fen()); setLast([from, to]); setShapes([]); setCircles([]); sfx.play(played, c)
      const nextIdx = idx + 1
      const isAltEnd = uci !== exp
      if (nextIdx >= p.moves.length || isAltEnd || c.isCheckmate()) {
        setStatus('solved'); setIdx(p.moves.length); sfx.good()
        setNote({ tone: 'good', text: p.note ? `Correct! ${p.note}` : 'Correct!' })
        finish(true)
      } else {
        setNote({ tone: 'info', text: 'Good. Keep going…' })
        later(() => {
          const m = c.move(uciToMove(p.moves[nextIdx]))
          setFen(c.fen()); setLast([m.from, m.to]); setIdx(nextIdx + 1); sfx.play(m, c)
        }, 450)
        setIdx(nextIdx)
      }
    } else {
      setAttempts(a => a + 1)
      sfx.bad()
      setSync(k => k + 1)
      if (strict || attempts >= 1) {
        setStatus('failed'); setNote({ tone: 'bad', text: `Not quite. ${p.note ? p.note : 'Here is the move.'}` }); showSolution(); finish(false)
      } else setNote({ tone: 'bad', text: 'Not quite. Look again: check for checks, captures and threats. Try again.' })
    }
  }

  const hint = () => {
    const exp = p.moves[idx]
    if (!exp) return
    setHints(h => h + 1)
    if (hints === 0) { setCircles([{ sq: exp.slice(0, 2) as Square }]); setNote({ tone: 'info', text: 'Hint: this is the piece to move.' }) }
    else showSolution()
  }

  const orient = useMemo(() => {
    try { const c = new Chess(p.fen); if (p.setup !== false) c.move(uciToMove(p.moves[0])); return c.turn() === 'b' ? 'black' : 'white' } catch { return 'white' }
  }, [p]) as 'white' | 'black'
  const turnWord = orient === 'white' ? 'White' : 'Black'

  return (
    <div className="game">
      <div className="board-col">
        <Board fen={fen} orientation={orient} movable={status === 'solving' ? (orient === 'white' ? 'w' : 'b') : null} lastMove={last} shapes={shapes} circles={circles} onMove={onMove} syncKey={sync} />
      </div>
      <div className="panel" style={{ height: 'auto', minHeight: 420 }}>
        <div className="lp">
          {header}
          <h2>{status === 'setup' ? 'Watch the last move…' : `${turnWord} to move`}</h2>
          <div className="body">{status === 'solving' && !note ? 'Find the best move. Run your scan: checks, captures, threats.' : null}</div>
          {note && <div className={`feedback ${note.tone}`}><Md text={note.text} /></div>}
          <div className="spacer" />
          <div className="row">
            {status === 'solving' && !strict && <button className="btn small ghost" onClick={hint}>💡 Hint</button>}
            {(status === 'solved' || status === 'failed') && <button className="btn" onClick={onNext}>{isLast ? 'Finish' : 'Next'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ======================= count (attackers / defenders) =======================
function CountItem({ item, header, onResolved, onNext, isLast }: ItemProps & { item: { t: 'count'; q: CountQ } }) {
  const q = item.q
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const [a, setA] = useState<number[]>([])
  const [safe, setSafe] = useState<boolean | null>(null)
  const chess = useMemo(() => new Chess(q.fen), [q])
  const piece = chess.get(q.target)!
  const enemy = piece.color === 'w' ? 'b' : 'w'
  const shapes: Shape[] = step === 3 ? [
    ...chess.attackers(q.target, enemy).map(s => ({ orig: s, dest: q.target, brush: 'red' as const })),
    ...chess.attackers(q.target, piece.color).map(s => ({ orig: s, dest: q.target, brush: 'green' as const })),
  ] : []
  const name = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece.type]
  const side = piece.color === 'w' ? 'white' : 'black'
  const nums = (onPick: (n: number) => void) => <div className="nums">{[0, 1, 2, 3, 4].map(n => <button key={n} onClick={() => onPick(n)}>{n}</button>)}</div>
  const results = step === 3 ? [a[0] === q.attackers, a[1] === q.defenders, safe === q.safe] : []
  const clean = results.length > 0 && results.every(Boolean)

  return (
    <div className="game">
      <div className="board-col"><Board fen={q.fen} orientation="white" movable={null} shapes={shapes} circles={[{ sq: q.target, brush: 'yellow' }]} /></div>
      <div className="panel" style={{ height: 'auto', minHeight: 420 }}>
        <div className="lp">
          {header}
          <h2>The {side} {name} on {q.target}</h2>
          {step === 0 && <><div className="body">How many <b>{enemy === 'w' ? 'white' : 'black'}</b> pieces attack it right now?</div>{nums(n => { setA([n]); setStep(1) })}</>}
          {step === 1 && <><div className="body">How many <b>{side}</b> pieces defend it?</div>{nums(n => { setA(x => [...x, n]); setStep(2) })}</>}
          {step === 2 && <><div className="body">If the attackers start capturing, does the <b>{side}</b> side lose material?</div>
            <div className="opts"><button className="opt" onClick={() => { setSafe(true); setStep(3); onResolved({ solved: true, clean: a[0] === q.attackers && a[1] === q.defenders && q.safe === true }) }}>No, it is safe</button>
              <button className="opt" onClick={() => { setSafe(false); setStep(3); onResolved({ solved: true, clean: a[0] === q.attackers && a[1] === q.defenders && q.safe === false }) }}>Yes, it can be won</button></div></>}
          {step === 3 && (
            <>
              <div className="row small muted">
                <span>Attackers: <b style={{ color: '#fff' }}>{q.attackers}</b> {results[0] ? '✓' : `✗ (you said ${a[0]})`}</span>
                <span>Defenders: <b style={{ color: '#fff' }}>{q.defenders}</b> {results[1] ? '✓' : `✗ (you said ${a[1]})`}</span>
                <span>Safe: <b style={{ color: '#fff' }}>{q.safe ? 'yes' : 'no'}</b> {results[2] ? '✓' : '✗'}</span>
              </div>
              <div className={`feedback ${clean ? 'good' : 'bad'}`}>{clean ? 'All correct. ' : ''}<Md text={q.explain} /></div>
              <div className="muted small">Red arrows = attackers, green arrows = defenders.</div>
              <div className="spacer" />
              <button className="btn" onClick={onNext}>{isLast ? 'Finish' : 'Next'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ======================= trade verdict =======================
function TradeItem({ item, header, onResolved, onNext, isLast }: ItemProps & { item: { t: 'trade'; q: TradeQ } }) {
  const q = item.q
  const [pick, setPick] = useState<TradeQ['verdict'] | null>(null)
  const chess = useMemo(() => new Chess(q.fen), [q])
  const orient = chess.turn() === 'b' ? 'black' : 'white'
  const ok = pick === q.verdict
  const p = chess.get(q.from), t = chess.get(q.to)
  const nm = (x?: { type: PieceSymbol } | null) => (x ? { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[x.type] : '?')
  const choose = (v: TradeQ['verdict']) => { if (pick) return; setPick(v); onResolved({ solved: true, clean: v === q.verdict }); v === q.verdict ? sfx.good() : sfx.bad() }
  return (
    <div className="game">
      <div className="board-col"><Board fen={q.fen} orientation={orient} movable={null} shapes={[{ orig: q.from, dest: q.to, brush: 'yellow' }]} /></div>
      <div className="panel" style={{ height: 'auto', minHeight: 420 }}>
        <div className="lp">
          {header}
          <h2>Should you take?</h2>
          <div className="body">Your {nm(p)} on {q.from} can capture the {nm(t)} on {q.to}. Think about what happens if they take back, then decide.</div>
          <div className="muted small">Pawn 1 · Knight 3 · Bishop 3 · Rook 5 · Queen 9</div>
          <div className="opts">
            {([['win', 'I win material'], ['even', 'Even trade'], ['lose', 'I lose material']] as const).map(([k, l]) => (
              <button key={k} className={`opt ${pick ? (k === q.verdict ? 'ok' : pick === k ? 'no' : '') : ''}`} disabled={!!pick} onClick={() => choose(k)}>{l}</button>
            ))}
          </div>
          {pick && <div className={`feedback ${ok ? 'good' : 'bad'}`}><Md text={q.explain} /></div>}
          <div className="spacer" />
          {pick && <button className="btn" onClick={onNext}>{isLast ? 'Finish' : 'Next'}</button>}
        </div>
      </div>
    </div>
  )
}

// ======================= opening principle choice =======================
function PrincipleItem({ item, header, onResolved, onNext, isLast }: ItemProps & { item: { t: 'principle'; q: PrincipleQ } }) {
  const q = item.q
  const [pick, setPick] = useState<string | null>(null)
  const chess = useMemo(() => new Chess(q.fen), [q])
  const orient = chess.turn() === 'b' ? 'black' : 'white'
  const choose = (u: string) => { if (pick) return; setPick(u); onResolved({ solved: true, clean: u === q.correct }); u === q.correct ? sfx.good() : sfx.bad() }
  return (
    <div className="game">
      <div className="board-col"><Board fen={q.fen} orientation={orient} movable={null} shapes={pick ? [{ orig: q.correct.slice(0, 2) as Square, dest: q.correct.slice(2, 4) as Square, brush: 'green' }] : []} /></div>
      <div className="panel" style={{ height: 'auto', minHeight: 420 }}>
        <div className="lp">
          {header}
          <h2>Which move follows the opening principles?</h2>
          <div className="body">Centre, develop, castle. Do not waste time.</div>
          <div className="opts">
            {q.options.map(o => <button key={o.uci} className={`opt ${pick ? (o.uci === q.correct ? 'ok' : pick === o.uci ? 'no' : '') : ''}`} disabled={!!pick} onClick={() => choose(o.uci)}>{o.san}</button>)}
          </div>
          {pick && <div className={`feedback ${pick === q.correct ? 'good' : 'bad'}`}><Md text={q.explain} /></div>}
          <div className="spacer" />
          {pick && <button className="btn" onClick={onNext}>{isLast ? 'Finish' : 'Next'}</button>}
        </div>
      </div>
    </div>
  )
}

// ======================= runner =======================
export interface RunnerProps {
  title: string
  count: number
  getItem: (i: number) => Item
  mode: RunMode
  need?: number
  seconds?: number
  blurb?: string
  onExit: () => void
  onComplete?: (s: RunSummary) => void
  onAgain?: () => void
  /** shown on the summary of a boss run when passed */
  passLabel?: string
}

export function PuzzleRunner(p: RunnerProps) {
  const st = useProgress()
  const [i, setI] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [done, setDone] = useState<RunSummary | null>(null)
  const [left, setLeft] = useState(p.seconds ?? 0)
  const t0 = useRef(Date.now())
  const cache = useRef<Record<number, Item>>({})
  const item = (idx: number) => (cache.current[idx] ??= p.getItem(idx))
  const cur = useMemo(() => (done ? null : item(i)), [i, done]) // eslint-disable-line react-hooks/exhaustive-deps
  const resultsRef = useRef<boolean[]>([])

  const complete = useCallback((res: boolean[]) => {
    const total = p.count
    const correct = res.filter(Boolean).length
    const passed = p.need !== undefined ? correct >= p.need : undefined
    const s: RunSummary = { correct, total, passed, seconds: Math.round((Date.now() - t0.current) / 1000) }
    setDone(s)
    p.onComplete?.(s)
  }, [p])

  // countdown for timed bosses
  useEffect(() => {
    if (!p.seconds || done) return
    const t = setInterval(() => setLeft(l => { if (l <= 1) { clearInterval(t); complete(resultsRef.current); return 0 } return l - 1 }), 1000)
    return () => clearInterval(t)
  }, [p.seconds, done, complete])

  const onResolved = (r: Resolved) => {
    const it = item(i)
    const id = it.t === 'move' ? it.puzzle.id : it.q.id
    const themes = it.t === 'move' ? it.puzzle.themes : [it.t]
    recordPuzzle({ id, themes }, r.clean, undefined, { review: p.mode === 'review' || p.mode === 'warmup', noReview: it.t !== 'move' })
    bump(p.mode === 'review' || p.mode === 'warmup' ? 'review' : 'train')
    resultsRef.current = [...resultsRef.current, r.clean]
    setResults(resultsRef.current)
  }
  const onNext = () => {
    if (i + 1 >= p.count) complete(resultsRef.current)
    else setI(i + 1)
  }

  const dots = (
    <div>
      <div className="row"><b>{p.title}</b><span className="spacer" />
        {p.seconds ? <span className="chip">⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span> : null}
        <span className="chip">{Math.min(i + 1, p.count)}/{p.count}</span>
        <button className="link small" onClick={p.onExit}>{p.mode === 'boss' ? 'Quit' : 'Exit'}</button></div>
      <div className="dots" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: p.count }, (_, k) => <i key={k} className={k < results.length ? 'on' : k === i ? 'cur' : ''} style={k < results.length && !results[k] ? { background: 'var(--red)' } : undefined} />)}
      </div>
      {p.mode === 'boss' && p.need !== undefined && <div className="muted small" style={{ marginTop: 6 }}>Need {p.need} correct · one try each · no hints</div>}
    </div>
  )

  return (
    <>
      {cur && (
        <div key={i}>
          {cur.t === 'move' && <MoveItem item={cur} header={dots} strict={p.mode === 'boss'} onResolved={onResolved} onNext={onNext} isLast={i + 1 >= p.count} />}
          {cur.t === 'count' && <CountItem item={cur} header={dots} strict={p.mode === 'boss'} onResolved={onResolved} onNext={onNext} isLast={i + 1 >= p.count} />}
          {cur.t === 'trade' && <TradeItem item={cur} header={dots} strict={p.mode === 'boss'} onResolved={onResolved} onNext={onNext} isLast={i + 1 >= p.count} />}
          {cur.t === 'principle' && <PrincipleItem item={cur} header={dots} strict={p.mode === 'boss'} onResolved={onResolved} onNext={onNext} isLast={i + 1 >= p.count} />}
        </div>
      )}
      {done && (
        <div className="modal-bg">
          <div className="modal">
            <div className="bigbadge">{done.passed === undefined ? (done.correct >= done.total * 0.7 ? '🎉' : '💪') : done.passed ? '🏆' : '💥'}</div>
            <h2 className={done.passed === undefined ? '' : done.passed ? 'pass' : 'fail'}>
              {done.passed === undefined ? `${done.correct} / ${done.total} correct` : done.passed ? `Passed! ${done.correct}/${done.total}` : `${done.correct}/${done.total}. You needed ${p.need}.`}
            </h2>
            <div className="sub">
              {done.passed === undefined ? (done.correct === done.total ? 'Perfect set.' : 'Anything you missed will come back in your review queue.') : done.passed ? (p.passLabel ?? 'Boss defeated.') : 'Look at what you missed and try again — the puzzles will be different.'}
            </div>
            {p.mode !== 'boss' && (() => { const t = todayRecord(st); const goal = p.mode === 'drill' ? t.trainDone : t.reviewDone
              return <div className="small" style={{ textAlign: 'center', color: goal ? 'var(--green-hi)' : undefined }}>✓ Saved.{goal ? ` ${p.mode === 'drill' ? 'Train' : 'Warm-up'} is done for today.` : ''}{t.complete ? ' Day complete, streak safe 🔥' : ''}</div> })()}
            <div className="row" style={{ justifyContent: 'center' }}>
              {p.mode === 'boss' && done.passed && <button className="btn" onClick={p.onExit}>Continue</button>}
              {p.mode === 'boss' && !done.passed && p.onAgain && <button className="btn" onClick={p.onAgain}>Try again</button>}
              {p.mode === 'boss' && !done.passed && <button className="btn ghost" onClick={p.onExit}>Back to path</button>}
              {p.mode !== 'boss' && <button className="btn" onClick={p.onExit}>Done</button>}
              {p.mode === 'drill' && p.onAgain && <button className="btn ghost" onClick={p.onAgain}>Another set</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
