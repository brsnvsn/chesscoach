// Sound effects. Piece sounds are real recordings from Lichess (public/sound, AGPLv3+); feedback chimes are WebAudio tones.
import { getState } from '../store/progress'
let ctx: AudioContext | null = null
const audioCtx = () => (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)())

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, when = 0) {
  if (!getState().settings.sound) return
  try {
    const c = audioCtx()
    const o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.value = freq
    const t = c.currentTime + when
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur)
  } catch { /* audio blocked until user gesture */ }
}

// decoded once, played through WebAudio so rapid moves never cut each other off
const buffers: Record<string, Promise<AudioBuffer | null>> = {}
function sample(name: 'Move' | 'Capture') {
  if (!getState().settings.sound) return
  try {
    const c = audioCtx()
    if (c.state === 'suspended') void c.resume()
    buffers[name] ??= fetch(`${import.meta.env.BASE_URL}sound/${name}.mp3`).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).catch(() => null)
    void buffers[name].then(buf => {
      if (!buf) return
      const src = c.createBufferSource(), g = c.createGain()
      g.gain.value = 0.9
      src.buffer = buf; src.connect(g).connect(c.destination); src.start()
    })
  } catch { /* ignore */ }
}

export const sfx = {
  move: () => sample('Move'),
  capture: () => sample('Capture'),
  check: () => { sample('Move'); tone(880, 0.09, 'sine', 0.05, 0.05) },
  /** pick the right sound for a move that has just been played on `after` */
  play: (mv: { captured?: string }, after: { isCheck: () => boolean }) => (after.isCheck() ? (mv.captured ? sample('Capture') : sample('Move'), tone(880, 0.09, 'sine', 0.05, 0.05)) : mv.captured ? sample('Capture') : sample('Move')),
  good: () => { tone(523, 0.12, 'sine', 0.09); tone(784, 0.18, 'sine', 0.09, 0.1) },
  bad: () => { tone(220, 0.18, 'sawtooth', 0.06); tone(165, 0.25, 'sawtooth', 0.06, 0.14) },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.1, i * 0.12)),
}
