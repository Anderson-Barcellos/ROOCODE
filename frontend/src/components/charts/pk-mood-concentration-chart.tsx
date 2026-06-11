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
  ReferenceDot,
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
  sem_faixa: { short: 'Sem faixa ref.', color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
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
const COVERAGE_CARD_CLASS =
  'relative flex min-h-[172px] flex-col justify-between overflow-hidden rounded-xl border p-3 text-left transition duration-150'

const interpolateMood = interpolateRgbBasis(['#b91c1c', '#fbbf24', '#15803d'])

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
  concMin: number | null
  concMax: number | null
  concAuc: number | null
  concBand: [number, number] | null
  concTrend: number | null
  doseCount: number
  doseTotalMg: number
  doseTimes: string[]
}

interface TrackedMed {
  presetKey: string
  label: string
  color: string
  status: CoverageStatus | null
}

interface DoseDaySummary {
  count: number
  totalMg: number
  times: string[]
}

interface DailyConcentrationMetrics {
  min: number
  max: number
  auc: number
}

function moodColor(valence: number): string {
  return interpolateMood(Math.max(0, Math.min(1, (valence + 1) / 2)))
}

function fmtConc(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return value.toFixed(0)
  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function dayLabel(dateIso: string): string {
  return format(parseISO(dateIso), 'd MMM', { locale: ptBR })
}

function presetMedication(presetKey: string): PKMedication {
  return { id: presetKey, ...PK_PRESETS[presetKey] }
}

function dosesForPreset(records: DoseRecord[], presetKey: string): PKDose[] {
  return records
    .filter((record) => findPresetKey(record.substance) === presetKey)
    .map((record) => ({
      medicationId: presetKey,
      timestamp: new Date(record.taken_at).getTime(),
      doseAmount: record.dose_mg,
    }))
}

function coverageSeverity(klass: CoverageClass): number {
  switch (klass) {
    case 'vulnerabilidade':
      return 0
    case 'acima_faixa':
      return 1
    case 'cobertura_incompleta':
      return 2
    case 'queda':
      return 3
    case 'adequada':
      return 4
    case 'sem_faixa':
    default:
      return 5
  }
}

function formatDoseWindow(status: CoverageStatus): string {
  if (status.expectedDosesLast48h > 0) {
    return `48h ${status.loggedDosesLast48h}/${status.expectedDosesLast48h} doses`
  }
  if (status.loggedDosesLast48h > 0) {
    return `48h ${status.loggedDosesLast48h} dose${status.loggedDosesLast48h > 1 ? 's' : ''} PRN`
  }
  return '48h sem dose'
}

function formatCoverageCue(status: CoverageStatus): string {
  if (status.klass === 'vulnerabilidade') return 'abaixo do piso terapêutico'
  if (status.klass === 'acima_faixa') return 'acima do teto terapêutico'
  if (status.klass === 'cobertura_incompleta') return 'há lacuna entre regime e log'
  if (status.hoursUntilBelowMin != null) {
    return `cobre ~${status.hoursUntilBelowMin}h`
  }
  if (status.trendPctPerDay != null) {
    return `${status.trendPctPerDay >= 0 ? '+' : ''}${status.trendPctPerDay.toFixed(0)}%/24h`
  }
  if (status.klass === 'sem_faixa') return 'sem faixa terapêutica formal'
  return 'sem alerta imediato'
}

function buildDailyDoseSummary(records: DoseRecord[], presetKey: string | null): Map<string, DoseDaySummary> {
  const summaryByDate = new Map<string, DoseDaySummary>()
  if (!presetKey) return summaryByDate

  for (const record of records) {
    if (findPresetKey(record.substance) !== presetKey) continue
    try {
      const parsed = parseISO(record.taken_at)
      const dateKey = format(parsed, 'yyyy-MM-dd')
      const current = summaryByDate.get(dateKey) ?? { count: 0, totalMg: 0, times: [] }
      current.count += 1
      current.totalMg += record.dose_mg
      current.times.push(`${format(parsed, 'HH:mm')} · ${fmtConc(record.dose_mg)} mg`)
      summaryByDate.set(dateKey, current)
    } catch {
      // ignore malformed timestamps
    }
  }

  return summaryByDate
}

function estimateDailyConcentrationMetricsLocally(
  dateIso: string,
  med: PKMedication,
  doses: PKDose[],
  weightKg: number,
): DailyConcentrationMetrics | null {
  let min = Number.POSITIVE_INFINITY
  let max = 0
  let auc = 0

  for (let hour = 0; hour < 24; hour += 1) {
    const queryAt = Date.parse(`${dateIso}T${String(hour).padStart(2, '0')}:00:00Z`)
    if (!Number.isFinite(queryAt)) return null
    const concentration = calculateConcentration(med, doses, queryAt, weightKg)
    if (!Number.isFinite(concentration)) continue
    min = Math.min(min, concentration)
    max = Math.max(max, concentration)
    auc += concentration
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max, auc }
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

export function PKMoodConcentrationChart({
  snapshots,
  forecastStartDate,
  weightKg = DEFAULT_PK_BODY_WEIGHT_KG,
}: Props) {
  const { data: allDoses = [] } = useDoses(FULL_HISTORY_DOSE_HOURS)
  const { data: regimen = [] } = useRegimen()
  const [smaWindow, setSmaWindow] = useState(7)
  const [concSmaWindow, setConcSmaWindow] = useState(5)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selection, setSelection] = useState<BrushIndexSelection>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [nowTimestamp] = useState(() => Date.now())

  const statusByKey = useMemo(() => {
    const statuses = computeCoverageStatus(allDoses, regimen, {
      now: nowTimestamp,
      bodyWeightKg: weightKg,
    })
    const map = new Map<string, CoverageStatus>()
    for (const status of statuses) map.set(status.presetKey, status)
    return map
  }, [allDoses, regimen, nowTimestamp, weightKg])

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
    if (allDoses.some((dose) => findPresetKey(dose.substance) === 'clonazepam') && !seen.has('clonazepam')) {
      keys.push('clonazepam')
    }
    return keys.map((presetKey) => ({
      presetKey,
      label: PK_PRESETS[presetKey].brandName ?? PK_PRESETS[presetKey].name,
      color: SUBSTANCE_COLORS[PRESET_TO_COLOR_ID[presetKey] ?? ''] ?? 'var(--accent-violet)',
      status: statusByKey.get(presetKey) ?? null,
    }))
  }, [allDoses, regimen, statusByKey])

  const recommendedKey = useMemo(() => {
    if (trackedMeds.length === 0) return null
    return trackedMeds.reduce((bestKey, med) => {
      if (!bestKey) return med.presetKey
      const bestMed = trackedMeds.find((item) => item.presetKey === bestKey)
      if (!bestMed?.status) return med.presetKey
      if (!med.status) return bestKey
      return coverageSeverity(med.status.klass) < coverageSeverity(bestMed.status.klass)
        ? med.presetKey
        : bestKey
    }, trackedMeds[0]?.presetKey ?? null)
  }, [trackedMeds])

  const activeKey = useMemo(() => {
    if (selectedKey && trackedMeds.some((med) => med.presetKey === selectedKey)) return selectedKey
    return recommendedKey
  }, [selectedKey, trackedMeds, recommendedKey])

  const activeMed = useMemo(
    () => trackedMeds.find((med) => med.presetKey === activeKey) ?? null,
    [trackedMeds, activeKey],
  )
  const activeStatus = activeMed?.status ?? null
  const activeColor = activeMed?.color ?? 'var(--foreground)'
  const activeSubstanceId = activeKey ? PRESET_TO_COLOR_ID[activeKey] ?? null : null
  const seriesFrom = snapshots[0]?.date ?? ''
  const seriesTo = snapshots[snapshots.length - 1]?.date ?? ''

  const { data: backendConcentrationSeries } = useConcentrationSeries(
    activeSubstanceId,
    seriesFrom,
    seriesTo,
    weightKg,
  )

  const forecastLabel = useMemo(() => {
    if (!forecastStartDate) return null
    return dayLabel(forecastStartDate)
  }, [forecastStartDate])

  const activeDoseSummaryByDate = useMemo(
    () => buildDailyDoseSummary(allDoses, activeKey),
    [activeKey, allDoses],
  )

  const allRows = useMemo<Row[]>(() => {
    const med = activeKey ? presetMedication(activeKey) : null
    const doses = med && activeKey ? dosesForPreset(allDoses, activeKey) : []
    const backendByDate = new Map<string, DailyConcentrationMetrics>()
    if (backendConcentrationSeries?.series?.length) {
      for (const point of backendConcentrationSeries.series) {
        if (
          Number.isFinite(point.cmin_est) &&
          Number.isFinite(point.cmax_est) &&
          Number.isFinite(point.auc_est)
        ) {
          backendByDate.set(point.date, {
            min: point.cmin_est,
            max: point.cmax_est,
            auc: point.auc_est,
          })
        }
      }
    }

    const rawValence = snapshots.map((snapshot) => snapshot.mood?.valence ?? null)
    const trend = sma(rawValence, smaWindow)
    const concentrationMetrics = snapshots.map((snapshot) => {
      if (!med) return null
      const backendPoint = backendByDate.get(snapshot.date)
      if (backendPoint) return backendPoint
      return estimateDailyConcentrationMetricsLocally(snapshot.date, med, doses, weightKg)
    })
    const rawConcMax = concentrationMetrics.map((point) => point?.max ?? null)
    const concTrend = sma(rawConcMax, concSmaWindow)

    return snapshots.map((snapshot, index) => {
      const valence = snapshot.mood?.valence ?? null
      const metrics = concentrationMetrics[index]
      const doseSummary = activeDoseSummaryByDate.get(snapshot.date) ?? {
        count: 0,
        totalMg: 0,
        times: [],
      }
      return {
        date: snapshot.date,
        label: dayLabel(snapshot.date),
        valence,
        valenceClass: snapshot.mood?.valenceClass ?? null,
        color: valence != null ? moodColor(valence) : 'var(--chart-series-forecast)',
        interpolated:
          !snapshot.forecasted &&
          (snapshot.interpolated === true || snapshot.mood?.interpolated === true),
        forecasted: snapshot.forecasted === true,
        forecastConfidence: snapshot.forecastConfidence ?? null,
        trend: trend[index],
        concMin: metrics?.min ?? null,
        concMax: metrics?.max ?? null,
        concAuc: metrics?.auc ?? null,
        concBand: metrics ? [metrics.min, metrics.max] : null,
        concTrend: concTrend[index],
        doseCount: doseSummary.count,
        doseTotalMg: doseSummary.totalMg,
        doseTimes: doseSummary.times,
      }
    })
  }, [
    activeDoseSummaryByDate,
    activeKey,
    allDoses,
    backendConcentrationSeries,
    concSmaWindow,
    smaWindow,
    snapshots,
    weightKg,
  ])

  const visibleRows = useMemo(() => {
    if (!selection) return allRows
    const [startIndex, endIndex] = selection
    return allRows.slice(startIndex, endIndex + 1)
  }, [allRows, selection])

  const handleBrushChange = useCallback(
    (nextSelection: BrushIndexSelection) => setSelection(nextSelection),
    [],
  )

  useEffect(() => () => setContainerWidth(0), [])

  const range = useMemo(() => {
    if (!activeStatus || activeStatus.klass === 'sem_faixa') return null
    return {
      min: activeStatus.therapeuticMin,
      max: activeStatus.therapeuticMax,
      unit: activeStatus.unit,
    }
  }, [activeStatus])

  const concTop = useMemo(() => {
    let maxConc = 0
    for (const row of visibleRows) {
      if (row.concMax != null && row.concMax > maxConc) maxConc = row.concMax
    }
    return range ? Math.max(maxConc * 1.12, range.max * 1.18, 1) : Math.max(maxConc * 1.15, 1)
  }, [range, visibleRows])

  const doseMarkerLevel = useMemo(() => Math.max(concTop * 0.05, 1), [concTop])
  const doseMarkerRows = useMemo(
    () => visibleRows.filter((row) => row.doseCount > 0),
    [visibleRows],
  )
  const totalDays = allRows.length
  const daysWithMood = allRows.filter((row) => row.valence != null).length
  const coveragePct = totalDays > 0 ? Math.round((daysWithMood / totalDays) * 100) : 0
  const latestPkRow = useMemo(
    () => [...allRows].reverse().find((row) => row.concMax != null || row.concMin != null) ?? null,
    [allRows],
  )

  const moodVerdict = useMemo(() => {
    const valid = allRows.filter((point) => point.valence != null).map((point) => point.valence as number)
    if (valid.length < 8) return null
    const last7 = valid.slice(-7)
    const prev7 = valid.slice(-14, -7)
    if (!last7.length || !prev7.length) return null
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const delta = mean(last7) - mean(prev7)
    const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(2).replace('.', ',')}`
    if (delta <= -0.2) {
      return {
        text: `Humor médio em queda na última semana (Δ ${deltaText} vs semana anterior). Vale revisar sono, estresse e cobertura medicamentosa recente.`,
        tone: 'watch' as const,
      }
    }
    if (delta >= 0.2) {
      return {
        text: `Humor médio melhorando na última semana (Δ ${deltaText} vs semana anterior). Tendência favorável.`,
        tone: 'good' as const,
      }
    }
    return {
      text: `Humor médio estável na última semana (Δ ${deltaText} vs semana anterior).`,
      tone: 'neutral' as const,
    }
  }, [allRows])

  const verdictClass =
    moodVerdict?.tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : moodVerdict?.tone === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'

  const hasMood = allRows.some((row) => row.valence != null)
  const selectionDayCount = selection ? selection[1] - selection[0] + 1 : allRows.length

  return (
    <div className={SURFACE_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
        <div className="min-w-0">
          <span className={KICKER_CLASS}>Farmaco cockpit · cobertura & oscilação</span>
          <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">
            {activeMed ? `${activeMed.label} em foco` : 'Cobertura medicamentosa'}
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[color:var(--muted)]">
            {activeMed
              ? `O mapa de cobertura escolhe o foco. A Janela 1 deixa o humor como contexto; a Janela 2 mostra a oscilação diária de ${activeMed.label} com faixa terapêutica e doses registradas.`
              : 'Sem medicação rastreável no regime atual. O humor continua disponível, mas a janela farmacológica só abre quando houver uma substância ativa ou dose PRN registrada.'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px] sm:items-end">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs text-[color:var(--muted)] sm:text-right">
            <div className="font-semibold text-[color:var(--foreground)]">Janela sincronizada</div>
            <div>{selection ? `${selectionDayCount} dias no zoom` : `${allRows.length} dias no recorte atual`}</div>
            {activeMed && !selectedKey && recommendedKey === activeMed.presetKey && (
              <div>foco automático na prioridade clínica</div>
            )}
          </div>
          {selectedKey && recommendedKey && recommendedKey !== selectedKey && (
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-2.5 py-1 text-xs font-semibold text-[color:var(--muted)] transition hover:bg-[color:var(--card)]"
            >
              Voltar ao foco sugerido
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {trackedMeds.length > 0 ? (
          trackedMeds.map((med) => {
            const active = med.presetKey === activeKey
            const badge = med.status ? CLASS_BADGE[med.status.klass] : null
            const borderColor = active ? `${med.color}66` : 'var(--border)'
            return (
              <button
                key={med.presetKey}
                type="button"
                onClick={() => {
                  setSelectedKey(med.presetKey)
                  setSelection(null)
                }}
                className={COVERAGE_CARD_CLASS}
                style={{
                  borderColor,
                  background: active ? 'var(--card-strong)' : 'var(--card)',
                  boxShadow: active ? '0 10px 24px rgba(17,35,30,0.08)' : 'none',
                }}
                aria-pressed={active}
              >
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-1"
                  style={{ background: med.color, opacity: active ? 1 : 0.72 }}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: med.color }} />
                      <span className="truncate text-sm font-semibold text-[color:var(--foreground)]">{med.label}</span>
                    </div>
                    <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      Mapa de cobertura
                    </div>
                  </div>
                  {active && (
                    <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      Em foco
                    </span>
                  )}
                </div>

                {badge ? (
                  <div className="mt-3 inline-flex w-fit rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em]" style={{ color: badge.color, background: badge.bg, borderColor: `${badge.color}33` }}>
                    {badge.short}
                  </div>
                ) : (
                  <div className="mt-3 inline-flex w-fit rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    sem leitura
                  </div>
                )}

                {med.status ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="text-lg font-semibold text-[color:var(--foreground)]">
                      {fmtConc(med.status.concentrationNow)} {med.status.unit}
                    </div>
                    <div className="text-xs text-[color:var(--muted)]">{formatDoseWindow(med.status)}</div>
                    <div className="text-xs font-medium leading-5 text-[color:var(--foreground)]">
                      {formatCoverageCue(med.status)}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-5 text-[color:var(--muted)]">Sem dados suficientes para resumir esta substância.</p>
                )}
              </button>
            )
          })
        ) : (
          <div className="sm:col-span-2 xl:col-span-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-3 text-sm text-[color:var(--muted)]">
            Nenhuma medicação ativa no regime ou PRN recente para montar o mapa de cobertura.
          </div>
        )}
      </div>

      {moodVerdict && (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${verdictClass}`}>
          <span className="font-semibold">Veredito do humor:</span> {moodVerdict.text}
        </p>
      )}

      {activeMed && activeStatus && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs">
          <span className="rounded-full border px-2 py-0.5 font-semibold" style={{ color: CLASS_BADGE[activeStatus.klass].color, background: CLASS_BADGE[activeStatus.klass].bg, borderColor: `${CLASS_BADGE[activeStatus.klass].color}33` }}>
            {CLASS_BADGE[activeStatus.klass].short}
          </span>
          <span className="font-mono font-semibold text-[color:var(--foreground)]">
            agora {fmtConc(activeStatus.concentrationNow)} {activeStatus.unit}
          </span>
          {latestPkRow?.concMax != null && (
            <span className="font-mono text-[color:var(--foreground)]">
              pico {fmtConc(latestPkRow.concMax)} {range?.unit ?? 'ng/mL'}
            </span>
          )}
          {latestPkRow?.concMin != null && (
            <span className="font-mono text-[color:var(--foreground)]">
              vale {fmtConc(latestPkRow.concMin)} {range?.unit ?? 'ng/mL'}
            </span>
          )}
          {latestPkRow?.concAuc != null && (
            <span className="font-mono text-[color:var(--muted)]">AUC {fmtConc(latestPkRow.concAuc)}</span>
          )}
          <span className="text-[color:var(--muted)]">{formatDoseWindow(activeStatus)}</span>
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
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Janela 1</p>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">Humor diário · contexto da mesma janela</p>
              <p className="text-xs text-[color:var(--muted)]">
                {daysWithMood} dias com humor em {totalDays} no recorte ({coveragePct}% de cobertura).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-[color:var(--muted)]">MM humor</span>
              {SMA_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSmaWindow(option.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    smaWindow === option.value
                      ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                      : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
                  }`}
                >
                  {option.label}
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
                    tickFormatter={(value: number) => (value === -1 ? '-1' : value === 0 ? '0' : value === 1 ? '+1' : value.toFixed(1))}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 14, border: '1px solid var(--chart-ui-border)', fontSize: 12, background: 'var(--chart-ui-card-bg)' }}
                    content={({ payload }) => {
                      const row = payload?.[0]?.payload as Row | undefined
                      if (!row) return null
                      return (
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[color:var(--foreground)]">{row.label}</p>
                          {row.valence != null ? (
                            <>
                              <p className="text-[color:var(--muted)]">{row.valenceClass ?? '—'}</p>
                              <p className="font-mono text-[color:var(--muted)]">Humor: {row.valence > 0 ? '+' : ''}{row.valence.toFixed(2)}</p>
                            </>
                          ) : (
                            <p className="text-[color:var(--muted)]">Sem humor</p>
                          )}
                          {row.forecasted && (
                            <p className="mt-1 border-t border-[color:var(--border)] pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-violet-700">🔮 projetado{row.forecastConfidence != null ? ` · conf ${row.forecastConfidence.toFixed(2)}` : ''}</p>
                          )}
                          {row.interpolated && !row.forecasted && (
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
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Janela 2</p>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                {activeMed ? `${activeMed.label} · banda diária (vale → pico)` : 'Concentração farmacológica'}
              </p>
              <p className="text-xs text-[color:var(--muted)]">
                {activeMed
                  ? range
                    ? `Faixa ${fmtConc(range.min)}–${fmtConc(range.max)} ${range.unit}. Banda diária = cmin → cmax; linha forte = pico; ponto na base = dose registrada.`
                    : 'Sem faixa terapêutica definida para esta substância. A banda diária continua útil para ver oscilação e aderência.'
                  : 'Selecione uma medicação no mapa de cobertura para abrir a janela farmacológica.'}
              </p>
              {activeMed && backendConcentrationSeries?.source === 'regimen_fallback' && (
                <p className="text-xs text-[color:var(--muted)]">Fonte de concentração: fallback do regime (sem dose log suficiente na janela).</p>
              )}
            </div>
            {activeMed && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-[color:var(--muted)]">MM pico</span>
                {CONC_SMA_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConcSmaWindow(option.value)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      concSmaWindow === option.value
                        ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                        : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeMed ? (
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
                    tickFormatter={(value: number) => fmtConc(value)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 14, border: '1px solid var(--chart-ui-border)', fontSize: 12, background: 'var(--chart-ui-card-bg)' }}
                    content={({ payload }) => {
                      const row = payload?.[0]?.payload as Row | undefined
                      if (!row) return null
                      return (
                        <div className="max-w-[320px] rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[color:var(--foreground)]">{row.label}</p>
                          <p className="text-[color:var(--muted)]">{activeMed.label}</p>
                          {row.concMax != null ? (
                            <div className="mt-2 space-y-1 font-mono text-[color:var(--foreground)]">
                              <p>pico: {fmtConc(row.concMax)} {range?.unit ?? 'ng/mL'}</p>
                              <p>vale: {fmtConc(row.concMin ?? 0)} {range?.unit ?? 'ng/mL'}</p>
                              {row.concAuc != null && <p>AUC: {fmtConc(row.concAuc)}</p>}
                              {row.concTrend != null && <p>MM {concSmaWindow}d: {fmtConc(row.concTrend)} {range?.unit ?? 'ng/mL'}</p>}
                            </div>
                          ) : (
                            <p className="mt-2 text-[color:var(--muted)]">Sem concentração calculável.</p>
                          )}
                          {range && (
                            <p className="mt-2 text-[color:var(--muted)]">Faixa: {fmtConc(range.min)}–{fmtConc(range.max)} {range.unit}</p>
                          )}
                          {row.doseCount > 0 ? (
                            <div className="mt-2 border-t border-[color:var(--border)] pt-2 text-[color:var(--foreground)]">
                              <p className="font-semibold">Dose registrada no dia</p>
                              <p className="font-mono">{fmtConc(row.doseTotalMg)} mg · {row.doseCount} tomada{row.doseCount > 1 ? 's' : ''}</p>
                              <p className="text-[color:var(--muted)]">{row.doseTimes.join(' • ')}</p>
                            </div>
                          ) : (
                            <p className="mt-2 border-t border-[color:var(--border)] pt-2 text-[color:var(--muted)]">Sem dose registrada neste dia.</p>
                          )}
                          {row.valence != null && (
                            <p className="mt-2 text-[color:var(--muted)]">Humor: {row.valence > 0 ? '+' : ''}{row.valence.toFixed(2)} {row.valenceClass ? `· ${row.valenceClass}` : ''}</p>
                          )}
                          {backendConcentrationSeries?.source === 'regimen_fallback' && (
                            <p className="mt-2 text-[color:var(--muted)]">Fonte: regime estimado</p>
                          )}
                          {row.forecasted && (
                            <p className="mt-1 border-t border-[color:var(--border)] pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-violet-700">🔮 projetado{row.forecastConfidence != null ? ` · conf ${row.forecastConfidence.toFixed(2)}` : ''}</p>
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
                    dataKey="concBand"
                    stroke="none"
                    fill={activeColor}
                    fillOpacity={0.14}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                  />
                  {doseMarkerRows.map((row) => (
                    <ReferenceLine
                      key={`dose-line-${row.date}`}
                      yAxisId="conc"
                      x={row.label}
                      stroke={activeColor}
                      strokeOpacity={0.2}
                      strokeDasharray="2 6"
                      strokeWidth={1}
                    />
                  ))}
                  <Line
                    yAxisId="conc"
                    dataKey="concMax"
                    type="monotone"
                    stroke={activeColor}
                    strokeWidth={2.4}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                  />
                  <Line
                    yAxisId="conc"
                    dataKey="concMin"
                    type="monotone"
                    stroke={activeColor}
                    strokeOpacity={0.58}
                    strokeDasharray="3 4"
                    strokeWidth={1.5}
                    dot={false}
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
                  {doseMarkerRows.map((row) => (
                    <ReferenceDot
                      key={`dose-dot-${row.date}`}
                      yAxisId="conc"
                      x={row.label}
                      y={doseMarkerLevel}
                      r={Math.min(6, 3 + row.doseCount)}
                      fill={activeColor}
                      stroke="var(--card-strong)"
                      strokeWidth={1.5}
                      ifOverflow="extendDomain"
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">Use o mapa de cobertura acima para abrir uma medicação em foco. O humor segue visível como contexto desta mesma janela.</p>
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-xs text-[color:var(--muted)]">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-rose-700" /> Desagradável</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Neutro</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-green-700" /> Agradável</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-6 rounded-full bg-[color:var(--foreground)]" /> Humor (média {smaWindow}d)</span>
          {activeMed && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: activeColor }} /> {activeMed.label} pico diário</span>
          )}
          {activeMed && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-sm" style={{ background: activeColor, opacity: 0.18 }} /> Banda vale → pico</span>
          )}
          {activeMed && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-6 rounded-full border-b border-dashed" style={{ borderColor: activeColor, opacity: 0.8 }} /> Vale diário</span>
          )}
          {activeMed && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-6 rounded-full bg-[color:var(--foreground)]" /> Pico MM {concSmaWindow}d</span>
          )}
          {activeMed && (
            <span className="flex items-center gap-1.5"><span className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: activeColor, color: 'white' }}>•</span> Dose registrada</span>
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
