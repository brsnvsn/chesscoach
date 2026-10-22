import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color } from 'chess.js'
import { Board } from './Board'
import { CoachPanel } from './CoachPanel'
import { useGame, type GameStats, type Judgement, type JudgeInfo, type Over } from './useGame'
import { BOTS, botFor } from '../chess/bots'
import { VALUE, material, other } from '../chess/analysis'
import { bump, recordGame, recordPuzzle, setSetting, useProgress, readyToFade, dayKey, type Assist } from '../store/progress'
import type { Puzzle } from '../data/types'
import type { GameRules } from '../data/levels'
import { sfx } from './sfx'

export interface GameConfig {
  botLevel: number
  color: Color
  assist: Assist
  startFen?: string
  title?: string
  hint?: string
  judge?: (i: JudgeInfo) => Judgement | null
  stalemateGuard?: boolean
  /** hide the assist selector (boss/scenario fix their own rules) */
  lockAssist?: boolean
  /** this game counts as a boss or scenario attempt rather than a free game */
  attempt?: boolean
}

export interface DoneInfo { judgement: Judgement | null; over: Over; stats: GameStats }

// ---------- boss rule judge ----------
export function makeJudge(rules: GameRules) {
  return (i: JudgeInfo): Judgement | null => {
    const s = i.stats
    const fail = (r: string): Judgement => ({ passed: false, reasons: [r] })
    if (rules.maxHangs !== undefined && s.hangs > rules.maxHangs) return fail(rules.maxHangs === 0 ? 'You left a piece hanging. This fight allows none.' : `You hung ${s.hangs} pieces (limit ${rules.maxHangs}).`)
    if (rules.maxBlunders !== undefined && s.blunders > rules.maxBlunders) return fail(`Too many blunders (${s.blunders}, limit ${rules.maxBlunders}).`)
    if (rules.maxMissedFree !== undefined && s.missedFree > rules.maxMissedFree) return fail('You walked past a free piece. This fight allows none.')
    const over = !!i.over
    if (!i.final && !over) return null
    const moves = s.userMoves
    const enough = (rules.minFreeOffered ?? 0) <= s.offeredFree
    const timeUp = rules.maxMoves ? moves >= rules.maxMoves : false
    if (!over && !timeUp && !(moves >= rules.minMoves && enough && !rules.mustWin)) return null
    const reasons: string[] = []
    let passed = true
    if (rules.mustWin) { if (i.over?.result !== 'win') { passed = false; reasons.push('You needed to win the game.') } }
    else if (i.over?.result === 'loss') { passed = false; reasons.push('You lost the game.') }
    if (rules.castled && !i.dev.castled) { passed = false; reasons.push('You did not castle.') }
    if (rules.minDeveloped !== undefined && i.dev.minorsDeveloped < rules.minDeveloped) { passed = false; reasons.push(`You developed ${i.dev.minorsDeveloped} piece${i.dev.minorsDeveloped === 1 ? '' : 's'}; the target is ${rules.minDeveloped}.`) }
    if (!enough) { passed = false; reasons.push(`Only ${s.offeredFree} free piece${s.offeredFree === 1 ? '' : 's'} showed up; the fight needs ${rules.minFreeOffered}. Try again.`) }
    if (passed) reasons.push('Every condition met.')
    return { passed, reasons }
  }
}

export function makeScenarioJudge(maxMoves: number) {
  return (i: JudgeInfo): Judgement | null => {
    const c = i.chess
    if (c.isCheckmate()) return c.turn() !== i.userColor ? { passed: true, reasons: [`Checkmate in ${i.stats.userMoves} move${i.stats.userMoves === 1 ? '' : 's'}.`] } : { passed: false, reasons: ['You were checkmated.'] }
    if (c.isStalemate()) return { passed: false, reasons: ['Stalemate: the game is a draw. Always leave the enemy king a move, or give check.'] }
    if (c.isInsufficientMaterial() || c.isDraw()) return { passed: false, reasons: ['The game was drawn. You must checkmate.'] }
    if (i.final && i.stats.userMoves >= maxMoves) return { passed: false, reasons: [`Out of moves. The limit is ${maxMoves}.`] }
    return null
  }
}

// ---------- setup screen ----------
export function PlaySetup({ onStart }: { onStart: (c: GameConfig) => void }) {
  const s = useProgress()
  const [bot, setBot] = useState(s.settings.botLevel)
  const [color, setColor] = useState<'w' | 'b' | 'random'>(s.settings.color)
  return (
    <div className="setup">
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Play a game</h1>
      <div className="card">
        <h2>Opponent</h2>
        <div className="bots">
          {BOTS.map(b => (
            <button key={b.level} className={`bot-opt ${bot === b.level ? 'on' : ''}`} onClick={() => setBot(b.level)}>
              <span className="lv">{b.level}</span>
              <span><b>{b.name}</b><p>{b.blurb}</p></span>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>You play</h2>
        <div className="seg">
          {([['w', 'White'], ['b', 'Black'], ['random', 'Random']] as const).map(([k, l]) => <button key={k} className={color === k ? 'on' : ''} onClick={() => setColor(k)}>{l}</button>)}
        </div>
        <h2 style={{ marginTop: 16 }}>Safety help</h2>
        <div className="seg">
          {([['quiz', 'Quiz me'], ['warn', 'Warn me'], ['off', 'Off']] as const).map(([k, l]) => <button key={k} className={s.settings.assist === k ? 'on' : ''} onClick={() => setSetting('assist', k)}>{l}</button>)}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          <b>Quiz:</b> before risky moves, you count the attackers and defenders. <b>Warn:</b> only stops you when a move loses material. <b>Off:</b> the coach only comments after your move.
        </p>
      </div>
      <button className="btn big" onClick={() => { setSetting('botLevel', bot); setSetting('color', color); onStart({ botLevel: bot, color: color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color, assist: s.settings.assist }) }}>Start game</button>
    </div>
  )
}

// ---------- the game itself ----------
function Strip({ name, sub, glyph, adv }: { name: string; sub?: string; glyph: string; adv: number }) {
  return (
    <div className="strip">
      <div className="av">{glyph}</div>
      <div><b>{name}</b> {adv > 0 && <span className="adv">+{adv}</span>}<div className="sub">{sub}</div></div>
    </div>
  )
}

interface GameProps { config: GameConfig; onExit: () => void; onAgain: () => void; onDone?: (d: DoneInfo) => void; onReview?: () => void }

export function Game({ config, onExit, onAgain, onDone, onReview }: GameProps) {
  const prog = useProgress()
  const assist = config.lockAssist ? config.assist : prog.settings.assist
  const g = useGame({ botLevel: config.botLevel, userColor: config.color, startFen: config.startFen, assist, stalemateGuard: config.stalemateGuard, judge: config.judge })
  const bot = botFor(config.botLevel)
  const orientation = config.color === 'w' ? 'white' : 'black'
  const chess = useMemo(() => { try { return new Chess(g.fen) } catch { return new Chess() } }, [g.fen])
  const adv = material(chess, config.color) - material(chess, other(config.color))
  const recorded = useRef(false)
  const [summary, setSummary] = useState<null | { xp: { label: string; n: number }[]; total: number; mistakes: number }>(null)

  // when the game ends: score it, save it, queue mistakes for review
  useEffect(() => {
    if (!g.over || recorded.current) return
    recorded.current = true
    const st = g.stats, res = g.over.result
    const lines: { label: string; n: number }[] = []
    if (!config.attempt) {
      lines.push({ label: st.userMoves >= 8 ? 'Finished a game' : 'Short game', n: st.userMoves >= 8 ? 30 : 5 })
      if (res === 'win') lines.push({ label: 'Win', n: 20 })
      if (res === 'draw') lines.push({ label: 'Draw', n: 8 })
      if (st.blunders === 0 && st.mistakes === 0 && st.userMoves >= 10) lines.push({ label: 'No mistakes or blunders', n: 20 })
      if (st.hangs === 0 && st.userMoves >= 10) lines.push({ label: 'Never hung a piece', n: 10 })
    }
    const total = lines.reduce((a, b) => a + b.n, 0)
    const mistakes = g.moments.current.slice().sort((a, b) => b.loss - a.loss).slice(0, 3)
    if (!config.attempt) {
      recordGame({ date: dayKey(), bot: config.botLevel, result: res, moves: st.userMoves, blunders: st.blunders, mistakes: st.mistakes, hangs: st.hangs, missedFree: st.missedFree, xp: total })
      if (st.userMoves >= 8) bump('play')
      for (const m of mistakes) {
        if (!m.bestUci) continue
        const p: Puzzle = { id: `game-${Date.now()}-${m.ply}`, fen: m.fenBefore, moves: [m.bestUci], themes: ['ownGame'], rating: 800, setup: false, source: 'game', note: `${m.bestSan} ${m.bestWhy}.` }
        recordPuzzle({ id: p.id, themes: p.themes }, false, p, { noXp: true })
      }
    }
    setSummary({ xp: lines, total, mistakes: mistakes.length })
    res === 'win' || g.judgement?.passed ? sfx.good() : sfx.bad()
  }, [g.over, g.stats, g.moments, g.judgement, config])

  const fade = readyToFade(prog)
  const judged = config.attempt && g.over
  return (
    <div className="game">
      <div className="board-col">
        <Strip name={bot.name} sub={`Level ${bot.level}`} glyph={bot.level >= 5 ? '🤖' : '🙂'} adv={-adv} />
        <Board fen={g.displayFen} orientation={orientation} movable={g.userMovable} lastMove={g.lastMove} shapes={g.boardShapes} onMove={g.tryMove} syncKey={g.syncKey} />
        <Strip name="You" sub={config.title} glyph="🧑" adv={adv} />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {config.hint && <div className="card small" style={{ padding: '10px 14px' }}><b>Goal:</b> {config.hint}</div>}
        {fade && !config.lockAssist && (
          <div className="card small" style={{ padding: '10px 14px', borderColor: 'var(--green)' }}>
            <b>You are counting accurately.</b> Ready for less help? <button className="link" onClick={() => setSetting('assist', 'warn')}>Switch to Warn mode</button>
          </div>
        )}
        <CoachPanel
          messages={g.messages} moves={g.moves} pending={g.pending} thinking={g.thinking} disabled={!!g.over || g.thinking}
          assist={assist} engineMissing={g.engineMissing} onAssist={config.lockAssist ? undefined : a => setSetting('assist', a)}
          onHover={m => g.setHoverShapes(m?.shapes ?? null)} onAnswer={g.answerQuiz} onConfirm={g.confirmPending} onTakeBack={g.takeBack}
          onScan={g.scan} onResign={g.resign}
        />
      </div>
      {g.over && summary && (
        <div className="modal-bg">
          <div className="modal">
            {judged ? (
              <>
                <div className="bigbadge">{g.judgement?.passed ? '🏆' : '💥'}</div>
                <h2 className={g.judgement?.passed ? 'pass' : 'fail'}>{g.judgement?.passed ? 'Passed!' : 'Not this time'}</h2>
                <div className="sub">{(g.judgement?.reasons ?? [g.over.reason]).join(' ')}</div>
              </>
            ) : (
              <>
                <div className="bigbadge">{g.over.result === 'win' ? '🏆' : g.over.result === 'draw' ? '🤝' : '📘'}</div>
                <h2>{g.over.result === 'win' ? 'You won!' : g.over.result === 'draw' ? 'Draw' : 'Game over'}</h2>
                <div className="sub">{g.over.reason}</div>
              </>
            )}
            <div className="statgrid">
              <div className="stat"><b>{g.stats.blunders}</b><span>Blunders</span></div>
              <div className="stat"><b>{g.stats.mistakes}</b><span>Mistakes</span></div>
              <div className="stat"><b>{g.stats.hangs}</b><span>Pieces hung</span></div>
              <div className="stat"><b>{g.stats.missedFree}/{g.stats.offeredFree}</b><span>Free pieces missed</span></div>
              <div className="stat"><b>{g.stats.quizTotal ? `${g.stats.quizCorrect}/${g.stats.quizTotal}` : '–'}</b><span>Safety counts right</span></div>
              <div className="stat"><b>{g.stats.userMoves}</b><span>Your moves</span></div>
            </div>
            {!config.attempt && g.moments.current.length > 0 && (
              <div className="card" style={{ background: 'var(--panel-2)' }}>
                <h3>Key moments</h3>
                {g.moments.current.slice().sort((a, b) => b.loss - a.loss).slice(0, 3).map(m => (
                  <p key={m.ply} className="small" style={{ marginBottom: 6 }}>
                    Move {Math.ceil(m.ply / 2)}: <b>{m.san}</b> ({m.grade}). Better: <b>{m.bestSan}</b>, which {m.bestWhy}.
                  </p>
                ))}
                <p className="muted small">These are saved as puzzles in your review queue so you can replay them tomorrow.</p>
              </div>
            )}
            {!config.attempt && summary.xp.length > 0 && (
              <div className="small muted">{summary.xp.map(l => `${l.label} +${l.n}`).join(' · ')} — <b style={{ color: '#fff' }}>+{summary.total} XP</b></div>
            )}
            <div className="row" style={{ justifyContent: 'center' }}>
              {config.attempt ? (
                <>
                  {g.judgement?.passed ? <button className="btn" onClick={() => onDone?.({ judgement: g.judgement, over: g.over!, stats: g.stats })}>Continue</button>
                    : <><button className="btn" onClick={onAgain}>Try again</button><button className="btn ghost" onClick={() => onDone?.({ judgement: g.judgement, over: g.over!, stats: g.stats })}>Back</button></>}
                </>
              ) : (
                <>
                  <button className="btn" onClick={onAgain}>Play again</button>
                  {summary.mistakes > 0 && onReview && <button className="btn ghost" onClick={onReview}>Review mistakes</button>}
                  <button className="btn ghost" onClick={onExit}>Home</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// avoid unused import warning when VALUE is only used for types in some builds
void VALUE
