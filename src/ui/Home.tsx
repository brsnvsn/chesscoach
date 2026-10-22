import { useState } from 'react'
import { LEVELS, levelDef, type LevelDef } from '../data/levels'
import { LESSONS } from '../data/lessons'
import {
  useProgress, visibleStreak, todayRecord, dueReviews, DAILY_XP_GOAL, DAILY_REVIEW_GOAL, blundersPerGame, type State,
} from '../store/progress'
import { puzzleCount } from '../data/puzzles'

export type Nav =
  | { v: 'home' } | { v: 'play' } | { v: 'review' } | { v: 'settings' }
  | { v: 'warmup' } | { v: 'lesson'; level: number; idx: number }
  | { v: 'drill'; level: number } | { v: 'boss'; level: number }

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="muted small">Play a few games to see your trend.</div>
  const w = 300, h = 64, max = Math.max(3, ...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 8) + 4},${h - 6 - (v / max) * (h - 14)}`).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Blunders per game over time">
      <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => <circle key={i} cx={(i / (values.length - 1)) * (w - 8) + 4} cy={h - 6 - (v / max) * (h - 14)} r="3" fill="var(--green-hi)" />)}
    </svg>
  )
}

function LevelCard({ L, s, go }: { L: LevelDef; s: State; go: (n: Nav) => void }) {
  const locked = L.n > s.level
  const passed = s.bossesPassed.includes(L.n)
  const cur = L.n === s.level
  const [open, setOpen] = useState(cur)
  const lessons = LESSONS[L.n] ?? []
  const done = lessons.filter(l => s.lessonsDone[l.id]).length
  const nextIdx = lessons.findIndex(l => !s.lessonsDone[l.id])
  return (
    <div className={`lvl ${locked ? 'locked' : ''} ${cur ? 'cur' : ''}`}>
      <div className="badge" style={{ background: passed ? 'var(--green-dark)' : undefined }}>{passed ? '✓' : L.glyph}<small>{L.n}</small></div>
      <div>
        <h3>{L.rank}: {L.name}</h3>
        <p>{L.skill}{!locked && lessons.length ? ` · ${done}/${lessons.length} lessons` : ''}</p>
      </div>
      {locked ? <span className="chip dim">🔒 Beat level {L.n - 1}</span> : <button className="btn small ghost" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : cur ? 'Open' : 'Review'}</button>}
      {open && !locked && (
        <div className="lvl-detail">
          <div className="muted small">{L.why}</div>
          {lessons.map((l, i) => (
            <div key={l.id} className="step-row">
              <span className="ok">{s.lessonsDone[l.id] ? '✓' : ''}</span>
              <span style={{ flex: 1 }}>{l.title} <span className="muted small">· {l.minutes} min</span></span>
              <button className={`btn small ${i === nextIdx ? '' : 'ghost'}`} onClick={() => go({ v: 'lesson', level: L.n, idx: i })}>{s.lessonsDone[l.id] ? 'Redo' : 'Start'}</button>
            </div>
          ))}
          <div className="step-row">
            <span className="ok" />
            <span style={{ flex: 1 }}>Practice drill <span className="muted small">· 8 questions</span></span>
            <button className="btn small ghost" onClick={() => go({ v: 'drill', level: L.n })}>Practise</button>
          </div>
          <div className="step-row">
            <span className="ok">{passed ? '✓' : ''}</span>
            <span style={{ flex: 1 }}><b>Boss: {L.bossName}</b><br /><span className="muted small">{L.boss.blurb}</span></span>
            <button className={`btn small ${nextIdx === -1 && !passed ? '' : 'red'}`} onClick={() => go({ v: 'boss', level: L.n })}>{passed ? 'Rematch' : 'Fight'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Home({ go }: { go: (n: Nav) => void }) {
  const s = useProgress()
  const st = visibleStreak(s)
  const today = todayRecord(s)
  const due = dueReviews(s).length
  const L = levelDef(s.level > 10 ? 10 : s.level)
  const lessons = LESSONS[L.n] ?? []
  const nextLesson = lessons.findIndex(l => !s.lessonsDone[l.id])
  const trainLabel = nextLesson >= 0 ? `Lesson: ${lessons[nextLesson].title}` : `Drill: ${L.skill}`
  const xpPct = Math.min(100, Math.round((today.xp / DAILY_XP_GOAL) * 100))
  const trend = blundersPerGame(s).slice(-20)
  const themes = Object.entries(s.themeStats).filter(([k]) => !['ownGame'].includes(k) && s.themeStats[k].solved + s.themeStats[k].failed >= 3)
    .sort((a, b) => (a[1].solved / (a[1].solved + a[1].failed)) - (b[1].solved / (b[1].solved + b[1].failed))).slice(0, 5)
  const nice: Record<string, string> = { hangingPiece: 'Free pieces', fork: 'Forks', pin: 'Pins', skewer: 'Skewers', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', backRankMate: 'Back-rank mates', discoveredAttack: 'Discovered attacks', doubleCheck: 'Double checks', count: 'Counting attackers', trade: 'Trades', principle: 'Opening principles' }
  void puzzleCount

  return (
    <div className="wrap">
      <div className="topline">
        <h1>{s.settings.name ? `Hey ${s.settings.name}` : 'Your chess coach'}</h1>
        <span className="spacer" />
        <span className="chip fire" title={st.atRisk && !st.doneToday ? 'Finish today\'s warm-up and training to keep it' : ''}>🔥 {st.count} <span className="dim">day{st.count === 1 ? '' : 's'}</span></span>
        <span className="chip">⭐ {s.xp} <span className="dim">XP</span></span>
        <span className="chip">{L.glyph} {s.level > 10 ? 'Grandmaster of this app' : `Level ${L.n} · ${L.rank}`}</span>
      </div>
      <div className="grid2">
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Today</h2><span className="spacer" />
              <span className="muted small">{today.xp}/{DAILY_XP_GOAL} XP</span>
            </div>
            <div className="bar" style={{ marginBottom: 14 }}><i style={{ width: `${xpPct}%` }} /></div>
            <div className="today">
              <div className={`task ${today.reviewDone ? 'done' : ''}`}>
                <div className="tick">{today.reviewDone ? '✓' : ''}</div>
                <div className="t"><b>Warm-up</b><span>{due > 0 ? `${due} puzzle${due === 1 ? '' : 's'} due for review` : 'A few quick puzzles from what you have learnt'} · {Math.min(today.review, DAILY_REVIEW_GOAL)}/{DAILY_REVIEW_GOAL}</span></div>
                <button className="btn small" onClick={() => go({ v: 'warmup' })}>{today.reviewDone ? 'More' : 'Start'}</button>
              </div>
              <div className={`task ${today.trainDone ? 'done' : ''}`}>
                <div className="tick">{today.trainDone ? '✓' : ''}</div>
                <div className="t"><b>Train</b><span>{trainLabel}</span></div>
                <button className="btn small" onClick={() => go(nextLesson >= 0 ? { v: 'lesson', level: L.n, idx: nextLesson } : { v: 'drill', level: L.n })}>{today.trainDone ? 'More' : 'Start'}</button>
              </div>
              <div className={`task ${today.playDone ? 'done' : ''}`}>
                <div className="tick">{today.playDone ? '✓' : ''}</div>
                <div className="t"><b>Play</b><span>One game with the coach beside you (bonus XP)</span></div>
                <button className="btn small" onClick={() => go({ v: 'play' })}>{today.playDone ? 'Again' : 'Play'}</button>
              </div>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              {today.complete ? '✅ Day complete. Your streak is safe.' : 'Warm-up + Train keeps your streak (about 5–8 minutes). Playing is the bonus.'}
              {' '}{st.freezes > 0 ? '❄ 1 streak freeze available this week.' : ''}
            </p>
          </div>
          <div className="card">
            <h2>Your progress</h2>
            <div className="statgrid" style={{ marginBottom: 12 }}>
              <div className="stat"><b>{s.games.length}</b><span>Games</span></div>
              <div className="stat"><b>{s.games.length ? (s.games.reduce((a, g) => a + g.hangs, 0) / s.games.length).toFixed(1) : '–'}</b><span>Pieces hung / game</span></div>
              <div className="stat"><b>{s.games.length ? (s.games.reduce((a, g) => a + g.blunders, 0) / s.games.length).toFixed(1) : '–'}</b><span>Blunders / game</span></div>
            </div>
            <h3>Mistakes per game (lower is better)</h3>
            <Spark values={trend} />
            {themes.length > 0 && (<>
              <h3 style={{ marginTop: 14 }}>Needs the most practice</h3>
              {themes.map(([k, v]) => { const pct = Math.round(100 * v.solved / (v.solved + v.failed)); return (
                <div key={k} className="step-row" style={{ marginBottom: 6 }}><span style={{ width: 150 }} className="small">{nice[k] ?? k}</span><div className="bar" style={{ flex: 1, height: 8 }}><i style={{ width: `${pct}%` }} /></div><span className="small muted" style={{ width: 38, textAlign: 'right' }}>{pct}%</span></div>
              ) })}
            </>)}
          </div>
        </div>
        <div className="path">
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Your path</h2>
          {LEVELS.map(l => <LevelCard key={l.n} L={l} s={s} go={go} />)}
        </div>
      </div>
    </div>
  )
}
