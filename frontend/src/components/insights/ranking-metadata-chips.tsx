import type { RankingResult } from '@/utils/driver-ranking'

interface Props {
  ranking: RankingResult
}

export function RankingMetadataChips({ ranking }: Props) {
  const items = [
    { label: 'robustas', value: `${ranking.robustCount}` },
    { label: 'cobertura', value: `${ranking.coveragePct}%` },
    { label: 'dias pareados', value: `n=${ranking.pairedDays}` },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[0.72rem] font-semibold text-slate-600"
        >
          <span className="text-slate-900">{chip.value}</span>
          <span className="uppercase tracking-[0.14em] text-slate-400">{chip.label}</span>
        </span>
      ))}
    </div>
  )
}
