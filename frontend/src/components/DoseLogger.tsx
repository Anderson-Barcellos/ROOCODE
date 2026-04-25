import { useState } from 'react'
import { format } from 'date-fns'
import { Pill, CheckCircle, AlertCircle } from 'lucide-react'
import { useSubstances, useLogDose } from '../lib/api'

const localNow = () => {
  const d = new Date()
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

export default function DoseLogger() {
  const { data: substances = [] } = useSubstances()
  const logDose = useLogDose()

  const [substance, setSubstance] = useState('')
  const [doseMg, setDoseMg] = useState('')
  const [takenAt, setTakenAt] = useState(localNow)
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)

  const selectedSub = substances.find(s => s.id === substance)

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
      setDoseMg('')
      setNote('')
      setTakenAt(localNow())
      setTimeout(() => setFeedback(null), 3000)
    } catch {
      setFeedback('err')
      setTimeout(() => setFeedback(null), 3000)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '7px 10px', color: 'var(--foreground)',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 12, outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--muted)',
    letterSpacing: '0.08em', display: 'block', marginBottom: 5,
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
        <Pill size={13} color="var(--accent-violet)" />
        <span className="font-display" style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px' }}>
          Log de Dose
        </span>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {/* Substance */}
        <div>
          <label style={labelStyle}>SUBSTÂNCIA</label>
          <select
            value={substance}
            onChange={e => setSubstance(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            required
          >
            <option value="">selecionar...</option>
            {substances.map(s => (
              <option key={s.id} value={s.id}>{s.display_name.split(' ')[0]}</option>
            ))}
          </select>
        </div>

        {/* Dose */}
        <div>
          <label style={labelStyle}>
            DOSE {selectedSub ? `(${selectedSub.dose_unit})` : '(mg)'}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={doseMg}
            onChange={e => setDoseMg(e.target.value)}
            placeholder="ex: 40"
            style={inputStyle}
            required
          />
        </div>

        {/* Datetime */}
        <div>
          <label style={labelStyle}>HORÁRIO</label>
          <input
            type="datetime-local"
            value={takenAt}
            onChange={e => setTakenAt(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        {/* Note */}
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>NOTA (opcional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="observações..."
            style={{ ...inputStyle, resize: 'none', height: 48, lineHeight: 1.5 }}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={logDose.isPending}
          style={{
            padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
            background: feedback === 'ok'
              ? 'rgba(15, 118, 110, 0.12)'
              : 'var(--accent-violet-dim)',
            color: feedback === 'ok' ? 'var(--accent)' : 'var(--accent-violet)',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.2s',
            border: `1px solid ${feedback === 'ok' ? 'rgba(15, 118, 110, 0.3)' : 'rgba(139,92,246,0.3)'}`,
          } as React.CSSProperties}
        >
          {feedback === 'ok'
            ? <><CheckCircle size={12} /> registrado</>
            : feedback === 'err'
              ? <><AlertCircle size={12} /> erro</>
              : logDose.isPending ? 'salvando...' : 'registrar dose'
          }
        </button>
      </form>
    </div>
  )
}
