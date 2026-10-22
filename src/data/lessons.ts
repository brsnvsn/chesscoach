// Lesson content. Every board here is verified by src/data/lessons.test.ts (FENs are legal, tap answers are
// actually correct, "tap" squares really are the fork / hanging / pinned squares the text claims).
import type { Square } from 'chess.js'
import type { Shape } from '../chess/explain'

export interface LessonBoard { fen: string; shapes?: Shape[]; highlight?: Square[]; orientation?: 'white' | 'black' }

export type LessonStep =
  | { type: 'read'; title: string; body: string; board?: LessonBoard }
  | { type: 'choose'; prompt: string; board?: LessonBoard; options: string[]; answer: number; explain: string }
  | { type: 'tap'; prompt: string; board: LessonBoard; answers: Square[]; explain: string }

export interface Lesson { id: string; title: string; minutes: number; steps: LessonStep[] }

const g = (orig: Square, dest?: Square): Shape => ({ orig, dest, brush: 'green' })
const r = (orig: Square, dest?: Square): Shape => ({ orig, dest, brush: 'red' })
const y = (orig: Square, dest?: Square): Shape => ({ orig, dest, brush: 'yellow' })

export const LESSONS: Record<number, Lesson[]> = {
  1: [
    {
      id: '1.1', title: 'What are pieces worth?', minutes: 3,
      steps: [
        { type: 'read', title: 'Every piece has a price', body: 'Count in **pawns**:\n\n• Pawn **1**\n• Knight **3**\n• Bishop **3**\n• Rook **5**\n• Queen **9**\n• King: priceless — it can never be traded\n\nThis is not a rule of chess, it is a price tag. **Before you capture or trade, compare the prices.**', board: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } },
        { type: 'choose', prompt: 'Which is worth more?', options: ['A rook (5)', 'A bishop and a pawn (3 + 1 = 4)'], answer: 0, explain: 'A rook is 5, a bishop plus a pawn is only 4. Add things up before you trade.' },
        { type: 'choose', prompt: 'You give up a knight (3) and win a rook (5). Did you win or lose material?', options: ['Won 2 points', 'Lost 2 points', 'Even'], answer: 0, explain: '5 − 3 = +2. Winning a rook for a knight is called **winning the exchange**.' },
        { type: 'choose', prompt: 'Which is worth more?', options: ['A queen (9)', 'Two rooks (5 + 5 = 10)'], answer: 1, explain: 'Two rooks edge out a queen. Each piece is worth different amounts depending on the position, but these numbers are a great starting point.' },
      ],
    },
    {
      id: '1.2', title: 'Good trades and bad trades', minutes: 4,
      steps: [
        { type: 'read', title: 'The golden rule of trading', body: '• **Equal trade** (3 for 3): fine, especially when you are ahead.\n• **You win more than you give**: great.\n• **You give more than you win**: bad — unless it wins something else.\n\nWhen you capture, ask: *"If they take back, what is the total?"*' },
        { type: 'choose', prompt: 'Should the queen take the pawn on d5?', board: { fen: '4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1', shapes: [y('d2', 'd5'), r('c6', 'd5')] }, options: ['Yes — a free pawn', 'No — the c6 pawn takes back, and I lose a queen (9) for a pawn (1)'], answer: 1, explain: 'The pawn on d5 is **defended** by the pawn on c6. Queen (9) for pawn (1) is a disaster.' },
        { type: 'choose', prompt: 'Bishop takes the knight on f6, and the g7 pawn takes back. How does that end?', board: { fen: '4k3/6p1/5n2/6B1/8/8/8/4K3 w - - 0 1', shapes: [y('g5', 'f6'), r('g7', 'f6')] }, options: ['I win material', 'Even trade: 3 for 3', 'I lose material'], answer: 1, explain: 'Knight (3) for bishop (3): even. Your bishop took a 3, their pawn took a 3.' },
      ],
    },
  ],
  2: [
    {
      id: '2.1', title: 'The two questions', minutes: 4,
      steps: [
        { type: 'read', title: 'Before every move, ask two questions', body: 'Most games at your level are lost by **moving a piece to a square where it can just be taken**. The fix is a habit:\n\n**1. Who attacks the square I am moving to?**\n**2. Who defends it?**\n\nHere the white knight on e5 is attacked by the d6 pawn and defended by nothing.', board: { fen: '4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1', shapes: [r('d6', 'e5')] } },
        { type: 'tap', prompt: 'Tap the black piece that attacks the white knight.', board: { fen: '4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1', highlight: ['e5'] }, answers: ['d6'], explain: 'The pawn on d6 captures diagonally, so it attacks e5 (and c5).' },
        { type: 'choose', prompt: 'How many white pieces defend the knight on e5?', board: { fen: '4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1', highlight: ['e5'] }, options: ['0', '1', '2'], answer: 0, explain: 'Nothing guards it. One attacker against zero defenders: the knight is lost.' },
      ],
    },
    {
      id: '2.2', title: 'Attackers vs defenders', minutes: 5,
      steps: [
        { type: 'read', title: 'The counting rule', body: 'A piece is in danger when:\n\n• **more attackers than defenders**, or\n• **the cheapest attacker is worth less than the piece**. A pawn attacking a knight wins it even if the knight is defended, because 1 < 3.\n\nA piece is **safe** when it is defended enough and no cheap piece can take it.' },
        { type: 'choose', prompt: 'The knight on e5 is defended by the f4 pawn. Is it safe from the d6 pawn?', board: { fen: '4k3/8/3p4/4N3/5P2/8/8/4K3 w - - 0 1', shapes: [r('d6', 'e5'), g('f4', 'e5')] }, options: ['Safe: it is defended', 'Not safe: pawn takes knight (+3), pawn takes back (+1) — I am down 2'], answer: 1, explain: 'Defended is not enough when the attacker is **cheaper** than your piece.' },
        { type: 'choose', prompt: 'Black knight on d5, defended by the e6 pawn. Your queen attacks it. Take it?', board: { fen: '4k3/8/4p3/3n4/8/8/3Q4/4K3 w - - 0 1', shapes: [y('d2', 'd5'), g('e6', 'd5')] }, options: ['Yes, a knight is a knight', 'No: queen (9) for knight (3) is awful'], answer: 1, explain: 'The queen is worth far more than the knight, and the pawn defends it. Do not trade up in the wrong direction.' },
      ],
    },
    {
      id: '2.3', title: 'What did I leave behind?', minutes: 4,
      steps: [
        { type: 'read', title: 'Moving a defender removes the defence', body: 'The other way to blunder: you move a piece that was **protecting** something. The destination is safe, but a friend is now hanging.\n\nSo the full habit is **three** questions: where am I going, who attacks it, and *what did this piece stop protecting?*', board: { fen: '3r2k1/8/8/3B4/8/2N5/8/4K3 w - - 0 1', shapes: [g('c3', 'd5'), r('d8', 'd5')] } },
        { type: 'choose', prompt: 'Your knight on c3 is guarding the bishop on d5 from the rook. If the knight moves away, what happens?', board: { fen: '3r2k1/8/8/3B4/8/2N5/8/4K3 w - - 0 1', shapes: [g('c3', 'd5'), r('d8', 'd5')] }, options: ['Nothing', 'The bishop on d5 is now undefended and the rook takes it'], answer: 1, explain: 'The knight was the only defender. Always look at what your move **un**-protects.' },
      ],
    },
  ],
  3: [
    {
      id: '3.1', title: 'Look at their pieces too', minutes: 4,
      steps: [
        { type: 'read', title: 'Your opponent hangs pieces as often as you do', body: 'At your level, pieces get left hanging **constantly** — on both sides. Most people never notice the free ones.\n\nEvery single move, scan **their** pieces: **is anything attacked and not defended?** That is a free piece.' },
        { type: 'tap', prompt: 'White to move. Tap the black piece you can win for free.', board: { fen: '4k3/8/8/3b4/8/2N5/8/4K3 w - - 0 1' }, answers: ['d5'], explain: 'Your knight attacks the bishop, and nothing defends it. Nxd5 wins a whole piece.' },
        { type: 'tap', prompt: 'Even defended pieces can be free. Tap the black piece you can win here.', board: { fen: 'r3k2r/ppp2ppp/2n5/3q4/8/2N2N2/PPP2PPP/R2QK2R w KQkq - 0 1', shapes: [] }, answers: ['d5'], explain: 'A **knight** attacks the **queen**. Whatever defends the queen, a 3 beats a 9. Cheaper attackers win bigger pieces.' },
      ],
    },
    {
      id: '3.2', title: 'Free… or bait?', minutes: 3,
      steps: [
        { type: 'read', title: 'Run the safety check on your capture too', body: 'A free-looking piece can be **bait**. Before you grab it, ask the same questions about your capturing piece: *after I take, who can take me?*' },
        { type: 'choose', prompt: 'The pawn on b7 looks free. Take it with the queen?', board: { fen: '2b1k3/1p6/8/8/8/8/1Q6/4K3 w - - 0 1', shapes: [y('b2', 'b7'), r('c8', 'b7')] }, options: ['Yes: free pawn', 'No: the bishop on c8 defends it, and I lose my queen for a pawn'], answer: 1, explain: 'The bishop on c8 guards b7. Queen (9) for pawn (1) — a trap.' },
      ],
    },
  ],
  4: [
    {
      id: '4.1', title: 'Checks, Captures, Threats', minutes: 4,
      steps: [
        { type: 'read', title: 'A 10-second scan that catches almost everything', body: 'Before each move, look for **C-C-T** — for **both** sides:\n\n**C**hecks: any check can force the game\n**C**aptures: anything to take, or that can take you\n**T**hreats: anything attacking something valuable\n\nStart with what **they** threaten. Then look at what **you** have.' },
        { type: 'choose', prompt: 'It is your move. What do you check first?', options: ['My own attacking plan', 'What the opponent just threatened (their checks, captures, threats)'], answer: 1, explain: 'If you do not know what they are threatening, you cannot know whether your move is safe.' },
        { type: 'tap', prompt: 'Their last move created a threat. Tap your piece that is under attack.', board: { fen: '4k3/8/8/2p5/3N4/8/8/4K3 w - - 0 1', shapes: [r('c5', 'd4')] }, answers: ['d4'], explain: 'The pawn on c5 attacks your knight. A good scan finds this before you play something else.' },
      ],
    },
    {
      id: '4.2', title: 'Make it a routine', minutes: 2,
      steps: [
        { type: 'read', title: 'Use the Scan button', body: 'In a game, press **Scan** in the coach panel and it will list the checks, captures and threats for you. Then try doing the scan **in your head first** and use the button to check yourself.\n\nThe goal is that you never need the button.' },
      ],
    },
  ],
  5: [
    {
      id: '5.1', title: 'The fork', minutes: 4,
      steps: [
        { type: 'read', title: 'One piece, two targets', body: 'A **fork** is one piece attacking two or more things at once. The opponent can only save one. **Knights** are the best forkers: they jump, so nothing can block them.', board: { fen: '3q3k/5N2/8/8/8/8/8/4K3 b - - 0 1', shapes: [y('f7', 'd8'), y('f7', 'h8')] } },
        { type: 'tap', prompt: 'The white knight can fork the king and queen. Tap the square it should jump to.', board: { fen: '3q3k/8/8/4N3/8/8/8/4K3 w - - 0 1', highlight: ['e5'] }, answers: ['f7'], explain: 'Nf7+ attacks the king on h8 and the queen on d8. The king must move, and you take the queen.' },
        { type: 'tap', prompt: 'Pawns can fork too. Tap the square the white pawn should move to.', board: { fen: '4k3/8/8/2n1b3/8/3P4/8/4K3 w - - 0 1' }, answers: ['d4'], explain: 'd4 attacks the knight on c5 and the bishop on e5 at once.' },
      ],
    },
    {
      id: '5.2', title: 'Spotting fork chances', minutes: 3,
      steps: [
        { type: 'read', title: 'Look for pairs', body: 'Scan the enemy pieces for **pairs** that a knight could attack from one square:\n\n• king + anything\n• two undefended pieces\n• a queen or rook + another piece\n\nAlways check the forking square is **safe** (run your counting check!).' },
        { type: 'tap', prompt: 'Tap the square where the white knight forks the king and the rook.', board: { fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1' }, answers: ['c7'], explain: 'Nc7+ attacks the king on e8 and the rook on a8.' },
      ],
    },
  ],
  6: [
    {
      id: '6.1', title: 'The pin', minutes: 4,
      steps: [
        { type: 'read', title: 'A piece that cannot move', body: 'A **pin** is when a piece cannot move because a **more valuable** piece is standing behind it on the same line.\n\nIf the piece behind is the **king**, the pin is **absolute** — the pinned piece literally cannot move.', board: { fen: 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4', shapes: [r('b5', 'c6'), y('c6', 'e8')] } },
        { type: 'tap', prompt: 'Tap the pinned black piece.', board: { fen: 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4' }, answers: ['c6'], explain: 'The knight on c6 is pinned to the king on e8 by the bishop on b5.' },
        { type: 'choose', prompt: 'Why can the black knight not move?', board: { fen: 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4', shapes: [r('b5', 'c6')] }, options: ['Moving it would put its own king in check, which is illegal', 'Knights cannot move diagonally'], answer: 0, explain: 'If it moved, the bishop would capture the king. That is not allowed.' },
        { type: 'choose', prompt: 'A rook pins a knight to the QUEEN behind it. Can the knight legally move?', board: { fen: '3qk3/8/3n4/8/8/8/8/3RK3 b - - 0 1', shapes: [r('d1', 'd6'), y('d6', 'd8')] }, options: ['Yes — but I lose the queen', 'No, it is illegal'], answer: 0, explain: 'That is a **relative** pin: the move is legal but costly.' },
      ],
    },
    {
      id: '6.2', title: 'The skewer', minutes: 3,
      steps: [
        { type: 'read', title: 'A pin in reverse', body: 'A **skewer** attacks a valuable piece that must move, exposing a piece **behind** it.\n\n**Pin:** the front piece is *cheaper*.\n**Skewer:** the front piece is *more valuable*.', board: { fen: 'r7/8/8/8/k7/8/8/R3K3 b - - 0 1', shapes: [r('a1', 'a4'), y('a4', 'a8')] } },
        { type: 'tap', prompt: 'The black king must move out of check. Tap the piece White wins next.', board: { fen: 'r7/8/8/8/k7/8/8/R3K3 b - - 0 1' }, answers: ['a8'], explain: 'The king steps aside and Rxa8 takes the rook that was behind it.' },
        { type: 'choose', prompt: 'A queen is in front and a rook behind it on the same line. Is attacking that line a pin or a skewer?', options: ['A pin', 'A skewer'], answer: 1, explain: 'The more valuable piece (queen) is in front, so it is a skewer.' },
      ],
    },
  ],
  7: [
    {
      id: '7.1', title: 'Back-rank mate', minutes: 4,
      steps: [
        { type: 'read', title: 'The king trapped by its own pawns', body: 'When a king sits on its back rank behind its own pawns, one rook or queen on that rank can be **checkmate**. Nothing blocks and the king has nowhere to step.', board: { fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', shapes: [g('a1', 'a8')] } },
        { type: 'tap', prompt: 'Tap the square where the rook delivers checkmate.', board: { fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1' }, answers: ['a8'], explain: 'Ra8# — the f7, g7 and h7 pawns block the king in.' },
        { type: 'choose', prompt: 'You are Black in this position. Which move prevents the back-rank mate?', board: { fen: '6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1' }, options: ['…h6 (makes an escape square)', '…Kh8'], answer: 0, explain: '…h6 gives the king the h7 square — a "luft". Kh8 would still be mated by Ra8#.' },
      ],
    },
    {
      id: '7.2', title: 'The ladder', minutes: 3,
      steps: [
        { type: 'read', title: 'You already know this one', body: 'Two rooks (or queen + rook) take turns checking, pushing the king to the edge like climbing a ladder. One rook cuts off a rank while the other gives check on the next.', board: { fen: '4k3/R7/8/8/8/8/8/1R2K3 w - - 0 1', shapes: [g('b1', 'b8')] } },
        { type: 'tap', prompt: 'Finish the ladder. Tap the square for checkmate.', board: { fen: '4k3/R7/8/8/8/8/8/1R2K3 w - - 0 1' }, answers: ['b8'], explain: 'Rb8#: the rook on a7 covers the 7th rank, the new rook checks along the 8th.' },
      ],
    },
    {
      id: '7.3', title: 'Queen mates — and the stalemate trap', minutes: 4,
      steps: [
        { type: 'read', title: 'Winning is not enough, do not stalemate', body: 'With a queen and king against a lone king, keep the queen **a knight\'s jump away** from the enemy king to cage it, then walk your king over.\n\nThe biggest danger is **stalemate**: if the enemy king has no legal move and is **not** in check, the game is a **draw**. Always check that your move leaves the opponent a legal move — or gives check.' },
        { type: 'choose', prompt: 'White to move. Which of these moves is a STALEMATE (a draw), not a win?', board: { fen: 'k7/7Q/1K6/8/8/8/8/8 w - - 0 1' }, options: ['Qc7', 'Qa7#', 'Qh8#'], answer: 0, explain: 'After Qc7 the black king has no moves but is not in check — stalemate. Qa7 and Qh8 are both checkmate.' },
      ],
    },
  ],
  8: [
    {
      id: '8.1', title: 'The 5 opening rules', minutes: 4,
      steps: [
        { type: 'read', title: 'You do not need to memorise openings', body: 'Follow five principles and you will be fine for a long time:\n\n1. **Control the centre** with e4 / d4 pawns\n2. **Develop** knights and bishops (off the back rank)\n3. **Castle** early to protect your king\n4. **Do not bring the queen out early** — it just gets chased\n5. **Do not move the same piece twice** before the others are out', board: { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' } },
        { type: 'choose', prompt: 'You are White. 1.e4 e5. Which move follows the principles best?', board: { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' }, options: ['Nf3 (develops and attacks e5)', 'Qh5 (early queen)', 'a3 (edge pawn)'], answer: 0, explain: 'Nf3 develops a piece **and** attacks the e5 pawn. Qh5 loses time when it is chased; a3 does nothing.' },
      ],
    },
    {
      id: '8.2', title: 'Do not fall for the fastest trap', minutes: 3,
      steps: [
        { type: 'read', title: 'Scholar\'s mate', body: 'White brings the queen and bishop at f7 — the weakest square, defended only by the king. If you do not notice the threat, the game is over in four moves.\n\nThis is the C-C-T scan in action: **what does their last move threaten?**', board: { fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', shapes: [r('h5', 'f7'), r('c4', 'f7')] } },
        { type: 'choose', prompt: 'Black to move. White threatens Qxf7#. Which move stops it?', board: { fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', shapes: [r('h5', 'f7')] }, options: ['…Nf6?? (attacking the queen)', '…Qe7 (defends f7)', '…Bc5'], answer: 1, explain: 'Only …Qe7 defends f7. After …Nf6 or …Bc5 White plays Qxf7# anyway — attacking the queen does not help if the mate comes first.' },
      ],
    },
  ],
  9: [
    {
      id: '9.1', title: 'Discovered attacks', minutes: 4,
      steps: [
        { type: 'read', title: 'Move one piece, unleash another', body: 'A **discovered attack** happens when you move a piece out of the way and **a different piece behind it** suddenly attacks something. The piece that moved can make its own threat at the same time — that is two threats at once.', board: { fen: '4k3/8/8/8/8/4N3/8/4RK2 w - - 0 1', shapes: [g('e1', 'e8')] } },
        { type: 'tap', prompt: 'Tap the white piece that, by moving, gives a discovered check.', board: { fen: '4k3/8/8/8/8/4N3/8/4RK2 w - - 0 1' }, answers: ['e3'], explain: 'The knight blocks the rook. Any knight move uncovers check from the rook on e1.' },
        { type: 'tap', prompt: 'The bishop moves with a discovered check AND attacks the queen. Tap a square that does both.', board: { fen: '3qk3/8/8/8/8/4B3/8/4RK2 w - - 0 1' }, answers: ['g5', 'b6'], explain: 'Bg5 (or Bb6) uncovers check from the rook while the bishop attacks the queen on d8. Black must answer the check, and you take the queen.' },
      ],
    },
    {
      id: '9.2', title: 'Double check', minutes: 3,
      steps: [
        { type: 'read', title: 'Two checks at once', body: 'In a **double check** two pieces give check at the same time. You cannot block or capture both — the **king must move**. Double checks are often deadly.', board: { fen: '4k3/8/5N2/8/8/8/8/4RK2 b - - 0 1', shapes: [r('f6', 'e8'), r('e1', 'e8')] } },
        { type: 'choose', prompt: 'Black is in double check (knight on f6 and rook on e1). What can Black do?', board: { fen: '4k3/8/5N2/8/8/8/8/4RK2 b - - 0 1', shapes: [r('f6', 'e8'), r('e1', 'e8')] }, options: ['Capture the knight', 'Block the rook\'s line', 'Move the king'], answer: 2, explain: 'Capturing or blocking only deals with one check. In a double check, only a king move is legal.' },
      ],
    },
  ],
  10: [
    {
      id: '10.1', title: 'Converting a won game', minutes: 4,
      steps: [
        { type: 'read', title: 'Being ahead is not the same as winning', body: 'When you are ahead on material:\n\n• **Trade pieces, not pawns.** Fewer pieces means fewer ways for the opponent to fight back.\n• **Keep running the safety check.** Most thrown-away wins are one hung piece.\n• **Avoid stalemate** and keep your king safe.\n• Push toward **checkmate** with the patterns you know: ladder, queen cage, back rank.' },
        { type: 'choose', prompt: 'You are up a rook. Which plan is best?', options: ['Trade pieces and simplify', 'Launch a risky attack with everything', 'Avoid all trades'], answer: 0, explain: 'Simplify. A rook up with fewer pieces on the board is a very easy win; a wild attack gives them chances.' },
      ],
    },
  ],
}
