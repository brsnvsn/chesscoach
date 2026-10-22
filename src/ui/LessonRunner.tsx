import { useMemo, useState } from 'react'
import type { Square } from 'chess.js'
import { Board } from './Board'
import { Md } from './Md'
import type { Lesson } from '../data/lessons'
import { completeLesson } from '../store/progress'
import { sfx } from './sfx'

interface Props { lesson: Lesson; levelName: string; hasNext: boolean; onExit: () => void; onNext?: () => void }

export function LessonRunner({ lesson, levelName, hasNext, onExit, onNext }: Props) {
  const [i, setI] = useState(0)
  const [wrong, setWrong] = useState<number[]>([])
  const [right, setRight] = useState<number | null>(null)
  const [marks, setMarks] = useState<Record<string, 'sel' | 'good' | 'bad'>>({})
  const [finished, setFinished] = useState<null | { dayDone: boolean }>(null)
  const step = lesson.steps[i]
  const last = i === lesson.steps.length - 1
  const board = step.type === 'read' ? step.board : step.board
  const answered = step.type === 'read' || (step.type === 'choose' && right === step.answer) || (step.type === 'tap' && Object.values(marks).includes('good'))

  const go = () => {
    if (last) { setFinished({ dayDone: completeLesson(lesson.id) }); sfx.levelUp(); return }
    setI(i + 1); setWrong([]); setRight(null); setMarks({})
  }

  const onTap = (sq: Square) => {
    if (step.type !== 'tap' || answered) return
    if (step.answers.includes(sq)) { setMarks({ [sq]: 'good' }); sfx.good() } else { setMarks({ [sq]: 'bad' }); sfx.bad() }
  }
  const circles = useMemo(() => (board?.highlight ?? []).map(sq => ({ sq, brush: 'yellow' as const })), [board])
  const title = step.type === 'read' ? step.title : step.type === 'choose' ? 'Your turn' : 'Tap the square'

  return (
    <div className="game">
      <div className="board-col">
        {board ? (
          <Board fen={board.fen} orientation={board.orientation ?? (board.fen.split(' ')[1] === 'b' && step.type !== 'read' ? 'black' : 'white')} movable={null}
            shapes={step.type === 'tap' && !answered ? (board.shapes ?? []) : (board.shapes ?? [])} circles={circles}
            onTap={step.type === 'tap' ? onTap : undefined} tapMarks={marks} />
        ) : (
          <div className="card" style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div><div style={{ fontSize: 72 }}>♞</div><div className="muted">{levelName}</div></div>
          </div>
        )}
      </div>
      <div className="panel" style={{ height: 'auto', minHeight: 420 }}>
        <div className="lp">
          <div>
            <div className="row"><b>{lesson.title}</b><span className="spacer" /><span className="chip dim">~{lesson.minutes} min</span></div>
            <div className="dots" style={{ marginTop: 8 }}>{lesson.steps.map((_, k) => <i key={k} className={k < i ? 'on' : k === i ? 'cur' : ''} />)}</div>
          </div>
          <h2>{title}</h2>
          {step.type === 'read' && <div className="body"><Md text={step.body} /></div>}
          {step.type === 'choose' && (
            <>
              <div className="body">{step.prompt}</div>
              <div className="opts">
                {step.options.map((o, k) => (
                  <button key={k} className={`opt ${right === k ? (k === step.answer ? 'ok' : 'no') : wrong.includes(k) ? 'no' : ''}`} disabled={right === step.answer || wrong.includes(k)}
                    onClick={() => { if (k === step.answer) { setRight(k); sfx.good() } else { setWrong(w => [...w, k]); sfx.bad() } }}>{o}</button>
                ))}
              </div>
              {wrong.length > 0 && right !== step.answer && <div className="feedback bad">Not quite. Have another look.</div>}
              {right === step.answer && <div className="feedback good"><Md text={step.explain} /></div>}
            </>
          )}
          {step.type === 'tap' && (
            <>
              <div className="body">{step.prompt}</div>
              {Object.values(marks).includes('bad') && !answered && <div className="feedback bad">Not that square. Try again.</div>}
              {answered && <div className="feedback good"><Md text={step.explain} /></div>}
            </>
          )}
          <div className="spacer" />
          <div className="row">
            <button className="btn" disabled={!answered} onClick={go}>{last ? 'Finish lesson' : 'Continue'}</button>
            <button className="link" onClick={onExit}>Exit</button>
          </div>
        </div>
      </div>
      {finished && (
        <div className="modal-bg">
          <div className="modal">
            <div className="bigbadge">📘</div>
            <h2>Lesson complete</h2>
            <div className="sub">+20 XP{finished.dayDone ? ' · Daily goal reached, streak extended!' : ''}</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              {hasNext && <button className="btn" onClick={onNext}>Next lesson</button>}
              <button className={`btn ${hasNext ? 'ghost' : ''}`} onClick={onExit}>Back to path</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
