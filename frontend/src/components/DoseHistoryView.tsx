import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { History, Pencil, Trash2, Check, X } from 'lucide-react'

import { useDoses, useDeleteDose, useUpdateDose, useSubstances } from '../lib/api'
import type { DoseRecord } from '../lib/api'

type RangeKey = '24h' | '7d' | '30d'
const RANGE_HOURS: Record<RangeKey, number> = { '24h': 24, '7d': 168, '30d': 720 }

const toLocalInput = (iso: string): string => {
  try {
    const d = parseISO(iso)
    return format(d, "yyyy-MM-dd'T'HH:mm")
  } catch {
    return ''
  }
}

const toHuman = (iso: string): string => {
  try {
    return format(parseISO(iso), "d 'de' MMM · HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}

export default function DoseHistoryView() {
  const [range, setRange] = useState<RangeKey>('7d')
  const { data: doses = [], isLoading } = useDoses(RANGE_HOURS[range])
  const { data: substances = [] } = useSubstances()
  const deleteDose = useDeleteDose()
  const updateDose = useUpdateDose()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ dose_mg: string; taken_at: string; note: string }>({
    dose_mg: '',
    taken_at: '',
    note: '',
  })

  const subById = useMemo(
    () => new Map(substances.map((s) => [s.id, s])),
    [substances],
  )

  const sortedDoses = useMemo(
    () =>
      [...doses].sort(
        (a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime(),
      ),
    [doses],
  )

  const startEdit = (record: DoseRecord) => {
    setEditingId(record.id)
    setDraft({
      dose_mg: String(record.dose_mg),
      taken_at: toLocalInput(record.taken_at),
      note: record.note ?? '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async (id: string) => {
    const dose_mg = parseFloat(draft.dose_mg)
    if (!Number.isFinite(dose_mg) || dose_mg <= 0) return
    const taken_at = draft.taken_at ? new Date(draft.taken_at).toISOString() : undefined
    await updateDose.mutateAsync({
      id,
      patch: {
        dose_mg,
        ...(taken_at ? { taken_at } : {}),
        note: draft.note,
      },
    })
    setEditingId(null)
  }

  const confirmDelete = async (record: DoseRecord) => {
    const label = subById.get(record.substance)?.display_name?.split(' ')[0] ?? record.substance
    if (!window.confirm(`Remover dose de ${label} (${record.dose_mg} ${subById.get(record.substance)?.dose_unit ?? 'mg'})?`)) {
      return
    }
    await deleteDose.mutateAsync(record.id)
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '5px 8px',
    color: 'var(--text-primary)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    outline: 'none',
  }

  const btnStyle = (tint: 'violet' | 'rose' | 'emerald' | 'muted'): React.CSSProperties => {
    const colorMap = {
      violet: ['var(--accent-violet)', 'var(--accent-violet-dim)', 'rgba(139,92,246,0.3)'],
      rose: ['#fb7185', 'rgba(251,113,133,0.1)', 'rgba(251,113,133,0.3)'],
      emerald: ['var(--accent-emerald)', 'var(--accent-emerald-dim)', 'rgba(52,211,153,0.3)'],
      muted: ['var(--text-muted)', 'transparent', 'var(--border)'],
    }[tint]
    return {
      background: colorMap[1],
      border: `1px solid ${colorMap[2]}`,
      color: colorMap[0],
      borderRadius: 4,
      padding: '3px 7px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <History size={13} color="var(--accent-violet)" />
          <span className="font-display" style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px' }}>
            Histórico de Doses
          </span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            color: 'var(--text-muted)', marginLeft: 4,
          }}>
            {sortedDoses.length} {sortedDoses.length === 1 ? 'dose' : 'doses'}
          </span>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          style={{ ...inputStyle, cursor: 'pointer', fontSize: 10 }}
        >
          <option value="24h">24h</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
        </select>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isLoading && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
            carregando…
          </div>
        )}
        {!isLoading && sortedDoses.length === 0 && (
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)',
            padding: '12px 0', textAlign: 'center',
          }}>
            nenhuma dose registrada neste intervalo
          </div>
        )}
        {sortedDoses.map((record) => {
          const sub = subById.get(record.substance)
          const label = sub?.display_name?.split(' ')[0] ?? record.substance
          const unit = sub?.dose_unit ?? 'mg'
          const isEditing = editingId === record.id

          if (isEditing) {
            return (
              <div
                key={record.id}
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--accent-violet-dim)',
                  borderRadius: 6,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                    color: 'var(--text-primary)', fontWeight: 600,
                    minWidth: 70,
                  }}>{label}</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={draft.dose_mg}
                    onChange={(e) => setDraft({ ...draft, dose_mg: e.target.value })}
                    style={{ ...inputStyle, width: 70 }}
                  />
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                    color: 'var(--text-muted)',
                  }}>{unit}</span>
                  <input
                    type="datetime-local"
                    value={draft.taken_at}
                    onChange={(e) => setDraft({ ...draft, taken_at: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <textarea
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="observações (opcional)…"
                  style={{ ...inputStyle, resize: 'none', height: 32, lineHeight: 1.4 }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={cancelEdit}
                    disabled={updateDose.isPending}
                    style={btnStyle('muted')}
                    type="button"
                  >
                    <X size={11} /> cancelar
                  </button>
                  <button
                    onClick={() => saveEdit(record.id)}
                    disabled={updateDose.isPending}
                    style={btnStyle('emerald')}
                    type="button"
                  >
                    <Check size={11} />
                    {updateDose.isPending ? 'salvando…' : 'salvar'}
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={record.id}
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                    color: 'var(--text-primary)', fontWeight: 600,
                  }}>{label}</span>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                    color: 'var(--accent-violet)',
                  }}>{record.dose_mg} {unit}</span>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                    color: 'var(--text-muted)', marginLeft: 'auto',
                  }}>{toHuman(record.taken_at)}</span>
                </div>
                {record.note && (
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                    color: 'var(--text-muted)', fontStyle: 'italic',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{record.note}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => startEdit(record)}
                  style={btnStyle('violet')}
                  aria-label="editar dose"
                  type="button"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => confirmDelete(record)}
                  disabled={deleteDose.isPending}
                  style={btnStyle('rose')}
                  aria-label="apagar dose"
                  type="button"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
