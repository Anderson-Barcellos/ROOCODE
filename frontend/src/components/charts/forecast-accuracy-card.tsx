import { useMemo } from 'react'

import {
  useForecastAccuracy,
  type FieldAccuracy,
  type ForecastSummaryInputSnapshot,
} from '@/lib/api'
import type { DailySnapshot } from '@/types/apple-health'

interface ForecastAccuracyCardProps {
  snapshots: DailySnapshot[]
}

const FIELD_LABELS: Record<string, string> = {
  sleepTotalHours: 'Sono total (h)',
  hrvSdnn: 'HRV (ms)',
  restingHeartRate: 'FC repouso (bpm)',
  activeEnergyKcal: 'Energia ativa (kcal)',
  exerciseMinutes: 'Exercício (min)',
  valence: 'Humor (valência)',
}

const FIELD_ORDER: string[] = [
  'sleepTotalHours',
  'hrvSdnn',
  'restingHeartRate',
  'activeEnergyKcal',
  'exerciseMinutes',
  'valence',
]

function formatMape(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

interface AccuracyTileProps {
  field: string
  acc: FieldAccuracy
}

function AccuracyTile({ field, acc }: AccuracyTileProps) {
  const label = FIELD_LABELS[field] ?? field
  return (
    <div className="rounded-2xl border border-slate-900/10 bg-white/85 p-4 shadow-[0_10px_28px_rgba(17,35,30,0.05)] backdrop-blur">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-['Fraunces'] text-3xl tracking-tight text-slate-900">{formatMape(acc.mape)}</span>
        <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">MAPE</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        MAE {formatNumber(acc.mae)} · RMSE {formatNumber(acc.rmse)} · n={acc.n}
      </p>
    </div>
  )
}

export function ForecastAccuracyCard({ snapshots }: ForecastAccuracyCardProps) {
  const apiInput: ForecastSummaryInputSnapshot[] = useMemo(
    () =>
      snapshots
        .filter((s) => !s.interpolated && !s.forecasted)
        .map((s) => ({
          date: s.date,
          values: {
            sleepTotalHours: s.health?.sleepTotalHours ?? null,
            hrvSdnn: s.health?.hrvSdnn ?? null,
            restingHeartRate: s.health?.restingHeartRate ?? null,
            activeEnergyKcal: s.health?.activeEnergyKcal ?? null,
            exerciseMinutes: s.health?.exerciseMinutes ?? null,
            valence: s.mood?.valence ?? null,
          },
        })),
    [snapshots],
  )

  const { data, isLoading, error } = useForecastAccuracy(apiInput, 30)

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Calibração · Forecast accuracy
      </span>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Quão bem a IA acerta o futuro?
        </h3>
        {data && (
          <span className="text-[0.65rem] uppercase tracking-wide text-slate-400">
            Janela {data.window_days}d · {data.history_size} previsões registradas
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        MAPE = erro percentual médio absoluto. Quanto menor, mais confiável a previsão. Cada nova
        previsão gerada é registrada e comparada com o que efetivamente aconteceu.
      </p>

      {isLoading && (
        <p className="mt-4 text-sm text-slate-400">Computando precisão…</p>
      )}

      {error && (
        <p className="mt-4 text-sm text-rose-600">
          Falha ao carregar accuracy: {error instanceof Error ? error.message : 'erro desconhecido'}
        </p>
      )}

      {data && data.warning && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">⚠ Coleta inicial.</span>{' '}
          <span className="text-amber-700/90">
            Histórico de previsões começa hoje — MAPE estará confiável após ~14 dias de coleta. {data.history_size}{' '}
            entries registradas até agora.
          </span>
        </div>
      )}

      {data && Object.keys(data.accuracy_by_field).length === 0 && !data.warning && (
        <p className="mt-4 text-sm text-slate-400">
          Nenhum pareamento predicted×actual na janela. Aguarde mais dias de coleta.
        </p>
      )}

      {data && Object.keys(data.accuracy_by_field).length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FIELD_ORDER.filter((field) => data.accuracy_by_field[field]).map((field) => (
            <AccuracyTile key={field} field={field} acc={data.accuracy_by_field[field]} />
          ))}
        </div>
      )}
    </div>
  )
}
