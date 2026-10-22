import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { threatsAgainst, freePieces, checkMoveSafety, forkFrom, linesBy, mateThreatsAgainst, isBackRankMate, seeOn, discoveredAttack, developmentStats } from './analysis'

const C = (fen: string) => new Chess(fen)

describe('hanging pieces & free pieces', () => {
  it('flags an undefended pawn that is attacked', () => {
    const t = threatsAgainst(C('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'), 'b')
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ square: 'e5', kind: 'hanging', netLoss: 1 })
  })
  it('does not flag a pawn defended by a knight when the attacker is a knight', () => {
    expect(threatsAgainst(C('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), 'b')).toHaveLength(0)
  })
  it('lists the free piece for the side to move', () => {
    const f = freePieces(C('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2'))
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ square: 'e5', gain: 1, kind: 'hanging' })
  })
  it('SEE: knight takes defended pawn is not a win', () => {
    expect(seeOn(C('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), 'e5')).toBe(0)
  })
  it('SEE counts a pawn trade-up: pawn takes defended knight', () => {
    // white pawn d4 attacks black knight e5, defended by a pawn: pawn x knight, pawn x pawn => +3 -1 = 2
    expect(seeOn(C('4k3/8/3p4/4n3/3P4/8/8/4K3 w - - 0 1'), 'e5')).toBe(2)
  })
})

describe('move safety (the habit this app teaches)', () => {
  it('catches the queen taking a pawn defended by a pawn', () => {
    const s = checkMoveSafety(C('4k3/2p5/3p4/8/8/8/8/3QK3 w - - 0 1'), 'd1', 'd6')!
    expect(s.losesMaterial).toBe(true)
    expect(s.movedPiece?.piece).toBe('q')
    expect(s.destAttackers).toEqual(['c7'])
    expect(s.destDefenders).toEqual([])
    expect(s.net).toBe(1 - 9)
  })
  it('reports a safe developing move', () => {
    const s = checkMoveSafety(C('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1'), 'g1', 'f3')!
    expect(s.losesMaterial).toBe(false)
    expect(s.destAttackers).toHaveLength(0)
  })
  it('notices when a move leaves another piece hanging (removes its only defender)', () => {
    const s = checkMoveSafety(C('3r2k1/8/8/3B4/8/2N5/8/4K3 w - - 0 1'), 'c3', 'a4')!
    expect(s.movedPiece).toBeNull()
    expect(s.newlyHanging.map(t => t.square)).toEqual(['d5'])
    expect(s.losesMaterial).toBe(true)
    // moving a different piece instead keeps the bishop defended
    expect(checkMoveSafety(C('3r2k1/8/8/3B4/8/2N5/8/4K3 w - - 0 1'), 'e1', 'e2')!.newlyHanging).toHaveLength(0)
  })
  it('sees that a move allows mate in one (fool\'s mate)', () => {
    const c = new Chess(); c.move('f3'); c.move('e5')
    const s = checkMoveSafety(c, 'g2', 'g4')!
    expect(s.allowsMate.map(m => m.san)).toEqual(['Qh4#'])
    expect(checkMoveSafety(c, 'e2', 'e4')!.allowsMate).toHaveLength(0)
  })
})

describe('tactic detectors', () => {
  it('finds a royal fork', () => {
    const c = C('3q3k/8/8/4N3/8/8/8/4K3 w - - 0 1')
    c.move('Nf7+')
    const f = forkFrom(c, 'f7', 'w')!
    expect(f.targets.map(t => t.piece).sort()).toEqual(['k', 'q'])
  })
  it('finds an absolute pin', () => {
    const l = linesBy(C('r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4'), 'w')
    expect(l).toContainEqual(expect.objectContaining({ kind: 'pin', absolute: true, front: 'c6', back: 'e8' }))
  })
  it('finds a skewer', () => {
    const l = linesBy(C('r7/8/8/8/k7/8/8/R3K3 w - - 0 1'), 'w')
    expect(l).toContainEqual(expect.objectContaining({ kind: 'skewer', front: 'a4', back: 'a8' }))
  })
  it('sees a mate threat and a back-rank mate', () => {
    const c = C('6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1')
    expect(mateThreatsAgainst(c, 'b').map(m => m.san)).toEqual(['Ra8#'])
    const d = C('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1')
    const mv = d.move('Ra8#')
    expect(isBackRankMate(d, mv)).toBe(true)
  })
  it('detects a discovered attack', () => {
    const before = C('4k3/8/8/8/8/4N3/8/4RK2 w - - 0 1')
    // knight moves off the e-file, uncovering the rook on the black king
    const after = new Chess(before.fen()); const mv = after.move('Nc4')
    const d = discoveredAttack(before, after, mv)
    expect(d).toContainEqual(expect.objectContaining({ slider: 'e1', target: 'e8', targetPiece: 'k' }))
  })
})

describe('development stats', () => {
  it('counts castling, minors and the early queen', () => {
    const c = new Chess()
    for (const s of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6']) c.move(s)
    const st = developmentStats(c.history({ verbose: true }), 'w')
    expect(st).toEqual({ castled: true, minorsDeveloped: 2, centerPawn: true, earlyQueen: false })
    const q = new Chess()
    for (const s of ['e4', 'e5', 'Qh5']) q.move(s)
    expect(developmentStats(q.history({ verbose: true }), 'w').earlyQueen).toBe(true)
  })
})
