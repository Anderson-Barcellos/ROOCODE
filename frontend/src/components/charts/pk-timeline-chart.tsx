import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import type { DoseRecord } from '@/lib/api'
import type { MedicationRegimenEntry } from '@/types/pharmacology'
import {
  buildPKMedication,
  calculateConcentration,
  DEFAULT_PK_BODY_WEIGHT_KG,
  type PKDose,
  type PKMedication,
} from '@/utils/pharmacokinetics'
import { getSubstanceColor } from '@/lib/substance-colors'

import { CHART_TOKENS } from './shared/chart-tokens'
import { ChartTooltip } from '@/components/charts/shared/ChartTooltip'
import type { PanoramaBrushRange } from './panorama-composite-chart'

/**
 * Timeline horária das concentrações PK em % de janela terapêutica.
 * Aproveita PK_PRESETS via buildPKMedication — não duplica modelo.
 *
 * Eixo X em horas/dias; eixo Y em % do teto terapêutico (0–100). Substâncias
 * sem therapeuticRange não aparecem (não há escala comparável).
 *
 * brushRange sincronizado: quando ausente, mostra últimas 48h + 6h pra frente.
 * Quando definido, usa a janela diária do brush (00:00 do startDate até 23:59
 * do endDate, mas limitado a 7 dias).
 */

interface PKTimelineChartProps {
  regimen: MedicationRegimenEntry[]
  doses: DoseRecord[]
  brushRange: PanoramaBrushRange | null
  weightKg?: number
}

interface TimelinePoint {
  timestamp: number
  label: string
  [substanceKey: string]: number | string | null
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const DEFAULT_WINDOW_HOURS_PAST = 48
const DEFAULT_WINDOW_HOURS_FUTURE = 6
const MAX_BRUSH_WINDOW_DAYS = 7
const STEP_MINUTES = 30

interface MedBundle {
  med: PKMedication
  pkDoses: PKDose[]
  color: string
}

function buildMedBundles(
  regimen: MedicationRegimenEntry[],
  doses: DoseRecord[],
): MedBundle[] {
  const seen = new Set<string>()
  const bundles: MedBundle[] = []
  for (const entry of regimen) {
    if (seen.has(entry.substance)) continue
    seen.add(entry.substance)
    const med = buildPKMedication(entry.substance)
    if (!med || !med.therapeuticRange) continue
    const pkDoses: PKDose[] = doses
      .filter((d) => d.substance === entry.substance)
      .map((d) => ({
        medicationId: med.id,
        timestamp: new Date(d.taken_at).getTime(),
        doseAmount: d.dose_mg,
      }))
    bundles.push({ med, pkDoses, color: getSubstanceColor(entry.substance) })
  }
  return bundles
}

function computeWindow(brushRange: PanoramaBrushRange | null, now: number): { start: number; end: number } {
  if (!brushRange) {
    return {
      start: now - DEFAULT_WINDOW_HOURS_PAST * HOUR_MS,
      end: now + DEFAULT_WINDOW_HOURS_FUTURE * HOUR_MS,
    }
  }
  const start = new Date(`${brushRange.startDate}T00:00:00`).getTime()
  let end = new Date(`${brushRange.endDate}T23:59:59`).getTime()
  const maxEnd = start + MAX_BRUSH_WINDOW_DAYS * DAY_MS
  if (end > maxEnd) end = maxEnd
  return { start, end }
}

function buildTimelineRows(bundles: MedBundle[], windowStart: number, windowEnd: number, weightKg: number): TimelinePoint[] {
  const stepMs = STEP_MINUTES * 60 * 1000
  const totalSteps = Math.max(1, Math.floor((windowEnd - windowStart) / stepMs))
  const rows: TimelinePoint[] = []
  for (let i = 0; i <= totalSteps; i += 1) {
    const t = windowStart + i * stepMs
    const row: TimelinePoint = {
      timestamp: t,
      label: format(new Date(t), 'dd/MM HH:mm', { locale: ptBR }),
    }
    for (const bundle of bundles) {
      const conc = calculateConcentration(bundle.med, bundle.pkDoses, t, weightKg)
      const range = bundle.med.therapeuticRange
      if (!range) {
        row[bundle.med.id] = null
        continue
      }
      const denom = range.max > 0 ? range.max : 1
      const pct = (conc / denom) * 100
      row[bundle.med.id] = Number.isFinite(pct) ? Math.max(0, pct) : null
    }
    rows.push(row)
  }
  return rows
}

interface DoseMarkersProps {
  doses: DoseRecord[]
  bundles: MedBundle[]
  windowStart: number
  windowEnd: number
  // Recharts inject via Customized
  xAxisMap?: Record<string, { scale: (v: number) => number }>
  yAxisMap?: Record<string, { y: number; height: number }>
}

function DoseMarkers({ doses, bundles, windowStart, windowEnd, xAxisMap, yAxisMap }: DoseMarkersProps) {
  if (!xAxisMap || !yAxisMap) return null
  const xKey = Object.keys(xAxisMap)[0]
  const yKey = Object.keys(yAxisMap)[0]
  const xAxis = xAxisMap[xKey]
  const yAxis = yAxisMap[yKey]
  if (!xAxis || !yAxis) return null
  const colorByKey = new Map(bundles.map((b) => [b.med.id, b.color]))
  return (
    <g>
      {doses.map((d) => {
        const ts = new Date(d.taken_at).getTime()
        if (ts < windowStart || ts > windowEnd) return null
        const color = colorByKey.get(d.substance)
        if (!color) return null
        const x = xAxis.scale(ts)
        return (
          <line
            key={`${d.id}-${ts}`}
            x1={x}
            x2={x}
            y1={yAxis.y}
            y2={yAxis.y + yAxis.height}
            stroke={color}
            strokeOpacity={0.4}
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        )
      })}
    </g>
  )
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.08)',
  fontSize: 12,
  background: 'white',
  boxShadow: '0 18px 42px rgba(17,35,30,0.12)',
  padding: '8px 12px',
}

export function PKTimelineChart({
  regimen,
  doses,
  brushRange,
  weightKg = DEFAULT_PK_BODY_WEIGHT_KG,
}: PKTimelineChartProps) {
  const bundles = useMemo(() => buildMedBundles(regimen, doses), [regimen, doses])
  const [now] = useState<number>(() => Date.now())
  const { start, end } = useMemo(
    () => computeWindow(brushRange, now),
    [brushRange, now],
  )
  const rows = useMemo(
    () => buildTimelineRows(bundles, start, end, weightKg),
    [bundles, start, end, weightKg],
  )

  if (!bundles.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
        Sem substâncias com faixa terapêutica no regime atual.
      </div>
    )
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Farmacocinética · timeline
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
            Concentração relativa por substância
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Eixo Y em % do teto terapêutico (0–100 = faixa válida). Linhas verticais leves marcam horários de doses registradas.
            {brushRange
              ? ' Janela ajustada pelo brush do chart principal.'
              : ' Janela padrão: últimas 48h + 6h pra frente.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bundles.map((b) => (
            <span
              key={b.med.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
              {b.med.name}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[280px] w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={{ width: 1, height: 1 }}
        >
          <ComposedChart data={rows} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={CHART_TOKENS.ui.grid} vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={[start, end]}
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(v: number) => format(new Date(v), 'dd/MM HH:mm', { locale: ptBR })}
            />
            <YAxis
              tick={{ fill: CHART_TOKENS.ui.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
              domain={[0, 150]}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <ChartTooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(label) =>
                typeof label === 'number' ? format(new Date(label), "dd/MM 'às' HH:mm", { locale: ptBR }) : String(label)
              }
              formatter={(value, name) => {
                if (typeof value !== 'number') return ['—', String(name)]
                const bundle = bundles.find((b) => b.med.id === name)
                return [`${value.toFixed(0)}% do teto`, bundle?.med.name ?? String(name)]
              }}
            />
            <ReferenceArea
              y1={20}
              y2={100}
              fill={CHART_TOKENS.fill.optimal}
              stroke="none"
              label={{ value: 'faixa terapêutica', position: 'insideTopLeft', fontSize: 10, fill: CHART_TOKENS.reference.optimalText }}
            />
            <ReferenceLine
              y={0}
              stroke={CHART_TOKENS.reference.attentionText}
              strokeDasharray="2 4"
              strokeWidth={1}
              label={{ value: 'mínimo', position: 'insideBottomRight', fontSize: 10, fill: CHART_TOKENS.reference.attentionText }}
            />
            <ReferenceLine
              y={100}
              stroke={CHART_TOKENS.reference.criticalText}
              strokeDasharray="2 4"
              strokeWidth={1}
              label={{ value: 'teto', position: 'insideTopRight', fontSize: 10, fill: CHART_TOKENS.reference.criticalText }}
            />
            {bundles.map((b) => (
              <Line
                key={b.med.id}
                type="monotone"
                dataKey={b.med.id}
                stroke={b.color}
                strokeWidth={1.8}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            <Customized
              component={(props: unknown) => (
                <DoseMarkers
                  doses={doses}
                  bundles={bundles}
                  windowStart={start}
                  windowEnd={end}
                  {...(props as { xAxisMap?: DoseMarkersProps['xAxisMap']; yAxisMap?: DoseMarkersProps['yAxisMap'] })}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
