import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { History, RefreshCw, Sparkles, X } from 'lucide-react'

import { useForecastReportById, useForecastReportsList } from '@/lib/api'
import type { DailySnapshot } from '@/types/apple-health'
import {
  useForecastReport,
  type ForecastDriver,
  type ForecastDriverDirection,
  type ForecastDriverImpact,
  type ForecastNarrative,
  type ForecastReport,
} from '@/hooks/useForecastReport'

interface ForecastReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  snapshots: DailySnapshot[]
  validRealDays: number
}

interface SectionConfig {
  id: string
  label: string
  key: keyof ForecastNarrative
}

const SECTIONS: readonly SectionConfig[] = [
  { id: 'contexto', label: 'Contexto recente', key: 'contexto_recente' },
  { id: 'hipoteses', label: 'Hipóteses ativas', key: 'hipoteses_ativas' },
  { id: 'tendencias', label: 'Tendências', key: 'tendencias' },
  { id: 'drivers', label: 'Drivers principais', key: 'drivers_principais' },
  { id: 'projecao', label: 'Projeção 5 dias', key: 'projecao_5d' },
  { id: 'monitoramento', label: 'Monitoramento', key: 'recomendacoes_monitoramento' },
]

const FORECAST_TABLE_FIELDS: Array<{ key: keyof NonNullable<DailySnapshot['health']>; label: string; unit: string }> = [
  { key: 'sleepTotalHours', label: 'Sono', unit: 'h' },
  { key: 'hrvSdnn', label: 'HRV', unit: 'ms' },
  { key: 'restingHeartRate', label: 'FC rep.', unit: 'bpm' },
]

const IMPACT_STYLES: Record<ForecastDriverImpact, string> = {
  alto: 'bg-violet-100 text-violet-800 border-violet-200',
  medio: 'bg-amber-100 text-amber-800 border-amber-200',
  baixo: 'bg-slate-100 text-slate-700 border-slate-200',
}

const DIRECTION_GLYPHS: Record<ForecastDriverDirection, string> = {
  positivo: '↑',
  negativo: '↓',
  neutro: '→',
}

const DIRECTION_COLORS: Record<ForecastDriverDirection, string> = {
  positivo: 'text-emerald-600',
  negativo: 'text-rose-600',
  neutro: 'text-slate-500',
}

function formatGeneratedAt(iso: string): string {
  try {
    return format(parseISO(iso), "d 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}

function formatGeneratedAtShort(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM · HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

function formatValence(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

interface HistoryItem {
  report_id: string
  generated_at: string
  preview: string
}

function buildHistoryItems(reports: ForecastReport[] | undefined): HistoryItem[] {
  if (!reports) return []
  return reports.map((r) => ({
    report_id: r.report_id,
    generated_at: r.generated_at,
    preview: truncate(r.narrative?.contexto_recente ?? '', 70),
  }))
}

function HistoryList({
  items,
  selectedReportId,
  onSelect,
  variant,
}: {
  items: HistoryItem[]
  selectedReportId: string | null
  onSelect: (reportId: string) => void
  variant: 'sidebar' | 'idle'
}) {
  if (items.length === 0) {
    if (variant === 'sidebar') {
      return (
        <p className="px-2 text-[0.7rem] leading-5 text-slate-400">
          Nenhuma análise persistida ainda.
        </p>
      )
    }
    return null
  }

  return (
    <ul className={variant === 'sidebar' ? 'space-y-1' : 'mt-3 max-h-64 space-y-1 overflow-y-auto'}>
      {items.map((item) => {
        const isSelected = item.report_id === selectedReportId
        return (
          <li key={item.report_id}>
            <button
              type="button"
              onClick={() => onSelect(item.report_id)}
              className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'bg-violet-100 text-violet-900'
                  : 'bg-white text-slate-700 hover:bg-violet-50'
              }`}
            >
              <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-violet-700">
                {formatGeneratedAtShort(item.generated_at)}
              </div>
              {item.preview && (
                <div className="mt-0.5 line-clamp-2 text-[0.72rem] leading-snug text-slate-600">
                  {item.preview}
                </div>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function IdleState({
  onGenerate,
  history,
  selectedReportId,
  onSelectHistory,
}: {
  onGenerate: () => void
  history: HistoryItem[]
  selectedReportId: string | null
  onSelectHistory: (reportId: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 text-center">
      <Sparkles className="mb-4 h-12 w-12 text-violet-400" strokeWidth={1.4} />
      <h3 className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
        Nenhuma análise gerada ainda
      </h3>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
        O modelo IA analisa os últimos 45 dias de dados (sono, FC, HRV, mood, regime
        farmacológico, derivações compostas) e projeta os próximos 5. Leva ~10-15s.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)] transition-colors hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <Sparkles className="h-4 w-4" strokeWidth={2} />
        Gerar nova análise
      </button>

      {history.length > 0 && (
        <div className="mt-8 w-full max-w-md">
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
            Ou veja análises anteriores
          </p>
          <HistoryList
            items={history}
            selectedReportId={selectedReportId}
            onSelect={onSelectHistory}
            variant="idle"
          />
        </div>
      )}
    </div>
  )
}

function LoadingState({ contextLabel }: { contextLabel: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" />
      <h3 className="font-['Fraunces'] text-xl tracking-[-0.03em] text-slate-900">
        {contextLabel}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        Modelo IA processando contexto clínico, regime PK e derivações compostas.
        Pode levar até 30s.
      </p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">
        ⚠
      </div>
      <h3 className="font-['Fraunces'] text-xl tracking-[-0.03em] text-slate-900">
        Não foi possível carregar análise
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-rose-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-5 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <RefreshCw className="h-4 w-4" strokeWidth={2} />
        Tentar de novo
      </button>
    </div>
  )
}

function DriverCard({ driver }: { driver: ForecastDriver }) {
  const impactClass = IMPACT_STYLES[driver.impact] ?? IMPACT_STYLES.baixo
  const directionGlyph = DIRECTION_GLYPHS[driver.direction] ?? '·'
  const directionColor = DIRECTION_COLORS[driver.direction] ?? 'text-slate-500'

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${impactClass}`}
        >
          {driver.impact}
        </span>
        <span className={`text-lg font-semibold ${directionColor}`} aria-hidden>
          {directionGlyph}
        </span>
        <span className="font-semibold text-slate-900">{driver.name}</span>
      </div>
      {driver.rationale && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{driver.rationale}</p>
      )}
    </div>
  )
}

function ForecastTable({ snapshots }: { snapshots: DailySnapshot[] }) {
  if (!snapshots.length) {
    return <p className="text-sm text-slate-500">Sem previsão disponível.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-slate-50 text-[0.7rem] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Data</th>
            {FORECAST_TABLE_FIELDS.map((field) => (
              <th key={field.key} className="px-3 py-2 text-right font-semibold">
                {field.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold">Humor</th>
            <th className="px-3 py-2 text-right font-semibold">Conf.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {snapshots.map((snap) => {
            const conf = snap.forecastConfidence ?? 0
            return (
              <tr key={snap.date} className="text-slate-700">
                <td className="px-3 py-2 font-mono text-xs">
                  {format(parseISO(snap.date), "d MMM (EEE)", { locale: ptBR })}
                </td>
                {FORECAST_TABLE_FIELDS.map((field) => {
                  const raw = snap.health?.[field.key]
                  const value = typeof raw === 'number' ? raw : null
                  return (
                    <td key={field.key} className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(value, field.key === 'sleepTotalHours' ? 1 : 0)}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatValence(snap.mood?.valence)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-violet-700">
                  {(conf * 100).toFixed(0)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SuccessState({
  report,
  onRegenerate,
  isRegenerating,
  history,
  selectedReportId,
  onSelectHistory,
  onBackToCurrent,
  canGoBackToCurrent,
}: {
  report: ForecastReport
  onRegenerate: () => void
  isRegenerating: boolean
  history: HistoryItem[]
  selectedReportId: string | null
  onSelectHistory: (reportId: string) => void
  onBackToCurrent: () => void
  canGoBackToCurrent: boolean
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sticky navigation lateral */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/50 px-4 py-5 md:block">
        <div className="space-y-4">
          <div>
            <p className="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
              Navegação
            </p>
            <nav className="flex flex-col gap-0.5">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#section-${section.id}`}
                  className="rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
                  {section.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="rounded-lg bg-white px-3 py-3 text-center">
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500">
              Confiança máx.
            </p>
            <p className="mt-1 font-['Fraunces'] text-2xl tracking-[-0.04em] text-violet-700">
              {(report.max_confidence * 100).toFixed(0)}%
            </p>
          </div>

          <div>
            <p className="flex items-center gap-1.5 px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
              <History className="h-3 w-3" strokeWidth={2} />
              Histórico
            </p>
            <HistoryList
              items={history}
              selectedReportId={selectedReportId}
              onSelect={onSelectHistory}
              variant="sidebar"
            />
          </div>

          <div className="space-y-2">
            {canGoBackToCurrent && (
              <button
                type="button"
                onClick={onBackToCurrent}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Voltar pra atual
              </button>
            )}
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} strokeWidth={2} />
              Gerar nova
            </button>
          </div>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-6">
          {SECTIONS.map((section) => {
            const text = report.narrative?.[section.key]
            if (!text) return null
            return (
              <section
                key={section.id}
                id={`section-${section.id}`}
                className="scroll-mt-4"
              >
                <h3 className="font-['Fraunces'] text-xl tracking-[-0.03em] text-slate-900">
                  {section.label}
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">{text}</p>

                {section.id === 'drivers' && report.drivers.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {report.drivers.map((driver, idx) => (
                      <DriverCard key={`${driver.name}-${idx}`} driver={driver} />
                    ))}
                  </div>
                )}

                {section.id === 'projecao' && (
                  <div className="mt-3">
                    <ForecastTable snapshots={report.forecast_snapshots} />
                  </div>
                )}
              </section>
            )
          })}

          {report.signals.length > 0 && (
            <section className="scroll-mt-4">
              <h3 className="font-['Fraunces'] text-xl tracking-[-0.03em] text-slate-900">
                Sinais detectados
              </h3>
              <ul className="mt-2 space-y-2">
                {report.signals.map((signal, idx) => (
                  <li
                    key={`${signal.field}-${idx}`}
                    className="flex items-start gap-3 rounded-xl bg-violet-50/60 px-3 py-2.5"
                  >
                    <span className="mt-0.5 shrink-0 text-xs font-bold uppercase tracking-wider text-violet-600">
                      {signal.field}
                    </span>
                    <span className="text-sm leading-5 text-slate-700">{signal.observation}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export function ForecastReportModal({
  open,
  onOpenChange,
  snapshots,
  validRealDays,
}: ForecastReportModalProps) {
  const report = useForecastReport()
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const reportsList = useForecastReportsList(30, 30)
  const historicReport = useForecastReportById(selectedReportId)

  const history = buildHistoryItems(reportsList.data?.reports)

  const fire = () => {
    setSelectedReportId(null)
    report.mutate({ snapshots, validRealDays })
  }

  const handleSelectHistory = (reportId: string) => {
    if (reportId === selectedReportId) return
    setSelectedReportId(reportId)
  }

  const handleBackToCurrent = () => {
    setSelectedReportId(null)
  }

  const isViewingHistory = selectedReportId !== null
  const activeReport: ForecastReport | undefined = isViewingHistory
    ? historicReport.data
    : report.data
  const isPendingActive = isViewingHistory ? historicReport.isLoading : report.isPending
  const isErrorActive = isViewingHistory ? historicReport.isError : report.isError
  const errorMessage = isViewingHistory
    ? historicReport.error?.message ?? 'Erro ao carregar relatório do histórico.'
    : report.error?.message ?? 'Erro inesperado no provedor de forecast.'

  let body: React.ReactNode
  if (isPendingActive) {
    body = (
      <LoadingState
        contextLabel={isViewingHistory ? 'Carregando relatório…' : 'Gerando análise…'}
      />
    )
  } else if (isErrorActive) {
    body = (
      <ErrorState
        message={errorMessage}
        onRetry={isViewingHistory ? () => historicReport.refetch() : fire}
      />
    )
  } else if (activeReport) {
    body = (
      <SuccessState
        report={activeReport}
        onRegenerate={fire}
        isRegenerating={report.isPending}
        history={history}
        selectedReportId={selectedReportId}
        onSelectHistory={handleSelectHistory}
        onBackToCurrent={handleBackToCurrent}
        canGoBackToCurrent={isViewingHistory && Boolean(report.data)}
      />
    )
  } else {
    body = (
      <IdleState
        onGenerate={fire}
        history={history}
        selectedReportId={selectedReportId}
        onSelectHistory={handleSelectHistory}
      />
    )
  }

  const headerSubtitle = activeReport
    ? `${formatGeneratedAt(activeReport.generated_at)}${isViewingHistory ? ' · histórico' : ''}`
    : 'Relatório IA detalhado · contexto clínico + projeção 5 dias'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-2 top-4 bottom-4 z-50 mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-slate-900/10 bg-white shadow-[0_32px_72px_rgba(15,23,42,0.32)] focus:outline-none md:inset-x-6 md:top-6 md:bottom-6"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900">
                <Sparkles className="h-5 w-5 text-violet-500" strokeWidth={1.8} />
                Análise IA
              </Dialog.Title>
              <p className="mt-1 text-xs text-slate-500">{headerSubtitle}</p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </Dialog.Close>
          </header>

          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
