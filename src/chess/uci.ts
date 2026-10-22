// Minimal UCI wrapper around Stockfish. Works over any transport (Web Worker in the browser, in-process in Node).
export interface Transport {
  send(cmd: string): void
  onLine(cb: (line: string) => void): void
  terminate(): void
}

export interface EngineLine { move: string; cp?: number; mate?: number; pv: string[]; depth: number }
export interface SearchResult { best: string; lines: EngineLine[] }
export interface SearchOpts { depth?: number; movetime?: number; multipv?: number }

/** Score from the side-to-move's point of view, in centipawns (mates become very large numbers). */
export function cpOf(l: EngineLine): number {
  if (l.mate !== undefined) return (l.mate > 0 ? 1 : -1) * (10000 - Math.min(Math.abs(l.mate), 100) * 50)
  return l.cp ?? 0
}

/** Lichess-style win probability (0-100) for a centipawn score. */
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-3000, Math.min(3000, cp)))) - 1)

export class UciEngine {
  private lineCbs: ((l: string) => void)[] = []
  private queue: Promise<unknown> = Promise.resolve()
  private multipv = 1
  private ready: Promise<void>
  private stopCurrent: (() => void) | null = null

  constructor(private t: Transport) {
    t.onLine(l => this.lineCbs.slice().forEach(cb => cb(l)))
    this.ready = this.init()
  }

  private waitFor(re: RegExp): Promise<string> {
    return new Promise(res => {
      const cb = (l: string) => { if (re.test(l)) { this.lineCbs = this.lineCbs.filter(x => x !== cb); res(l) } }
      this.lineCbs.push(cb)
    })
  }

  private async init() {
    const ok = this.waitFor(/^uciok/)
    this.t.send('uci')
    await ok
    this.t.send('setoption name Threads value 1')
    this.t.send('setoption name Hash value 16')
    const r = this.waitFor(/^readyok/)
    this.t.send('isready')
    await r
  }

  /** Run a search. Searches are queued one after another; call stop() to cut the running one short. */
  search(fen: string, opts: SearchOpts = {}): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready
      const mpv = opts.multipv ?? 1
      if (mpv !== this.multipv) { this.t.send(`setoption name MultiPV value ${mpv}`); this.multipv = mpv }
      const byPv = new Map<number, EngineLine>()
      const done = new Promise<string>(res => {
        const cb = (l: string) => {
          if (l.startsWith('info ') && l.includes(' pv ') && l.includes(' score ')) {
            const depth = +(/ depth (\d+)/.exec(l)?.[1] ?? 0)
            const pvIdx = +(/ multipv (\d+)/.exec(l)?.[1] ?? 1)
            const cp = / score cp (-?\d+)/.exec(l)
            const mate = / score mate (-?\d+)/.exec(l)
            const pv = l.slice(l.indexOf(' pv ') + 4).trim().split(/\s+/)
            const prev = byPv.get(pvIdx)
            if (!prev || depth >= prev.depth) byPv.set(pvIdx, { move: pv[0], cp: cp ? +cp[1] : undefined, mate: mate ? +mate[1] : undefined, pv, depth })
          } else if (l.startsWith('bestmove')) {
            this.lineCbs = this.lineCbs.filter(x => x !== cb)
            res(l.split(/\s+/)[1])
          }
        }
        this.lineCbs.push(cb)
      })
      this.t.send(`position fen ${fen}`)
      const go = opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 12}`
      this.stopCurrent = () => this.t.send('stop')
      this.t.send(go)
      const best = await done
      this.stopCurrent = null
      const lines = [...byPv.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
      return { best, lines }
    }
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }

  stop() { this.stopCurrent?.() }
  terminate() { this.t.terminate() }
}

/** Browser transport: Stockfish running in a Web Worker. */
export function workerTransport(url: string): Transport {
  const w = new Worker(url)
  return {
    send: c => w.postMessage(c),
    onLine: cb => { w.onmessage = e => cb(String(e.data)) },
    terminate: () => w.terminate(),
  }
}
