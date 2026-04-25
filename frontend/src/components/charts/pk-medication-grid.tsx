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
import { SUBSTANCE_COLORS } from '../../lib/substance-colors'

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
          ? `${point.pct.toFixed(1)}% · ${(point.conc_ng_ml ?? 0).toFixed(1)} ng/mL`
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
  weightKg: number
}

function PKCompactCard({ med, doses, doseRecords, windowStart, windowEnd, weightKg }: CardProps) {
  const range = med.therapeuticRange
  const hasRange = range != null

  const { data, currentPct, currentConc, rangeMinPct, maxConc } = useMemo(() => {
    const stepMinutes = 30
    const stepMs = stepMinutes * 60 * 1000
    const n = Math.max(1, Math.floor((windowEnd - windowStart) / stepMs))
    const series: GridPoint[] = []
    let maxConc = 0
    for (let i = 0; i <= n; i++) {
      const t = windowStart + i * stepMs
      const conc = calculateConcentration(med, doses, t, weightKg)
      if (conc > maxConc) maxConc = conc
      const pct = range ? (conc / range.max) * 100 : null
      series.push({
        timestamp: t,
        conc_ng_ml: conc,
        pct,
        label: format(t, "d MMM · HH:mm", { locale: ptBR }),
      })
    }
    const nowConc = calculateConcentration(med, doses, Date.now(), weightKg)
    const currentPct = range ? (nowConc / range.max) * 100 : 0
    return {
      data: series,
      currentPct,
      currentConc: nowConc,
      rangeMinPct: range ? (range.min / range.max) * 100 : 0,
      maxConc,
    }
  }, [med, doses, range, windowStart, windowEnd, weightKg])

  const color = COLORS_BY_ID[med.id] ?? '#8b5cf6'
  const status = hasRange ? statusOf(currentPct, rangeMinPct) : null
  const hasData = hasRange
    ? data.some((p) => (p.pct ?? 0) > 0.1)
    : data.some((p) => (p.conc_ng_ml ?? 0) > 0.001)

  // Key da série e domínio do Y axis dependem do modo.
  const seriesKey = hasRange ? 'pct' : 'conc_ng_ml'
  const yDomain: [number, number] = hasRange ? [0, 150] : [0, Math.max(maxConc * 1.2, 1)]
  const yTicks = hasRange ? [0, 50, 100, 150] : undefined
  const yTickFormatter = hasRange
    ? (v: number) => `${v}%`
    : (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(2))

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
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
            {hasRange && range && (
              <>
                <ReferenceArea
                  y1={rangeMinPct}
                  y2={100}
                  fill="#22c55e"
                  fillOpacity={0.08}
                  stroke="#22c55e"
                  strokeOpacity={0.2}
                  strokeDasharray="2 2"
                />
                <ReferenceLine y={100} stroke="#22c55e" strokeOpacity={0.4} strokeDasharray="3 3" />
              </>
            )}
            <Area
              type="monotone"
              dataKey={seriesKey}
              stroke={color}
              strokeWidth={1.8}
              fill={color}
              fillOpacity={0.15}
              isAnimationActive={false}
              connectNulls
            />
            <ReferenceLine
              x={Date.now()}
              stroke="var(--muted)"
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

      {/* Footer */}
      <div style={{
        marginTop: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
        color: 'var(--muted)', letterSpacing: '0.04em',
      }}>
        {hasRange && range
          ? `faixa ${range.min}–${range.max} ${range.unit}`
          : 'sem faixa terapêutica · concentração bruta pra correlação futura'}
      </div>
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
          color: 'var(--muted)', opacity: 0.7,
          padding: '4px 0',
        }}>
          desconhecidas no catálogo: {orphanNames.join(', ')} · adicione PK completo em "Catálogo de substâncias"
        </div>
      )}
    </div>
  )
}
