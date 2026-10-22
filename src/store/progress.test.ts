import { describe, it, expect } from 'vitest'
import { _test, visibleStreak, addDays, daysBetween, type State } from './progress'

const { fresh, finishDay, dayOf } = _test
function doDay(s: State, day: string) { const d = dayOf(s, day); d.reviewDone = true; d.trainDone = true; return finishDay(s, day) }

describe('streak', () => {
  it('counts consecutive days and awards a bonus once per day', () => {
    const s = fresh()
    expect(doDay(s, '2026-10-19')).toBe(true)
    expect(doDay(s, '2026-10-19')).toBe(false) // same day twice: no double count
    doDay(s, '2026-10-20'); doDay(s, '2026-10-21')
    expect(s.streak.count).toBe(3)
  })
  it('one missed day is covered by the weekly freeze, a second is not', () => {
    const s = fresh()
    doDay(s, '2026-10-19'); doDay(s, '2026-10-20')           // Mon, Tue
    doDay(s, '2026-10-22')                                    // skip Wed -> freeze used
    expect(s.streak.count).toBe(3); expect(s.streak.freezes).toBe(0)
    doDay(s, '2026-10-24')                                    // skip Fri, no freeze left (same week) -> resets
    expect(s.streak.count).toBe(1)
  })
  it('shows a broken streak as zero and an at-risk one as still alive', () => {
    const s = fresh(); doDay(s, '2026-10-19')
    expect(visibleStreak(s, '2026-10-20')).toMatchObject({ count: 1, atRisk: true })
    expect(visibleStreak(s, '2026-10-21')).toMatchObject({ count: 1, atRisk: true }) // freeze would cover
    expect(visibleStreak(s, '2026-10-23').count).toBe(0)
  })
  it('date helpers', () => { expect(addDays('2026-10-31', 1)).toBe('2026-11-01'); expect(daysBetween('2026-10-19', '2026-10-22')).toBe(3) })
})
