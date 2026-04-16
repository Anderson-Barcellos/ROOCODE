/* eslint-disable react-refresh/only-export-components */

import { BrainCircuit, LayoutDashboard, MoonStar, Orbit } from 'lucide-react'

export type TabKey = 'executive' | 'moodMedication' | 'sleepPhysiology' | 'patterns'

export const rangeOptions = ['7d', '30d', '90d', '1y', 'all'] as const
export type RangeOption = (typeof rangeOptions)[number]

interface TabNavProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  range: RangeOption
  onRangeChange: (range: RangeOption) => void
}

const tabs: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'executive', label: 'Executivo', icon: LayoutDashboard },
  { key: 'moodMedication', label: 'Humor + Medicação', icon: BrainCircuit },
  { key: 'sleepPhysiology', label: 'Sono + Fisiologia', icon: MoonStar },
  { key: 'patterns', label: 'Padrões', icon: Orbit },
]

export function TabNav({ activeTab, onTabChange, range, onRangeChange }: TabNavProps) {
  return (
    <nav className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-900/10 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 pt-3 pb-2">
        <div className="flex flex-wrap gap-1">
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">Período</span>
          {rangeOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onRangeChange(option)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                range === option
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
