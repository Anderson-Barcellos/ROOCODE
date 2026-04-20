import { useMemo } from 'react'
import {
  ComposedChart,
  Area,
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

import { useDoses, useSubstances } from '../../lib/api'
import type { DoseRecord, Substance } from '../../lib/api'
import {
  calculateConcentration,
  DEFAULT_PK_BODY_WEIGHT_KG,
  type PKMedication,
  type PKDose,
} from '../../utils/pharmacokinetics'

type Props = {
  hoursWindow?: number
  weightKg?: number
}

type GridPoint = {
  timestamp: number
  pct: number | null
  conc_ng_ml: number | null
  label: string
}

type CardStatus = 'sub' | 'within' | 'supra'

function toPKMedication(sub: Substance): PKMedication | null {
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

const COLORS_BY_ID: Record<string, string> = {
  lexapro: '#14b8a6',
  venvanse: '#8b5cf6',
  lamictal: '#3b82f6',
  clonazepam: '#f59e0b',
}

function statusOf(currentPct: number, rangeMinPct: number): CardStatus {
  if (currentPct > 100) return 'supra'
  if (currentPct < rangeMinPct) return 'sub'
  return 'within'
}

function statusColor(status: CardStatus): string {
  return status === 'within' ? '#22c55e' : status === 'supra' ? '#ef4444' : '#f59e0b'
}

function statusLabel(status: CardStatus): string {
  return status === 'within' ? 'na faixa' : status === 'supra' ? 'supra' : 'sub'
}

type TooltipShape = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: GridPoint }>
}

function CardTooltip({ active, payload }: TooltipShape) {
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
      <div>{point.pct != null ? `${point.pct.toFixed(1)}% · ${(point.conc_ng_ml ?? 0).toFixed(1)} ng/mL` : '—'}</div>
    </div>
  )
}

type CardProps = {
  med: PKMedication
  doses: PKDose[]
  doseRecords: DoseRecord[]
  windowStart: number
  windowEnd: number
  weightKg: number
}

function PKCompactCard({ med, doses, doseRecords, windowStart, windowEnd, weightKg }: CardProps) {
  const { data, currentPct, rangeMinPct } = useMemo(() => {
    const range = med.therapeuticRange
    if (!range) return { data: [] as GridPoint[], currentPct: 0, rangeMinPct: 0 }
    const stepMinutes = 30
    const stepMs = stepMinutes * 60 * 1000
    const n = Math.max(1, Math.floor((windowEnd - windowStart) / stepMs))
    const series: GridPoint[] = []
    for (let i = 0; i <= n; i++) {
      const t = windowStart + i * stepMs
      const conc = calculateConcentration(med, doses, t, weightKg)
      const pct = (conc / range.max) * 100
      series.push({
        timestamp: t,
        conc_ng_ml: conc,
        pct,
        label: format(t, "d MMM · HH:mm", { locale: ptBR }),
      })
    }
    const nowConc = calculateConcentration(med, doses, Date.now(), weightKg)
    const currentPct = (nowConc / range.max) * 100
    return {
      data: series,
      currentPct,
      rangeMinPct: (range.min / range.max) * 100,
    }
  }, [med, doses, windowStart, windowEnd, weightKg])

  const color = COLORS_BY_ID[med.id] ?? '#8b5cf6'
  const status = statusOf(currentPct, rangeMinPct)
  const hasData = data.some((p) => (p.pct ?? 0) > 0.1)

  return (
    <div style={{
      background: 'var(--bg-base)',
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
            color: 'var(--text-primary)', fontWeight: 600,
          }}>{med.name}</span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            color: 'var(--text-muted)',
          }}>{doseRecords.length} dose{doseRecords.length === 1 ? '' : 's'}</span>
        </div>
        {hasData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: statusColor(status),
              padding: '1px 6px', borderRadius: 3,
              background: `${statusColor(status)}15`,
              border: `1px solid ${statusColor(status)}33`,
            }}>{statusLabel(status)}</span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              color: 'var(--text-muted)',
            }}>{currentPct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 140 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="1 3" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={[windowStart, windowEnd]}
              scale="time"
              tickFormatter={(t) => format(t, 'd/M', { locale: ptBR })}
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={[0, 150]}
              ticks={[0, 50, 100, 150]}
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={CardTooltip} />
            {med.therapeuticRange && (
              <ReferenceArea
                y1={rangeMinPct}
                y2={100}
                fill="#22c55e"
                fillOpacity={0.08}
                stroke="#22c55e"
                strokeOpacity={0.2}
                strokeDasharray="2 2"
              />
            )}
            <ReferenceLine y={100} stroke="#22c55e" strokeOpacity={0.4} strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="pct"
              stroke={color}
              strokeWidth={1.8}
              fill={color}
              fillOpacity={0.15}
              isAnimationActive={false}
              connectNulls
            />
            <ReferenceLine
              x={Date.now()}
              stroke="var(--text-muted)"
              strokeDasharray="2 2"
              strokeOpacity={0.6}
            />
            {doses.map((dose) => (
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

      {/* Footer — therapeutic range info */}
      {med.therapeuticRange && (
        <div style={{
          marginTop: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--text-muted)', letterSpacing: '0.04em',
        }}>
          faixa {med.therapeuticRange.min}–{med.therapeuticRange.max} {med.therapeuticRange.unit}
        </div>
      )}
    </div>
  )
}

export function PKMedicationGrid({ hoursWindow = 168, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: allDoses = [], isLoading: loadingDoses } = useDoses(hoursWindow)
  const { data: substances = [], isLoading: loadingSubs } = useSubstances()

  const { cards, orphanNames } = useMemo(() => {
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
        orphans.push(dose.substance)
        continue
      }
      if (!med.therapeuticRange) {
        orphans.push(med.name)
        continue
      }
      const arr = dosesByMed.get(dose.substance) ?? []
      arr.push(dose)
      dosesByMed.set(dose.substance, arr)
    }

    const cards: Array<{ med: PKMedication; pkDoses: PKDose[]; records: DoseRecord[] }> = []
    for (const [medId, records] of dosesByMed) {
      const med = medsById.get(medId)
      if (!med) continue
      cards.push({
        med,
        pkDoses: records.map(toPKDose),
        records,
      })
    }
    cards.sort((a, b) => a.med.name.localeCompare(b.med.name))
    const uniqueOrphans = Array.from(new Set(orphans))
    return { cards, orphanNames: uniqueOrphans }
  }, [substances, allDoses])

  const now = Date.now()
  const windowStart = now - hoursWindow * 3600 * 1000
  const windowEnd = now + 12 * 3600 * 1000 // 12h de projeção pra frente

  if (loadingDoses || loadingSubs) {
    return (
      <div style={{
        padding: '24px 12px', textAlign: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)',
      }}>carregando…</div>
    )
  }

  if (!cards.length) {
    return (
      <div style={{
        padding: '24px 16px',
        background: 'var(--bg-base)',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}>
        <Activity size={16} color="var(--text-muted)" />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)',
        }}>
          sem doses logadas nos últimos {Math.round(hoursWindow / 24)} dias para substâncias com faixa terapêutica
        </span>
        {orphanNames.length > 0 && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
            color: 'var(--text-muted)', opacity: 0.7,
          }}>
            logadas sem faixa: {orphanNames.join(', ')} · configure em "Catálogo de substâncias"
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            weightKg={weightKg}
          />
        ))}
      </div>
      {orphanNames.length > 0 && (
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--text-muted)', opacity: 0.7,
          padding: '4px 0',
        }}>
          sem faixa terapêutica: {orphanNames.join(', ')} · edite no catálogo para aparecer no grid
        </div>
      )}
    </div>
  )
}
