/* eslint-disable react-refresh/only-export-components */

import { useState } from 'react'
import { Activity, HeartPulse, LayoutDashboard, Pill, SlidersHorizontal, Sparkles, Telescope } from 'lucide-react'
import type { InterpolationMode } from '@/hooks/useInterpolation'

export type TabKey = 'panorama' | 'recuperacao' | 'capacidade' | 'farmaco' | 'insights'
export type ThemeMode = 'clinical' | 'graphite' | 'contrast'
export type DensityMode = 'cozy' | 'compact'

export const rangeOptions = ['7d', '30d', '90d', '1y', 'all'] as const
export type RangeOption = (typeof rangeOptions)[number]

const AI_INTERPOLATION_ENABLED = import.meta.env.VITE_ENABLE_AI_INTERPOLATION === 'true'

const interpolationOptions: Array<{ key: InterpolationMode; label: string }> = AI_INTERPOLATION_ENABLED
  ? [
      { key: 'off', label: 'Off' },
      { key: 'linear', label: 'Linear' },
      { key: 'claude', label: 'IA' },
    ]
  : [
      { key: 'off', label: 'Off' },
      { key: 'linear', label: 'Linear' },
    ]

interface TabNavProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  blockedTabs?: TabKey[]
  blockReasonLabel?: string
  range: RangeOption
  onRangeChange: (range: RangeOption) => void
  interpolation: InterpolationMode
  onInterpolationChange: (mode: InterpolationMode) => void
  interpolationLoading?: boolean
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  density: DensityMode
  onDensityChange: (density: DensityMode) => void
  reducedMotion: boolean
  onReducedMotionChange: (enabled: boolean) => void
  onAnalyzeClick: () => void
}

const themeOptions: Array<{ key: ThemeMode; label: string }> = [
  { key: 'clinical', label: 'Clinical' },
  { key: 'graphite', label: 'Graphite' },
  { key: 'contrast', label: 'Contraste' },
]

const densityOptions: Array<{ key: DensityMode; label: string }> = [
  { key: 'cozy', label: 'Conforto' },
  { key: 'compact', label: 'Compacto' },
]

const tabs: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'panorama', label: 'Panorama', icon: LayoutDashboard },
  { key: 'recuperacao', label: 'Recuperação', icon: HeartPulse },
  { key: 'capacidade', label: 'Capacidade', icon: Activity },
  { key: 'farmaco', label: 'Farmaco', icon: Pill },
  { key: 'insights', label: 'Insights', icon: Telescope },
]

export function TabNav({
  activeTab,
  onTabChange,
  blockedTabs = [],
  blockReasonLabel,
  range,
  onRangeChange,
  interpolation,
  onInterpolationChange,
  interpolationLoading = false,
  theme,
  onThemeChange,
  density,
  onDensityChange,
  reducedMotion,
  onReducedMotionChange,
  onAnalyzeClick,
}: TabNavProps) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-900/10 bg-white/92 shadow-sm backdrop-blur">
      <div className="px-3 py-2 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(({ key, label, icon: Icon }) => {
            const blocked = blockedTabs.includes(key)
            const active = activeTab === key && !blocked
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (blocked) return
                  onTabChange(key)
                }}
                disabled={blocked}
                aria-disabled={blocked}
                title={blocked ? 'Aba temporariamente bloqueada' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-slate-950 text-white shadow-sm'
                    : blocked
                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100/80 text-slate-400'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {blocked && blockReasonLabel && (
                  <span className="rounded-full border border-slate-300/80 bg-white/70 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {blockReasonLabel}
                  </span>
                )}
              </button>
            )
          })}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <label className="sr-only" htmlFor="range-select">Período</label>
            <select
              id="range-select"
              value={range}
              onChange={(event) => onRangeChange(event.target.value as RangeOption)}
              className="h-8 rounded-full border border-slate-900/15 bg-white px-2.5 text-xs font-semibold text-slate-700"
            >
              {rangeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

          <button
            type="button"
            onClick={onAnalyzeClick}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-violet-600 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            <Sparkles className="h-3 w-3" />
            IA
          </button>

            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              aria-expanded={showSettings}
              className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition ${
                showSettings
                  ? 'border-slate-900/25 bg-slate-900 text-white'
                  : 'border-slate-900/15 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Ajustes
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="mt-2 rounded-xl border border-slate-900/10 bg-white/85 p-2.5 shadow-[0_8px_20px_rgba(17,35,30,0.08)] backdrop-blur">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <Sparkles className="h-3 w-3" />
                  Interpolação
                </span>
                <div className="flex flex-wrap gap-1">
                  {interpolationOptions.map(({ key, label }) => {
                    const active = interpolation === key
                    const showSpinner = active && key === 'claude' && interpolationLoading
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onInterpolationChange(key)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                          active
                            ? key === 'claude'
                              ? 'bg-teal-700 text-white'
                              : key === 'linear'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-950 text-white'
                            : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                        {showSpinner && (
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" aria-label="loading" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Tema</span>
                <div className="flex flex-wrap gap-1">
                  {themeOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onThemeChange(key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        theme === key
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Densidade</span>
                <div className="flex flex-wrap gap-1">
                  {densityOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onDensityChange(key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        density === key
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Acessibilidade</span>
                <button
                  type="button"
                  onClick={() => onReducedMotionChange(!reducedMotion)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    reducedMotion
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Reduz animações e transições visuais"
                >
                  Movimento reduzido
                </button>
                <p className="text-[0.68rem] text-slate-500">Atalhos: T (tema) · D (densidade)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
