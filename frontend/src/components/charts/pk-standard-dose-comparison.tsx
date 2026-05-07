import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { useSubstances } from '@/lib/api'
import { SUBSTANCE_COLORS } from '@/lib/substance-colors'
import type { MedicationRegimenEntry } from '@/types/pharmacology'
import {
  calculateConcentration,
  DEFAULT_PK_BODY_WEIGHT_KG,
  type PKDose,
  type PKMedication,
} from '@/utils/pharmacokinetics'
import { substanceToPKMedication } from '@/utils/intraday-correlation'

interface Props {
  regimen: MedicationRegimenEntry[]
  weightKg?: number
}

interface DosePlanSeries {
  med: PKMedication
  dataKey: string
  label: string
  color: string
  dailyDoseMg: number
  administrationsPerDay: number
  doses: PKDose[]
}

const HOURS_BACK = 120
const HOURS_FORWARD = 24
const STEP_MINUTES = 60
const MAX_SERIES = 3

function parseScheduleTime(value: string): { hours: number; minutes: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

function buildRegimenDoses(
  entries: MedicationRegimenEntry[],
  medicationId: string,
  startMs: number,
  endMs: number,
): PKDose[] {
  const doses: PKDose[] = []
  const dayMs = 24 * 60 * 60 * 1000

  const firstDay = new Date(startMs)
  firstDay.setHours(0, 0, 0, 0)
  firstDay.setTime(firstDay.getTime() - dayMs)

  const lastDay = new Date(endMs)
  lastDay.setHours(0, 0, 0, 0)

  for (let day = firstDay.getTime(); day <= lastDay.getTime(); day += dayMs) {
    const weekday = new Date(day).getDay()
    for (const entry of entries) {
      if (!entry.days_of_week.includes(weekday)) continue
      if (!Number.isFinite(entry.dose_mg) || entry.dose_mg <= 0) continue
      const times = entry.times.length > 0 ? entry.times : ['08:00']
      for (const time of times) {
        const parsed = parseScheduleTime(time)
        if (!parsed) continue
        const timestamp = day + parsed.hours * 60 * 60 * 1000 + parsed.minutes * 60 * 1000
        if (timestamp < firstDay.getTime() || timestamp > endMs) continue
        doses.push({
          medicationId,
          timestamp,
          doseAmount: entry.dose_mg,
        })
      }
    }
  }

  return doses.sort((a, b) => a.timestamp - b.timestamp)
}

function formatDose(value: number): string {
  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

export function PKStandardDoseComparison({ regimen, weightKg = DEFAULT_PK_BODY_WEIGHT_KG }: Props) {
  const { data: substances = [] } = useSubstances()

  const [nowMs] = useState(() => Date.now())

  const model = useMemo(() => {
    const startMs = nowMs - HOURS_BACK * 60 * 60 * 1000
    const endMs = nowMs + HOURS_FORWARD * 60 * 60 * 1000
    const stepMs = STEP_MINUTES * 60 * 1000

    const activeRegimen = regimen.filter((entry) => entry.active)
    const entriesBySubstance = new Map<string, MedicationRegimenEntry[]>()
    for (const entry of activeRegimen) {
      const list = entriesBySubstance.get(entry.substance) ?? []
      list.push(entry)
      entriesBySubstance.set(entry.substance, list)
    }

    const series: DosePlanSeries[] = []

    for (const [substanceId, entries] of entriesBySubstance) {
      const substance = substances.find((sub) => sub.id === substanceId)
      if (!substance) continue
      const med = substanceToPKMedication(substance)
      if (!med) continue

      const doses = buildRegimenDoses(entries, med.id, startMs, endMs)
      if (doses.length === 0) continue

      const administrationsPerDay = entries.reduce((sum, entry) => {
        const count = Math.max(1, entry.times.length)
        return sum + count
      }, 0)
      const dailyDoseMg = entries.reduce((sum, entry) => {
        const count = Math.max(1, entry.times.length)
        return sum + entry.dose_mg * count
      }, 0)

      series.push({
        med,
        dataKey: `${med.id}Pct`,
        label: substance.display_name,
        color: entries[0]?.color ?? SUBSTANCE_COLORS[substanceId] ?? '#0f766e',
        dailyDoseMg,
        administrationsPerDay,
        doses,
      })
    }

    const selectedSeries = series
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, MAX_SERIES)

    const timestamps: number[] = []
    for (let t = startMs; t <= endMs; t += stepMs) timestamps.push(t)

    const concentrationBySeries = new Map<string, number[]>()
    const denominatorBySeries = new Map<string, number>()
    for (const item of selectedSeries) {
      const concentrations = timestamps.map((timestamp) =>
        calculateConcentration(item.med, item.doses, timestamp, weightKg),
      )
      concentrationBySeries.set(item.dataKey, concentrations)
      const fallbackPeak = Math.max(...concentrations, 1)
      const denominator = item.med.therapeuticRange?.max ?? fallbackPeak
      denominatorBySeries.set(item.dataKey, denominator > 0 ? denominator : fallbackPeak)
    }

    const chartData = timestamps.map((timestamp, index) => {
      const row: Record<string, number | string> = {
        timestamp,
        label: format(timestamp, 'd MMM · HH:mm', { locale: ptBR }),
      }
      for (const item of selectedSeries) {
        const concentrations = concentrationBySeries.get(item.dataKey)
        const denominator = denominatorBySeries.get(item.dataKey)
        const concentration = concentrations?.[index]
        if (typeof concentration === 'number' && Number.isFinite(concentration) && typeof denominator === 'number') {
          row[item.dataKey] = (concentration / denominator) * 100
        }
      }
      return row
    })

    return {
      series: selectedSeries,
      chartData,
    }
  }, [nowMs, regimen, substances, weightKg])

  if (model.series.length === 0) {
    return (
      <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Dose padrão
        </span>
        <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
          Comparativo do regime
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Sem substâncias ativas no regime com parâmetros PK completos para simulação.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Dose padrão
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Curvas comparativas das 3 medicações
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Simulação do regime ativo com até 3 substâncias em conjunto. Eixo Y normalizado por referência terapêutica (ou pico previsto quando faixa não existe).
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {model.series.map((item) => (
          <span
            key={item.med.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label} · {formatDose(item.dailyDoseMg)} mg/d · {item.administrationsPerDay}x/d
          </span>
        ))}
      </div>

      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={model.chartData} margin={{ top: 8, right: 14, bottom: 6, left: -8 }}>
            <CartesianGrid stroke="rgba(100,116,139,0.1)" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => format(value, 'd/M', { locale: ptBR })}
            />
            <YAxis
              domain={[0, 160]}
              tick={{ fill: '#475569', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value.toFixed(0)}%`}
              label={{ value: '% referência', angle: -90, position: 'insideLeft', offset: 8, fontSize: 11, fill: '#64748b' }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid rgba(15,23,42,0.08)',
                background: 'rgba(255,252,246,0.97)',
                fontSize: 12,
              }}
              labelFormatter={(value) => {
                if (typeof value !== 'number' || !Number.isFinite(value)) return ''
                return format(value, "d MMM · HH:mm", { locale: ptBR })
              }}
              formatter={(value, name) => {
                const label = model.series.find((item) => item.dataKey === name)?.label ?? String(name)
                return [typeof value === 'number' ? `${value.toFixed(1)}%` : '—', label]
              }}
            />
            <Legend
              formatter={(value) => {
                const series = model.series.find((item) => item.dataKey === value)
                return <span style={{ fontSize: 11, color: '#475569' }}>{series?.label ?? value}</span>
              }}
            />
            {model.series.map((item) => (
              <Line
                key={item.dataKey}
                type="monotone"
                dataKey={item.dataKey}
                stroke={item.color}
                strokeWidth={2.2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
