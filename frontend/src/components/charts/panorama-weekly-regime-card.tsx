import type { PanoramaWeeklyComparisonRow } from '@/utils/panorama-model'

interface PanoramaWeeklyRegimeCardProps {
  rows: PanoramaWeeklyComparisonRow[]
  socialJetLagHours: number | null
}

function formatScore(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return value.toFixed(0)
}

function formatDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

function deltaTone(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'text-slate-500'
  if (Math.abs(value) < 1) return 'text-slate-500'
  return value > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
}

function socialJetLagLabel(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return 'SJL em coleta'
  if (hours <= 1) return `SJL baixo (${hours.toFixed(1)}h)`
  if (hours <= 2) return `SJL moderado (${hours.toFixed(1)}h)`
  return `SJL alto (${hours.toFixed(1)}h)`
}

export function PanoramaWeeklyRegimeCard({ rows, socialJetLagHours }: PanoramaWeeklyRegimeCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Regime semanal
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Semana útil × fim de semana</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Compara os 3 índices sintéticos entre dias úteis e fim de semana para detectar mudança de padrão de regime.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {socialJetLagLabel(socialJetLagHours)}
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {rows.map((row) => (
          <div key={row.key} className="grid items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm sm:grid-cols-[160px_1fr_1fr_120px]">
            <span className="font-semibold text-slate-700">{row.label}</span>
            <span className="text-slate-500">Útil: <strong className="text-slate-800">{formatScore(row.weekdayMean)}</strong></span>
            <span className="text-slate-500">FdS: <strong className="text-slate-800">{formatScore(row.weekendMean)}</strong></span>
            <span className={`text-xs font-semibold ${deltaTone(row.deltaWeekendMinusWeekday)}`}>
              Δ FdS-Útil {formatDelta(row.deltaWeekendMinusWeekday)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
