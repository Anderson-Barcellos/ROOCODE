import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'

import { useSaveRegimen, useSubstances, type MedicationRegimenEntry } from '@/lib/api'

interface MedicationRegimenEditorProps {
  regimen: MedicationRegimenEntry[]
}

const DAYS = [
  { value: 0, label: 'D' },
  { value: 1, label: 'S' },
  { value: 2, label: 'T' },
  { value: 3, label: 'Q' },
  { value: 4, label: 'Q' },
  { value: 5, label: 'S' },
  { value: 6, label: 'S' },
]

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `regimen-${Date.now()}`
}

function normalizeTimes(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function newEntry(substance: string): MedicationRegimenEntry {
  return {
    id: makeId(),
    substance,
    dose_mg: 1,
    times: ['07:00'],
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    start_date: null,
    end_date: null,
    color: null,
  }
}

export function MedicationRegimenEditor({ regimen }: MedicationRegimenEditorProps) {
  const { data: substances = [] } = useSubstances()
  const saveRegimen = useSaveRegimen()
  const [rows, setRows] = useState<MedicationRegimenEntry[]>(regimen)
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)

  useEffect(() => {
    setRows(regimen)
  }, [regimen])

  const substanceOptions = useMemo(() => {
    if (substances.length) return substances
    return [
      { id: 'lexapro', display_name: 'Lexapro', aliases: [], dose_unit: 'mg', confidence: 'high' as const },
      { id: 'venvanse', display_name: 'Venvanse', aliases: [], dose_unit: 'mg', confidence: 'medium' as const },
      { id: 'lamictal', display_name: 'Lamictal', aliases: [], dose_unit: 'mg', confidence: 'high' as const },
    ]
  }, [substances])

  const updateRow = (index: number, patch: Partial<MedicationRegimenEntry>) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )))
  }

  const toggleDay = (index: number, day: number) => {
    const current = rows[index]
    const nextDays = current.days_of_week.includes(day)
      ? current.days_of_week.filter((item) => item !== day)
      : [...current.days_of_week, day].sort((left, right) => left - right)
    updateRow(index, { days_of_week: nextDays })
  }

  const addRow = () => {
    setRows((current) => [...current, newEntry(substanceOptions[0]?.id ?? 'lexapro')])
  }

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  const handleSave = async () => {
    try {
      const saved = await saveRegimen.mutateAsync(rows)
      setRows(saved)
      setFeedback('ok')
      setTimeout(() => setFeedback(null), 2500)
    } catch {
      setFeedback('err')
      setTimeout(() => setFeedback(null), 2500)
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-900/10 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-teal-500'
  const iconButtonClass = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-900/10 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800'

  return (
    <div className="min-w-0 rounded-[1.25rem] border border-slate-900/10 bg-white/85 p-4 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Regime
          </span>
          <h3 className="mt-2 font-['Fraunces'] text-xl tracking-[-0.04em] text-slate-900">
            Doses previstas
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={iconButtonClass} onClick={() => setRows(regimen)} title="Restaurar">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" className={iconButtonClass} onClick={addRow} title="Adicionar">
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveRegimen.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-70"
          >
            {feedback === 'ok' ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {feedback === 'ok' ? 'Salvo' : feedback === 'err' ? 'Erro' : saveRegimen.isPending ? 'Salvando' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div key={row.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-900/10 bg-slate-50 p-3 lg:grid-cols-[1.3fr_0.7fr_0.8fr_1.2fr_auto]">
            <select
              value={row.substance}
              onChange={(event) => updateRow(index, { substance: event.target.value })}
              className={inputClass}
            >
              {substanceOptions.map((substance) => (
                <option key={substance.id} value={substance.id}>
                  {substance.display_name.split(' ')[0]}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="any"
              value={row.dose_mg}
              onChange={(event) => updateRow(index, { dose_mg: Number(event.target.value) })}
              className={inputClass}
              aria-label="Dose"
            />
            <input
              value={row.times.join(', ')}
              onChange={(event) => updateRow(index, { times: normalizeTimes(event.target.value) })}
              className={inputClass}
              aria-label="Horarios"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {DAYS.map((day) => {
                const active = row.days_of_week.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDay(index, day.value)}
                    className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                      active
                        ? 'bg-teal-700 text-white'
                        : 'border border-slate-900/10 bg-white text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-end gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(event) => updateRow(index, { active: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                Ativo
              </label>
              <button type="button" className={iconButtonClass} onClick={() => removeRow(index)} title="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
