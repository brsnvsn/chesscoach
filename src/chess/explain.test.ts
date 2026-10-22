import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { describePunish, describeBest } from './explain'

describe('describePunish', () => {
  it('names the mate the opponent now has', () => {
    const c = new Chess(); for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6']) c.move(m)
    expect(describePunish(c, 'h5f7')).toBe('White can answer **Qxf7#**, which is checkmate.')
  })
  it('names the piece that falls', () => {
    const c = new Chess(); for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5']) c.move(m) // Nxe5?? walks into Qg5
    expect(describePunish(c, 'd8g5')).toMatch(/^Black can answer \*\*Qg5\*\*, which (forks|attacks)/)
  })
  it('gives no fake reason when there is no tactic', () => {
    expect(describeBest(new Chess(), 'a2a3').why).toBe('')
  })
})
