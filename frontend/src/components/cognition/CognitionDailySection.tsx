import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  ListTree,
  LoaderCircle,
  NotebookPen,
  Orbit,
  TimerReset,
  Zap,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import type { RangeOption } from '@/components/navigation/TabNav'
import { EmptyAnalyticsState, SurfaceFrame } from '@/components/analytics/shared'
import {
  useCognitionStatus,
  useCompleteCognitionSession,
  usePrepareCognitionSession,
} from '@/lib/api'
import type {
  CognitiveContextInput,
  CognitiveFlankerTrial,
  CognitivePvtTrial,
  CognitiveSessionChartRow,
  CognitiveSessionRecord,
  CognitiveSpanAttempt,
  CognitiveVasInput,
  CompleteCognitiveSessionInput,
  PreparedCognitionPlan,
  SpanKind,
} from '@/types/cognition'
import {
  buildBalancedFlankerTrials,
  buildCorsiSequence,
  buildDigitSequence,
  spanLabel,
} from '@/utils/cognition-session'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'
import { ChartTooltip } from '@/components/charts/shared/ChartTooltip'
import {
  COGNITIVE_POLARITY,
  COGNITIVE_RELIABILITY,
  classifyChange,
  computeBaselineStats,
  detectDecoupling,
  spcBands,
  type ReliableMetricKey,
} from '@/utils/cognition-reliable-change'
import { PKCognitionScatterChart } from './PKCognitionScatterChart'

const STEP_LABELS = [
  'Contexto',
  'PVT',
  'Span',
  'Rotativo',
] as const

type SessionPhase = 'idle' | 'context' | 'pvt' | 'span' | 'slot' | 'saving'
type TimelineMetricKey = 'pvt_lapses' | 'pvt_response_speed' | 'span_primary' | 'slot_primary'

function formatMetricValue(row: CognitiveSessionChartRow, key: TimelineMetricKey) {
  const value = row[key]
  if (value == null) return 'n/d'
  if (key === 'pvt_response_speed') return value.toFixed(2)
  if (key === 'slot_primary' && row.rotating_type === 'B') return `${Math.round(value * 100)}%`
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function localDateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function baselineWindow(rows: CognitiveSessionChartRow[]) {
  const baselineRows = rows.filter((row) => row.baseline_phase)
  if (baselineRows.length === 0) return null
  return {
    from: baselineRows[0].date,
    to: baselineRows[baselineRows.length - 1].date,
  }
}

function statusTone(record: CognitiveSessionRecord | null) {
  if (!record) return 'text-slate-700'
  const lapses = record.pvt.lapses_count
  const speed = record.pvt.response_speed_mean ?? 0
  if (lapses <= 2 && speed >= 2.4) return 'text-emerald-700 dark:text-emerald-300'
  if (lapses >= 6 || speed <= 1.9) return 'text-rose-700 dark:text-rose-300'
  return 'text-amber-700 dark:text-amber-300'
}

function todaySessionLabel(record: CognitiveSessionRecord | null) {
  if (!record) return 'Sem aferição concluída hoje'
  if (record.baseline_phase) return 'Sessão concluída · baseline em construção'
  return 'Sessão concluída · comparável ao baseline'
}

function StepShell({
  currentStep,
  children,
}: {
  currentStep: number
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4">
        {STEP_LABELS.map((label, index) => {
          const active = currentStep === index
          const done = currentStep > index
          return (
            <div
              key={label}
              className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                active
                  ? 'border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                  : done
                    ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--muted)]'
              }`}
            >
              <span className="text-[0.68rem] uppercase tracking-[0.18em]">{index + 1}</span>
              <div className="mt-1">{label}</div>
            </div>
          )
        })}
      </div>
      {children}
    </div>
  )
}

function NumericSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[color:var(--foreground)]">{label}</span>
        <span className="text-sm font-semibold text-[color:var(--muted)]">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-[color:var(--foreground)]"
      />
    </div>
  )
}

function ContextStep({
  initialContext,
  initialVas,
  onNext,
}: {
  initialContext: CognitiveContextInput
  initialVas: CognitiveVasInput
  onNext: (payload: { context: CognitiveContextInput; vas: CognitiveVasInput }) => void
}) {
  const [context, setContext] = useState<CognitiveContextInput>(initialContext)
  const [vas, setVas] = useState<CognitiveVasInput>(initialVas)

  return (
    <StepShell currentStep={0}>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Estado interno</p>
            <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">
              Como tu estás entrando na sessão?
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <NumericSlider label="Humor" value={vas.mood} onChange={(mood) => setVas((prev) => ({ ...prev, mood }))} />
            <NumericSlider label="Energia / alerta" value={vas.energy} onChange={(energy) => setVas((prev) => ({ ...prev, energy }))} />
            <NumericSlider label="Ansiedade" value={vas.anxiety} onChange={(anxiety) => setVas((prev) => ({ ...prev, anxiety }))} />
            <NumericSlider label="Quão descansado" value={vas.rested ?? 50} onChange={(rested) => setVas((prev) => ({ ...prev, rested }))} />
          </div>
        </section>

        <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Contexto</p>
            <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">
              Covariáveis da sessão
            </h3>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-[color:var(--foreground)]">
              Horas de sono na noite anterior
              <input
                type="number"
                min={0}
                max={24}
                step={0.1}
                value={context.sleep_hours ?? ''}
                onChange={(event) =>
                  setContext((prev) => ({
                    ...prev,
                    sleep_hours: event.target.value === '' ? null : Number(event.target.value),
                  }))
                }
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-sm font-semibold text-[color:var(--foreground)]">
              <input
                type="checkbox"
                checked={context.caffeine_taken}
                onChange={(event) =>
                  setContext((prev) => ({
                    ...prev,
                    caffeine_taken: event.target.checked,
                    caffeine_amount_mg: event.target.checked ? prev.caffeine_amount_mg : null,
                  }))
                }
              />
              Café / estimulante ingerido até agora
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[color:var(--foreground)]">
              Cafeína (mg)
              <input
                type="number"
                min={0}
                max={2000}
                step={5}
                value={context.caffeine_amount_mg ?? ''}
                disabled={!context.caffeine_taken}
                onChange={(event) =>
                  setContext((prev) => ({
                    ...prev,
                    caffeine_amount_mg: event.target.value === '' ? null : Number(event.target.value),
                  }))
                }
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-sm disabled:opacity-50"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[color:var(--foreground)]">
              Horário da dose de Vyvanse
              <input
                type="time"
                value={context.vyvanse_taken_at ?? ''}
                onChange={(event) =>
                  setContext((prev) => ({
                    ...prev,
                    vyvanse_taken_at: event.target.value || null,
                  }))
                }
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--foreground)]">Almoço já realizado?</span>
              <div className="flex gap-2">
                {[
                  { label: 'Antes', value: true },
                  { label: 'Ainda não', value: false },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setContext((prev) => ({ ...prev, lunch_completed: option.value }))}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                      context.lunch_completed === option.value
                        ? 'border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                        : 'border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNext({ context, vas })}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)]"
          >
            Iniciar PVT
            <ChevronRight className="h-4 w-4" />
          </button>
        </section>
      </div>
    </StepShell>
  )
}

function PvtTask({
  durationMs,
  isiMinMs,
  isiMaxMs,
  onComplete,
}: {
  durationMs: number
  isiMinMs: number
  isiMaxMs: number
  onComplete: (payload: { duration_ms: number; trials: CognitivePvtTrial[] }) => void
}) {
  const [status, setStatus] = useState<'ready' | 'waiting' | 'stimulus' | 'done'>('ready')
  const [remainingMs, setRemainingMs] = useState(durationMs)
  const [message, setMessage] = useState('Clica para iniciar e responde assim que o alvo aparecer.')
  const [trialCount, setTrialCount] = useState(0)
  const startAtRef = useRef<number | null>(null)
  const waitStartedAtRef = useRef<number | null>(null)
  const stimulusAtRef = useRef<number | null>(null)
  const falseStartsRef = useRef(0)
  const currentDelayRef = useRef(isiMinMs)
  const trialsRef = useRef<CognitivePvtTrial[]>([])
  const timerRef = useRef<number | null>(null)
  const clockRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      if (clockRef.current) window.clearInterval(clockRef.current)
    }
  }, [])

  const finalize = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (clockRef.current) window.clearInterval(clockRef.current)
    setStatus('done')
    setMessage('PVT concluído. Bora para o span.')
    onComplete({ duration_ms: durationMs, trials: trialsRef.current })
  }

  const scheduleNextTrial = () => {
    if (startAtRef.current == null) return
    const elapsed = performance.now() - startAtRef.current
    if (elapsed >= durationMs) {
      finalize()
      return
    }
    const delay = isiMinMs + Math.round(Math.random() * (isiMaxMs - isiMinMs))
    currentDelayRef.current = delay
    falseStartsRef.current = 0
    waitStartedAtRef.current = performance.now()
    setStatus('waiting')
    setMessage('Aguarda o alvo aparecer.')
    timerRef.current = window.setTimeout(() => {
      stimulusAtRef.current = performance.now()
      setStatus('stimulus')
      setMessage('Agora!')
    }, delay)
  }

  const startTask = () => {
    trialsRef.current = []
    startAtRef.current = performance.now()
    setTrialCount(0)
    setRemainingMs(durationMs)
    if (clockRef.current) window.clearInterval(clockRef.current)
    clockRef.current = window.setInterval(() => {
      if (startAtRef.current == null) return
      const elapsed = performance.now() - startAtRef.current
      const nextRemaining = Math.max(0, durationMs - elapsed)
      setRemainingMs(nextRemaining)
      if (nextRemaining <= 0) finalize()
    }, 100)
    scheduleNextTrial()
  }

  const registerResponse = () => {
    if (status === 'ready' || status === 'done') return
    if (status === 'waiting') {
      falseStartsRef.current += 1
      setMessage('Muito cedo.')
      return
    }
    if (status === 'stimulus' && stimulusAtRef.current != null) {
      const reactionTime = performance.now() - stimulusAtRef.current
      trialsRef.current = [
        ...trialsRef.current,
        {
          stimulus_delay_ms: currentDelayRef.current,
          false_starts: falseStartsRef.current,
          reaction_time_ms: Math.round(reactionTime),
        },
      ]
      setTrialCount(trialsRef.current.length)
      setStatus('waiting')
      setMessage(`${Math.round(reactionTime)} ms`)
      window.setTimeout(() => scheduleNextTrial(), 220)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        registerResponse()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <StepShell currentStep={1}>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">PVT</p>
          <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Vigilância psicomotora</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Toca ou aperta espaço assim que o alvo surgir. Resposta antes da hora conta como falso início.
          </p>
          <button
            type="button"
            onClick={status === 'ready' ? startTask : registerResponse}
            className={`mt-5 flex h-[340px] w-full items-center justify-center rounded-[1.8rem] border text-center shadow-[0_16px_36px_rgba(17,35,30,0.09)] ${
              status === 'stimulus'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                : 'border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'
            }`}
          >
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-current/15 bg-white/55 text-2xl">
                {status === 'stimulus' ? <Zap className="h-8 w-8" /> : <TimerReset className="h-8 w-8" />}
              </div>
              <div className="text-2xl font-bold tracking-[-0.05em]">
                {status === 'ready' ? 'Iniciar PVT' : status === 'stimulus' ? 'TOCA' : status === 'done' ? 'Feito' : '...'}
              </div>
              <p className="mx-auto max-w-sm text-sm leading-6">{message}</p>
            </div>
          </button>
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Tempo restante</p>
            <div className="mt-2 text-3xl font-bold tracking-[-0.06em] text-[color:var(--foreground)]">
              {Math.ceil(remainingMs / 1000)}s
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Estímulos completos</p>
            <div className="mt-2 text-3xl font-bold tracking-[-0.06em] text-[color:var(--foreground)]">{trialCount}</div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4 text-sm leading-6 text-[color:var(--muted)]">
            O alvo surge com intervalos aleatórios entre {isiMinMs / 1000} e {isiMaxMs / 1000} segundos.
          </div>
        </section>
      </div>
    </StepShell>
  )
}

function DigitSpanTask({
  onComplete,
}: {
  onComplete: (payload: { kind: SpanKind; attempts: CognitiveSpanAttempt[] }) => void
}) {
  const [phase, setPhase] = useState<'forward' | 'backward'>('forward')
  const [length, setLength] = useState(3)
  const [attempts, setAttempts] = useState<CognitiveSpanAttempt[]>([])
  const [presenting, setPresenting] = useState(false)
  const [presentedSequence, setPresentedSequence] = useState<number[]>([])
  const [currentDigit, setCurrentDigit] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [failStreak, setFailStreak] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const startAttempt = () => {
    const sequence = buildDigitSequence(length)
    setPresentedSequence(sequence)
    setTyped('')
    setPresenting(true)
    let index = 0
    const showNext = () => {
      if (index >= sequence.length) {
        setCurrentDigit(null)
        setPresenting(false)
        return
      }
      setCurrentDigit(sequence[index])
      index += 1
      window.setTimeout(() => {
        setCurrentDigit(null)
        window.setTimeout(showNext, 280)
      }, 650)
    }
    showNext()
  }

  const submitAttempt = () => {
    if (presenting || typed.length !== presentedSequence.length) return
    const response = typed
      .split('')
      .map((char) => Number(char))
      .filter((value) => Number.isFinite(value))
    const expected = phase === 'backward' ? [...presentedSequence].reverse() : presentedSequence
    const correct = response.join(',') === expected.join(',')
    const nextAttempts = [
      ...attempts,
      {
        direction: phase,
        length,
        sequence: presentedSequence,
        response,
        correct,
      },
    ]
    setAttempts(nextAttempts)

    if (correct) {
      setLength((prev) => prev + 1)
      setFailStreak(0)
    } else {
      const nextFailStreak = failStreak + 1
      setFailStreak(nextFailStreak)
      if (nextFailStreak >= 2) {
        if (phase === 'forward') {
          setPhase('backward')
          setLength(3)
          setFailStreak(0)
          setTyped('')
          return
        }
        onComplete({ kind: 'digit', attempts: nextAttempts })
        return
      }
      window.setTimeout(startAttempt, 0)
    }
    setTyped('')
  }

  useEffect(() => {
    startAttempt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, length])

  useEffect(() => {
    if (!presenting && presentedSequence.length > 0) {
      inputRef.current?.focus()
    }
  }, [presenting, presentedSequence.length])

  return (
    <StepShell currentStep={2}>
      <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Span</p>
            <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Digit span</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              {phase === 'forward' ? 'Repete a sequência na mesma ordem.' : 'Repete a sequência ao contrário.'}
            </p>
          </div>
          <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-1.5 text-sm font-semibold text-[color:var(--foreground)]">
            Comprimento {length}
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-10 text-center shadow-[0_16px_34px_rgba(17,35,30,0.06)]">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Sequência atual</div>
          <div className="mt-4 min-h-[4rem] text-5xl font-bold tracking-[0.08em] text-[color:var(--foreground)]">
            {currentDigit ?? (presenting ? '·' : 'Digite a resposta')}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={typed}
            disabled={presenting}
            onChange={(event) => setTyped(event.target.value.replace(/\D/g, '').slice(0, 12))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitAttempt()
              }
            }}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-3 text-lg font-semibold tracking-[0.2em] text-[color:var(--foreground)] disabled:opacity-60"
            placeholder="Ex.: 3142"
          />
          <button
            type="button"
            disabled={presenting || typed.length !== presentedSequence.length}
            onClick={submitAttempt}
            className="rounded-2xl bg-[color:var(--foreground)] px-4 py-3 text-sm font-semibold text-[color:var(--card-strong)] disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </section>
    </StepShell>
  )
}

function CorsiSpanTask({
  onComplete,
}: {
  onComplete: (payload: { kind: SpanKind; attempts: CognitiveSpanAttempt[] }) => void
}) {
  const [length, setLength] = useState(3)
  const [attempts, setAttempts] = useState<CognitiveSpanAttempt[]>([])
  const [presenting, setPresenting] = useState(false)
  const [presentedSequence, setPresentedSequence] = useState<number[]>([])
  const [currentBlock, setCurrentBlock] = useState<number | null>(null)
  const [response, setResponse] = useState<number[]>([])
  const [failStreak, setFailStreak] = useState(0)

  const startAttempt = () => {
    const sequence = buildCorsiSequence(length)
    setPresentedSequence(sequence)
    setResponse([])
    setPresenting(true)
    let index = 0
    const showNext = () => {
      if (index >= sequence.length) {
        setCurrentBlock(null)
        setPresenting(false)
        return
      }
      setCurrentBlock(sequence[index])
      index += 1
      window.setTimeout(() => {
        setCurrentBlock(null)
        window.setTimeout(showNext, 260)
      }, 560)
    }
    showNext()
  }

  const submit = () => {
    const correct = response.join(',') === presentedSequence.join(',')
    const nextAttempts = [
      ...attempts,
      {
        direction: 'forward' as const,
        length,
        sequence: presentedSequence,
        response,
        correct,
      },
    ]
    setAttempts(nextAttempts)
    if (correct) {
      setLength((prev) => prev + 1)
      setFailStreak(0)
    } else {
      const nextFailStreak = failStreak + 1
      setFailStreak(nextFailStreak)
      if (nextFailStreak >= 2) {
        onComplete({ kind: 'corsi', attempts: nextAttempts })
        return
      }
    }
    setResponse([])
  }

  useEffect(() => {
    startAttempt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length])

  return (
    <StepShell currentStep={2}>
      <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Span</p>
            <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Corsi</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Repete tocando os blocos na mesma ordem apresentada.</p>
          </div>
          <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-1.5 text-sm font-semibold text-[color:var(--foreground)]">
            Comprimento {length}
          </div>
        </div>

        <div className="grid max-w-[460px] grid-cols-3 gap-3">
          {Array.from({ length: 9 }, (_, index) => {
            const active = currentBlock === index
            const selected = response.includes(index)
            return (
              <button
                key={index}
                type="button"
                disabled={presenting}
                onClick={() => {
                  if (response.length >= presentedSequence.length) return
                  setResponse((prev) => [...prev, index])
                }}
                className={`aspect-square rounded-[1.3rem] border transition ${
                  active
                    ? 'border-sky-300 bg-sky-100 shadow-[0_0_0_4px_rgba(56,189,248,0.15)] dark:border-sky-300 dark:bg-sky-500/20'
                    : selected
                      ? 'border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                      : 'border-[color:var(--border)] bg-[color:var(--card-strong)]'
                }`}
              >
                <span className="text-sm font-semibold">{index + 1}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={presenting || response.length === 0}
            onClick={() => setResponse((prev) => prev.slice(0, -1))}
            className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold"
          >
            Corrigir
          </button>
          <button
            type="button"
            disabled={presenting || response.length !== presentedSequence.length}
            onClick={submit}
            className="rounded-full bg-[color:var(--foreground)] px-3 py-1.5 text-sm font-semibold text-[color:var(--card-strong)] disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </section>
    </StepShell>
  )
}

function FluencyTask({
  mode,
  criterion,
  onComplete,
}: {
  mode: string
  criterion: string
  onComplete: (payload: { words: string[] }) => void
}) {
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(60)
  const [text, setText] = useState('')
  const textRef = useRef('')

  useEffect(() => {
    textRef.current = text
  }, [text])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer)
          onComplete({ words: textRef.current.split(/\n+/).map((item) => item.trim()).filter(Boolean) })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, onComplete])

  return (
    <StepShell currentStep={3}>
      <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Slot A</p>
            <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Fluência verbal</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              {mode === 'phonemic' ? `Produz palavras iniciando com a letra ${criterion}.` : `Produz itens da categoria ${criterion}.`}
            </p>
          </div>
          <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-1.5 text-sm font-semibold text-[color:var(--foreground)]">
            {remaining}s
          </div>
        </div>
        <textarea
          value={text}
          disabled={!running}
          onChange={(event) => setText(event.target.value)}
          placeholder="Uma palavra por linha"
          className="min-h-[240px] w-full rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-3 text-sm leading-6 text-[color:var(--foreground)] disabled:opacity-60"
        />
        <div className="flex flex-wrap gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => setRunning(true)}
              className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)]"
            >
              Iniciar 60 s
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onComplete({ words: text.split(/\n+/).map((item) => item.trim()).filter(Boolean) })}
              className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)]"
            >
              Encerrar e salvar
            </button>
          )}
        </div>
      </section>
    </StepShell>
  )
}

function ReadingRecallTask({
  passage,
  onComplete,
}: {
  passage: string
  onComplete: (payload: { reading_time_ms: number; recall_text: string }) => void
}) {
  const [phase, setPhase] = useState<'reading' | 'recall'>('reading')
  const [recallText, setRecallText] = useState('')
  const readingStartedRef = useRef<number | null>(null)

  useEffect(() => {
    if (phase === 'reading' && readingStartedRef.current == null) {
      readingStartedRef.current = performance.now()
    }
  }, [phase])

  return (
    <StepShell currentStep={3}>
      <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Slot B</p>
          <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Reading recall</h3>
        </div>
        {phase === 'reading' ? (
          <>
            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-5 text-sm leading-7 text-[color:var(--foreground)]">
              {passage}
            </div>
            <button
              type="button"
              onClick={() => setPhase('recall')}
              className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)]"
            >
              Terminei de ler
            </button>
          </>
        ) : (
          <>
            <textarea
              value={recallText}
              onChange={(event) => setRecallText(event.target.value)}
              placeholder="Escreve o que tu lembras do texto, sem consultar a fonte."
              className="min-h-[260px] w-full rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-3 text-sm leading-6 text-[color:var(--foreground)]"
            />
            <button
              type="button"
              disabled={recallText.trim().length === 0}
              onClick={() =>
                onComplete({
                  reading_time_ms: Math.max(1000, Math.round(performance.now() - (readingStartedRef.current ?? performance.now()))),
                  recall_text: recallText.trim(),
                })
              }
              className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)] disabled:opacity-50"
            >
              Enviar recall
            </button>
          </>
        )}
      </section>
    </StepShell>
  )
}

function FlankerTask({
  trialCount,
  onComplete,
}: {
  trialCount: number
  onComplete: (payload: { trials: CognitiveFlankerTrial[] }) => void
}) {
  const [trials, setTrials] = useState(() => buildBalancedFlankerTrials(trialCount))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'fixation' | 'stimulus'>('ready')
  const stimulusAtRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const runTrial = () => {
    setPhase('fixation')
    timeoutRef.current = window.setTimeout(() => {
      stimulusAtRef.current = performance.now()
      setPhase('stimulus')
    }, 350)
  }

  const advance = (response: 'left' | 'right' | null) => {
    if (phase !== 'stimulus') return
    const current = trials[index]
    const reaction = stimulusAtRef.current == null ? null : Math.round(performance.now() - stimulusAtRef.current)
    const correct = response != null && response === current.expected_response
    const updated = trials.map((trial, trialIndex) =>
      trialIndex === index
        ? {
            ...trial,
            response,
            reaction_time_ms: reaction,
            correct,
          }
        : trial,
    )
    setTrials(updated)
    if (index >= updated.length - 1) {
      onComplete({ trials: updated })
      return
    }
    setIndex((prev) => prev + 1)
    setPhase('ready')
    window.setTimeout(runTrial, 200)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') advance('left')
      if (event.key === 'ArrowRight') advance('right')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const current = trials[index]
  const stimulus = current
    ? current.congruent
      ? current.expected_response === 'left'
        ? '<<<<<'
        : '>>>>>'
      : current.expected_response === 'left'
        ? '>><>>'
        : '<<><<'
    : ''

  return (
    <StepShell currentStep={3}>
      <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Slot C</p>
            <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Flanker</h3>
          </div>
          <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-3 py-1.5 text-sm font-semibold text-[color:var(--foreground)]">
            Trial {index + 1}/{trialCount}
          </div>
        </div>
        <div className="rounded-[1.8rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-12 text-center">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            {phase === 'stimulus' ? 'Responde pela seta central' : 'Prepara'}
          </div>
          <div className="mt-5 min-h-[4rem] font-mono text-5xl tracking-[0.3em] text-[color:var(--foreground)]">
            {phase === 'ready' ? '—' : phase === 'fixation' ? '+' : stimulus}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {phase === 'ready' ? (
            <button
              type="button"
              onClick={runTrial}
              className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)]"
            >
              {index === 0 ? 'Iniciar flanker' : 'Próximo trial'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => advance('left')}
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-2 text-sm font-semibold"
              >
                Esquerda
              </button>
              <button
                type="button"
                onClick={() => advance('right')}
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--card-strong)] px-4 py-2 text-sm font-semibold"
              >
                Direita
              </button>
            </>
          )}
        </div>
      </section>
    </StepShell>
  )
}

function TimelineChart({
  rows,
}: {
  rows: CognitiveSessionChartRow[]
}) {
  const [metric, setMetric] = useState<TimelineMetricKey>('pvt_lapses')
  const baseline = useMemo(() => baselineWindow(rows), [rows])
  // Banda de controle só para métricas medidas toda sessão; rotativo fica fora.
  const bands = useMemo(() => {
    if (metric === 'slot_primary') return null
    const stats = computeBaselineStats(rows, metric)
    return stats ? spcBands(stats) : null
  }, [rows, metric])

  if (!rows.length) {
    return <EmptyAnalyticsState message="Ainda não há sessões suficientes para desenhar a série temporal." />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'pvt_lapses', label: 'Lapses PVT' },
          { key: 'pvt_response_speed', label: 'Velocidade PVT' },
          { key: 'span_primary', label: 'Span' },
          { key: 'slot_primary', label: 'Rotativo' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMetric(option.key as TimelineMetricKey)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              metric === option.key
                ? 'bg-[color:var(--foreground)] text-[color:var(--card-strong)]'
                : 'border border-[color:var(--border)] bg-[color:var(--card-strong)] text-[color:var(--foreground)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="h-[320px] rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-3">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.ui.grid} />
            <XAxis dataKey="date" tickFormatter={localDateLabel} stroke={CHART_TOKENS.ui.axis} />
            <YAxis yAxisId="left" stroke={CHART_TOKENS.ui.axis} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={CHART_TOKENS.ui.axis} />
            <ChartTooltip
              contentStyle={{
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}
              formatter={(value, name, entry) => {
                if (name === 'mood') return [`${value}`, 'Humor']
                return [formatMetricValue(entry.payload as CognitiveSessionChartRow, metric), 'Métrica']
              }}
              labelFormatter={(label) => `Sessão ${localDateLabel(String(label))}`}
            />
            <Legend />
            {baseline && (
              <ReferenceArea
                yAxisId="left"
                x1={baseline.from}
                x2={baseline.to}
                fill={CHART_TOKENS.fill.attention}
                fillOpacity={0.18}
              />
            )}
            {bands && (
              <>
                <ReferenceLine yAxisId="left" y={bands.warnHigh} stroke={CHART_TOKENS.fill.attention} strokeDasharray="4 4" strokeOpacity={0.7} />
                <ReferenceLine yAxisId="left" y={bands.warnLow} stroke={CHART_TOKENS.fill.attention} strokeDasharray="4 4" strokeOpacity={0.7} />
                <ReferenceLine yAxisId="left" y={bands.signalHigh} stroke={CHART_TOKENS.fill.critical} strokeDasharray="2 4" strokeOpacity={0.85} />
                <ReferenceLine yAxisId="left" y={bands.signalLow} stroke={CHART_TOKENS.fill.critical} strokeDasharray="2 4" strokeOpacity={0.85} />
              </>
            )}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={metric}
              stroke={CHART_TOKENS.series.capacity}
              strokeWidth={2.2}
              dot={{ r: 3 }}
              connectNulls
              name="Métrica"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="mood"
              stroke={CHART_TOKENS.series.mood}
              strokeWidth={1.8}
              dot={{ r: 2 }}
              connectNulls
              name="Humor"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const RELIABLE_CARD_METRICS: Array<{ key: ReliableMetricKey; label: string }> = [
  { key: 'pvt_lapses', label: 'Lapses PVT' },
  { key: 'pvt_response_speed', label: 'Velocidade PVT' },
  { key: 'span_primary', label: 'Span' },
  { key: 'mood', label: 'Humor' },
  { key: 'energy', label: 'Energia' },
  { key: 'anxiety', label: 'Ansiedade' },
]

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function ReliableChangeCard({ rows }: { rows: CognitiveSessionChartRow[] }) {
  const summary = useMemo(() => {
    const perMetric = RELIABLE_CARD_METRICS.map(({ key, label }) => {
      const stats = computeBaselineStats(rows, key)
      if (!stats) return null
      let improve = 0
      let worsen = 0
      for (const row of rows) {
        if (row.baseline_phase) continue
        const change = classifyChange(row[key], stats, COGNITIVE_RELIABILITY[key], COGNITIVE_POLARITY[key])
        if (!change || change.band === 'within') continue
        if (change.direction === 'improve') improve += 1
        else if (change.direction === 'worsen') worsen += 1
      }
      return { key, label, stats, improve, worsen }
    }).filter((entry): entry is NonNullable<typeof entry> => entry != null)
    return { perMetric, decoupling: detectDecoupling(rows) }
  }, [rows])

  if (!summary.perMetric.length) return null

  const { decoupling } = summary
  return (
    <section className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
      <div className="mb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Régua de mudança confiável</p>
        <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">
          Banda de controle (±2σ/±3σ) + RCI sobre o baseline
        </h3>
      </div>
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4 text-sm leading-6 text-[color:var(--muted)]">
        {decoupling.evaluatedCount > 0 ? (
          <>
            Cognição e humor se desacoplaram em{' '}
            <strong className="text-[color:var(--foreground)]">{decoupling.decoupledCount}</strong> de{' '}
            {decoupling.evaluatedCount} sessões pós-baseline — um eixo cruzou a régua sem o outro acompanhar.
          </>
        ) : (
          <>Ainda sem sessões pós-baseline para avaliar o desacoplamento humor×cognição.</>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.perMetric.map((metric) => (
          <div key={metric.key} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
            <p className="text-sm font-semibold text-[color:var(--foreground)]">{metric.label}</p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              baseline {formatStat(metric.stats.mean)} ± {formatStat(metric.stats.sd)} (n={metric.stats.n})
            </p>
            <p className="mt-2 text-xs">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">↑ {metric.improve} melhora</span>
              <span className="text-[color:var(--muted)]"> · </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">↓ {metric.worsen} piora</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function CognitionDailySection({ range }: { range: RangeOption }) {
  const statusDays = range === 'all' ? 0 : range === '1y' ? 365 : Number(range.replace('d', ''))
  const statusQuery = useCognitionStatus(statusDays)
  const prepareMutation = usePrepareCognitionSession()
  const completeMutation = useCompleteCognitionSession()

  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [plan, setPlan] = useState<PreparedCognitionPlan | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [context, setContext] = useState<CognitiveContextInput>({
    sleep_hours: null,
    caffeine_taken: false,
    caffeine_amount_mg: null,
    vyvanse_taken_at: null,
    lunch_completed: null,
  })
  const [vas, setVas] = useState<CognitiveVasInput>({
    mood: 50,
    energy: 50,
    anxiety: 30,
    rested: 50,
  })
  const [pvt, setPvt] = useState<{ duration_ms: number; trials: CognitivePvtTrial[] } | null>(null)
  const [span, setSpan] = useState<{ kind: SpanKind; attempts: CognitiveSpanAttempt[] } | null>(null)
  const [localTodaySession, setLocalTodaySession] = useState<CognitiveSessionRecord | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const todaySession = localTodaySession ?? statusQuery.data?.today_session ?? null
  const timeline = statusQuery.data?.timeline ?? []
  const baselineCount = statusQuery.data?.baseline_session_count ?? 0
  const baselineComplete = statusQuery.data?.baseline_complete ?? false

  const startSession = async () => {
    try {
      const prepared = await prepareMutation.mutateAsync()
      setSessionError(null)
      setPlan(prepared)
      setStartedAt(new Date().toISOString())
      setPvt(null)
      setSpan(null)
      setPhase('context')
    } catch {
      setSessionError('Não consegui preparar a sessão agora.')
    }
  }

  const submitSession = async (slotPayload: {
    fluencyWords?: string[]
    reading?: { reading_time_ms: number; recall_text: string }
    flanker?: CognitiveFlankerTrial[]
  }) => {
    if (!plan || !startedAt || !pvt || !span) return
    setPhase('saving')
    const payload: CompleteCognitiveSessionInput = {
      started_at: startedAt,
      plan: {
        rotating_type: plan.rotating_type,
        span_kind: plan.span_kind,
        fluency_mode: plan.fluency?.mode ?? null,
        fluency_criterion: plan.fluency?.criterion ?? null,
        reading_passage: plan.reading?.passage ?? null,
        reading_idea_units: plan.reading?.idea_units ?? [],
        reading_source_theme: plan.reading?.source_theme ?? null,
      },
      context,
      vas,
      pvt,
      span,
      fluency: slotPayload.fluencyWords ? { words: slotPayload.fluencyWords } : null,
      reading: slotPayload.reading ?? null,
      flanker: slotPayload.flanker ? { trials: slotPayload.flanker } : null,
    }
    try {
      const result = await completeMutation.mutateAsync(payload)
      setSessionError(null)
      setLocalTodaySession(result.session)
      setPhase('idle')
      setPlan(null)
    } catch {
      setSessionError('Falhou ao persistir ou pontuar a sessão. Tu pode tentar concluir de novo.')
      setPhase('slot')
    }
  }

  if (phase !== 'idle' && plan) {
    return (
      <SurfaceFrame
        icon={<Brain className="h-4 w-4" />}
        kicker="Cognição diária"
        title="Sessão curta, sempre na mesma janela"
        description="Baseline longitudinal com núcleo fixo e um slot rotativo por dia."
      >
        {phase === 'context' && (
          <ContextStep
            initialContext={context}
            initialVas={vas}
            onNext={({ context: nextContext, vas: nextVas }) => {
              setContext(nextContext)
              setVas(nextVas)
              setPhase('pvt')
            }}
          />
        )}
        {phase === 'pvt' && (
          <PvtTask
            durationMs={plan.pvt.duration_ms}
            isiMinMs={plan.pvt.isi_min_ms}
            isiMaxMs={plan.pvt.isi_max_ms}
            onComplete={(payload) => {
              setPvt(payload)
              setPhase('span')
            }}
          />
        )}
        {phase === 'span' && (
          plan.span_kind === 'digit' ? (
            <DigitSpanTask
              onComplete={(payload) => {
                setSpan(payload)
                setPhase('slot')
              }}
            />
          ) : (
            <CorsiSpanTask
              onComplete={(payload) => {
                setSpan(payload)
                setPhase('slot')
              }}
            />
          )
        )}
        {phase === 'slot' && plan.rotating_type === 'A' && plan.fluency && (
          <FluencyTask
            mode={plan.fluency.mode}
            criterion={plan.fluency.criterion}
            onComplete={({ words }) => {
              void submitSession({ fluencyWords: words })
            }}
          />
        )}
        {phase === 'slot' && plan.rotating_type === 'B' && plan.reading && (
          <ReadingRecallTask
            passage={plan.reading.passage}
            onComplete={(reading) => {
              void submitSession({ reading })
            }}
          />
        )}
        {phase === 'slot' && plan.rotating_type === 'C' && (
          <FlankerTask
            trialCount={plan.flanker.trial_count}
            onComplete={({ trials }) => {
              void submitSession({ flanker: trials })
            }}
          />
        )}
        {phase === 'saving' && (
          <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-6 text-center">
            <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[color:var(--foreground)]" />
            <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">Persistindo sessão e rodando scoring no servidor…</p>
          </div>
        )}
        {sessionError && (
          <p className="text-sm text-rose-600 dark:text-rose-300">{sessionError}</p>
        )}
      </SurfaceFrame>
    )
  }

  return (
    <SurfaceFrame
      icon={<Brain className="h-4 w-4" />}
      kicker="Cognição diária"
      title="Aferição cognitiva longitudinal N=1"
      description="Sessão curta com PVT, span e slot rotativo para acompanhar tendência intra-individual sem pretensão normativa."
      metaPanel={
        <div className="grid min-w-[240px] gap-2">
          <div className="rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Estado de hoje</div>
            <div className={`mt-2 text-sm font-semibold ${statusTone(todaySession)}`}>{todaySessionLabel(todaySession)}</div>
          </div>
          <div className="rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Baseline</div>
            <div className="mt-2 text-sm font-semibold text-[color:var(--foreground)]">
              {baselineComplete ? `${baselineCount} sessões iniciais fechadas` : `${baselineCount}/14 sessões`}
            </div>
          </div>
        </div>
      }
    >
      {statusQuery.isLoading ? (
        <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-6 text-center text-sm text-[color:var(--muted)]">
          Carregando histórico cognitivo…
        </div>
      ) : statusQuery.isError ? (
        <EmptyAnalyticsState message="Não consegui carregar o módulo cognitivo agora." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                <Clock3 className="h-3.5 w-3.5" />
                Janela fixa
              </div>
              <div className="mt-3 text-xl font-bold tracking-[-0.04em] text-[color:var(--foreground)]">12h–13h</div>
            </div>
            <div className="rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                <Gauge className="h-3.5 w-3.5" />
                Sessões totais
              </div>
              <div className="mt-3 text-xl font-bold tracking-[-0.04em] text-[color:var(--foreground)]">{statusQuery.data?.session_count ?? 0}</div>
            </div>
            <div className="rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                <ListTree className="h-3.5 w-3.5" />
                Próximo slot
              </div>
              <div className="mt-3 text-xl font-bold tracking-[-0.04em] text-[color:var(--foreground)]">
                {todaySession ? 'Concluído hoje' : statusQuery.data?.next_plan?.rotating_type ?? 'A'}
              </div>
            </div>
            <div className="rounded-[1.35rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                <Orbit className="h-3.5 w-3.5" />
                Span do dia
              </div>
              <div className="mt-3 text-xl font-bold tracking-[-0.04em] text-[color:var(--foreground)]">
                {todaySession ? spanLabel(todaySession.span.kind) : spanLabel(statusQuery.data?.next_plan?.span_kind ?? 'digit')}
              </div>
            </div>
          </div>

          {!todaySession ? (
            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--card-strong)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Sessão diária</div>
                  <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Pronta para rodar em 5–7 minutos</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    Núcleo fixo com PVT e span, mais um slot rotativo por dia. Tudo persiste no servidor com raw + métricas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void startSession()}
                  disabled={prepareMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--card-strong)] disabled:opacity-50"
                >
                  {prepareMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
                  Iniciar aferição
                </button>
              </div>
              {prepareMutation.isError && (
                <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">Não consegui preparar os materiais da sessão agora.</p>
              )}
              {sessionError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{sessionError}</p>}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Aferição de hoje fechada às {new Date(todaySession.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-400/30 bg-white/70 dark:bg-slate-900/35 p-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.18em] text-emerald-700/75 dark:text-emerald-300/80">Humor</div>
                  <div className="mt-1 text-xl font-bold">{todaySession.vas.mood}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-400/30 bg-white/70 dark:bg-slate-900/35 p-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.18em] text-emerald-700/75 dark:text-emerald-300/80">Lapses PVT</div>
                  <div className="mt-1 text-xl font-bold">{todaySession.pvt.lapses_count}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-400/30 bg-white/70 dark:bg-slate-900/35 p-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.18em] text-emerald-700/75 dark:text-emerald-300/80">Span</div>
                  <div className="mt-1 text-xl font-bold">{todaySession.span.primary_score}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-400/30 bg-white/70 dark:bg-slate-900/35 p-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.18em] text-emerald-700/75 dark:text-emerald-300/80">Rotativo</div>
                  <div className="mt-1 text-xl font-bold">
                    {todaySession.rotating_type === 'A'
                      ? todaySession.fluency?.valid_count ?? 'n/d'
                      : todaySession.rotating_type === 'B'
                        ? `${Math.round(((todaySession.reading?.recovered_count ?? 0) / Math.max(1, todaySession.reading?.total_units ?? 1)) * 100)}%`
                        : todaySession.flanker?.interference_ms ?? 'n/d'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
              <div className="mb-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Série temporal</p>
                <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">Métrica-chave com overlay de humor</h3>
              </div>
              <TimelineChart rows={timeline} />
            </section>

            <section className="space-y-4 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Leitura do desenho</p>
                <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">O que esta v1 já suporta</h3>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4 text-sm leading-6 text-[color:var(--muted)]">
                Correlação contemporânea fica disponível porque humor, energia, ansiedade e cognição saem da mesma sessão.
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4 text-sm leading-6 text-[color:var(--muted)]">
                O baseline inicial usa as primeiras 14 sessões como fase de aprendizado. Antes disso, a interpretação deve ser conservadora.
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card-strong)] p-4 text-sm leading-6 text-[color:var(--muted)]">
                Flanker entra como exploratório. Os sinais primários robustos continuam sendo lapses/RT do PVT, span e contagens do slot rotativo.
              </div>
            </section>
          </div>

          {baselineComplete && <ReliableChangeCard rows={timeline} />}

          {timeline.some((row) => row.venvanse_ng_ml != null) && (
            <section className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow)]">
              <div className="mb-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Exploratório · PK × PVT</p>
                <h3 className="mt-2 font-['Fraunces'] text-2xl tracking-[-0.04em] text-[color:var(--foreground)]">
                  Concentração Venvanse × vigilância psicomotora
                </h3>
              </div>
              <PKCognitionScatterChart rows={timeline} />
            </section>
          )}

          {(completeMutation.isError || statusQuery.data?.timeline.length === 0) && !todaySession && (
            <p className="text-sm text-[color:var(--muted)]">
              Sem histórico ainda. A primeira sessão já inaugura a série.
            </p>
          )}
        </div>
      )}
    </SurfaceFrame>
  )
}
