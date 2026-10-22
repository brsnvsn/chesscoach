import { useEffect, useMemo, useRef } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import 'chessground/assets/chessground.base.css'
import '../assets/pieces/maestro/maestro.css'
import type { Shape } from '../chess/explain'

export interface BoardProps {
  fen: string
  orientation?: 'white' | 'black'
  /** which side the player may move: 'w' | 'b' | 'both' | null (view only) */
  movable?: 'w' | 'b' | 'both' | null
  lastMove?: [Square, Square] | null
  shapes?: Shape[]
  /** circles drawn on squares (e.g. the piece you are asked about) */
  circles?: { sq: Square; brush?: Shape['brush'] }[]
  onMove?: (from: Square, to: Square) => void
  /** bump to force the board to re-sync to `fen` (e.g. after taking a move back) */
  syncKey?: number
  /** tap mode: clicking a square calls this instead of moving pieces */
  onTap?: (sq: Square) => void
  tapMarks?: Record<string, 'sel' | 'good' | 'bad'>
}

const toKeys = (shapes: Shape[] = [], circles: BoardProps['circles'] = []): DrawShape[] => [
  ...shapes.map(s => ({ orig: s.orig as Key, dest: s.dest as Key | undefined, brush: s.brush })),
  ...circles.map(c => ({ orig: c.sq as Key, brush: c.brush ?? 'yellow' })),
]

function destsFor(fen: string): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>()
  try {
    for (const m of new Chess(fen).moves({ verbose: true })) {
      const list = dests.get(m.from as Key) ?? []
      list.push(m.to as Key)
      dests.set(m.from as Key, list)
    }
  } catch { /* invalid fen: no moves */ }
  return dests
}

export function Board(p: BoardProps) {
  const host = useRef<HTMLDivElement>(null)
  const cg = useRef<Api | null>(null)
  const onMoveRef = useRef(p.onMove)
  onMoveRef.current = p.onMove

  const turn = useMemo(() => (p.fen.split(' ')[1] === 'b' ? 'black' : 'white') as 'white' | 'black', [p.fen])
  const mover = p.movable === 'w' ? 'white' : p.movable === 'b' ? 'black' : p.movable === 'both' ? 'both' : undefined
  const dests = useMemo(() => (mover && !p.onTap ? destsFor(p.fen) : new Map<Key, Key[]>()), [p.fen, mover, p.onTap])
  const inCheck = useMemo(() => { try { return new Chess(p.fen).isCheck() } catch { return false } }, [p.fen])

  useEffect(() => {
    if (!host.current) return
    cg.current = Chessground(host.current, {
      fen: p.fen, orientation: p.orientation ?? 'white', coordinates: true,
      animation: { enabled: true, duration: 180 },
      movable: { free: false, color: mover, dests, showDests: true, events: { after: (o, d) => onMoveRef.current?.(o as Square, d as Square) } },
      draggable: { enabled: true, showGhost: true },
      premovable: { enabled: false },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true, autoShapes: [] },
    })
    return () => { cg.current?.destroy(); cg.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    cg.current?.set({
      fen: p.fen, orientation: p.orientation ?? 'white', turnColor: turn,
      check: inCheck, lastMove: p.lastMove ? (p.lastMove as Key[]) : undefined,
      movable: { color: mover, dests, free: false },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fen, p.orientation, p.lastMove?.[0], p.lastMove?.[1], mover, dests, p.syncKey, inCheck, turn])

  useEffect(() => { cg.current?.setAutoShapes(toKeys(p.shapes, p.circles)) }, [p.shapes, p.circles])

  const files = p.orientation === 'black' ? 'hgfedcba' : 'abcdefgh'
  const ranks = p.orientation === 'black' ? '12345678' : '87654321'
  return (
    <div className="board-wrap">
      <div className="cg-host" ref={host} />
      {p.onTap && (
        <div className="tap-grid">
          {[...ranks].flatMap(rk => [...files].map(f => {
            const sq = (f + rk) as Square
            return <button key={sq} aria-label={sq} className={p.tapMarks?.[sq] ?? ''} onClick={() => p.onTap!(sq)} />
          }))}
        </div>
      )}
    </div>
  )
}
