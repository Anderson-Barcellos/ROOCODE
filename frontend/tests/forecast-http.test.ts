import assert from 'node:assert/strict'

import type { ForecastPayload } from '../src/hooks/useForecast'
import { postForecast } from '../src/hooks/useForecast'

async function withMockFetch(responseBody: string, status: number, fn: () => Promise<void>) {
  const originalFetch = global.fetch
  const mockFetch: typeof fetch = async () =>
    new Response(responseBody, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  global.fetch = mockFetch
  try {
    await fn()
  } finally {
    global.fetch = originalFetch
  }
}

const payload: ForecastPayload = {
  snapshots: [],
  horizon: 5,
  valid_real_days: 7,
  rolling_summary: {
    window_days: 7,
    sample_days: 0,
    means: {
      sleepTotalHours: null,
      hrvSdnn: null,
      restingHeartRate: null,
      activeEnergyKcal: null,
      exerciseMinutes: null,
      valence: null,
    },
  },
}

async function run() {
  await withMockFetch(
    JSON.stringify({
      forecasted_snapshots: [],
      meta: { cached: false, error: 'provider failed', forecasted_dates: [], max_confidence: 0 },
      signals: [],
    }),
    502,
    async () => {
      let caught: Error | null = null
      try {
        await postForecast(payload)
      } catch (err) {
        caught = err as Error
      }
      assert.ok(caught)
      assert.equal(caught?.message, 'provider failed')
    },
  )

  await withMockFetch('not json', 200, async () => {
    let caught: Error | null = null
    try {
      await postForecast(payload)
    } catch (err) {
      caught = err as Error
    }
    assert.ok(caught)
    assert.equal(caught?.message, 'Invalid forecast response JSON')
  })

  await withMockFetch('gateway unavailable', 502, async () => {
    let caught: Error | null = null
    try {
      await postForecast(payload)
    } catch (err) {
      caught = err as Error
    }
    assert.ok(caught)
    assert.equal(caught?.message, 'HTTP 502')
  })
}

run().catch((err) => {
  // Propaga falha para o runner de testes
  console.error(err)
  process.exit(1)
})
