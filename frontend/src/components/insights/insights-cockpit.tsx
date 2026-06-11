import { useMemo, useState } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { rankDrivers } from '@/utils/driver-ranking'
import { buildCockpitHeadline } from '@/utils/insights-narrative'

import { DriverDetailPanel } from './driver-detail-panel'
import { DriverRankingCard } from './driver-ranking-card'
import { MedicationContextStrip } from './medication-context-strip'
import { RankingMetadataChips } from './ranking-metadata-chips'

interface Props {
  snapshots: DailySnapshot[]
}

export function InsightsCockpit({ snapshots }: Props) {
  const ranking = useMemo(() => rankDrivers(snapshots), [snapshots])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)

  const headline = buildCockpitHeadline(ranking)
  const toggleCard = (id: string) => setExpandedId((curr) => (curr === id ? null : id))

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit rounded-full border border-teal-200 dark:border-teal-400/30 bg-teal-50 dark:bg-teal-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
          Quem mexeu no humor essa janela
        </span>
        <p className="font-['Fraunces'] text-xl tracking-[-0.03em] text-slate-900">{headline}</p>
        <RankingMetadataChips ranking={ranking} />
      </header>

      {ranking.top3.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {ranking.top3.map((d) => (
            <div key={d.id} className="flex flex-col">
              <DriverRankingCard
                driver={d}
                expanded={expandedId === d.id}
                onToggle={() => toggleCard(d.id)}
              />
              {expandedId === d.id && <DriverDetailPanel driver={d} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Nenhum driver atingiu n≥10 nesta janela. Aumenta a janela ou aguarda mais logs de humor pra ativar o ranking.
        </div>
      )}

      <div className="mt-4">
        <MedicationContextStrip snapshots={snapshots} />
      </div>

      {ranking.others.length > 0 && (
        <details
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
          open={othersOpen}
          onToggle={(e) => setOthersOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Ver outros drivers ({ranking.others.length})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {ranking.others.map((d) => (
              <div key={d.id} className="flex flex-col">
                <DriverRankingCard
                  driver={d}
                  expanded={expandedId === d.id}
                  onToggle={() => toggleCard(d.id)}
                />
                {expandedId === d.id && <DriverDetailPanel driver={d} />}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
