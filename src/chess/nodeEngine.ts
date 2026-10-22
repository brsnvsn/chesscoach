// Node-only helper (tests and the puzzle generator): runs the bundled Stockfish in-process.
import { createRequire } from 'node:module'
import { UciEngine, type Transport } from './uci'

export function createNodeEngine(): UciEngine {
  const require = createRequire(import.meta.url)
  let cb: (l: string) => void = () => {}
  const sf = require('stockfish')('lite-single', (line: string) => cb(line))
  const t: Transport = {
    send: c => sf.processCommand(c),
    onLine: f => { cb = f },
    terminate: () => sf.terminate(),
  }
  return new UciEngine(t)
}
