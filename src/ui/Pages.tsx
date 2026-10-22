import { useRef, useState } from 'react'
import { dueReviews, getState, resetAll, setSetting, update, useProgress, type State } from '../store/progress'

export function ReviewPage({ onStart }: { onStart: () => void }) {
  const s = useProgress()
  const due = dueReviews(s)
  const queued = Object.values(s.review)
  const next = queued.filter(r => r.due > due[0]?.due).map(r => r.due).sort()[0]
  return (
    <div className="setup">
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Review</h1>
      <div className="card">
        <h2>{due.length} due now</h2>
        <p className="muted">Puzzles you missed come back after 1 day, then 3, 7, 16 and 35 days. That spacing is what moves a pattern from "I recognise it" to "I see it instantly". Mistakes from your own games land here too.</p>
        <p className="muted small" style={{ marginTop: 8 }}>{queued.length} in the queue{next ? ` · next one due ${next}` : ''}</p>
      </div>
      <button className="btn big" disabled={due.length === 0} onClick={onStart}>{due.length ? 'Start review' : 'Nothing due 🎉'}</button>
    </div>
  )
}

export function SettingsPage() {
  const s = useProgress()
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const exportData = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chesscoach-progress.json'; a.click()
  }
  const importData = (raw: string) => {
    try {
      const d = JSON.parse(raw) as State
      if (d.v !== 1 || typeof d.xp !== 'number') throw new Error('bad')
      update(x => { Object.assign(x, d) }); setMsg('Progress imported.')
    } catch { setMsg('That file is not a valid progress export.') }
  }
  return (
    <div className="setup">
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Settings</h1>
      <div className="card">
        <h2>You</h2>
        <input value={s.settings.name} onChange={e => setSetting('name', e.target.value.slice(0, 24))} placeholder="Your name (optional)" style={{ background: '#1a1917', border: '1px solid #3a3835', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 16, width: '100%' }} />
        <h2 style={{ marginTop: 16 }}>Sound</h2>
        <div className="seg">{[true, false].map(v => <button key={String(v)} className={s.settings.sound === v ? 'on' : ''} onClick={() => setSetting('sound', v)}>{v ? 'On' : 'Off'}</button>)}</div>
        <h2 style={{ marginTop: 16 }}>Safety help in games</h2>
        <div className="seg">{(['quiz', 'warn', 'off'] as const).map(a => <button key={a} className={s.settings.assist === a ? 'on' : ''} onClick={() => setSetting('assist', a)}>{a === 'quiz' ? 'Quiz' : a === 'warn' ? 'Warn' : 'Off'}</button>)}</div>
      </div>
      <div className="card">
        <h2>Your data</h2>
        <p className="muted small">Progress is saved in this browser only (Google sign-in to sync across devices is planned). Export a backup any time.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small ghost" onClick={exportData}>Export progress</button>
          <button className="btn small ghost" onClick={() => file.current?.click()}>Import file</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(importData) }} />
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="…or paste exported JSON here" rows={3} style={{ marginTop: 10, width: '100%', background: '#1a1917', border: '1px solid #3a3835', borderRadius: 8, color: '#fff', padding: 10 }} />
        {text && <button className="btn small" style={{ marginTop: 8 }} onClick={() => importData(text)}>Import pasted data</button>}
        {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
        <button className="btn small red" onClick={() => { if (confirm('Erase all progress on this device?')) resetAll() }}>Reset everything</button>
      </div>
      <p className="muted small">Chess Coach is open source (GPL-3.0). Board by Lichess (chessground), engine: Stockfish.</p>
    </div>
  )
}
