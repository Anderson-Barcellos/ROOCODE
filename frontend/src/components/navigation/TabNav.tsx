/* eslint-disable react-refresh/only-export-components */

import { useEffect, useRef, useState } from 'react'
import { Activity, Heart, HeartPulse, LayoutDashboard, Moon, Pill, SlidersHorizontal, Sparkles, Telescope } from 'lucide-react'
import type { InterpolationMode } from '@/hooks/useInterpolation'

export type TabKey = 'panorama' | 'recuperacao' | 'capacidade' | 'farmaco' | 'sono' | 'coracao' | 'insights'
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
  { key: 'sono', label: 'Sono', icon: Moon },
  { key: 'coracao', label: 'Coração', icon: Heart },
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
  const tabScrollRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!tabScrollRef.current || !activeTabRef.current) return
    activeTabRef.current.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeTab])

  return (
    <nav className="sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--card-strong)] shadow-sm backdrop-blur">
      <div className="px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div ref={tabScrollRef} className="order-1 flex min-w-0 w-full items-center gap-1 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:flex-1">
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
                ref={active ? activeTabRef : null}
                className={`inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)] shadow-sm'
                    : blocked
                    ? 'cursor-not-allowed border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--muted)] opacity-70'
                    : 'text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--card)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {blocked && blockReasonLabel && (
                  <span className="hidden rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)] sm:inline-flex">
                    {blockReasonLabel}
                  </span>
                )}
              </button>
            )
          })}
          </div>

          <div className="order-2 ml-auto flex w-full items-center justify-end gap-1.5 sm:w-auto">
            <label className="sr-only" htmlFor="range-select">Período</label>
            <select
              id="range-select"
              value={range}
              onChange={(event) => onRangeChange(event.target.value as RangeOption)}
              className="h-8 rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-2.5 text-xs font-semibold text-[color:var(--foreground)]"
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
                  ? 'border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                  : 'border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)] hover:bg-[color:var(--card)]'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Ajustes
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="mt-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-2.5 shadow-[0_8px_20px_rgba(17,35,30,0.08)] backdrop-blur">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
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
                                : 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                            : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)] hover:bg-[color:var(--card)]'
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
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Tema</span>
                <div className="flex flex-wrap gap-1">
                  {themeOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onThemeChange(key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        theme === key
                          ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                          : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)] hover:bg-[color:var(--card)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Densidade</span>
                <div className="flex flex-wrap gap-1">
                  {densityOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onDensityChange(key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        density === key
                          ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                          : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)] hover:bg-[color:var(--card)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Acessibilidade</span>
                <button
                  type="button"
                  onClick={() => onReducedMotionChange(!reducedMotion)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    reducedMotion
                      ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                      : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)] hover:bg-[color:var(--card)]'
                  }`}
                  title="Reduz animações e transições visuais"
                >
                  Movimento reduzido
                </button>
                <p className="text-[0.68rem] text-[color:var(--muted)]">Atalhos: T (tema) · D (densidade)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
