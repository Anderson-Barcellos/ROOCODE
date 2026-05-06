import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import type { DailySnapshot, ForecastSignal } from '@/types/apple-health'

const FIELD_LABELS: Record<string, string> = {
  sleepTotalHours: 'Sono',
  hrvSdnn: 'HRV',
  restingHeartRate: 'FC Repouso',
  activeEnergyKcal: 'Energia Ativa',
  exerciseMinutes: 'Exercício',
  valence: 'Humor',
}

interface ForecastSignalsPanelProps {
  signals: ForecastSignal[]
  loading: boolean
  error: boolean
  errorMessage: string | null
  maxConfidence: number
  forecastedSnapshots?: DailySnapshot[]
}

export function ForecastSignalsPanel({
  signals,
  loading,
  error,
  errorMessage,
  maxConfidence,
  forecastedSnapshots = [],
}: ForecastSignalsPanelProps) {
  if (loading) {
    return (
      <div className="rounded-[1.5rem] border border-violet-200 bg-violet-50/60 p-5">
        <p className="text-sm text-violet-700 animate-pulse">🔮 Modelo IA gerando sinais…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50/70 p-5">
        <p className="text-sm font-semibold text-rose-800">Não foi possível gerar sinais de projeção.</p>
        <p className="mt-1 text-xs text-rose-700/80">{errorMessage ?? 'Erro inesperado no provedor de forecast.'}</p>
      </div>
    )
  }

  if (!signals.length) return null

  return (
    <div className="rounded-[1.5rem] border border-violet-200/80 bg-white/80 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-violet-900/10 bg-violet-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
        Projeção
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Sinais dos próximos 5 dias
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Confiança máxima nesta projeção: {(maxConfidence * 100).toFixed(0)}% · Tom descritivo, não prescritivo.
      </p>
      <ul className="mt-4 space-y-2">
        {signals.map((signal, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl bg-violet-50/60 px-3 py-2.5"
          >
            <span className="mt-0.5 shrink-0 text-xs font-bold uppercase tracking-wider text-violet-600">
              {FIELD_LABELS[signal.field] ?? signal.field}
            </span>
            <span className="text-sm leading-5 text-slate-700">{signal.observation}</span>
          </li>
        ))}
      </ul>

      {forecastedSnapshots.some((s) => s.forecastRationale) && (
        <details className="group mt-4 rounded-xl bg-violet-50/40 px-3 py-2 open:pb-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-violet-700 transition-colors hover:text-violet-900">
            <span className="inline-flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">▸</span>
              Ver justificativa por dia
            </span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {forecastedSnapshots.map((snap) => {
              const conf = snap.forecastConfidence ?? 0
              const rationale = snap.forecastRationale ?? ''
              if (!rationale) return null
              return (
                <li key={snap.date} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="font-mono">
                      {format(parseISO(snap.date), "d 'de' MMM (EEE)", { locale: ptBR })}
                    </span>
                    <span className="text-violet-600">conf {(conf * 100).toFixed(0)}%</span>
                  </div>
                  <p className="mt-1 leading-5 text-slate-700">{rationale}</p>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}
