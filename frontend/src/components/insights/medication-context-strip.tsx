import { Pill } from 'lucide-react'

import type { DailySnapshot } from '@/types/apple-health'

interface Props {
  snapshots: DailySnapshot[]
}

export function MedicationContextStrip({ snapshots }: Props) {
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated)
  const totalDoses = usable.reduce((sum, s) => sum + (s.medications?.count ?? 0), 0)
  const daysWithLog = usable.filter((s) => (s.medications?.count ?? 0) > 0).length
  const empty = totalDoses === 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-slate-700">
        <Pill className="h-3.5 w-3.5" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-slate-700">Doses logadas</span>
        {empty ? (
          <span className="text-slate-500">— sem doses nesta janela</span>
        ) : (
          <span className="text-slate-600">
            · {totalDoses} doses em {daysWithLog} {daysWithLog === 1 ? 'dia' : 'dias'} ({usable.length} no recorte)
          </span>
        )}
      </div>
    </div>
  )
}
