# Chess Coach

A gamified chess trainer for beginners. Play against bots while a side chat explains what happened, and work through 10 levels built around the habits that matter most: **check whether a square is safe before you move there**, take free pieces, spot forks/pins/mates, and finish won games.

- **Daily loop:** warm-up + train (about 10 minutes) keeps your streak. Playing is the bonus.
- **Levels unlock by beating a boss**, not by grinding XP.
- **Safety quiz:** before risky moves the coach asks you to count attackers and defenders, then fades out as you improve.
- **Spaced repetition:** puzzles you miss, and mistakes from your own games, come back at 1/3/7/16/35 days.
- **Stockfish in your browser** grades your moves and powers six bots (Rookie Randy to Sharp Sana). No server needed.
- Progress is saved in your browser (localStorage). Export/import in Settings.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

Deploy anywhere static: Vercel (framework: Vite) or GitHub Pages (workflow included; enable Pages -> Source: GitHub Actions).

## Puzzles

`npm run gen:puzzles -- --seed 1 --minutes 20` generates engine-verified puzzles (unique winning move, themed). Merge with `npx tsx scripts/gen-puzzles.ts --merge tmp/gen-*.json`.

## Credits and licence

Built on [chessground](https://github.com/lichess-org/chessground) (Lichess), [chess.js](https://github.com/jhlywa/chess.js) and [Stockfish](https://stockfishchess.org/). Because chessground and Stockfish are GPL, this project is **GPL-3.0-or-later** (see `LICENSE`).

Piece set: **Maestro** by sadsnake1, [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (from the Lichess repository). Non-commercial use only; swap the set in `src/assets/pieces/` before any commercial use.
