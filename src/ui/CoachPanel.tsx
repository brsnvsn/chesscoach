import { useEffect, useRef, useState } from 'react'
import { NAME } from '../chess/analysis'
import { GRADE_ICON } from '../chess/explain'
import type { Assist } from '../store/progress'
import { Md } from './Md'
import type { MoveEntry, Pending } from './useGame'
import type { CoachMsg } from '../chess/explain'

interface Props {
  messages: CoachMsg[]
  moves: MoveEntry[]
  pending: Pending | null
  thinking: boolean
  disabled: boolean
  assist: Assist
  engineMissing: boolean
  onAssist?: (a: Assist) => void
  onHover: (m: CoachMsg | null) => void
  onAnswer: (n: number) => void
  onConfirm: () => void
  onTakeBack: () => void
  onScan: () => void
  onResign: () => void
  /** extra controls (e.g. hint) */
  footer?: React.ReactNode
}

function QuizCard({ p, onAnswer, onConfirm, onTakeBack }: { p: Pending; onAnswer: (n: number) => void; onConfirm: () => void; onTakeBack: () => void }) {
  const s = p.safety
  const piece = NAME[s.move.piece]
  const A = s.destAttackers.length, D = s.destDefenders.length
  const unsafe = s.losesMaterial || s.allowsMate.length > 0
  if (p.mode === 'quiz' && p.step === 'q1') return (
    <div className="qcard">
      <h3>Safety check: you moved your {piece} to <b>{p.to}</b>.</h3>
      <div>How many <b>enemy</b> pieces attack {p.to}?</div>
      <div className="nums">{[0, 1, 2, 3, 4].map(n => <button key={n} onClick={() => onAnswer(n)}>{n}</button>)}</div>
      <div className="muted small">Take a second and look at every enemy piece. Take-back is free.</div>
    </div>
  )
  if (p.mode === 'quiz' && p.step === 'q2') return (
    <div className="qcard">
      <h3>And how many of <b>your</b> pieces defend {p.to}?</h3>
      <div className="muted small">(Pieces that could recapture there, not counting the one that just moved.)</div>
      <div className="nums">{[0, 1, 2, 3, 4].map(n => <button key={n} onClick={() => onAnswer(n)}>{n}</button>)}</div>
    </div>
  )
  const why = s.allowsMate.length ? `This lets them play ${s.allowsMate[0].san} — checkmate.`
    : s.movedPiece && s.losesMaterial ? `Your ${piece} can be won: ${A} attacker${A === 1 ? '' : 's'} against ${D} defender${D === 1 ? '' : 's'}.`
    : s.newlyHanging.length ? `It leaves your ${NAME[s.newlyHanging[0].piece]} on ${s.newlyHanging[0].square} hanging.`
    : s.ignored.length ? `Your ${NAME[s.ignored[0].piece]} on ${s.ignored[0].square} is still under attack.`
    : 'Nothing can be won by force on that square.'
  const title = p.mode === 'stalemate' ? 'That is stalemate!' : unsafe ? (p.mode === 'warn' ? 'Wait!' : 'Not safe') : 'Safe'
  const tone = p.mode === 'stalemate' ? 'bad' : unsafe ? 'bad' : 'good'
  return (
    <div className={`qcard ${tone}`}>
      <h3>{unsafe || p.mode === 'stalemate' ? '⚠ ' : '✓ '}{title}</h3>
      {p.mode === 'quiz' && (
        <div className="row small">
          <span>Attackers: <b>{A}</b> {p.a1 === A ? '✓' : `✗ (you said ${p.a1})`}</span>
          <span>Defenders: <b>{D}</b> {p.a2 === D ? '✓' : `✗ (you said ${p.a2})`}</span>
        </div>
      )}
      <div>{p.mode === 'stalemate' ? 'The opponent would have no legal move and no check — a draw. Play something else.' : why}</div>
      {(unsafe || p.mode === 'stalemate') ? (
        <div className="row">
          <button className="btn small" onClick={onTakeBack}>Take it back</button>
          {p.mode !== 'stalemate' && <button className="btn small ghost" onClick={onConfirm}>Play it anyway</button>}
        </div>
      ) : <div className="muted small">Playing it…</div>}
    </div>
  )
}

export function CoachPanel(p: Props) {
  const [tab, setTab] = useState<'coach' | 'moves'>('coach')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [p.messages.length, p.pending?.step])

  const rows: { n: number; w?: MoveEntry; b?: MoveEntry }[] = []
  p.moves.forEach((m, i) => { if (m.color === 'w') rows.push({ n: rows.length + 1, w: m }); else if (rows.length && !rows[rows.length - 1].b && rows[rows.length - 1].w) rows[rows.length - 1].b = m; else rows.push({ n: rows.length + 1, b: m }); void i })

  return (
    <div className="panel">
      <div className="tabs">
        <button className={tab === 'coach' ? 'on' : ''} onClick={() => setTab('coach')}>Coach</button>
        <button className={tab === 'moves' ? 'on' : ''} onClick={() => setTab('moves')}>Moves</button>
      </div>
      {tab === 'coach' ? (
        <div className="chat">
          {p.messages.map(m => (
            <div key={m.id} className={`msg ${m.who} ${m.tone ?? ''} ${m.shapes?.length ? 'clickable' : ''}`}
              onMouseEnter={() => m.shapes?.length && p.onHover(m)} onMouseLeave={() => p.onHover(null)} onClick={() => m.shapes?.length && p.onHover(m)}>
              {m.title && <div className="ttl">{m.title}</div>}
              <div className="txt"><Md text={m.text} /></div>
            </div>
          ))}
          <div ref={end} />
        </div>
      ) : (
        <div className="moves">
          {rows.map(r => (
            <div key={r.n} style={{ display: 'contents' }}>
              <span className="n">{r.n}.</span>
              <span className="m">{r.w?.san}{r.w?.grade && ['inaccuracy', 'mistake', 'blunder'].includes(r.w.grade) && <i className={`gr ${r.w.grade}`}>{GRADE_ICON[r.w.grade]}</i>}</span>
              <span className="m">{r.b?.san}{r.b?.grade && ['inaccuracy', 'mistake', 'blunder'].includes(r.b.grade) && <i className={`gr ${r.b.grade}`}>{GRADE_ICON[r.b.grade]}</i>}</span>
            </div>
          ))}
        </div>
      )}
      {p.pending && <QuizCard p={p.pending} onAnswer={p.onAnswer} onConfirm={p.onConfirm} onTakeBack={p.onTakeBack} />}
      <div className="think">{p.thinking ? 'Opponent is thinking…' : p.engineMissing ? 'Engine could not load: the bot plays randomly and moves are not graded.' : ''}</div>
      <div className="panel-foot">
        <div className="row">
          <button className="btn small ghost" disabled={p.disabled || !!p.pending} onClick={p.onScan} title="List the checks, captures and threats">🔍 Scan (C-C-T)</button>
          {p.footer}
          <span className="spacer" />
          <button className="link" onClick={p.onResign}>Resign</button>
        </div>
        {p.onAssist && (
          <div className="row small">
            <span className="muted">Safety help:</span>
            <div className="seg">
              {(['quiz', 'warn', 'off'] as const).map(a => <button key={a} className={p.assist === a ? 'on' : ''} onClick={() => p.onAssist!(a)}>{a === 'quiz' ? 'Quiz' : a === 'warn' ? 'Warn' : 'Off'}</button>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
