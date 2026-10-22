import { UciEngine, workerTransport } from '../chess/uci'

let engine: UciEngine | null = null
let failed = false

/** One shared Stockfish for the whole app (loaded on first use; ~1.8 MB). */
export function getEngine(): UciEngine | null {
  if (engine || failed) return engine
  try {
    engine = new UciEngine(workerTransport(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`))
  } catch {
    failed = true
  }
  return engine
}
export const engineFailed = () => failed
