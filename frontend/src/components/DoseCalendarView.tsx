import { useMemo, useState } from 'react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  isToday,
  isSameDay,
  getDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'

import {
  useDoses,
  useDeleteDose,
  useUpdateDose,
  useSubstances,
} from '../lib/api'
import type { DoseRecord } from '../lib/api'
import { getSubstanceColor } from '../lib/substance-colors'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const HOURS_WINDOW = 24 * 90 // 90 dias

const toLocalInput = (iso: string): string => {
  try {
    return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
  } catch {
    return ''
  }
}

export default function DoseCalendarView() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ dose_mg: string; taken_at: string; note: string }>({
    dose_mg: '',
    taken_at: '',
    note: '',
  })

  const { data: doses = [], isLoading } = useDoses(HOURS_WINDOW)
  const { data: substances = [] } = useSubstances()
  const updateDose = useUpdateDose()
  const deleteDose = useDeleteDose()

  const subById = useMemo(
    () => new Map(substances.map((s) => [s.id, s])),
    [substances],
  )

  const dosesByDay = useMemo(() => {
    const map = new Map<string, DoseRecord[]>()
    for (const d of doses) {
      try {
        const key = format(parseISO(d.taken_at), 'yyyy-MM-dd')
        const arr = map.get(key) ?? []
        arr.push(d)
        map.set(key, arr)
      } catch {
        // skip
      }
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime(),
      )
    }
    return map
  }, [doses])

  const monthDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(viewMonth),
      end: endOfMonth(viewMonth),
    })
  }, [viewMonth])

  const startPaddingCount = monthDays.length > 0 ? getDay(monthDays[0]) : 0

  const selectedKey = format(selectedDay, 'yyyy-MM-dd')
  const selectedDoses = dosesByDay.get(selectedKey) ?? []

  const startEdit = (record: DoseRecord) => {
    setEditingId(record.id)
    setDraft({
      dose_mg: String(record.dose_mg),
      taken_at: toLocalInput(record.taken_at),
      note: record.note ?? '',
    })
  }

  const cancelEdit = () => setEditingId(null)

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
    const sub = subById.get(record.substance)
    const label = sub?.display_name?.split(' ')[0] ?? record.substance
    const unit = sub?.dose_unit ?? 'mg'
    if (
      !window.confirm(`Remover dose de ${label} (${record.dose_mg} ${unit})?`)
    ) {
      return
    }
    await deleteDose.mutateAsync(record.id)
  }

  const goToToday = () => {
    const now = new Date()
    setViewMonth(startOfMonth(now))
    setSelectedDay(now)
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '5px 8px',
    color: 'var(--foreground)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    outline: 'none',
  }

  const navBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 7px',
    cursor: 'pointer',
    color: 'var(--muted)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    transition: 'all 0.15s',
  }

  const iconBtn = (tint: 'violet' | 'rose' | 'emerald' | 'muted'): React.CSSProperties => {
    const colorMap = {
      violet: ['var(--accent-violet)', 'rgba(139,92,246,0.08)', 'rgba(139,92,246,0.25)'],
      rose: ['#fb7185', 'rgba(251,113,133,0.08)', 'rgba(251,113,133,0.25)'],
      emerald: ['var(--accent)', 'rgba(15, 118, 110, 0.10)', 'rgba(15, 118, 110, 0.28)'],
      muted: ['var(--muted)', 'transparent', 'var(--border)'],
    }[tint]
    return {
      background: colorMap[1],
      border: `1px solid ${colorMap[2]}`,
      color: colorMap[0],
      borderRadius: 4,
      padding: '3px 6px',
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
      {/* Header com título + nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <CalendarDays size={13} color="var(--accent-violet)" />
          <span
            className="font-display"
            style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.2px' }}
          >
            Histórico — Calendário
          </span>
          {isLoading && (
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                color: 'var(--muted)',
              }}
            >
              carregando…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setViewMonth(addMonths(viewMonth, -1))}
            style={navBtn}
            type="button"
            aria-label="mês anterior"
          >
            <ChevronLeft size={11} />
          </button>
          <button onClick={goToToday} style={navBtn} type="button">
            hoje
          </button>
          <button
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            style={navBtn}
            type="button"
            aria-label="próximo mês"
          >
            <ChevronRight size={11} />
          </button>
        </div>
      </div>

      {/* Mês em Fraunces */}
      <div
        style={{
          fontFamily: 'Fraunces, serif',
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.5px',
          color: 'var(--foreground)',
          marginBottom: 14,
          textTransform: 'capitalize',
        }}
      >
        {format(viewMonth, "MMMM 'de' yyyy", { locale: ptBR })}
      </div>

      {/* DUAL PANE */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(220px, 0.55fr)',
          gap: 18,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* === CALENDAR === */}
        <div style={{ minWidth: 0 }}>
          {/* Weekday header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
              marginBottom: 6,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 6,
            }}
          >
            {WEEKDAYS.map((label, i) => (
              <span
                key={i}
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: 9,
                  color: 'var(--muted)',
                  letterSpacing: '0.18em',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  fontStyle: i === 0 ? 'italic' : 'normal',
                  fontWeight: 500,
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
            }}
          >
            {Array.from({ length: startPaddingCount }, (_, i) => (
              <div key={`pad-${i}`} style={{ minHeight: 60 }} />
            ))}
            {monthDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayDoses = dosesByDay.get(dayKey) ?? []
              const today = isToday(day)
              const selected = isSameDay(day, selectedDay)
              const isSunday = getDay(day) === 0
              const visible = dayDoses.slice(0, 4)
              const overflow = dayDoses.length - visible.length

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  style={{
                    minHeight: 60,
                    background: selected
                      ? 'var(--accent-violet-dim)'
                      : 'transparent',
                    border: today
                      ? '1.5px solid var(--accent-violet)'
                      : '1px solid transparent',
                    borderRadius: 6,
                    padding: '4px 0 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.18s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Fraunces, serif',
                      fontSize: 16,
                      fontWeight: today ? 600 : 500,
                      color: 'var(--foreground)',
                      fontStyle: isSunday ? 'italic' : 'normal',
                      lineHeight: 1,
                    }}
                  >
                    {format(day, 'd')}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      alignItems: 'center',
                    }}
                  >
                    {visible.map((d) => (
                      <span
                        key={d.id}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          background: getSubstanceColor(d.substance),
                        }}
                      />
                    ))}
                    {overflow > 0 && (
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 8,
                          color: 'var(--muted)',
                          marginTop: 1,
                        }}
                      >
                        +{overflow}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Legenda subtle */}
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: 'var(--muted)',
              letterSpacing: '0.04em',
            }}
          >
            {Array.from(new Set(doses.map((d) => d.substance)))
              .slice(0, 6)
              .map((subId) => {
                const sub = subById.get(subId)
                const label = sub?.display_name?.split(' ')[0] ?? subId
                return (
                  <span
                    key={subId}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: getSubstanceColor(subId),
                      }}
                    />
                    {label}
                  </span>
                )
              })}
          </div>
        </div>

        {/* === SIDE PANEL === */}
        <div
          style={{
            minWidth: 0,
            borderLeft: '1px dashed var(--border)',
            paddingLeft: 16,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontSize: 9,
                color: 'var(--muted)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 3,
                fontWeight: 500,
              }}
            >
              {format(selectedDay, 'EEEE', { locale: ptBR })}
              {isToday(selectedDay) && ' · hoje'}
            </span>
            <span
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--foreground)',
                letterSpacing: '-0.3px',
              }}
            >
              {format(selectedDay, "d 'de' MMMM", { locale: ptBR })}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 0,
            }}
          >
            {selectedDoses.length === 0 && (
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  color: 'var(--muted)',
                  fontStyle: 'italic',
                  padding: '6px 0',
                }}
              >
                nenhuma dose registrada neste dia
              </span>
            )}

            {selectedDoses.map((record) => {
              const sub = subById.get(record.substance)
              const label = sub?.display_name?.split(' ')[0] ?? record.substance
              const unit = sub?.dose_unit ?? 'mg'
              const color = getSubstanceColor(record.substance)
              const isEditing = editingId === record.id

              if (isEditing) {
                return (
                  <div
                    key={record.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 8,
                      borderRadius: 6,
                      background: 'rgba(139, 92, 246, 0.05)',
                      border: '1px solid var(--accent-violet-dim)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draft.dose_mg}
                      onChange={(e) =>
                        setDraft({ ...draft, dose_mg: e.target.value })
                      }
                      placeholder={`dose (${unit})`}
                      style={inputStyle}
                    />
                    <input
                      type="datetime-local"
                      value={draft.taken_at}
                      onChange={(e) =>
                        setDraft({ ...draft, taken_at: e.target.value })
                      }
                      style={inputStyle}
                    />
                    <textarea
                      value={draft.note}
                      onChange={(e) =>
                        setDraft({ ...draft, note: e.target.value })
                      }
                      placeholder="nota..."
                      style={{
                        ...inputStyle,
                        resize: 'none',
                        height: 32,
                        lineHeight: 1.4,
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        gap: 4,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        onClick={cancelEdit}
                        disabled={updateDose.isPending}
                        style={iconBtn('muted')}
                        type="button"
                      >
                        <X size={10} /> cancelar
                      </button>
                      <button
                        onClick={() => saveEdit(record.id)}
                        disabled={updateDose.isPending}
                        style={iconBtn('emerald')}
                        type="button"
                      >
                        <Check size={10} />
                        {updateDose.isPending ? '…' : 'salvar'}
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={record.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: color,
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11,
                        color: 'var(--foreground)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 10,
                        color: 'var(--muted)',
                        marginTop: 1,
                      }}
                    >
                      {record.dose_mg} {unit} ·{' '}
                      {format(parseISO(record.taken_at), 'HH:mm')}
                    </div>
                    {record.note && (
                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 10,
                          color: 'var(--muted)',
                          fontStyle: 'italic',
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {record.note}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(record)}
                      style={iconBtn('violet')}
                      aria-label="editar dose"
                      type="button"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      onClick={() => confirmDelete(record)}
                      disabled={deleteDose.isPending}
                      style={iconBtn('rose')}
                      aria-label="apagar dose"
                      type="button"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
