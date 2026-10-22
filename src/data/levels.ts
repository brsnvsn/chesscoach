// The curriculum. Levels unlock by beating a boss, not by grinding XP.
// Order follows the Pareto cut: stop hanging pieces (2) -> take free pieces (3) -> scan (4) -> tactics (5,6,9) -> mates (7) -> openings (8) -> converting (10).

export type DrillSpec =
  | { kind: 'trade' }
  | { kind: 'count' }
  | { kind: 'principle' }
  | { kind: 'moves'; themes: string[]; label: string }
  | { kind: 'scenario'; ids: string[] }

export interface GameRules {
  /** boss is judged once this many full moves have been played (or the game ends) */
  minMoves: number
  maxHangs?: number
  maxBlunders?: number
  minFreeOffered?: number
  maxMissedFree?: number
  castled?: boolean
  minDeveloped?: number
  mustWin?: boolean
  /** hard stop: judged at this move even if minMoves not reached */
  maxMoves?: number
}

export type BossSpec =
  | { type: 'puzzles'; drill: DrillSpec; count: number; need: number; seconds?: number; blurb: string }
  | { type: 'game'; bot: number; rules: GameRules; blurb: string; color?: 'w' | 'b' }
  | { type: 'scenario'; ids: string[]; blurb: string }

export interface LevelDef {
  n: number
  rank: string
  glyph: string
  name: string
  skill: string
  /** why this matters, in one line */
  why: string
  color: string
  drill: DrillSpec
  boss: BossSpec
  bossName: string
}

export const LEVELS: LevelDef[] = [
  { n: 1, rank: 'Pawn', glyph: '♟', name: 'Know your army', skill: 'Piece values and trades', why: 'You cannot tell a good trade from a bad one without prices.', color: '#a3a3a3',
    drill: { kind: 'trade' }, bossName: 'The Haggler',
    boss: { type: 'puzzles', drill: { kind: 'trade' }, count: 10, need: 8, blurb: 'Judge 10 trades. Get 8 right.' } },
  { n: 2, rank: 'Guard', glyph: '🛡', name: 'Is it safe?', skill: 'Counting attackers and defenders', why: 'Hanging pieces is how most of your games are lost. This is the big one.', color: '#6aa84f',
    drill: { kind: 'count' }, bossName: 'Rookie Randy',
    boss: { type: 'game', bot: 1, rules: { minMoves: 20, maxHangs: 0 }, blurb: 'Play Rookie Randy for 20 moves without hanging a single piece.' } },
  { n: 3, rank: 'Hunter', glyph: '🎯', name: 'Free pieces', skill: 'Spotting what they left hanging', why: 'Opponents hang pieces all the time. Most players never see it.', color: '#e0a030',
    drill: { kind: 'moves', themes: ['hangingPiece'], label: 'Free pieces' }, bossName: 'Butterfingers Randy',
    boss: { type: 'game', bot: 1, rules: { minMoves: 25, maxMoves: 45, maxHangs: 1, minFreeOffered: 3, maxMissedFree: 0 }, blurb: 'Take every free piece the bot offers. Miss none (at least 3 must appear).' } },
  { n: 4, rank: 'Scout', glyph: '🔭', name: 'Checks, Captures, Threats', skill: 'The 10-second scan', why: 'One habit that catches hanging pieces, mates and tactics for both sides.', color: '#3d85c6',
    drill: { kind: 'moves', themes: ['hangingPiece', 'mateIn1', 'fork'], label: 'Mixed: spot the tactic' }, bossName: 'The Gauntlet',
    boss: { type: 'puzzles', drill: { kind: 'moves', themes: ['hangingPiece', 'mateIn1', 'fork', 'pin'], label: 'Mixed' }, count: 15, need: 12, blurb: '15 mixed puzzles, 12 correct (80%).' } },
  { n: 5, rank: 'Knight', glyph: '♞', name: 'Forks', skill: 'One piece, two targets', why: 'The easiest way to win material from a stronger-looking opponent.', color: '#8e63ce',
    drill: { kind: 'moves', themes: ['fork'], label: 'Forks' }, bossName: 'Fork Rush',
    boss: { type: 'puzzles', drill: { kind: 'moves', themes: ['fork'], label: 'Forks' }, count: 10, need: 8, seconds: 240, blurb: 'Fork rush: 8 correct out of 10 in 4 minutes.' } },
  { n: 6, rank: 'Bishop', glyph: '♝', name: 'Pins and skewers', skill: 'Lines that win material', why: 'Pinned pieces cannot move; skewered pieces lose what is behind them.', color: '#e06666',
    drill: { kind: 'moves', themes: ['pin', 'skewer'], label: 'Pins and skewers' }, bossName: 'Tactics Test',
    boss: { type: 'puzzles', drill: { kind: 'moves', themes: ['pin', 'skewer', 'fork'], label: 'Tactics' }, count: 12, need: 10, blurb: '12 tactics puzzles, 10 correct.' } },
  { n: 7, rank: 'Rook', glyph: '♜', name: 'Checkmate', skill: 'Mating patterns and basic mates', why: 'So you finish won games instead of stalemating or running out of ideas.', color: '#c27ba0',
    drill: { kind: 'moves', themes: ['mateIn1', 'backRankMate', 'mateIn2'], label: 'Mates' }, bossName: 'The Cornered King',
    boss: { type: 'scenario', ids: ['kq', 'kr'], blurb: 'Checkmate with queen + king, then rook + king, within the move limits. No stalemates.' } },
  { n: 8, rank: 'Captain', glyph: '⚓', name: 'Opening principles', skill: 'Centre, develop, castle', why: 'Five habits replace memorising any opening for a long time.', color: '#45818e',
    drill: { kind: 'principle' }, bossName: 'Club Kofi',
    boss: { type: 'game', bot: 3, rules: { minMoves: 10, maxMoves: 10, castled: true, minDeveloped: 3, maxHangs: 0, maxBlunders: 0 }, blurb: 'Against Club Kofi: castle, develop three pieces, and make no blunders in the first 10 moves.' } },
  { n: 9, rank: 'Commander', glyph: '⚔', name: 'Discoveries and double checks', skill: 'Two threats at once', why: 'Tactics that are hard to see coming and hard to defend.', color: '#cc4125',
    drill: { kind: 'moves', themes: ['discoveredAttack', 'doubleCheck', 'pin', 'fork'], label: 'Discoveries and mixed' }, bossName: 'The Grandmaster\'s Apprentice',
    boss: { type: 'puzzles', drill: { kind: 'moves', themes: ['discoveredAttack', 'doubleCheck', 'pin', 'fork', 'skewer', 'mateIn2'], label: 'Mixed' }, count: 15, need: 12, blurb: '15 mixed tactics, 12 correct.' } },
  { n: 10, rank: 'Master', glyph: '♛', name: 'Convert and finish', skill: 'Turning an advantage into a win', why: 'Most throw-away games are won positions that were not finished.', color: '#f1c232',
    drill: { kind: 'scenario', ids: ['krr', 'big-lead', 'kq', 'kr'] }, bossName: 'Sharp Sana',
    boss: { type: 'game', bot: 4, rules: { minMoves: 1, mustWin: true, maxBlunders: 2 }, blurb: 'Beat Sharp Sana with no more than two blunders.' } },
]

export const levelDef = (n: number) => LEVELS[Math.max(1, Math.min(10, n)) - 1]

// ---------- endgame / conversion scenarios (you are White, the bot defends as well as it can) ----------
export interface Scenario { id: string; title: string; fen: string; maxMoves: number; bot: number; hint: string }

export const SCENARIOS: Record<string, Scenario> = {
  kq: { id: 'kq', title: 'Queen + King vs King', fen: '8/8/8/4k3/8/8/Q7/4K3 w - - 0 1', maxMoves: 20, bot: 6, hint: 'Cage the king with the queen a knight\'s jump away, bring your king closer, and check every move for stalemate before you play it.' },
  kr: { id: 'kr', title: 'Rook + King vs King', fen: '8/8/8/8/4k3/8/8/R3K3 w - - 0 1', maxMoves: 35, bot: 6, hint: 'Use the rook to cut the king off, push it to the edge with your king, then deliver the check along the edge.' },
  krr: { id: 'krr', title: 'The two-rook ladder', fen: '8/8/4k3/8/8/8/8/RR2K3 w - - 0 1', maxMoves: 10, bot: 6, hint: 'Rooks check on alternating ranks, pushing the king up the board.' },
  'big-lead': { id: 'big-lead', title: 'Convert a big lead', fen: '4k3/pp3ppp/8/8/8/8/PPP2PPP/3QK3 w - - 0 1', maxMoves: 40, bot: 3, hint: 'You are up a queen. Trade pieces, avoid hanging anything, and look for a mate.' },
}
