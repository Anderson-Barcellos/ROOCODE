import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Compass, BrainCircuit, MoonStar, Orbit } from 'lucide-react'
import { TabNav, type TabKey, type RangeOption } from '@/components/navigation/TabNav'
import { SurfaceFrame, EmptyAnalyticsState } from '@/components/analytics/shared'
import DoseLogger from '@/components/DoseLogger'
import { ChartsDemo } from '@/pages/ChartsDemo'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('executive')
  const [range, setRange] = useState<RangeOption>('30d')
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#charts-demo') return <ChartsDemo />

  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <>
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} range={range} onRangeChange={setRange} />

      <main className="app-shell">
        {/* Hero panel */}
        <section className="hero-panel">
          <span className="eyebrow">
            RooCode · Dashboard de Saúde Pessoal
          </span>
          <h1>Neuropsiquiatria, farmacocinética e dados de Apple Watch — sob o mesmo teto.</h1>
          <p>
            Correlações clínicas entre concentração plasmática, humor, sono e fisiologia cardiovascular.
            Janela atual: <strong>{range}</strong> · {today}.
          </p>
        </section>

        <div className="mt-6">
          {activeTab === 'executive' && (
            <SurfaceFrame
              icon={<Compass className="h-4 w-4" />}
              kicker="Executivo"
              title="Visão geral semanal"
              description="Panorama consolidado de sono, atividade, humor e medicação nos últimos dias."
              window={{ label: range, coveredDays: null }}
              status="Em desenvolvimento — Fase 4"
            >
              <EmptyAnalyticsState message="MetricCards + Timeline + Insights serão implementados na Fase 4." />
            </SurfaceFrame>
          )}

          {activeTab === 'moodMedication' && (
            <SurfaceFrame
              icon={<BrainCircuit className="h-4 w-4" />}
              kicker="Humor + Medicação"
              title="Farmacocinética e estado afetivo"
              description="Concentração plasmática (% Cmax) sobreposta ao humor — com doses, lags e regressões."
              window={{ label: range, coveredDays: null }}
              status="Em desenvolvimento — Fase 4"
            >
              <div className="mt-5 max-w-md">
                <DoseLogger />
              </div>
            </SurfaceFrame>
          )}

          {activeTab === 'sleepPhysiology' && (
            <SurfaceFrame
              icon={<MoonStar className="h-4 w-4" />}
              kicker="Sono + Fisiologia"
              title="Arquitetura do sono e recuperação"
              description="Estágios de sono, HRV, FC em repouso, SpO₂ e padrões semanais."
              window={{ label: range, coveredDays: null }}
              status="Em desenvolvimento — Fase 4"
            >
              <EmptyAnalyticsState message="Sleep stages chart + HRV analysis + Heart rate bands serão implementados na Fase 4." />
            </SurfaceFrame>
          )}

          {activeTab === 'patterns' && (
            <SurfaceFrame
              icon={<Orbit className="h-4 w-4" />}
              kicker="Padrões"
              title="Análise correlacional"
              description="Matriz N×N Pearson entre PK, humor, sono, HRV e atividade. Clique uma célula para ver o scatter detalhado."
              window={{ label: range, coveredDays: null }}
              status="Em desenvolvimento — Fase 4"
            >
              <EmptyAnalyticsState message="Correlation heatmap + Scatter correlation + Lag analysis serão implementados na Fase 4." />
            </SurfaceFrame>
          )}
        </div>
      </main>
    </>
  )
}
