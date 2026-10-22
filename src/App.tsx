import { useEffect, useRef, useState } from 'react'
import { Home, type Nav } from './ui/Home'
import { Game, PlaySetup, makeJudge, makeScenarioJudge, type GameConfig, type DoneInfo } from './ui/Play'
import { PuzzleRunner, type RunSummary } from './ui/PuzzleRunner'
import { LessonRunner } from './ui/LessonRunner'
import { ReviewPage, SettingsPage } from './ui/Pages'
import { LEVELS, SCENARIOS, levelDef, type DrillSpec } from './data/levels'
import { LESSONS } from './data/lessons'
import { loadExtraPuzzles } from './data/puzzles'
import { setForSpec, warmupSet, reviewSet } from './ui/drillFactory'
import { passBoss, useProgress, bump, addXp, getState } from './store/progress'
import { sfx } from './ui/sfx'
import type { Puzzle } from './data/types'

type View =
  | Nav
  | { v: 'game'; cfg: GameConfig; key: number }
  | { v: 'scenario'; id: string; level: number; boss: boolean; stage: number; key: number }
  | { v: 'mistakes'; puzzles: Puzzle[]; key: number }

/** Debug/share link: ?fen=<FEN>&bot=1&color=w&assist=quiz starts a game from any position. */
function initialView(): View {
  try {
    const q = new URLSearchParams(location.search)
    const fen = q.get('fen')
    if (fen) {
      const assist = (['quiz', 'warn', 'off'].includes(q.get('assist') ?? '') ? q.get('assist') : 'quiz') as 'quiz' | 'warn' | 'off'
      return { v: 'game', key: Date.now(), cfg: { botLevel: Math.max(1, Math.min(6, +(q.get('bot') ?? 1))), color: q.get('color') === 'b' ? 'b' : 'w', assist, startFen: fen, title: 'Custom position' } }
    }
  } catch { /* ignore bad params */ }
  return { v: 'home' }
}

const NAV = [
  { k: 'home', ico: '🏠', label: 'Learn' },
  { k: 'play', ico: '♟', label: 'Play' },
  { k: 'review', ico: '🔁', label: 'Review' },
  { k: 'settings', ico: '⚙', label: 'Settings' },
] as const

export default function App() {
  const s = useProgress()
  const [view, setView] = useState<View>(initialView)
  const [key, setKey] = useState(0)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  useEffect(() => { void loadExtraPuzzles() }, [])
  const pendingUp = useRef<number | null>(null)
  /** back to the path; a level-up celebration waits until the result screen has been dismissed */
  const home = () => { setView({ v: 'home' }); if (pendingUp.current !== null) { setLevelUp(pendingUp.current); pendingUp.current = null } }
  const go = (n: Nav) => { setKey(k => k + 1); setView(n) }
  const active = view.v === 'home' || view.v === 'lesson' || view.v === 'drill' || view.v === 'boss' || view.v === 'warmup' ? 'home' : view.v === 'game' || view.v === 'scenario' || view.v === 'mistakes' ? 'play' : view.v

  const bossPassed = (level: number, defer = false) => {
    const first = !getState().bossesPassed.includes(level)
    passBoss(level)
    if (!first) return // a rematch pays no XP and shows no level-up
    sfx.levelUp()
    if (defer) pendingUp.current = level; else setLevelUp(level)
  }

  let body: React.ReactNode = null
  if (view.v === 'home') body = <Home go={go} />
  else if (view.v === 'play') body = <PlaySetup onStart={cfg => setView({ v: 'game', cfg, key: Date.now() })} />
  else if (view.v === 'game') body = <Game key={view.key} config={view.cfg} onExit={home} onAgain={() => setView({ v: 'game', cfg: { ...view.cfg, color: view.cfg.color }, key: Date.now() })} onReview={puzzles => setView({ v: 'mistakes', puzzles, key: Date.now() })} onDone={() => home()} />
  else if (view.v === 'review') body = <ReviewPage onStart={() => setView({ v: 'drill', level: -1 })} />
  else if (view.v === 'settings') body = <SettingsPage />
  else if (view.v === 'mistakes') body = <PuzzleRunner key={view.key} title="Your mistakes" mode="review" count={view.puzzles.length} getItem={i => ({ t: 'move', puzzle: view.puzzles[i] })} onExit={home} />
  else if (view.v === 'warmup') {
    const set = warmupSet(Math.min(s.level, 10))
    body = <PuzzleRunner key={key} title="Warm-up" mode="warmup" count={set.count} getItem={set.getItem} onExit={home} onAgain={() => go({ v: 'warmup' })} />
  } else if (view.v === 'lesson') {
    const lessons = LESSONS[view.level] ?? []
    const L = levelDef(view.level)
    const lesson = lessons[view.idx]
    body = lesson
      ? <LessonRunner key={lesson.id} lesson={lesson} levelName={`${L.rank}: ${L.name}`} hasNext={view.idx + 1 < lessons.length} onExit={home} onNext={() => go({ v: 'lesson', level: view.level, idx: view.idx + 1 })} />
      : <Home go={go} />
  } else if (view.v === 'drill') {
    if (view.level === -1) {
      const set = reviewSet()
      body = <PuzzleRunner key={key} title="Review" mode="review" count={set.count} getItem={set.getItem} onExit={home} />
    } else {
      const L = levelDef(view.level)
      if (L.drill.kind === 'scenario') body = <ScenarioPicker ids={L.drill.ids} onPick={id => setView({ v: 'scenario', id, level: view.level, boss: false, stage: 0, key: Date.now() })} onBack={home} />
      else {
        const set = setForSpec(L.drill, 8)
        body = <PuzzleRunner key={key} title={`${L.rank} drill`} mode="drill" count={set.count} getItem={set.getItem} onExit={home} onAgain={() => go({ v: 'drill', level: view.level })} />
      }
    }
  } else if (view.v === 'boss') {
    const L = levelDef(view.level)
    const b = L.boss
    if (b.type === 'puzzles') {
      const set = setForSpec(b.drill as DrillSpec, b.count)
      body = <PuzzleRunner key={key} title={`Boss: ${L.bossName}`} mode="boss" count={set.count} getItem={set.getItem} need={Math.min(b.need, set.count)} seconds={b.seconds} blurb={b.blurb}
        onComplete={(r: RunSummary) => { if (r.passed) bossPassed(L.n, true) }} onExit={home} onAgain={() => go({ v: 'boss', level: view.level })} passLabel={`${L.bossName} defeated.`} />
    } else if (b.type === 'game') {
      const cfg: GameConfig = { botLevel: b.bot, color: b.color ?? 'w', assist: s.settings.assist, title: `Boss: ${L.bossName}`, hint: b.blurb, judge: makeJudge(b.rules), attempt: true }
      body = <Game key={key} config={cfg} onExit={home} onAgain={() => go({ v: 'boss', level: view.level })} onDone={(d: DoneInfo) => { if (d.judgement?.passed) bossPassed(L.n); home() }} />
    } else {
      body = <ScenarioPicker ids={b.ids} boss onPick={() => undefined} onBack={home} auto={() => setView({ v: 'scenario', id: b.ids[0], level: L.n, boss: true, stage: 0, key: Date.now() })} />
    }
  } else if (view.v === 'scenario') {
    const sc = SCENARIOS[view.id]
    const L = levelDef(view.level)
    const ids = L.boss.type === 'scenario' ? L.boss.ids : []
    const cfg: GameConfig = { botLevel: sc.bot, color: 'w', assist: 'off', startFen: sc.fen, title: sc.title, hint: `${sc.hint} Limit: ${sc.maxMoves} moves.`, judge: makeScenarioJudge(sc.maxMoves), stalemateGuard: true, lockAssist: true, attempt: true }
    body = <Game key={view.key} config={cfg} onExit={home} onAgain={() => setView({ ...view, key: Date.now() })}
      onDone={(d: DoneInfo) => {
        if (!d.judgement?.passed) return home()
        if (view.boss) {
          if (view.stage + 1 < ids.length) setView({ v: 'scenario', id: ids[view.stage + 1], level: view.level, boss: true, stage: view.stage + 1, key: Date.now() })
          else { bossPassed(view.level); home() }
        } else { addXp(40); bump('train', 8); home() }
      }} />
  }

  return (
    <div className="app">
      <nav className="side">
        <div className="brand"><span className="logo">♞</span> Chess Coach</div>
        {NAV.map(n => <button key={n.k} className={`nav ${active === n.k ? 'on' : ''}`} onClick={() => go({ v: n.k } as Nav)}><span className="ico">{n.ico}</span>{n.label}</button>)}
        <div className="side-foot">Level {Math.min(s.level, 10)} · {s.xp} XP</div>
      </nav>
      <main className="main">{body}</main>
      {levelUp !== null && (
        <div className="modal-bg">
          <div className="modal">
            <div className="bigbadge flash">{levelDef(levelUp).glyph}</div>
            <h2 className="pass">Level {levelUp} cleared!</h2>
            <div className="sub">{levelUp < 10 ? <>You are now a <b style={{ color: '#fff' }}>{LEVELS[levelUp].rank}</b>. Next up: {LEVELS[levelUp].skill}.</> : 'You have cleared every level. You are a Master of this app. Keep playing and keep counting.'}</div>
            <div className="small muted" style={{ textAlign: 'center' }}>+150 XP</div>
            <button className="btn" onClick={() => setLevelUp(null)}>Continue</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ScenarioPicker({ ids, onPick, onBack, boss, auto }: { ids: string[]; onPick: (id: string) => void; onBack: () => void; boss?: boolean; auto?: () => void }) {
  return (
    <div className="setup">
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>{boss ? 'Boss: checkmate!' : 'Finish the game'}</h1>
      {ids.map(id => { const sc = SCENARIOS[id]; return (
        <div key={id} className="card">
          <h2>{sc.title}</h2>
          <p className="muted">{sc.hint}</p>
          <p className="muted small">Checkmate within {sc.maxMoves} moves. Beware of stalemate.</p>
          {!boss && <button className="btn small" style={{ marginTop: 10 }} onClick={() => onPick(id)}>Play this</button>}
        </div>
      ) })}
      {boss && <button className="btn big" onClick={auto}>Start the boss fight</button>}
      <button className="link" onClick={onBack}>Back</button>
    </div>
  )
}
