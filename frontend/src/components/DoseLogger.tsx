import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Pill, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'

import { useSubstances, useLogDose, useRegimen } from '../lib/api'

const localNow = () => format(new Date(), "yyyy-MM-dd'T'HH:mm")

const buildScheduledDateTime = (timeHHMM: string): string => {
  const [h, m] = timeHHMM.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return localNow()
  const now = new Date()
  const scheduled = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    h,
    m,
    0,
    0,
  )
  // Se o horário do regime já passou hoje em mais de 30min, usa now()
  // (reduz risco de log retroativo acidental).
  if (scheduled.getTime() < now.getTime() - 30 * 60 * 1000) {
    return localNow()
  }
  return format(scheduled, "yyyy-MM-dd'T'HH:mm")
}

export default function DoseLogger() {
  const { data: substances = [] } = useSubstances()
  const { data: regimen = [] } = useRegimen()
  const logDose = useLogDose()

  const [substance, setSubstance] = useState('')
  const [doseMg, setDoseMg] = useState('')
  const [takenAt, setTakenAt] = useState(localNow)
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)
  const [doseFromRegimen, setDoseFromRegimen] = useState(false)
  const [timeFromRegimen, setTimeFromRegimen] = useState(false)

  // Track substance change pra disparar auto-fill SÓ na transição
  const prevSubstance = useRef('')

  const selectedSub = substances.find((s) => s.id === substance)
  const activeEntry = regimen.find((e) => e.active && e.substance === substance)

  useEffect(() => {
    if (substance === prevSubstance.current) return
    prevSubstance.current = substance

    if (substance && activeEntry) {
      setDoseMg(String(activeEntry.dose_mg))
      setDoseFromRegimen(true)
      const firstTime = activeEntry.times?.[0]
      if (firstTime) {
        setTakenAt(buildScheduledDateTime(firstTime))
        setTimeFromRegimen(true)
      } else {
        setTakenAt(localNow())
        setTimeFromRegimen(false)
      }
    } else {
      // Substância manual (suplemento/PRN) — preserva campos pra user digitar
      setDoseFromRegimen(false)
      setTimeFromRegimen(false)
    }
  }, [substance, activeEntry])

  const handleDoseChange = (value: string) => {
    setDoseMg(value)
    setDoseFromRegimen(false)
  }

  const handleTakenAtChange = (value: string) => {
    setTakenAt(value)
    setTimeFromRegimen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!substance || !doseMg || !takenAt) return

    try {
      await logDose.mutateAsync({
        substance,
        dose_mg: parseFloat(doseMg),
        taken_at: new Date(takenAt).toISOString(),
        note,
      })
      setFeedback('ok')
      setSubstance('')
      setDoseMg('')
      setNote('')
      setTakenAt(localNow())
      setDoseFromRegimen(false)
      setTimeFromRegimen(false)
      prevSubstance.current = ''
      setTimeout(() => setFeedback(null), 3000)
    } catch {
      setFeedback('err')
      setTimeout(() => setFeedback(null), 3000)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '7px 10px',
    color: 'var(--foreground)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    outline: 'none',
  }

  const inputAutoFilledStyle: React.CSSProperties = {
    ...inputStyle,
    background: 'rgba(139, 92, 246, 0.06)',
    borderColor: 'rgba(139, 92, 246, 0.25)',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    color: 'var(--muted)',
    letterSpacing: '0.08em',
    display: 'block',
    marginBottom: 5,
  }

  const regimenChip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    background: 'rgba(139, 92, 246, 0.1)',
    color: 'var(--accent-violet)',
    fontSize: 8,
    padding: '1px 5px',
    borderRadius: 3,
    marginLeft: 6,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
        <Pill size={13} color="var(--accent-violet)" />
        <span
          className="font-display"
          style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px' }}
        >
          Log de Dose
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}
      >
        {/* Substance */}
        <div>
          <label style={labelStyle}>SUBSTÂNCIA</label>
          <select
            value={substance}
            onChange={(e) => setSubstance(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            required
          >
            <option value="">selecionar...</option>
            {substances.map((s) => {
              const inRegimen = regimen.some((e) => e.active && e.substance === s.id)
              return (
                <option key={s.id} value={s.id}>
                  {s.display_name.split(' ')[0]}
                  {inRegimen ? ' · regime' : ''}
                </option>
              )
            })}
          </select>
        </div>

        {/* Dose */}
        <div>
          <label style={labelStyle}>
            DOSE {selectedSub ? `(${selectedSub.dose_unit})` : '(mg)'}
            {doseFromRegimen && (
              <span style={regimenChip}>
                <Sparkles size={8} /> regime
              </span>
            )}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={doseMg}
            onChange={(e) => handleDoseChange(e.target.value)}
            placeholder="ex: 40"
            style={doseFromRegimen ? inputAutoFilledStyle : inputStyle}
            required
          />
        </div>

        {/* Datetime */}
        <div>
          <label style={labelStyle}>
            HORÁRIO
            {timeFromRegimen && (
              <span style={regimenChip}>
                <Sparkles size={8} /> regime
              </span>
            )}
          </label>
          <input
            type="datetime-local"
            value={takenAt}
            onChange={(e) => handleTakenAtChange(e.target.value)}
            style={timeFromRegimen ? inputAutoFilledStyle : inputStyle}
            required
          />
        </div>

        {/* Note */}
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>NOTA (opcional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="observações..."
            style={{ ...inputStyle, resize: 'none', height: 48, lineHeight: 1.5 }}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={logDose.isPending}
          style={
            {
              padding: '8px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              background:
                feedback === 'ok'
                  ? 'rgba(15, 118, 110, 0.12)'
                  : 'var(--accent-violet-dim)',
              color: feedback === 'ok' ? 'var(--accent)' : 'var(--accent-violet)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s',
              border: `1px solid ${
                feedback === 'ok' ? 'rgba(15, 118, 110, 0.3)' : 'rgba(139,92,246,0.3)'
              }`,
            } as React.CSSProperties
          }
        >
          {feedback === 'ok' ? (
            <>
              <CheckCircle size={12} /> registrado
            </>
          ) : feedback === 'err' ? (
            <>
              <AlertCircle size={12} /> erro
            </>
          ) : logDose.isPending ? (
            'salvando...'
          ) : (
            'registrar dose'
          )}
        </button>
      </form>
    </div>
  )
}
