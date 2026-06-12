import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { computeSleepOnsetDelaySeries } from '../src/utils/sleep-onset-delay'

function isoDate(dayOffset: number): string {
  const base = new Date('2026-05-18T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - dayOffset)
  return base.toISOString().slice(0, 10)
}

function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// onsetHour em hora local (-03:00); onset à noite (ex 23) cai na data anterior.
function snapshot(dayOffset: number, onsetHHMM: string): DailySnapshot {
  const date = isoDate(dayOffset)
  const start = `${previousDate(date)}T${onsetHHMM}:00-03:00`
  const end = `${date}T07:00:00-03:00`
  const health = {
    date,
    sleepStartAt: start,
    sleepEndAt: end,
    sleepTotalHours: 7.5,
    sleepCoreHours: 4,
    sleepDeepHours: 1.4,
    sleepRemHours: 1.6,
    sleepAwakeHours: 0.4,
  } as unknown as DailyHealthMetrics
  return { date, health, mood: null, medications: null }
}

// 14 noites adormecendo às 23:00 -> baseline estável, delay ~0
const steady = Array.from({ length: 14 }, (_, i) => snapshot(13 - i, '23:00'))
const steadySeries = computeSleepOnsetDelaySeries(steady)
const steadyLast = steadySeries.at(-1)!
assert.ok(steadyLast.delayMinutes != null, 'com 14 noites o delay é computável')
assert.ok(Math.abs(steadyLast.delayMinutes!) < 5, 'rotina estável => atraso ~0')

// Última noite 1h mais tarde (00:00 do dia, vs baseline 23:00) -> delay ~ +60
const shifted = [...Array.from({ length: 13 }, (_, i) => snapshot(13 - i, '23:00')), snapshot(0, '00:00')]
const shiftedLast = computeSleepOnsetDelaySeries(shifted).at(-1)!
assert.ok(shiftedLast.delayMinutes != null && shiftedLast.delayMinutes > 45, 'dormir 1h mais tarde => delay positivo')

// Poucas noites (< mínimo) -> baseline e delay null, mas onset presente
const sparse = computeSleepOnsetDelaySeries([snapshot(1, '23:00'), snapshot(0, '23:30')])
assert.equal(sparse.at(-1)!.delayMinutes, null)
assert.ok(sparse.at(-1)!.onsetMinutes != null)

console.log('sleep-onset-delay.test.ts — all assertions passed')
