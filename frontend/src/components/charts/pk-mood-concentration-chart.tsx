import { useCallback, useEffect, useMemo, useState } from 'react'
import { interpolateRgbBasis } from 'd3'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySnapshot } from '@/types/apple-health'
import { FULL_HISTORY_DOSE_HOURS, useConcentrationSeries, useDoses, useRegimen } from '@/lib/api'
import type { DoseRecord } from '@/lib/api'
import {
  PK_PRESETS,
  calculateConcentration,
  findPresetKey,
  DEFAULT_PK_BODY_WEIGHT_KG,
  type PKMedication,
  type PKDose,
} from '@/utils/pharmacokinetics'
import {
  computeCoverageStatus,
  type CoverageClass,
  type CoverageStatus,
} from '@/utils/pk-coverage'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'
import { sma } from '@/utils/statistics'
import { ChartBrushOverlay, type BrushIndexSelection } from '@/components/charts/shared/useChartBrush'

// SUBSTANCE_COLORS é chaveado por id de backend; presets usam nome genérico.
const PRESET_TO_COLOR_ID: Record<string, string> = {
  escitalopram: 'lexapro',
  lisdexamfetamine: 'venvanse',
  lamotrigine: 'lamictal',
  clonazepam: 'clonazepam',
}

const CLASS_BADGE: Record<CoverageClass, { short: string; color: string; bg: string }> = {
  adequada: { short: 'Em faixa', color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
  queda: { short: 'Em queda', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  vulnerabilidade: { short: 'Subterapêutico', color: '#be123c', bg: 'rgba(244,63,94,0.12)' },
  acima_faixa: { short: 'Acima da faixa', color: '#dc2626', bg: 'rgba(239,68,68,0.12)' },
  cobertura_incompleta: { short: 'Cobertura incompleta', color: '#a21caf', bg: 'rgba(217,70,239,0.12)' },
  sem_faixa: { short: 'Sem faixa', color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
}

const SMA_OPTIONS = [
  { value: 5, label: '5d' },
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
]

const CONC_SMA_OPTIONS = [
  { value: 3, label: '3d' },
  { value: 5, label: '5d' },
  { value: 7, label: '7d' },
]

const CHART_HEIGHT = 290
const BRUSH_HEIGHT = 30
const PLOT_MARGIN_LEFT = 38
const PLOT_MARGIN_RIGHT = 48
const SURFACE_CLASS =
  'rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)] backdrop-blur'
const KICKER_CLASS =
  'inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]'
const PANEL_CLASS = 'rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-3'

const interpolateMood = interpolateRgbBasis(['#b91c1c', '#fbbf24', '#15803d'])
function moodColor(valence: number): string {
  return interpolateMood(Math.max(0, Math.min(1, (valence + 1) / 2)))
}

function fmtConc(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function dayLabel(dateIso: string): string {
  return format(parseISO(dateIso), 'd MMM', { locale: ptBR })
}

interface Props {
  snapshots: DailySnapshot[]
  forecastStartDate?: string
  weightKg?: number
}

interface Row {
  date: string
  label: string
  valence: number | null
  valenceClass: string | null
  color: string
  interpolated: boolean
  forecasted: boolean
  forecastConfidence: number | null
  trend: number | null
  conc: number | null
  concTrend: number | null
}

interface TrackedMed {
  presetKey: string
  label: string
  color: string
  status: CoverageStatus | null
}

const MOOD_KEY = 'mood'

function presetMedication(presetKey: string): PKMedication {
  return { id: presetKey, ...PK_PRESETS[presetKey] }
}

function dosesForPreset(records: DoseRecord[], presetKey: string): PKDose[] {
  return records
    .filter((r) => findPresetKey(r.substance) === presetKey)
    .map((r) => ({ medicationId: presetKey, timestamp: new Date(r.taken_at).getTime(), doseAmount: r.dose_mg }))
}

function ValenceDot(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload || payload.valence == null) return null
  if (payload.forecasted) {
    return <circle cx={cx} cy={cy} r={4} fill="white" stroke={payload.color} strokeWidth={1.5} strokeDasharray="1.5 1" opacity={0.55} />
  }
  if (payload.interpolated) {
    return <circle cx={cx} cy={cy} r={4} fill="white" stroke={payload.color} strokeWidth={1.5} strokeDasharray="2 1.5" />
  }
  return <circle cx={cx} cy={cy} r={4} fill={payload.color} stroke="white" strokeWidth={1.5} />
}

export function PKMoodConcentrationChart({ snapshots, forecastStartDate, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: allDoses = [] } = useDoses(FULL_HISTORY_DOSE_HOURS)
  const { data: regimen = [] } = useRegimen()
  const [smaWindow, setSmaWindow] = useState(7)
  const [concSmaWindow, setConcSmaWindow] = useState(5)
  const [selectedKey, setSelectedKey] = useState<string>(MOOD_KEY)
  const [selection, setSelection] = useState<BrushIndexSelection>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [nowTimestamp] = useState(() => Date.now())

  const statusByKey = useMemo(() => {
    const statuses = computeCoverageStatus(allDoses, regimen, { now: nowTimestamp, bodyWeightKg: weightKg })
    const map = new Map<string, CoverageStatus>()
    for (const s of statuses) map.set(s.presetKey, s)
    return map
  }, [allDoses, regimen, nowTimestamp, weightKg])

  // Escopo: regime ativo ∪ clonazepam-quando-dosado.
  const trackedMeds = useMemo<TrackedMed[]>(() => {
    const keys: string[] = []
    const seen = new Set<string>()
    for (const entry of regimen) {
      if (!entry.active) continue
      const key = findPresetKey(entry.substance)
      if (key && PK_PRESETS[key] && !seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
    if (allDoses.some((d) => findPresetKey(d.substance) === 'clonazepam') && !seen.has('clonazepam')) {
      keys.push('clonazepam')
    }
    return keys.map((presetKey) => ({
      presetKey,
      label: PK_PRESETS[presetKey].brandName ?? PK_PRESETS[presetKey].name,
      color: SUBSTANCE_COLORS[PRESET_TO_COLOR_ID[presetKey] ?? ''] ?? '#8b5cf6',
      status: statusByKey.get(presetKey) ?? null,
    }))
  }, [regimen, allDoses, statusByKey])

  const activeKey = selectedKey !== MOOD_KEY && !trackedMeds.some((m) => m.presetKey === selectedKey)
    ? MOOD_KEY
    : selectedKey
  const isMoodMode = activeKey === MOOD_KEY
  const activeMed = isMoodMode ? null : trackedMeds.find((m) => m.presetKey === activeKey) ?? null
  const activeStatus = activeMed?.status ?? null
  const activeColor = activeMed?.color ?? 'var(--foreground)'
  const activeSubstanceId = !isMoodMode ? PRESET_TO_COLOR_ID[activeKey] ?? null : null
  const seriesFrom = snapshots[0]?.date ?? ''
  const seriesTo = snapshots[snapshots.length - 1]?.date ?? ''

  const { data: backendConcentrationSeries } = useConcentrationSeries(activeSubstanceId, seriesFrom, seriesTo, weightKg)
  const forecastLabel = useMemo(() => {
    if (!forecastStartDate) return null
    return dayLabel(forecastStartDate)
  }, [forecastStartDate])

  const allRows = useMemo<Row[]>(() => {
    const med = isMoodMode ? null : presetMedication(activeKey)
    const doses = med ? dosesForPreset(allDoses, activeKey) : []
    const backendConcByDate = new Map<string, number>()
    if (!isMoodMode && backendConcentrationSeries?.series?.length) {
      for (const point of backendConcentrationSeries.series) {
        if (Number.isFinite(point.cmax_est)) {
          backendConcByDate.set(point.date, point.cmax_est)
        }
      }
    }
    const rawValence = snapshots.map((s) => s.mood?.valence ?? null)
    const trend = sma(rawValence, smaWindow)
    const rawConc = snapshots.map((snap) => {
      if (!med) return null
      const backendConc = backendConcByDate.get(snap.date)
      if (backendConc != null) return backendConc
      const eod = new Date(`${snap.date}T23:59:59`).getTime()
      if (!Number.isFinite(eod)) return null
      return calculateConcentration(med, doses, eod, weightKg)
    })
    const concTrend = sma(rawConc, concSmaWindow)

    return snapshots.map((snap, i) => {
      const valence = snap.mood?.valence ?? null
      return {
        date: snap.date,
        label: dayLabel(snap.date),
        valence,
        valenceClass: snap.mood?.valenceClass ?? null,
        color: valence != null ? moodColor(valence) : 'var(--chart-series-forecast)',
        interpolated: !snap.forecasted && (snap.interpolated === true || snap.mood?.interpolated === true),
        forecasted: snap.forecasted === true,
        forecastConfidence: snap.forecastConfidence ?? null,
        trend: trend[i],
        conc: rawConc[i],
        concTrend: concTrend[i],
      }
    })
  }, [isMoodMode, activeKey, allDoses, backendConcentrationSeries, snapshots, smaWindow, concSmaWindow, weightKg])

  const visibleRows = useMemo(() => {
    if (!selection) return allRows
    const [i0, i1] = selection
    return allRows.slice(i0, i1 + 1)
  }, [allRows, selection])

  const handleBrushChange = useCallback((sel: BrushIndexSelection) => setSelection(sel), [])
  useEffect(() => () => setContainerWidth(0), [])

  const range = useMemo(() => {
    if (isMoodMode || !activeStatus || activeStatus.klass === 'sem_faixa') return null
    return { min: activeStatus.therapeuticMin, max: activeStatus.therapeuticMax, unit: activeStatus.unit }
  }, [isMoodMode, activeStatus])

  const concTop = useMemo(() => {
    if (isMoodMode) return 1
    let maxConc = 0
    for (const r of visibleRows) if (r.conc != null && r.conc > maxConc) maxConc = r.conc
    return range ? Math.max(maxConc * 1.12, range.max * 1.18, 1) : Math.max(maxConc * 1.15, 1)
  }, [isMoodMode, visibleRows, range])

  const totalDays = allRows.length
  const daysWithMood = allRows.filter((r) => r.valence != null).length
  const coveragePct = totalDays > 0 ? Math.round((daysWithMood / totalDays) * 100) : 0

  const moodVerdict = useMemo(() => {
    const valid = allRows.filter((p) => p.valence != null).map((p) => p.valence as number)
    if (valid.length < 8) return null
    const last7 = valid.slice(-7)
    const prev7 = valid.slice(-14, -7)
    if (!last7.length || !prev7.length) return null
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
    const delta = mean(last7) - mean(prev7)
    const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(2).replace('.', ',')}`
    if (delta <= -0.2) return { text: `Humor médio em queda na última semana (Δ ${deltaText} vs semana anterior). Vale revisar sono, estresse e cobertura medicamentosa recente.`, tone: 'watch' as const }
    if (delta >= 0.2) return { text: `Humor médio melhorando na última semana (Δ ${deltaText} vs semana anterior). Tendência favorável.`, tone: 'good' as const }
    return { text: `Humor médio estável na última semana (Δ ${deltaText} vs semana anterior).`, tone: 'neutral' as const }
  }, [allRows])

  const verdictClass =
    moodVerdict?.tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : moodVerdict?.tone === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'

  const hasMood = allRows.some((r) => r.valence != null)
  const badge = activeStatus ? CLASS_BADGE[activeStatus.klass] : null

  return (
    <div className={SURFACE_CLASS}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={KICKER_CLASS}>
            Linha do tempo · Humor & medicação
          </span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">
            {isMoodMode ? 'Humor dia a dia' : `Humor × ${activeMed?.label}`}
          </h3>
          {isMoodMode ? (
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {daysWithMood} dias com registro em {totalDays} — {coveragePct}% de cobertura · escala −1 a +1.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
              Humor à esquerda (−1 a +1), concentração estimada de {activeMed?.label} à direita
              {range ? ` (escala real · faixa ${fmtConc(range.min)}–${fmtConc(range.max)} ${range.unit} sombreada)` : ' (escala real · sem faixa de referência)'}. 
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Seletor: Humor + drogas (com pontinho de status) */}
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => { setSelectedKey(MOOD_KEY); setSelection(null) }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                isMoodMode
                  ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                  : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
              }`}
              aria-pressed={isMoodMode}
            >
              Humor
            </button>
            {trackedMeds.map((med) => {
              const active = med.presetKey === activeKey
              const dotColor = med.status ? CLASS_BADGE[med.status.klass].color : '#cbd5e1'
              return (
                <button
                  key={med.presetKey}
                  type="button"
                  onClick={() => { setSelectedKey(med.presetKey); setSelection(null) }}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)] shadow-sm'
                      : 'border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--muted)]'
                  }`}
                  aria-pressed={active}
                  title={med.status ? CLASS_BADGE[med.status.klass].short : undefined}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
                  {med.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-[color:var(--muted)]">Tendência</span>
            {SMA_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSmaWindow(opt.value)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  smaWindow === opt.value
                    ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                    : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {moodVerdict && (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
          <span className="font-semibold">Veredito do humor:</span> {moodVerdict.text}
        </p>
      )}

      {!isMoodMode && activeStatus && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs">
          {badge && activeStatus.klass !== 'sem_faixa' ? (
            <span className="rounded-full border px-2 py-0.5 font-semibold" style={{ color: badge.color, background: badge.bg, borderColor: `${badge.color}33` }}>
              {badge.short}
            </span>
          ) : (
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-2 py-0.5 font-semibold text-[color:var(--muted)]">sem faixa</span>
          )}
          <span className="font-mono font-semibold text-[color:var(--foreground)]">{fmtConc(activeStatus.concentrationNow)} {activeStatus.unit}</span>
          {activeStatus.trendPctPerDay != null && (
            <span
              className="font-mono"
              style={{ color: activeStatus.klass === 'acima_faixa' ? '#dc2626' : activeStatus.trendPctPerDay < -5 ? '#b45309' : activeStatus.trendPctPerDay > 5 ? '#15803d' : '#64748b' }}
            >
              {activeStatus.trendPctPerDay >= 0 ? '+' : ''}{activeStatus.trendPctPerDay.toFixed(0)}%/24h
            </span>
          )}
          <span className="text-[color:var(--muted)]">
            {activeStatus.expectedDosesLast48h > 0
              ? `48h: ${activeStatus.loggedDosesLast48h}/${activeStatus.expectedDosesLast48h} doses`
              : activeStatus.loggedDosesLast48h > 0
                ? `48h: ${activeStatus.loggedDosesLast48h} dose${activeStatus.loggedDosesLast48h > 1 ? 's' : ''} (sob demanda)`
                : '48h: sem dose'}
          </span>
          {activeStatus.missedDoses > 0 && (
            <span className="text-fuchsia-700">{activeStatus.missedDoses} não registrada(s)</span>
          )}
          {activeStatus.hoursUntilBelowMin != null && activeStatus.klass !== 'vulnerabilidade' && (
            <span className="text-amber-700">cobre ~{activeStatus.hoursUntilBelowMin}h</span>
          )}
          {backendConcentrationSeries?.source === 'regimen_fallback' && (
            <span className="text-[color:var(--muted)]">curva: fallback do regime</span>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <section className={PANEL_CLASS}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Janela 1</p>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">Humor diário (sem overlay de concentração)</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-[color:var(--muted)]">MM humor</span>
              {SMA_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSmaWindow(opt.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    smaWindow === opt.value
                      ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                      : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {hasMood ? (
            <div className="relative" style={{ height: CHART_HEIGHT - 40 }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
                initialDimension={{ width: 1, height: 1 }}
                onResize={(width) => setContainerWidth(width)}
              >
                <ComposedChart data={visibleRows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-ui-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--chart-ui-axis)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="mood"
                    domain={[-1, 1]}
                    ticks={[-1, -0.5, 0, 0.5, 1]}
                    tick={{ fill: 'var(--chart-ui-axis)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    tickFormatter={(v: number) => (v === -1 ? '-1' : v === 0 ? '0' : v === 1 ? '+1' : v.toFixed(1))}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 14, border: '1px solid var(--chart-ui-border)', fontSize: 12, background: 'var(--chart-ui-card-bg)' }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as Row | undefined
                      if (!p) return null
                      return (
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[color:var(--foreground)]">{p.label}</p>
                          {p.valence != null ? (
                            <>
                              <p className="text-[color:var(--muted)]">{p.valenceClass ?? '—'}</p>
                              <p className="font-mono text-[color:var(--muted)]">Humor: {p.valence > 0 ? '+' : ''}{p.valence.toFixed(2)}</p>
                            </>
                          ) : (
                            <p className="text-[color:var(--muted)]">Sem humor</p>
                          )}
                          {p.forecasted && (
                            <p className="mt-1 border-t border-[color:var(--border)] pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-violet-700">🔮 projetado{p.forecastConfidence != null ? ` · conf ${p.forecastConfidence.toFixed(2)}` : ''}</p>
                          )}
                          {p.interpolated && !p.forecasted && (
                            <p className="mt-1 border-t border-[color:var(--border)] pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-amber-700">⚠ estimado</p>
                          )}
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine yAxisId="mood" y={0} stroke="var(--chart-reference-mean)" strokeDasharray="4 3" />
                  {forecastLabel && (
                    <ReferenceLine yAxisId="mood" x={forecastLabel} stroke="var(--accent-violet)" strokeDasharray="4 3" strokeWidth={1.5} />
                  )}
                  <Line
                    yAxisId="mood"
                    dataKey="trend"
                    type="monotone"
                    stroke="var(--foreground)"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                    activeDot={false}
                  />
                  <Line
                    yAxisId="mood"
                    dataKey="valence"
                    type="monotone"
                    stroke="transparent"
                    strokeWidth={0}
                    dot={(dotProps) => <ValenceDot {...dotProps} payload={dotProps.payload as Row} />}
                    activeDot={false}
                    connectNulls={false}
                    legendType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">Sem registros de humor na janela atual.</p>
          )}
        </section>

        <section className={PANEL_CLASS}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Janela 2</p>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                {isMoodMode ? 'Concentração farmacológica' : `${activeMed?.label} · concentração (escala real)`}
              </p>
              <p className="text-xs text-[color:var(--muted)]">
                {isMoodMode
                  ? 'Selecione uma medicação para abrir a janela interativa de concentração.'
                  : range
                    ? `Escala real com faixa terapêutica ${fmtConc(range.min)}–${fmtConc(range.max)} ${range.unit}.`
                    : 'Escala real sem faixa terapêutica definida para esta substância.'}
              </p>
              {!isMoodMode && backendConcentrationSeries?.source === 'regimen_fallback' && (
                <p className="text-xs text-[color:var(--muted)]">Fonte de concentração: fallback do regime (sem dose log suficiente na janela).</p>
              )}
            </div>
            {!isMoodMode && (
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs text-[color:var(--muted)]">MM concentração</span>
                {CONC_SMA_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConcSmaWindow(opt.value)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      concSmaWindow === opt.value
                        ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                        : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isMoodMode ? (
            <p className="text-sm text-[color:var(--muted)]">Use os botões de substância acima para trocar da visão de Humor para uma janela de concentração dedicada.</p>
          ) : (
            <div className="relative" style={{ height: CHART_HEIGHT - 40 }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
                initialDimension={{ width: 1, height: 1 }}
                onResize={(width) => setContainerWidth(width)}
              >
                <ComposedChart data={visibleRows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-ui-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--chart-ui-axis)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="conc"
                    domain={[0, concTop]}
                    tick={{ fill: activeColor, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v: number) => fmtConc(v)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 14, border: '1px solid var(--chart-ui-border)', fontSize: 12, background: 'var(--chart-ui-card-bg)' }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as Row | undefined
                      if (!p) return null
                      return (
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[color:var(--foreground)]">{p.label}</p>
                          {p.conc != null ? (
                            <p className="font-mono" style={{ color: activeColor }}>
                              {activeMed?.label}: {fmtConc(p.conc)} {range?.unit ?? 'ng/mL'}
                            </p>
                          ) : (
                            <p className="text-[color:var(--muted)]">Sem concentração calculável</p>
                          )}
                          {p.concTrend != null && (
                            <p className="font-mono text-[color:var(--muted)]">MM {concSmaWindow}d: {fmtConc(p.concTrend)} {range?.unit ?? 'ng/mL'}</p>
                          )}
                          {p.forecasted && (
                            <p className="mt-1 border-t border-[color:var(--border)] pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-violet-700">🔮 projetado{p.forecastConfidence != null ? ` · conf ${p.forecastConfidence.toFixed(2)}` : ''}</p>
                          )}
                          {p.interpolated && !p.forecasted && (
                            <p className="mt-1 border-t border-[color:var(--border)] pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-amber-700">⚠ estimado</p>
                          )}
                        </div>
                      )
                    }}
                  />
                  {range && (
                    <ReferenceArea yAxisId="conc" y1={range.min} y2={range.max} ifOverflow="extendDomain" fill={activeColor} fillOpacity={0.07} strokeOpacity={0} />
                  )}
                  {forecastLabel && (
                    <ReferenceLine yAxisId="conc" x={forecastLabel} stroke="var(--accent-violet)" strokeDasharray="4 3" strokeWidth={1.5} />
                  )}
                  <Area
                    yAxisId="conc"
                    type="monotone"
                    dataKey="conc"
                    stroke={activeColor}
                    strokeWidth={2}
                    fill={activeColor}
                    fillOpacity={0.1}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                  />
                  <Line
                    yAxisId="conc"
                    dataKey="concTrend"
                    type="monotone"
                    stroke="var(--foreground)"
                    strokeDasharray="5 3"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    activeDot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <div className="relative" style={{ height: BRUSH_HEIGHT }}>
          <ChartBrushOverlay
            width={containerWidth}
            height={BRUSH_HEIGHT}
            marginLeft={PLOT_MARGIN_LEFT}
            marginRight={PLOT_MARGIN_RIGHT}
            dataLength={allRows.length}
            selection={selection}
            onChange={handleBrushChange}
            position="top"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--muted)]">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-rose-700" /> Desagradável</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Neutro</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-green-700" /> Agradável</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-6 rounded-full bg-[color:var(--foreground)]" /> Humor (média {smaWindow}d)</span>
          {!isMoodMode && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: activeColor }} /> {activeMed?.label} (concentração)</span>
          )}
          {!isMoodMode && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-6 rounded-full bg-[color:var(--foreground)]" /> Concentração MM {concSmaWindow}d</span>
          )}
          {selection && (
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-2.5 py-1 font-semibold text-[color:var(--muted)] hover:bg-[color:var(--card)]"
            >
              Limpar zoom
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
