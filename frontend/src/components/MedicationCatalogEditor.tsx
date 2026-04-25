import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FlaskConical, Pencil, Trash2, Plus, X, Check, ArrowLeft } from 'lucide-react'

import { useSubstances, useCreateSubstance, useUpdateSubstance, useDeleteSubstance } from '../lib/api'
import type { Substance, SubstancePayload, SubstancePatch } from '../lib/api'

type Mode = { kind: 'list' } | { kind: 'form'; editingKey: string | null }

type FormState = {
  key: string
  display_name: string
  aliases: string
  dose_unit: string
  bioavailability: string
  half_life_hours: string
  tmax_hours: string
  ke_per_hour: string
  ka_per_hour: string
  vd_l_per_kg: string
  vd_l: string
  therapeutic_range_min: string
  therapeutic_range_max: string
  therapeutic_range_unit: string
  ke0_per_hour: string
  notes: string
}

const emptyForm = (): FormState => ({
  key: '',
  display_name: '',
  aliases: '',
  dose_unit: 'mg',
  bioavailability: '',
  half_life_hours: '',
  tmax_hours: '',
  ke_per_hour: '',
  ka_per_hour: '',
  vd_l_per_kg: '',
  vd_l: '',
  therapeutic_range_min: '',
  therapeutic_range_max: '',
  therapeutic_range_unit: '',
  ke0_per_hour: '',
  notes: '',
})

const substanceToForm = (sub: Substance): FormState => ({
  key: sub.id,
  display_name: sub.display_name,
  aliases: (sub.aliases ?? []).join(', '),
  dose_unit: sub.dose_unit ?? 'mg',
  bioavailability: sub.bioavailability != null ? String(sub.bioavailability) : '',
  half_life_hours: sub.half_life_hours != null ? String(sub.half_life_hours) : '',
  tmax_hours: sub.tmax_hours != null ? String(sub.tmax_hours) : '',
  ke_per_hour: sub.ke_per_hour != null ? String(sub.ke_per_hour) : '',
  ka_per_hour: sub.ka_per_hour != null ? String(sub.ka_per_hour) : '',
  vd_l_per_kg: sub.vd_l_per_kg != null ? String(sub.vd_l_per_kg) : '',
  vd_l: sub.vd_l != null ? String(sub.vd_l) : '',
  therapeutic_range_min: sub.therapeutic_range_min != null ? String(sub.therapeutic_range_min) : '',
  therapeutic_range_max: sub.therapeutic_range_max != null ? String(sub.therapeutic_range_max) : '',
  therapeutic_range_unit: sub.therapeutic_range_unit ?? '',
  ke0_per_hour: sub.ke0_per_hour != null ? String(sub.ke0_per_hour) : '',
  notes: (sub.notes ?? []).join('\n'),
})

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const formToPayload = (form: FormState): SubstancePayload | { error: string } => {
  if (!form.display_name.trim()) return { error: 'Nome de exibição é obrigatório' }
  const bioavailability = parseNumber(form.bioavailability)
  const half_life_hours = parseNumber(form.half_life_hours)
  const tmax_hours = parseNumber(form.tmax_hours)
  const ke_per_hour = parseNumber(form.ke_per_hour)
  const ka_per_hour = parseNumber(form.ka_per_hour)
  if (bioavailability == null || !(bioavailability > 0 && bioavailability <= 1.5)) {
    return { error: 'Bioavailability deve ser > 0 e ≤ 1.5' }
  }
  if (half_life_hours == null || half_life_hours <= 0) {
    return { error: 'Half-life deve ser > 0' }
  }
  if (tmax_hours == null || tmax_hours <= 0) {
    return { error: 'Tmax deve ser > 0' }
  }
  if (ke_per_hour == null || ke_per_hour <= 0) {
    return { error: 'ke deve ser > 0' }
  }
  if (ka_per_hour == null || ka_per_hour <= 0) {
    return { error: 'ka deve ser > 0' }
  }
  const vd_l_per_kg = parseNumber(form.vd_l_per_kg)
  const vd_l = parseNumber(form.vd_l)
  if (vd_l_per_kg == null && vd_l == null) {
    return { error: 'Informar Vd (L/kg) OU Vd absoluto (L)' }
  }
  const aliases = form.aliases
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const notes = form.notes
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    display_name: form.display_name.trim(),
    aliases,
    dose_unit: form.dose_unit.trim() || 'mg',
    bioavailability,
    half_life_hours,
    tmax_hours,
    ke_per_hour,
    ka_per_hour,
    vd_l_per_kg: vd_l_per_kg ?? null,
    vd_l: vd_l ?? null,
    therapeutic_range_min: parseNumber(form.therapeutic_range_min),
    therapeutic_range_max: parseNumber(form.therapeutic_range_max),
    therapeutic_range_unit: form.therapeutic_range_unit.trim() || null,
    ke0_per_hour: parseNumber(form.ke0_per_hour),
    notes,
  }
}

const KEY_REGEX = /^[a-z0-9_]{2,40}$/

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function MedicationCatalogEditor({ open, onOpenChange }: Props) {
  const { data: substances = [], isLoading } = useSubstances()
  const createSub = useCreateSubstance()
  const updateSub = useUpdateSubstance()
  const deleteSub = useDeleteSubstance()

  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [form, setForm] = useState<FormState>(emptyForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...substances].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [substances],
  )

  const startAdd = () => {
    setForm(emptyForm())
    setMode({ kind: 'form', editingKey: null })
    setFeedback(null)
  }

  const startEdit = (sub: Substance) => {
    if (!sub.is_custom) {
      setFeedback(`${sub.display_name.split(' ')[0]} é built-in. Clone como custom para override.`)
      setTimeout(() => setFeedback(null), 3500)
      return
    }
    setForm(substanceToForm(sub))
    setMode({ kind: 'form', editingKey: sub.id })
    setFeedback(null)
  }

  const backToList = () => {
    setMode({ kind: 'list' })
    setForm(emptyForm())
    setFeedback(null)
  }

  const copyFromPreset = (key: string) => {
    const sub = substances.find((s) => s.id === key)
    if (!sub) return
    const nextKey = form.key
    setForm({ ...substanceToForm(sub), key: nextKey })
  }

  const handleSave = async () => {
    const validation = formToPayload(form)
    if ('error' in validation) {
      setFeedback(validation.error)
      return
    }
    try {
      if (mode.kind === 'form' && mode.editingKey) {
        const patch: SubstancePatch = validation
        await updateSub.mutateAsync({ key: mode.editingKey, patch })
        setFeedback('atualizado')
      } else {
        if (!KEY_REGEX.test(form.key)) {
          setFeedback('Chave deve conter apenas [a-z0-9_] (2–40 chars)')
          return
        }
        await createSub.mutateAsync({ key: form.key, body: validation })
        setFeedback('criado')
      }
      setTimeout(() => {
        setFeedback(null)
        backToList()
      }, 800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      setFeedback(msg)
    }
  }

  const handleDelete = async (sub: Substance) => {
    if (!sub.is_custom) return
    if (!window.confirm(`Remover "${sub.display_name}" do catálogo? Doses logadas com essa substância ficarão órfãs.`)) return
    try {
      await deleteSub.mutateAsync(sub.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover'
      setFeedback(msg)
      setTimeout(() => setFeedback(null), 3500)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '6px 9px', color: 'var(--foreground)',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--muted)',
    letterSpacing: '0.08em', display: 'block', marginBottom: 4,
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0, background: 'rgba(8, 12, 20, 0.6)',
          backdropFilter: 'blur(4px)', zIndex: 80,
        }} />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 81, background: 'var(--card-strong)',
            border: '1px solid var(--border)', borderRadius: 12,
            width: 'min(760px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
            padding: 20, color: 'var(--foreground)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {mode.kind === 'form' && (
                <button
                  onClick={backToList}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                  }}
                  type="button"
                >
                  <ArrowLeft size={12} /> voltar
                </button>
              )}
              <FlaskConical size={14} color="var(--accent-violet)" />
              <Dialog.Title asChild>
                <span className="font-display" style={{ fontSize: 14, fontWeight: 600 }}>
                  {mode.kind === 'list'
                    ? 'Catálogo de Substâncias'
                    : mode.editingKey
                      ? `Editar — ${form.display_name || mode.editingKey}`
                      : 'Nova substância'}
                </span>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button style={{
                background: 'transparent', border: 'none', color: 'var(--muted)',
                cursor: 'pointer', padding: 4,
              }} aria-label="fechar" type="button">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {feedback && (
            <div style={{
              marginBottom: 10, padding: '6px 10px', borderRadius: 5,
              background: 'rgba(217, 119, 6, 0.12)',
              border: '1px solid rgba(245,158,11,0.3)',
              color: 'var(--warm)',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            }}>{feedback}</div>
          )}

          {mode.kind === 'list' && (
            <>
              <button
                onClick={startAdd}
                style={{
                  marginBottom: 12, padding: '6px 12px', borderRadius: 5, cursor: 'pointer',
                  background: 'var(--accent-violet-dim)', color: 'var(--accent-violet)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
                type="button"
              >
                <Plus size={12} /> Adicionar substância
              </button>
              {isLoading && <div style={{ fontSize: 11, color: 'var(--muted)' }}>carregando…</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sorted.map((sub) => (
                  <div key={sub.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 5,
                    background: 'var(--card)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                          color: 'var(--foreground)', fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{sub.display_name}</span>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                          padding: '1px 5px', borderRadius: 3,
                          background: sub.is_custom ? 'rgba(15, 118, 110, 0.15)' : 'rgba(139,92,246,0.15)',
                          color: sub.is_custom ? 'var(--accent)' : 'var(--accent-violet)',
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                        }}>{sub.is_custom ? 'custom' : 'built-in'}</span>
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--muted)' }}>
                        {sub.id} · t½ {sub.half_life_hours ?? '—'}h · F {sub.bioavailability ?? '—'}
                      </span>
                    </div>
                    <button
                      onClick={() => startEdit(sub)}
                      disabled={!sub.is_custom}
                      title={sub.is_custom ? 'editar' : 'built-in — clone pra override'}
                      style={{
                        background: sub.is_custom ? 'var(--accent-violet-dim)' : 'transparent',
                        border: `1px solid ${sub.is_custom ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
                        color: sub.is_custom ? 'var(--accent-violet)' : 'var(--muted)',
                        borderRadius: 4, padding: '3px 7px', cursor: sub.is_custom ? 'pointer' : 'not-allowed',
                        opacity: sub.is_custom ? 1 : 0.4,
                      }} type="button">
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(sub)}
                      disabled={!sub.is_custom || deleteSub.isPending}
                      title={sub.is_custom ? 'apagar' : 'built-in — não pode ser removida'}
                      style={{
                        background: sub.is_custom ? 'rgba(251,113,133,0.1)' : 'transparent',
                        border: `1px solid ${sub.is_custom ? 'rgba(251,113,133,0.3)' : 'var(--border)'}`,
                        color: sub.is_custom ? '#fb7185' : 'var(--muted)',
                        borderRadius: 4, padding: '3px 7px', cursor: sub.is_custom ? 'pointer' : 'not-allowed',
                        opacity: sub.is_custom ? 1 : 0.4,
                      }} type="button">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {mode.kind === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Row 1: key + display_name + copy-from-preset */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(180px,2fr) auto', gap: 8 }}>
                <div>
                  <label style={labelStyle}>CHAVE (id interno)</label>
                  <input
                    type="text" value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    readOnly={mode.editingKey != null}
                    placeholder="ex: vitamina_c"
                    style={{
                      ...inputStyle,
                      background: mode.editingKey != null ? 'transparent' : 'var(--card)',
                      color: mode.editingKey != null ? 'var(--muted)' : 'var(--foreground)',
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>NOME DE EXIBIÇÃO *</label>
                  <input
                    type="text" value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Vitamina C"
                    style={inputStyle}
                  />
                </div>
                {mode.editingKey == null && substances.length > 0 && (
                  <div>
                    <label style={labelStyle}>COPIAR DE</label>
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) copyFromPreset(e.target.value) }}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">— preset —</option>
                      {substances.map((s) => (
                        <option key={s.id} value={s.id}>{s.display_name.split(' ')[0]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>ALIASES (vírgula)</label>
                <input
                  type="text" value={form.aliases}
                  onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                  placeholder="ex: ácido ascórbico, asc"
                  style={inputStyle}
                />
              </div>

              {/* Row 2: PK params */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div>
                  <label style={labelStyle}>BIOAVAILABILITY (0–1.5) *</label>
                  <input type="number" step="any" value={form.bioavailability}
                    onChange={(e) => setForm({ ...form, bioavailability: e.target.value })}
                    placeholder="0.9" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>HALF-LIFE (h) *</label>
                  <input type="number" step="any" value={form.half_life_hours}
                    onChange={(e) => setForm({ ...form, half_life_hours: e.target.value })}
                    placeholder="2.0" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>TMAX (h) *</label>
                  <input type="number" step="any" value={form.tmax_hours}
                    onChange={(e) => setForm({ ...form, tmax_hours: e.target.value })}
                    placeholder="1.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ka (1/h) *</label>
                  <input type="number" step="any" value={form.ka_per_hour}
                    onChange={(e) => setForm({ ...form, ka_per_hour: e.target.value })}
                    placeholder="1.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ke (1/h) *</label>
                  <input type="number" step="any" value={form.ke_per_hour}
                    onChange={(e) => setForm({ ...form, ke_per_hour: e.target.value })}
                    placeholder="0.35" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>DOSE UNIT</label>
                  <input type="text" value={form.dose_unit}
                    onChange={(e) => setForm({ ...form, dose_unit: e.target.value })}
                    placeholder="mg" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Vd (L/kg) †</label>
                  <input type="number" step="any" value={form.vd_l_per_kg}
                    onChange={(e) => setForm({ ...form, vd_l_per_kg: e.target.value })}
                    placeholder="ex: 12" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Vd (L absoluto) †</label>
                  <input type="number" step="any" value={form.vd_l}
                    onChange={(e) => setForm({ ...form, vd_l: e.target.value })}
                    placeholder="ex: 40" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ke0 (1/h) opt</label>
                  <input type="number" step="any" value={form.ke0_per_hour}
                    onChange={(e) => setForm({ ...form, ke0_per_hour: e.target.value })}
                    placeholder="ex: 0.2" style={inputStyle} />
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: -4 }}>
                † informar pelo menos um dos dois Vd
              </div>

              {/* Therapeutic range */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div>
                  <label style={labelStyle}>FAIXA TERAPÊUTICA MIN</label>
                  <input type="number" step="any" value={form.therapeutic_range_min}
                    onChange={(e) => setForm({ ...form, therapeutic_range_min: e.target.value })}
                    placeholder="15" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>FAIXA TERAPÊUTICA MAX</label>
                  <input type="number" step="any" value={form.therapeutic_range_max}
                    onChange={(e) => setForm({ ...form, therapeutic_range_max: e.target.value })}
                    placeholder="80" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>UNIDADE</label>
                  <input type="text" value={form.therapeutic_range_unit}
                    onChange={(e) => setForm({ ...form, therapeutic_range_unit: e.target.value })}
                    placeholder="ng/mL" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>NOTAS (uma por linha)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="observações clínicas…"
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.4, height: 60 }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={backToList}
                  disabled={createSub.isPending || updateSub.isPending}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--muted)', borderRadius: 5, padding: '6px 12px',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, cursor: 'pointer',
                  }}
                  type="button"
                >cancelar</button>
                <button
                  onClick={handleSave}
                  disabled={createSub.isPending || updateSub.isPending}
                  style={{
                    background: 'rgba(15, 118, 110, 0.12)',
                    border: '1px solid rgba(15, 118, 110, 0.3)',
                    color: 'var(--accent)', borderRadius: 5, padding: '6px 12px',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                  type="button"
                >
                  <Check size={11} />
                  {createSub.isPending || updateSub.isPending ? 'salvando…' : 'salvar'}
                </button>
              </div>
            </div>
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
