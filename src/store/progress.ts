// All player progress lives in localStorage for now (Google sign-in + sync can replace `persist`/`load` later).
import { useSyncExternalStore } from 'react'
import type { Puzzle } from '../data/types'

const KEY = 'chesscoach.v1'
/** spaced repetition gaps in days: a missed puzzle returns after 1, then 3, 7, 16, 35 days */
export const INTERVALS = [1, 3, 7, 16, 35]

export interface ReviewItem { id: string; box: number; due: string; fails: number; puzzle?: Puzzle }
export interface GameRecord { date: string; bot: number; result: 'win' | 'loss' | 'draw' | 'abandoned'; moves: number; blunders: number; mistakes: number; hangs: number; missedFree: number; xp: number }
export interface DayRecord { review: number; train: number; play: number; reviewDone: boolean; trainDone: boolean; playDone: boolean; xp: number; complete: boolean }
export type Assist = 'quiz' | 'warn' | 'off'

export interface State {
  v: 1
  xp: number
  /** the level the player is currently working on (1..10); 11 = everything cleared */
  level: number
  bossesPassed: number[]
  lessonsDone: Record<string, boolean>
  streak: { count: number; lastDay: string | null; freezes: number; freezeWeek: string; freezeUsedOn: string | null }
  days: Record<string, DayRecord>
  review: Record<string, ReviewItem>
  seen: Record<string, boolean>
  themeStats: Record<string, { solved: number; failed: number }>
  games: GameRecord[]
  quizRecent: boolean[]
  settings: { assist: Assist; botLevel: number; color: 'w' | 'b' | 'random'; sound: boolean; name: string }
}

// ---------- dates ----------
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000)
export const addDays = (k: string, n: number) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d) }
const weekKey = (k: string) => { const d = parseDay(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayKey(d) }

// ---------- state ----------
const fresh = (): State => ({
  v: 1, xp: 0, level: 1, bossesPassed: [], lessonsDone: {},
  streak: { count: 0, lastDay: null, freezes: 1, freezeWeek: weekKey(dayKey()), freezeUsedOn: null },
  days: {}, review: {}, seen: {}, themeStats: {}, games: [], quizRecent: [],
  settings: { assist: 'quiz', botLevel: 1, color: 'w', sound: true, name: '' },
})

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw) as State; if (s && s.v === 1) return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings }, streak: { ...fresh().streak, ...s.streak } } }
  } catch { /* private mode or corrupt: start fresh */ }
  return fresh()
}

let state: State = load()
const listeners = new Set<() => void>()
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable */ } }
export function update(fn: (s: State) => void) {
  const next: State = structuredClone(state)
  fn(next)
  state = next
  persist()
  listeners.forEach(l => l())
}
export const getState = () => state
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useProgress = (): State => useSyncExternalStore(subscribe, getState, getState)
export function resetAll() { state = fresh(); persist(); listeners.forEach(l => l()) }

/** exported for tests */
export const _test = { fresh: () => fresh(), finishDay: (s: State, day: string) => finishDay(s, day), dayOf: (s: State, k: string) => dayOf(s, k), visibleStreak }
export const emptyDay = (): DayRecord => ({ review: 0, train: 0, play: 0, reviewDone: false, trainDone: false, playDone: false, xp: 0, complete: false })
const dayOf = (s: State, k = dayKey()): DayRecord => (s.days[k] ??= emptyDay())

// ---------- streak ----------
function refreshFreeze(s: State, today: string) {
  const w = weekKey(today)
  if (s.streak.freezeWeek !== w) { s.streak.freezeWeek = w; s.streak.freezes = 1 }
}

/** the streak the player would see today (a missed day that a freeze can cover still counts) */
export function visibleStreak(s: State, today = dayKey()): { count: number; doneToday: boolean; atRisk: boolean; freezes: number } {
  const last = s.streak.lastDay
  const doneToday = last === today
  if (!last) return { count: 0, doneToday: false, atRisk: false, freezes: s.streak.freezes }
  const gap = daysBetween(last, today)
  const week = weekKey(today) !== s.streak.freezeWeek ? 1 : s.streak.freezes
  if (gap <= 1) return { count: s.streak.count, doneToday, atRisk: gap === 1, freezes: week }
  if (gap === 2 && week > 0) return { count: s.streak.count, doneToday: false, atRisk: true, freezes: week }
  return { count: 0, doneToday: false, atRisk: false, freezes: week }
}

function finishDay(s: State, today: string): boolean {
  const d = dayOf(s, today)
  if (d.complete || !(d.reviewDone && d.trainDone)) return false
  d.complete = true
  refreshFreeze(s, today)
  const last = s.streak.lastDay
  if (!last) s.streak.count = 1
  else {
    const gap = daysBetween(last, today)
    if (gap === 1) s.streak.count += 1
    else if (gap === 2 && s.streak.freezes > 0) { s.streak.freezes -= 1; s.streak.freezeUsedOn = addDays(today, -1); s.streak.count += 1 }
    else if (gap > 0) s.streak.count = 1
  }
  s.streak.lastDay = today
  addXpRaw(s, 25, today)
  return true
}

function addXpRaw(s: State, n: number, today = dayKey()) { s.xp += n; dayOf(s, today).xp += n }
export const addXp = (n: number) => update(s => addXpRaw(s, n))

// ---------- actions ----------
export const DAILY_REVIEW_GOAL = 3

/** Mark progress on today's loop. Returns true if this completed the day (streak goes up). */
export function bump(kind: 'review' | 'train' | 'play', n = 1): boolean {
  let completed = false
  update(s => {
    const today = dayKey()
    const d = dayOf(s, today)
    d[kind] += n
    if (kind === 'review' && d.review >= DAILY_REVIEW_GOAL) d.reviewDone = true
    if (kind === 'train' && d.train >= 8) d.trainDone = true
    if (kind === 'play') d.playDone = true
    completed = finishDay(s, today)
  })
  return completed
}

/** A lesson finished counts as a day's training. */
export function completeLesson(id: string): boolean {
  let completed = false
  update(s => {
    const first = !s.lessonsDone[id]
    s.lessonsDone[id] = true
    const today = dayKey()
    const d = dayOf(s, today)
    d.trainDone = true
    if (first) addXpRaw(s, 20, today)
    completed = finishDay(s, today)
  })
  return completed
}

/** Record a puzzle result: XP, theme stats, spaced-repetition queue. */
export function recordPuzzle(p: { id: string; themes: string[] }, solvedFirstTry: boolean, custom?: Puzzle, opts: { review?: boolean; noXp?: boolean; noReview?: boolean } = {}) {
  update(s => {
    const today = dayKey()
    s.seen[p.id] = true
    for (const t of p.themes) { const st = (s.themeStats[t] ??= { solved: 0, failed: 0 }); solvedFirstTry ? st.solved++ : st.failed++ }
    const item = s.review[p.id]
    if (opts.noReview) { /* procedural drill: nothing to schedule */ }
    else if (!solvedFirstTry) {
      s.review[p.id] = { id: p.id, box: 0, due: addDays(today, 1), fails: (item?.fails ?? 0) + 1, puzzle: custom ?? item?.puzzle }
    } else if (item && item.due <= today) {
      const box = item.box + 1
      if (box >= INTERVALS.length) delete s.review[p.id]
      else s.review[p.id] = { ...item, box, due: addDays(today, INTERVALS[box]) }
    }
    if (!opts.noXp) addXpRaw(s, solvedFirstTry ? (opts.review ? 8 : 10) : 2, today)
  })
}

export function recordQuiz(correct: boolean) {
  update(s => { s.quizRecent = [...s.quizRecent, correct].slice(-20); addXpRaw(s, correct ? 3 : 0) })
}

export function recordGame(g: GameRecord) {
  update(s => { s.games = [...s.games, g].slice(-100); addXpRaw(s, g.xp) })
}

export function passBoss(level: number) {
  update(s => {
    if (!s.bossesPassed.includes(level)) { s.bossesPassed.push(level); addXpRaw(s, 150) }
    s.level = Math.max(s.level, level + 1)
  })
}

export function setSetting<K extends keyof State['settings']>(k: K, v: State['settings'][K]) { update(s => { s.settings[k] = v }) }

// ---------- selectors ----------
export const dueReviews = (s: State, today = dayKey()): ReviewItem[] => Object.values(s.review).filter(r => r.due <= today).sort((a, b) => a.due.localeCompare(b.due))
export const todayRecord = (s: State): DayRecord => s.days[dayKey()] ?? emptyDay()
export const DAILY_XP_GOAL = 100

/** quiz scaffolding: suggest fading from "quiz" to "warn" once the counting habit is reliable */
export function readyToFade(s: State): boolean {
  const r = s.quizRecent.slice(-10)
  return s.settings.assist === 'quiz' && r.length >= 10 && r.filter(Boolean).length >= 9
}
export const blundersPerGame = (s: State) => s.games.map(g => g.blunders + g.mistakes * 0.5)
