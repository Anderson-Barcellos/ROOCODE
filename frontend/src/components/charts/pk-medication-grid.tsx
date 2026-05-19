import { useMemo, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Activity } from 'lucide-react'

import { FULL_HISTORY_DOSE_HOURS, useDoses, useSubstances } from '../../lib/api'
import type { DoseRecord, Substance } from '../../lib/api'
import {
  calculateConcentration,
  computeTrendFromSamples,
  DEFAULT_PK_BODY_WEIGHT_KG,
  getMoodCorrelationWindowMs,
  type PKMedication,
  type PKDose,
} from '../../utils/pharmacokinetics'
import { SUBSTANCE_COLORS } from '../../lib/substance-colors'

type Props = {
  hoursWindow?: number
  windowLabel?: string
  weightKg?: number
}

type GridPoint = {
  timestamp: number
  pct: number | null
  conc_ng_ml: number | null
  ema_pct: number | null
  ema_ng_ml: number | null
  label: string
}

type CardStatus = 'sub' | 'within' | 'supra'

function toPKMedication(sub: Substance): PKMedication | null {
  // Requisitos mínimos de PK: sem isso não há como calcular concentração.
  if (sub.half_life_hours == null || sub.ka_per_hour == null || sub.bioavailability == null) {
    return null
  }
  const vdPerKg =
    sub.vd_l_per_kg != null
      ? sub.vd_l_per_kg
      : sub.vd_l != null
        ? sub.vd_l / DEFAULT_PK_BODY_WEIGHT_KG
        : null
  if (vdPerKg == null) return null

  // Fase 8A.1 — therapeutic range é opcional.
  // Suplementos (Bacopa, Magnésio, Vit D3, Omega-3, Piracetam) têm PK completo
  // mas não têm faixa clínica estabelecida → renderizam em modo "concentração bruta".
  const therapeuticRange =
    sub.therapeutic_range_min != null && sub.therapeutic_range_max != null
      ? {
          min: sub.therapeutic_range_min,
          max: sub.therapeutic_range_max,
          unit: sub.therapeutic_range_unit ?? 'ng/mL',
        }
      : undefined

  return {
    id: sub.id,
    name: sub.display_name.split(' ')[0],
    category: 'Other',
    halfLife: sub.half_life_hours,
    volumeOfDistribution: vdPerKg,
    bioavailability: sub.bioavailability,
    absorptionRate: sub.ka_per_hour,
    therapeuticRange,
  }
}

function toPKDose(record: DoseRecord): PKDose {
  return {
    medicationId: record.substance,
    timestamp: new Date(record.taken_at).getTime(),
    doseAmount: record.dose_mg,
  }
}

const COLORS_BY_ID = SUBSTANCE_COLORS

function statusFromConc(conc: number, min: number, max: number): CardStatus {
  if (conc > max) return 'supra'
  if (conc < min) return 'sub'
  return 'within'
}

function statusColor(status: CardStatus): string {
  return status === 'within' ? '#22c55e' : status === 'supra' ? '#ef4444' : '#f59e0b'
}

function statusLabel(status: CardStatus): string {
  return status === 'within' ? 'na faixa' : status === 'supra' ? 'acima da faixa' : 'abaixo da faixa'
}

type TooltipShape = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: GridPoint }>
}

function CardTooltip({ active, payload, hasRange }: TooltipShape & { hasRange?: boolean }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div style={{
      background: 'rgba(255, 252, 246, 0.97)',
      border: '1px solid rgba(15, 23, 42, 0.08)',
      borderRadius: 12,
      padding: '8px 12px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11,
      color: 'var(--foreground)',
      boxShadow: '0 18px 42px rgba(17, 35, 30, 0.12)',
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 3 }}>{point.label}</div>
      <div>
        {hasRange && point.pct != null
          ? `${point.pct.toFixed(1)}% do teto terap. · ${(point.conc_ng_ml ?? 0).toFixed(2)} ng/mL`
          : point.conc_ng_ml != null
            ? `${point.conc_ng_ml.toFixed(2)} ng/mL`
            : '—'}
      </div>
    </div>
  )
}

type CardProps = {
  med: PKMedication
  doses: PKDose[]
  doseRecords: DoseRecord[]
  windowStart: number
  windowEnd: number
  nowTimestamp: number
  weightKg: number
}

function PKCompactCard({ med, doses, doseRecords, windowStart, windowEnd, nowTimestamp, weightKg }: CardProps) {
  const range = med.therapeuticRange
  const hasRange = range != null

  const { data, currentPct, currentConc, maxConc, maxPct } = useMemo(() => {
    const stepMinutes = 30
    const stepMs = stepMinutes * 60 * 1000
    const n = Math.max(1, Math.floor((windowEnd - windowStart) / stepMs))
    const timestamps: number[] = []
    const concs: number[] = []
    let maxConc = 0
    for (let i = 0; i <= n; i++) {
      const t = windowStart + i * stepMs
      const conc = calculateConcentration(med, doses, t, weightKg)
      if (conc > maxConc) maxConc = conc
      timestamps.push(t)
      concs.push(conc)
    }

    const emaWindowMs = getMoodCorrelationWindowMs(med)
    const emaSeries = computeTrendFromSamples(timestamps, concs, emaWindowMs, 3)

    let maxPct = 0
    const series: GridPoint[] = timestamps.map((t, i) => {
      const conc = concs[i]
      const emaVal = emaSeries[i]
      const pct = range && range.max > 0
        ? (conc / range.max) * 100
        : maxConc > 0 ? (conc / maxConc) * 100 : null
      const emaPct = emaVal != null
        ? range && range.max > 0
          ? (emaVal / range.max) * 100
          : maxConc > 0 ? (emaVal / maxConc) * 100 : null
        : null
      if (pct != null && pct > maxPct) maxPct = pct
      if (emaPct != null && emaPct > maxPct) maxPct = emaPct
      return {
        timestamp: t,
        conc_ng_ml: conc,
        pct,
        ema_ng_ml: emaVal,
        ema_pct: emaPct,
        label: format(t, "d MMM · HH:mm", { locale: ptBR }),
      }
    })

    const nowConc = calculateConcentration(med, doses, nowTimestamp, weightKg)
    const currentPct = range && range.max > 0
      ? (nowConc / range.max) * 100
      : maxConc > 0 ? (nowConc / maxConc) * 100 : 0
    if (currentPct > maxPct) maxPct = currentPct
    return {
      data: series,
      currentPct,
      currentConc: nowConc,
      maxConc,
      maxPct,
    }
  }, [med, doses, range, windowStart, windowEnd, nowTimestamp, weightKg])

  const color = COLORS_BY_ID[med.id] ?? '#8b5cf6'
  const status = hasRange && range ? statusFromConc(currentConc, range.min, range.max) : null
  const showTherapeuticBand = !!(hasRange && range && range.max > range.min)
  const hasData = hasRange
    ? data.some((p) => (p.pct ?? 0) > 0.1)
    : data.some((p) => (p.conc_ng_ml ?? 0) > 0.001)
  const doseMarkers = doses.filter((dose) => dose.timestamp >= windowStart && dose.timestamp <= windowEnd)

  const seriesKey = hasRange ? 'pct' : 'conc_ng_ml'
  const emaKey = hasRange ? 'ema_pct' : 'ema_ng_ml'
  const therapeuticMinPct = showTherapeuticBand && range ? (range.min / range.max) * 100 : null
  const yDomain: [number, number] = showTherapeuticBand
    ? [0, Math.max(maxPct * 1.1, 115)]
    : [0, Math.max(maxConc * 1.2, 1)]
  const yTicks = showTherapeuticBand ? [0, 25, 50, 75, 100] : undefined
  const yTickFormatter = (v: number) => {
    if (showTherapeuticBand) return `${v.toFixed(0)}%`
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(1)
    return v.toFixed(2)
  }

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 12,
      minHeight: 200,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            color: 'var(--foreground)', fontWeight: 600,
          }}>{med.name}</span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            color: 'var(--muted)',
          }}>{doseRecords.length} dose{doseRecords.length === 1 ? '' : 's'}</span>
        </div>
        {hasData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {hasRange && status ? (
              <>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: statusColor(status),
                  padding: '1px 6px', borderRadius: 3,
                  background: `${statusColor(status)}15`,
                  border: `1px solid ${statusColor(status)}33`,
                }}>{statusLabel(status)}</span>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  color: 'var(--muted)',
                }}>{currentPct.toFixed(0)}%</span>
              </>
            ) : (
              <>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                  padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(139,92,246,0.12)',
                  color: 'var(--accent-violet)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  letterSpacing: '0.04em',
                }}>experimental</span>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  color: 'var(--muted)',
                }}>{currentConc >= 10 ? currentConc.toFixed(0) : currentConc.toFixed(2)} ng/mL</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 140 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
          <ComposedChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="1 3" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={[windowStart, windowEnd]}
              scale="time"
              tickFormatter={(t) => format(t, 'd/M', { locale: ptBR })}
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yTickFormatter}
            />
            <Tooltip content={<CardTooltip hasRange={hasRange} />} />
            {showTherapeuticBand && therapeuticMinPct != null && (
              <ReferenceArea
                y1={therapeuticMinPct}
                y2={100}
                ifOverflow="extendDomain"
                fill="#22c55e"
                fillOpacity={0.10}
                strokeOpacity={0}
              />
            )}
            <Area
              type="monotone"
              dataKey={seriesKey}
              stroke={color}
              strokeWidth={1.2}
              strokeOpacity={0.45}
              fill={color}
              fillOpacity={0.08}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={emaKey}
              stroke={color}
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <ReferenceLine
              x={nowTimestamp}
              stroke="var(--muted)"
              strokeDasharray="2 2"
              strokeOpacity={0.6}
            />
            {doseMarkers.map((dose) => (
              <ReferenceLine
                key={`${dose.timestamp}-${dose.doseAmount}`}
                x={dose.timestamp}
                stroke={color}
                strokeOpacity={0.5}
                strokeWidth={1.2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
        color: 'var(--muted)', letterSpacing: '0.04em',
      }}>
        {hasRange && range
          ? `escala: % do teto terapêutico · faixa sombreada ${therapeuticMinPct?.toFixed(0) ?? 0}–100% (${range.min}–${range.max} ${range.unit})`
          : 'sem faixa terapêutica · concentração bruta pra correlação futura'}
      </div>
    </div>
  )
}

export function PKMedicationGrid({ hoursWindow = 168, windowLabel, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: allDoses = [], isLoading: loadingDoses } = useDoses(FULL_HISTORY_DOSE_HOURS)
  const { data: substances = [], isLoading: loadingSubs } = useSubstances()
  const [nowTimestamp] = useState(() => Date.now())

  const { cards, orphanNames, hiddenNoRecent } = useMemo(() => {
    const medsById = new Map<string, PKMedication>()
    const orphans: string[] = []
    for (const sub of substances) {
      const med = toPKMedication(sub)
      if (med) medsById.set(sub.id, med)
    }

    const dosesByMed = new Map<string, DoseRecord[]>()
    for (const dose of allDoses) {
      const med = medsById.get(dose.substance)
      if (!med) {
        // Substância desconhecida (não tem PK completo no catálogo) → orphan.
        orphans.push(dose.substance)
        continue
      }
      // Fase 8A.1 — substâncias sem therapeutic_range agora são renderizadas em
      // modo "concentração bruta". PK ok + range undefined = card experimental.
      const arr = dosesByMed.get(dose.substance) ?? []
      arr.push(dose)
      dosesByMed.set(dose.substance, arr)
    }

    const windowStart = nowTimestamp - hoursWindow * 3600 * 1000
    const windowEnd = nowTimestamp + 12 * 3600 * 1000
    const cards: Array<{ med: PKMedication; pkDoses: PKDose[]; records: DoseRecord[] }> = []
    const hiddenNoRecent: string[] = []
    for (const [medId, records] of dosesByMed) {
      const med = medsById.get(medId)
      if (!med) continue
      const visibleRecords = records.filter((record) => {
        const ts = new Date(record.taken_at).getTime()
        return Number.isFinite(ts) && ts >= windowStart && ts <= windowEnd
      })
      if (visibleRecords.length > 0) {
        cards.push({
          med,
          pkDoses: records.map(toPKDose),
          records: visibleRecords,
        })
      } else if (!med.therapeuticRange) {
        hiddenNoRecent.push(med.name)
      }
    }
    cards.sort((a, b) => a.med.name.localeCompare(b.med.name))
    const uniqueOrphans = Array.from(new Set(orphans))
    return { cards, orphanNames: uniqueOrphans, hiddenNoRecent }
  }, [substances, allDoses, nowTimestamp, hoursWindow])

  const windowStart = nowTimestamp - hoursWindow * 3600 * 1000
  const windowEnd = nowTimestamp + 12 * 3600 * 1000 // 12h de projeção pra frente

  if (loadingDoses || loadingSubs) {
    return (
      <div style={{
        padding: '24px 12px', textAlign: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--muted)',
      }}>carregando…</div>
    )
  }

  if (!cards.length) {
    return (
      <div style={{
        padding: '24px 16px',
        background: 'var(--card)',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}>
        <Activity size={16} color="var(--muted)" />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--muted)',
        }}>
          sem doses logadas nos últimos {Math.round(hoursWindow / 24)} dias
        </span>
        {orphanNames.length > 0 && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
            color: 'var(--muted)', opacity: 0.7,
          }}>
            desconhecidas no catálogo: {orphanNames.join(', ')} · adicione em "Catálogo de substâncias"
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        color: 'var(--muted)',
        letterSpacing: '0.04em',
      }}>
        <span>Janela PK: {windowLabel ?? `${Math.round(hoursWindow / 24)}d`} + 12h projetadas</span>
        <span>concentração atual sempre marcada pela linha pontilhada</span>
      </div>
      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {cards.map(({ med, pkDoses, records }) => (
          <PKCompactCard
            key={med.id}
            med={med}
            doses={pkDoses}
            doseRecords={records}
            windowStart={windowStart}
            windowEnd={windowEnd}
            nowTimestamp={nowTimestamp}
            weightKg={weightKg}
          />
        ))}
      </div>
      {orphanNames.length > 0 && (
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--muted)', opacity: 0.7,
          padding: '4px 0',
        }}>
          desconhecidas no catálogo: {orphanNames.join(', ')} · adicione PK completo em "Catálogo de substâncias"
        </div>
      )}
      {hiddenNoRecent.length > 0 && (
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--muted)', opacity: 0.7,
          padding: '2px 0',
        }}>
          sem registro recente (colapsadas): {hiddenNoRecent.join(', ')}
        </div>
      )}
    </div>
  )
}
