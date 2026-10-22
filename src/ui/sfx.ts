// Tiny WebAudio sound effects (no files to load).
import { getState } from '../store/progress'
let ctx: AudioContext | null = null
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, when = 0) {
  if (!getState().settings.sound) return
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = type; o.frequency.value = freq
    const t = ctx.currentTime + when
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur)
  } catch { /* audio blocked until user gesture */ }
}
export const sfx = {
  move: () => tone(300, 0.07, 'triangle', 0.1),
  capture: () => { tone(200, 0.09, 'square', 0.07); tone(140, 0.12, 'triangle', 0.1, 0.02) },
  check: () => { tone(520, 0.1, 'square', 0.06); tone(660, 0.12, 'square', 0.06, 0.09) },
  good: () => { tone(523, 0.12, 'sine', 0.09); tone(784, 0.18, 'sine', 0.09, 0.1) },
  bad: () => { tone(220, 0.18, 'sawtooth', 0.06); tone(165, 0.25, 'sawtooth', 0.06, 0.14) },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.1, i * 0.12)),
}
