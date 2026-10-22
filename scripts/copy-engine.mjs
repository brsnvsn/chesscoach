// Copies the single-threaded lite Stockfish build into public/ so it is served as a static file.
// (It needs no special headers, so it works on GitHub Pages and Vercel alike.)
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
const src = 'node_modules/stockfish/bin'
const dst = 'public/stockfish'
if (!existsSync(src)) { console.error('stockfish package missing: run npm install'); process.exit(1) }
mkdirSync(dst, { recursive: true })
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) copyFileSync(`${src}/${f}`, `${dst}/${f}`)
console.log('Stockfish engine copied to', dst)
