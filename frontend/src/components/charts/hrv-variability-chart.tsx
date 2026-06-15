import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { CardScoreBadge } from '@/components/cards/CardScoreBadge'
import { calculateDayGapDays, dayLabel } from '@/utils/aggregation'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { DataReadinessGate } from '@/components/charts/shared/DataReadinessGate'
import { ChartTooltip } from '@/components/charts/shared/ChartTooltip'
import { computeHrvVariabilitySeries } from '@/utils/hrv-variability'

interface HrvVariabilityChartProps {
  snapshots: DailySnapshot[]
  baselineSnapshots?: DailySnapshot[]
}

const COLOR_TEAL = '#0f766e'
const COLOR_TEAL_DARK = '#134e4a'

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
}

interface ChartRow {
  date: string
  label: string
  hrv: number | null
  hrvReal: number | null
  hrvInterp: number | null
  hrvBridge: number | null
  sma7: number | null
  sma30: number | null
  sdBandLow: number | null
  sdBandWidth: number | null
  rollingSd7: number | null
  derivedFromInterpolated: boolean
}

function buildRows(baselineSnapshots: DailySnapshot[], snapshots: DailySnapshot[]): ChartRow[] {
  const series = computeHrvVariabilitySeries(baselineSnapshots)
  const byDate = new Map(series.map((point) => [point.date, point]))

  const rows: ChartRow[] = snapshots.map((snapshot, idx) => {
    const point = byDate.get(snapshot.date)
    const prevPoint = idx > 0 ? byDate.get(snapshots[idx - 1].date) : null
    const nextPoint = idx < snapshots.length - 1 ? byDate.get(snapshots[idx + 1].date) : null
    const isInterp = point?.derivedFromInterpolated ?? !!(snapshot.interpolated || snapshot.forecasted)
    const prevIsInterp = prevPoint?.derivedFromInterpolated ?? false
    const nextIsInterp = nextPoint?.derivedFromInterpolated ?? false

    const sdBandWidth =
      point?.sdBandHigh != null && point?.sdBandLow != null
        ? point.sdBandHigh - point.sdBandLow
        : null

    return {
      date: snapshot.date,
      label: dayLabel(snapshot.date),
      hrv: point?.hrv ?? null,
      hrvReal: isInterp ? null : (point?.hrv ?? null),
      hrvInterp: isInterp
        ? (point?.hrv ?? null)
        : prevIsInterp || nextIsInterp
          ? (point?.hrv ?? null)
          : null,
      hrvBridge: point?.hrv ?? null,
      sma7: point?.sma7 ?? null,
      sma30: point?.sma30 ?? null,
      sdBandLow: point?.sdBandLow ?? null,
      sdBandWidth,
      rollingSd7: point?.rollingSd7 ?? null,
      derivedFromInterpolated: isInterp,
    }
  })

  if (rows.length < 2) return rows

  const withGaps: ChartRow[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i]
    withGaps.push(current)
    const next = rows[i + 1]
    if (!next) continue
    if (calculateDayGapDays(current.date, next.date) > 2) {
      withGaps.push({
        date: `${current.date}-gap`,
        label: '',
        hrv: null,
        hrvReal: null,
        hrvInterp: null,
        hrvBridge: null,
        sma7: null,
        sma30: null,
        sdBandLow: null,
        sdBandWidth: null,
        rollingSd7: null,
        derivedFromInterpolated: false,
      })
    }
  }
  return withGaps
}

function sdLabel(sd: number | null): { text: string; color: string } | null {
  if (sd == null) return null
  if (sd < 5) return { text: 'Baixa (rígido)', color: '#f59e0b' }
  if (sd <= 15) return { text: 'Normal', color: '#10b981' }
  return { text: 'Alta (flexível)', color: '#6366f1' }
}

function hrvVerdict(hrv: number): { text: string; mood: 'good' } {
  return {
    text: `VFC pessoal mais recente: ${hrv.toFixed(1)} ms (SDNN ultra-curto Apple Watch). Acompanha a tua tendência — SMA 7d e 30d mostram a direção; envelope SD reflete estabilidade dia-a-dia.`,
    mood: 'good',
  }
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartRow }>
}

function HrvTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row || (row.hrvReal == null && row.hrvInterp == null)) return null

  const hrv = (row.hrvReal ?? row.hrvInterp)!
  const sdInfo = sdLabel(row.rollingSd7)

  return (
    <div className="rounded-2xl bg-white px-3 py-2 text-xs shadow-[0_18px_42px_rgba(17,35,30,0.12)]" style={TOOLTIP_STYLE}>
      <div className="mb-1 font-semibold text-slate-700">{row.label}</div>
      {row.derivedFromInterpolated && (
        <div className="mb-1 text-[0.62rem] font-medium text-amber-600 dark:text-amber-300">
          ⚠ estimado a partir de dia interp
        </div>
      )}
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          {hrv.toFixed(1)} ms
        </span>
      </div>
      <div className="space-y-1 text-slate-600">
        {row.sma7 != null && (
          <div className="flex justify-between gap-3">
            <span>SMA 7d</span>
            <span className="font-semibold text-slate-800">{row.sma7.toFixed(1)} ms</span>
          </div>
        )}
        {row.sma30 != null && (
          <div className="flex justify-between gap-3">
            <span>SMA 30d</span>
            <span className="font-semibold text-slate-800">{row.sma30.toFixed(1)} ms</span>
          </div>
        )}
        {row.rollingSd7 != null && (
          <>
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-1">
              <span>Variabilidade dia-a-dia</span>
              <span className="font-semibold text-slate-800">{row.rollingSd7.toFixed(1)} ms SD</span>
            </div>
            {sdInfo && (
              <div className="flex justify-between gap-3">
                <span>Avaliação</span>
                <span className="font-semibold" style={{ color: sdInfo.color }}>{sdInfo.text}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function HrvVariabilityChart({ snapshots, baselineSnapshots }: HrvVariabilityChartProps) {
  const baselineSource = baselineSnapshots ?? snapshots
  const data = useMemo(() => buildRows(baselineSource, snapshots), [baselineSource, snapshots])
  const readiness = useMemo(
    () => evaluateReadiness(snapshots, CHART_REQUIREMENTS.hrvVariabilityChart, 'HRV Variability'),
    [snapshots],
  )

  const latest = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const row = data[i]
      if (row.hrvReal != null || row.hrvInterp != null) return row
    }
    return null
  }, [data])

  const yDomain = useMemo<[number, number]>(() => {
    const vals = data.flatMap((r) => {
      const v: number[] = []
      if (r.hrv != null) v.push(r.hrv)
      if (r.sma7 != null) v.push(r.sma7)
      if (r.sma30 != null) v.push(r.sma30)
      return v
    })
    const minVal = vals.length ? Math.min(...vals) : 0
    const maxVal = vals.length ? Math.max(...vals) : 80
    return [Math.max(0, Math.floor(minVal - 5)), Math.ceil(maxVal + 5)]
  }, [data])

  const chartBody = (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="rgba(100,116,139,0.1)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={22}
          />
          <YAxis
            domain={yDomain}
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v: number) => `${v}`}
          />

          <Area
            type="monotone"
            dataKey="sdBandLow"
            stackId="sd"
            fill="transparent"
            stroke="none"
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="sdBandWidth"
            stackId="sd"
            fill="#94a3b8"
            fillOpacity={0.15}
            stroke="#94a3b8"
            strokeWidth={0.5}
            strokeOpacity={0.3}
            connectNulls={false}
          />

          <Line
            type="monotone"
            dataKey="hrvBridge"
            stroke={COLOR_TEAL}
            strokeWidth={1.2}
            strokeOpacity={0.22}
            strokeDasharray="1 5"
            dot={false}
            activeDot={false}
            connectNulls
            name="HRV (ligação visual)"
            legendType="none"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="hrvReal"
            stroke={COLOR_TEAL}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="HRV"
          />
          <Line
            type="monotone"
            dataKey="hrvInterp"
            stroke={COLOR_TEAL}
            strokeWidth={1.8}
            strokeOpacity={0.55}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            name="HRV (estimado)"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="sma7"
            stroke={COLOR_TEAL}
            strokeWidth={2.2}
            dot={false}
            connectNulls={false}
            name="SMA 7d"
          />
          <Line
            type="monotone"
            dataKey="sma30"
            stroke={COLOR_TEAL_DARK}
            strokeWidth={2.8}
            dot={false}
            connectNulls={false}
            name="SMA 30d"
          />

          <ChartTooltip content={<HrvTooltip />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  const latestHrv = latest != null ? (latest.hrvReal ?? latest.hrvInterp) : null

  const verdict = latestHrv != null ? hrvVerdict(latestHrv) : null
  const verdictClass = 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Coração · VFC
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Variabilidade da Frequência Cardíaca
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            SDNN ultra-curto (~1 min) registrado pelo Apple Watch — sem norma populacional robusta para
            wearables. Este gráfico mostra a tua tendência pessoal: HRV diário, SMA 7d, SMA 30d e
            envelope de variabilidade dia-a-dia (SD 7d em cinza).
          </p>
          {verdict && (
            <p className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
              {verdict.text}
            </p>
          )}
        </div>
        {latestHrv != null && (
          <CardScoreBadge
            label="Último"
            value={`${latestHrv.toFixed(1)} ms`}
            hint={latest?.label}
          />
        )}
      </div>

      <DataReadinessGate readiness={readiness}>{chartBody}</DataReadinessGate>

      <details className="mt-5">
        <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800">
          Saiba mais: siglas da VFC (SDNN, RMSSD, HF/LF…)
        </summary>
        <div className="mt-3 space-y-3 text-[0.78rem] leading-5 text-slate-500">
          <p>
            O sistema nervoso autônomo modula o intervalo entre cada batimento cardíaco. Existem 7 métricas
            principais divididas em dois domínios:
          </p>
          <div>
            <p className="mb-1 font-semibold text-slate-600">
              Domínio Temporal (calculadas diretamente dos intervalos RR):
            </p>
            <ul className="space-y-1.5 pl-3">
              <li>
                <span className="font-mono text-[0.72rem]">SDNN</span> — Desvio padrão dos intervalos NN
                (todos os intervalos entre batimentos normais). Reflete variabilidade global. É a métrica
                disponível via Apple Watch.
              </li>
              <li>
                <span className="font-mono text-[0.72rem]">RMSSD</span> — Raiz quadrada da média dos
                quadrados das diferenças entre intervalos NN consecutivos. Marcador primário de atividade
                parassimpática (nervo vago). Requer dados beat-to-beat.
              </li>
              <li>
                <span className="font-mono text-[0.72rem]">NN50</span> — Contagem de pares de intervalos
                NN com diferença &gt; 50ms. Indicador de regulação vagal. Requer dados beat-to-beat.
              </li>
              <li>
                <span className="font-mono text-[0.72rem]">pNN50</span> — Percentual de NN50 sobre total
                de intervalos. Versão normalizada do NN50. Requer dados beat-to-beat.
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-600">
              Domínio Frequencial (calculadas via análise espectral / FFT dos intervalos RR):
            </p>
            <ul className="space-y-1.5 pl-3">
              <li>
                <span className="font-mono text-[0.72rem]">HF (0.15–0.4 Hz)</span> — Potência na faixa
                respiratória. Marcador direto do tônus parassimpático/vagal. Requer dados beat-to-beat.
              </li>
              <li>
                <span className="font-mono text-[0.72rem]">LF (0.04–0.15 Hz)</span> — Potência na faixa
                barorreflexa. Reflete atividade simpática + parassimpática. Requer dados beat-to-beat.
              </li>
              <li>
                <span className="font-mono text-[0.72rem]">Razão LF/HF</span> — Proxy do balanço
                simpato-parassimpático. Valores altos sugerem dominância simpática. Requer dados
                beat-to-beat. Nota: o ABI (gráfico acima) é um proxy simplificado deste conceito.
              </li>
            </ul>
          </div>
          <p className="border-t border-slate-100 pt-2 text-[0.72rem] text-slate-400">
            O Apple Watch mede SDNN usando o sensor óptico (PPG) em janela ultra-curta (~1 min),
            subestimado em relação às normas ECG de 5 min / 24 h (Malik et al., Eur Heart J 1996;
            Shaffer &amp; Ginsberg, Front Public Health 2017). Por isso este chart não classifica
            em Bom/Ruim — mostra apenas a tua tendência pessoal ao longo do tempo.
          </p>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap gap-4 text-[0.68rem]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm bg-slate-400 opacity-30" />
          <span className="text-slate-500">Envelope SD 7d</span>
        </div>
      </div>
    </div>
  )
}
