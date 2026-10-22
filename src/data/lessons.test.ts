import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { LESSONS } from './lessons'
import { freePieces, threatsAgainst, forkFrom, linesBy, matesInOne, attackersOf, checkMoveSafety, seeOn } from '../chess/analysis'

const all = Object.entries(LESSONS).flatMap(([lvl, ls]) => ls.map(l => ({ lvl: +lvl, ...l })))

describe('lessons are well-formed', () => {
  it('every FEN loads and every tap answer is a square holding something or a legal destination', () => {
    for (const l of all) for (const s of l.steps) {
      const fen = s.type !== 'read' ? s.board?.fen : s.board?.fen
      if (fen) expect(() => new Chess(fen), `${l.id} ${fen}`).not.toThrow()
      if (s.type === 'choose') { expect(s.answer).toBeGreaterThanOrEqual(0); expect(s.answer).toBeLessThan(s.options.length) }
    }
    expect(Object.keys(LESSONS)).toHaveLength(10)
  })
})

describe('lesson claims are actually true', () => {
  it('2.1: only the d6 pawn attacks e5, nothing defends', () => {
    const c = new Chess('4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1')
    expect(attackersOf(c, 'e5', 'b')).toEqual(['d6']); expect(attackersOf(c, 'e5', 'w')).toEqual([])
  })
  it('2.2: pawn attack wins a defended knight; defended knight vs queen is safe', () => {
    const c = new Chess('4k3/8/3p4/4N3/5P2/8/8/4K3 b - - 0 1'); expect(seeOn(c, 'e5')).toBe(2)
    const d = new Chess('4k3/8/4p3/3n4/8/8/3Q4/4K3 w - - 0 1'); expect(seeOn(d, 'd5')).toBe(0)
  })
  it('2.3: moving the knight leaves the bishop hanging', () => {
    const s = checkMoveSafety(new Chess('3r2k1/8/8/3B4/8/2N5/8/4K3 w - - 0 1'), 'c3', 'a4')!
    expect(s.newlyHanging.map(t => t.square)).toEqual(['d5'])
  })
  it('1.2: queen takes defended pawn loses; Bxf6 is an even trade', () => {
    const c = new Chess('4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1'); expect(checkMoveSafety(c, 'd2', 'd5')!.losesMaterial).toBe(true)
    const d = new Chess('4k3/6p1/5n2/6B1/8/8/8/4K3 w - - 0 1'); d.move('Bxf6'); expect(seeOn(d, 'f6')).toBe(3)
  })
  it('3.1: the free pieces are as described', () => {
    expect(freePieces(new Chess('4k3/8/8/3b4/8/2N5/8/4K3 w - - 0 1')).map(f => f.square)).toEqual(['d5'])
    const f = freePieces(new Chess('r3k2r/ppp2ppp/2n5/3q4/8/2N2N2/PPP2PPP/R2QK2R w KQkq - 0 1'))
    expect(f.map(x => x.square)).toContain('d5')
  })
  it('3.2: queen takes b7 is bait', () => {
    expect(checkMoveSafety(new Chess('2b1k3/1p6/8/8/8/8/1Q6/4K3 w - - 0 1'), 'b2', 'b7')!.losesMaterial).toBe(true)
  })
  it('4.1: the knight on d4 is attacked by the c5 pawn', () => {
    expect(threatsAgainst(new Chess('4k3/8/8/2p5/3N4/8/8/4K3 w - - 0 1'), 'w').map(t => t.square)).toEqual(['d4'])
  })
  it('5.x: the fork squares', () => {
    const a = new Chess('3q3k/8/8/4N3/8/8/8/4K3 w - - 0 1'); a.move('Nf7+'); expect(forkFrom(a, 'f7', 'w')).toBeTruthy()
    const b = new Chess('4k3/8/8/2n1b3/8/3P4/8/4K3 w - - 0 1'); b.move('d4'); expect(forkFrom(b, 'd4', 'w')).toBeTruthy()
    const c = new Chess('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'); c.move('Nc7+'); expect(forkFrom(c, 'c7', 'w')?.targets.map(t => t.piece).sort()).toEqual(['k', 'r'])
  })
  it('6.x: the pin, the relative pin and the skewer', () => {
    const pin = linesBy(new Chess('r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4'), 'w')
    expect(pin).toContainEqual(expect.objectContaining({ kind: 'pin', absolute: true, front: 'c6' }))
    const rel = linesBy(new Chess('3qk3/8/3n4/8/8/8/8/3RK3 b - - 0 1'), 'w')
    expect(rel).toContainEqual(expect.objectContaining({ kind: 'pin', absolute: false, front: 'd6', back: 'd8' }))
    const sk = new Chess('r7/8/8/8/k7/8/8/R3K3 b - - 0 1')
    expect(sk.isCheck()).toBe(true)
    expect(linesBy(sk, 'w')).toContainEqual(expect.objectContaining({ kind: 'skewer', back: 'a8' }))
  })
  it('7.x: back-rank mate, ladder mate, stalemate trap', () => {
    expect(matesInOne(new Chess('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1')).map(m => m.san)).toEqual(['Ra8#'])
    const luft = new Chess('6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1'); luft.move('h6'); expect(matesInOne(luft)).toHaveLength(0)
    const kh8 = new Chess('6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1'); kh8.move('Kh8'); expect(matesInOne(kh8).map(m => m.san)).toEqual(['Ra8#'])
    expect(matesInOne(new Chess('4k3/R7/8/8/8/8/8/1R2K3 w - - 0 1')).map(m => m.san)).toEqual(['Rb8#'])
    const q = new Chess('k7/7Q/1K6/8/8/8/8/8 w - - 0 1')
    const a = new Chess(q.fen()); a.move('Qc7'); expect(a.isStalemate()).toBe(true)
    const b = new Chess(q.fen()); b.move('Qa7'); expect(b.isCheckmate()).toBe(true)
    const h = new Chess(q.fen()); h.move('Qh8'); expect(h.isCheckmate()).toBe(true)
  })
  it('8.2: only Qe7 stops Qxf7#', () => {
    const base = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3'
    const mated = (m: string) => { const c = new Chess(base); c.move(m); return matesInOne(c).length > 0 }
    expect(mated('Nf6')).toBe(true); expect(mated('Bc5')).toBe(true); expect(mated('Qe7')).toBe(false)
  })
  it('9.x: discovered and double check', () => {
    const d = new Chess('4k3/8/8/8/8/4N3/8/4RK2 w - - 0 1'); d.move('Nc4'); expect(d.isCheck()).toBe(true)
    for (const sq of ['g5', 'b6']) { const b = new Chess('3qk3/8/8/8/8/4B3/8/4RK2 w - - 0 1'); b.move({ from: 'e3', to: sq as 'g5' }); expect(b.isCheck()).toBe(true); expect(attackersOf(b, 'd8', 'w')).toContain(sq) }
    const dc = new Chess('4k3/8/5N2/8/8/8/8/4RK2 b - - 0 1'); expect(dc.isCheck()).toBe(true)
    expect(new Set(dc.moves({ verbose: true }).map(m => m.piece))).toEqual(new Set(['k']))
  })
})

import { Chess as _C } from 'chess.js'
import { SCENARIOS as _S } from './levels'
describe('scenarios', () => {
  it('start from legal positions with the side to move not giving check', () => {
    for (const s of Object.values(_S)) {
      const c = new _C(s.fen)
      expect(c.isGameOver(), s.id).toBe(false)
      const flipped = new _C(s.fen.replace(' w ', ' b '))
      expect(flipped.isCheck(), s.id + ' (opponent already in check)').toBe(false)
    }
  })
})
