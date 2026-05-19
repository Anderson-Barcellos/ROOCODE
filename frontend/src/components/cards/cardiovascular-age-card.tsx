import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { USER_PROFILE } from '@/utils/user-profile'
import { mean } from '@/utils/date'
import { estimateVo2MaxUthSorensen } from '@/utils/health-policies'
import { CHART_REQUIREMENTS, evaluateReadiness } from '@/utils/data-readiness'
import { buildIndexEvidenceReport } from '@/utils/index-evidence'

interface CardiovascularAgeCardProps {
  snapshots: DailySnapshot[]
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function CardiovascularAgeCard({ snapshots }: CardiovascularAgeCardProps) {
  const summary = useMemo(() => {
    const readiness = evaluateReadiness(
      snapshots,
      CHART_REQUIREMENTS.cardiovascularAgeIndex,
      'CardiovascularAge',
    )
    const real = snapshots.filter((snapshot) => !snapshot.interpolated && !snapshot.forecasted)
    const latest = real.at(-1) ?? snapshots.at(-1) ?? null
    const rhr = latest?.health?.restingHeartRate ?? mean(real.map((snapshot) => snapshot.health?.restingHeartRate ?? null))
    const hrv = latest?.health?.hrvSdnn ?? mean(real.map((snapshot) => snapshot.health?.hrvSdnn ?? null))
    const usedVo2Proxy = latest?.health?.vo2Max == null && rhr != null
    const vo2 = latest?.health?.vo2Max ?? (rhr != null ? estimateVo2MaxUthSorensen(rhr, USER_PROFILE.hrMaxBpm) : null)
    if (rhr == null || hrv == null || vo2 == null) {
      return {
        cardiovascularAge: null,
        confidence: 0,
        rhr,
        hrv,
        vo2,
        evidence: buildIndexEvidenceReport({
          eligible: false,
          reason: 'inputs_missing',
          inputsUsed: [rhr != null ? 'restingHeartRate' : '', hrv != null ? 'hrvSdnn' : '', vo2 != null ? 'vo2' : ''].filter(Boolean),
          inputsMissing: [
            rhr == null ? 'restingHeartRate' : '',
            hrv == null ? 'hrvSdnn' : '',
            vo2 == null ? 'vo2' : '',
          ].filter(Boolean),
          proxiesUsed: usedVo2Proxy ? ['vo2FromRhr'] : [],
          usedInterpolated: false,
          confidencePenalty: 0,
          readiness: readiness.status,
        }),
      }
    }

    const rhrPenalty = (rhr - 58) * 0.55
    const hrvPenalty = (55 - hrv) * 0.18
    const vo2Penalty = (42 - vo2) * 0.42
    const cardiovascularAge = clamp(USER_PROFILE.age + rhrPenalty + hrvPenalty + vo2Penalty, 24, 85)
    const baseConfidence = clamp(real.length / 30, 0.35, 1)
    const eligible = readiness.status !== 'standby'
    const confidence = eligible ? baseConfidence : 0
    return {
      cardiovascularAge: eligible ? cardiovascularAge : null,
      confidence,
      rhr,
      hrv,
      vo2,
      evidence: buildIndexEvidenceReport({
        eligible,
        reason: eligible ? 'ok' : 'insufficient_readiness',
        inputsUsed: ['restingHeartRate', 'hrvSdnn', 'vo2'],
        inputsMissing: [],
        proxiesUsed: usedVo2Proxy ? ['vo2FromRhr'] : [],
        usedInterpolated: false,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  }, [snapshots])

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Leitura interpretativa
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">Idade cardiovascular</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Estimativa ampla baseada em FC de repouso, HRV, VO2 e idade cronológica.
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-['Fraunces'] text-5xl tracking-[-0.07em] text-slate-900">
            {summary?.cardiovascularAge != null ? summary.cardiovascularAge.toFixed(0) : '--'}
          </p>
          <p className="text-xs text-slate-500">
            {summary?.cardiovascularAge != null ? `idade equivalente · ${Math.round(summary.confidence * 100)}% confiança` : 'dados insuficientes'}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
          !summary?.cardiovascularAge
            ? 'border-slate-200 bg-slate-100 text-slate-700'
            : summary.cardiovascularAge <= USER_PROFILE.age
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : summary.cardiovascularAge <= USER_PROFILE.age + 5
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {!summary?.cardiovascularAge ? 'Coletando' : summary.cardiovascularAge <= USER_PROFILE.age ? 'Compatível' : summary.cardiovascularAge <= USER_PROFILE.age + 5 ? 'A vigiar' : 'Desfavorável'}
        </span>
      </div>

      {summary?.cardiovascularAge != null ? (
        <div className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">RHR {summary.rhr.toFixed(0)} bpm</div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">HRV {summary.hrv.toFixed(0)} ms</div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">VO2 {summary.vo2.toFixed(1)}</div>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Estimativa exploratória com intervalo amplo de confiança. Serve para engajamento e tendência, não para diagnóstico.
      </p>
    </div>
  )
}
