/**
 * TempHumorCorrelation — chart cross-domain Insights.
 *
 * Espelha estrutura visual do PKHumorCorrelation:
 *   - Heatmap horizontal de 7 lags ([-3..+3])
 *   - Lags negativos esmaecidos (controle de causalidade)
 *   - Marker no lag pré-registrado (+1d) com borda âmbar
 *   - Tooltip por célula com r, p, q, n, CI95
 *   - Sumário interpretativo abaixo do header
 *
 * Lógica em utils/temp-humor-correlation.ts (testável separadamente).
 */

import { useMemo, useState } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  analyzeTempHumor,
  LAG_DAYS_SWEEP,
  MIN_TOTAL_SAMPLES,
  PREREGISTERED_LAG_DAYS,
  type LagEstimate,
} from '@/utils/temp-humor-correlation'

interface Props {
  snapshots: DailySnapshot[]
}

interface SelectedHeatmapCell {
  key: string
  label: string
  detail: string
}

export function TempHumorCorrelation({ snapshots }: Props) {
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<SelectedHeatmapCell | null>(null)
  const { samples, lags, peakLagDays } = useMemo(
    () => analyzeTempHumor(snapshots),
    [snapshots],
  )

  const significantCount = useMemo(
    () => lags.filter((l) => l.qFdr != null && l.qFdr < 0.05).length,
    [lags],
  )

  const futureImpact = useMemo(() => {
    const future = lags.filter((l) => l.lagDays > 0)
    if (future.length === 0) return []
    const significantFuture = future.filter((l) => l.qFdr != null && l.qFdr < 0.05)
    const pool = significantFuture.length > 0 ? significantFuture : future
    return [...pool]
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 3)
      .sort((a, b) => a.lagDays - b.lagDays)
  }, [lags])

  if (samples.length < MIN_TOTAL_SAMPLES || lags.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Temperatura × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Lag sweep — temperatura do pulso × valência
        </h3>
        <p className="mt-4 text-sm text-slate-500">
          Dados insuficientes pra detecção robusta. Precisamos de ao menos{' '}
          {MIN_TOTAL_SAMPLES} dias com temperatura do pulso real (não interpolada) e
          baseline pessoal computável ({30} dias rolantes, mín 14 pontos reais).
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Dias válidos atualmente: {samples.length}.
        </p>
      </div>
    )
  }

  const peak = peakLagDays != null ? lags.find((l) => l.lagDays === peakLagDays) : null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div>
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Temperatura × Humor
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Lag sweep — temperatura do pulso × valência
        </h3>
        <p className="mt-1 text-xs text-slate-500 leading-5">
          Associação entre o desvio térmico noturno (delta vs baseline pessoal 30d)
          e tua valência de humor ao longo dos próximos dias.{' '}
          <span className="italic text-slate-400">
            Associação linear não implica relação causal — vide controles abaixo.
          </span>
        </p>
        <p className="mt-2 text-[0.68rem] leading-5 text-slate-500">
          <span className="font-semibold text-amber-700">Hipótese pré-registrada:</span>{' '}
          aumento de temperatura noturna precede queda de valência com lag de +1d
          (mecanismo candidato: inflamação subclínica / disautonomia / fragmentação
          circadiana).
        </p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          <span>Sinais significativos (q &lt; 0.05):</span>
          <span>{significantCount}</span>
        </p>
        {futureImpact.length > 0 && (
          <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
            <span className="font-semibold">Impacto para frente (+1d…+3d):</span>
            <div className="mt-1 space-y-1">
              {futureImpact.map((item) => (
                <div key={item.lagDays} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={item.r >= 0 ? 'text-teal-700' : 'text-red-600'}>
                    {item.r >= 0 ? 'tendência de melhora' : 'tendência de piora'} em +{item.lagDays}d
                  </span>
                  <span className="text-slate-600">(r={item.r.toFixed(2)}, n={item.n})</span>
                  <span className={item.qFdr != null && item.qFdr < 0.05 ? 'text-amber-700' : 'text-slate-500'}>
                    {item.qFdr != null && item.qFdr < 0.05 ? 'q<0.05' : 'exploratório'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {peak && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold">Pico detectado:</span>{' '}
          {interpretPeak(peak)}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <div
          className="grid min-w-[640px] gap-x-1 gap-y-2"
          style={{ gridTemplateColumns: '140px repeat(7, minmax(72px, 1fr))' }}
        >
          <div />
          {LAG_DAYS_SWEEP.map((lag) => (
            <div
              key={lag}
              className={`text-center text-[0.65rem] font-semibold uppercase tracking-wider ${
                lag < 0 ? 'text-slate-400' : lag === 0 ? 'text-teal-700' : 'text-slate-700'
              }`}
            >
              {lag === 0 ? 'lag 0' : lag > 0 ? `+${lag}d` : `${lag}d`}
            </div>
          ))}

          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Δ temp × humor
          </div>
          {LAG_DAYS_SWEEP.map((lag) => {
            const est = lags.find((l) => l.lagDays === lag) ?? null
            const label = `Δ temp × humor · ${lag === 0 ? 'lag 0' : lag > 0 ? `+${lag}d` : `${lag}d`}`
            return (
              <HeatmapCell
                key={lag}
                label={label}
                estimate={est}
                isPeak={peakLagDays === lag}
                isControl={lag < 0}
                isPreregistered={lag === PREREGISTERED_LAG_DAYS}
                selected={selectedHeatmapCell?.key === `temp-${lag}`}
                onSelect={est ? (detail) => setSelectedHeatmapCell({
                  key: `temp-${lag}`,
                  label,
                  detail,
                }) : undefined}
              />
            )
          })}
        </div>

        {selectedHeatmapCell && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-xs leading-5 text-slate-600">
            <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Detalhe selecionado</p>
            <p className="mt-1 font-semibold text-slate-800">{selectedHeatmapCell.label}</p>
            <p>{selectedHeatmapCell.detail}</p>
          </div>
        )}

        <ul className="mt-3 space-y-0.5 text-[0.68rem] leading-5 text-slate-500">
          <li>
            <span className="font-semibold text-teal-700">Verde/↑</span> = Δtemp ↑ associado a humor melhor ·{' '}
            <span className="font-semibold text-red-500">Vermelho/↓</span> = Δtemp ↑ associado a humor pior
          </li>
          <li>
            <span className="font-semibold text-amber-600">★</span> = q &lt; 0.05 (FDR sobre 7 lags) ·{' '}
            <span className="font-semibold text-amber-600">borda âmbar</span> = lag de pico ·{' '}
            <span className="font-semibold text-amber-700">tag &ldquo;pré&rdquo;</span> = hipótese pré-registrada
          </li>
          <li>
            <span className="font-semibold text-slate-400">Lags negativos (esmaecidos)</span> = controles de causalidade. Pico aqui ou sinal forte em ambos os lados (positivo e negativo) sugere <span className="italic">confundidor comum</span>, não relação causal direcional.
          </li>
        </ul>
      </div>
    </div>
  )
}

function interpretPeak(peak: LagEstimate): string {
  const direction = peak.r > 0 ? '↑ humor mais alto' : '↓ humor mais baixo'
  const ref =
    peak.lagDays === 0
      ? 'no mesmo dia — associação contemporânea, direção causal não estabelecida'
      : peak.lagDays > 0
        ? `${peak.lagDays}d depois`
        : 'em lag negativo — associação provavelmente espúria ou via confundidor'
  return `${direction} associado a temperatura mais alta (Δ positivo) ${ref} (r ≈ ${peak.r.toFixed(2)}, n ${peak.n}).`
}

function formatR(r: number): string {
  if (!Number.isFinite(r)) return '—'
  return r.toFixed(2)
}

function formatP(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p < 0.001) return '<0.001'
  if (p < 0.01) return p.toFixed(3)
  return p.toFixed(2)
}

function formatCi(lower: number | null, upper: number | null): string {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper))
    return 'sem IC95%'
  return `[${lower.toFixed(2)}, ${upper.toFixed(2)}]`
}

function colorForR(r: number): string {
  const clamped = Math.max(-1, Math.min(1, r))
  const intensity = Math.abs(clamped)
  if (clamped < 0) return `rgba(239, 68, 68, ${intensity * 0.45})`
  if (clamped > 0) return `rgba(20, 184, 166, ${intensity * 0.45})`
  return 'rgba(241, 245, 249, 1)'
}

function HeatmapCell({
  label,
  estimate,
  isPeak,
  isControl,
  isPreregistered,
  selected,
  onSelect,
}: {
  label: string
  estimate: LagEstimate | null
  isPeak: boolean
  isControl: boolean
  isPreregistered: boolean
  selected: boolean
  onSelect?: (detail: string) => void
}) {
  if (!estimate) {
    return (
      <div
        className={`h-12 rounded-md border border-slate-100 bg-slate-50/50 ${
          isControl ? 'opacity-60' : ''
        } ${isPreregistered ? 'ring-2 ring-amber-300' : ''}`}
        title={isPreregistered ? 'Lag pré-registrado (sem dados suficientes)' : undefined}
      />
    )
  }
  const significant = estimate.qFdr != null && estimate.qFdr < 0.05
  const tooltip =
    `r ${formatR(estimate.r)} · IC95% ${formatCi(estimate.ciLower, estimate.ciUpper)} ·` +
    ` p ${formatP(estimate.p)} · q ${formatP(estimate.qFdr ?? Number.NaN)} · n ${estimate.n}` +
    (isPreregistered ? ' · pré-registrado (+1d)' : '')
  const className = `relative flex h-12 items-center justify-center rounded-md border text-xs font-mono ${
    isPeak ? 'border-2 border-amber-500' : 'border-slate-200'
  } ${isControl ? 'opacity-70' : ''} ${
    isPreregistered && !isPeak ? 'ring-2 ring-amber-300' : ''
  } ${selected ? 'ring-2 ring-slate-900/35 ring-offset-1' : ''}`
  const content = (
    <>
      {isPreregistered && (
        <span className="absolute left-0.5 top-0.5 rounded bg-amber-100 px-1 text-[0.55rem] font-semibold text-amber-700">
          pré
        </span>
      )}
      {estimate.r > 0.05 && (
        <span className="absolute right-0.5 bottom-0.5 text-[0.55rem] text-teal-700">↑</span>
      )}
      {estimate.r < -0.05 && (
        <span className="absolute right-0.5 bottom-0.5 text-[0.55rem] text-red-500">↓</span>
      )}
      <span className="text-slate-900 mix-blend-luminosity">{formatR(estimate.r)}</span>
      {significant && (
        <span className="absolute right-0.5 top-0.5 text-amber-600">★</span>
      )}
    </>
  )
  if (onSelect) {
    return (
      <button
        type="button"
        title={tooltip}
        aria-label={`${label}: ${tooltip}`}
        aria-pressed={selected}
        onClick={() => onSelect(tooltip)}
        className={`${className} cursor-pointer transition hover:ring-2 hover:ring-slate-900/20 hover:ring-offset-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-1`}
        style={{ background: colorForR(estimate.r) }}
      >
        {content}
      </button>
    )
  }
  return (
    <div
      title={tooltip}
      className={className}
      style={{ background: colorForR(estimate.r) }}
    >
      {content}
    </div>
  )
}
