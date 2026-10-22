import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { makeCountQ, makeTradeQ, makePrincipleQ } from './drills'
import { mulberry32 } from './positions'
import { attackersOf } from './analysis'

describe('procedural drills', () => {
  it('count questions are consistent with the board and unambiguous', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 25; i++) {
      const q = makeCountQ(rand, 'c' + i)
      const c = new Chess(q.fen)
      const p = c.get(q.target)!
      expect(p).toBeTruthy()
      expect(attackersOf(c, q.target, p.color === 'w' ? 'b' : 'w')).toHaveLength(q.attackers)
      expect(attackersOf(c, q.target, p.color)).toHaveLength(q.defenders)
      expect(q.attackers).toBeGreaterThanOrEqual(1)
    }
  })
  it('trade questions can be built for every verdict, and the capture is legal', () => {
    const rand = mulberry32(11)
    for (const want of ['win', 'even', 'lose'] as const) {
      for (let i = 0; i < 6; i++) {
        const q = makeTradeQ(rand, 't', want)
        expect(q.verdict).toBe(want)
        expect(new Chess(q.fen).moves({ verbose: true }).some(m => m.from === q.from && m.to === q.to)).toBe(true)
      }
    }
  })
  it('principle questions have one correct, legal option', () => {
    const rand = mulberry32(5)
    for (let i = 0; i < 20; i++) {
      const q = makePrincipleQ(rand, 'p' + i)
      expect(q.options).toHaveLength(3)
      expect(q.options.some(o => o.uci === q.correct)).toBe(true)
      const legal = new Chess(q.fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''))
      for (const o of q.options) expect(legal).toContain(o.uci)
    }
  })
})
