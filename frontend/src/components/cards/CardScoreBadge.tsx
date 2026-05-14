/**
 * Header score badge — padrão visual repetido em 8 cards/charts
 * (LimitingFactorCard, NightQualityCard, ActivityReadinessCard,
 * RecoveryScoreChart, HrvVariabilityChart, ChronotropicResponseChart,
 * AutonomicBalanceChart, HeartRateReserveChart, HeartRateReserveChart).
 *
 * BACKLOG #35 (2026-05-14): antes era JSX literal duplicado em cada
 * arquivo. Refatorado pra componente único pra garantir consistência
 * tipográfica (Fraunces, tracking, spacing) e facilitar mudanças globais.
 */

import type { ReactNode } from 'react'

interface CardScoreBadgeProps {
  /** Etiqueta acima do número (ex: "Score do dia", "Score", "Último"). */
  label: string
  /** Valor principal — número ou string formatada. */
  value: ReactNode
  /**
   * Banda/classificação opcional, renderizada entre o valor e o hint
   * (ex: "Robusto", "Alta", nome de faixa cardio). Aceita cor inline
   * via `bandColor` pra cores arbitrárias vindas de bands literais.
   */
  band?: ReactNode
  bandColor?: string
  /** Linha de contexto opcional (ex: data "21 abr"). */
  hint?: ReactNode
  /** Override de cor do número (default slate-900). */
  valueColorClass?: string
}

export function CardScoreBadge({
  label,
  value,
  band,
  bandColor,
  hint,
  valueColorClass = 'text-slate-900',
}: CardScoreBadgeProps) {
  return (
    <div className="text-right">
      <div className="text-[0.65rem] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-['Fraunces'] text-3xl tracking-[-0.04em] ${valueColorClass}`}>
        {value}
      </div>
      {band != null && (
        <div
          className="text-[0.7rem] font-semibold uppercase tracking-wider"
          style={bandColor ? { color: bandColor } : undefined}
        >
          {band}
        </div>
      )}
      {hint != null && <div className="text-[0.65rem] text-slate-500">{hint}</div>}
    </div>
  )
}
