import type {
  AppleHealthBundle,
  DailyHealthMetrics,
  DailyMoodMetrics,
  DailySnapshot,
  MedicationRow,
  ParsedCsvFile,
} from '@/types/apple-health'

export type AuditDomain = 'health' | 'mood' | 'medications'
export type FieldVisibility = 'dashboard' | 'section' | 'action' | 'inventory'

export interface PipelineStep {
  id: string
  title: string
  system: string
  detail: string
}

export interface DomainSummary {
  domain: AuditDomain
  label: string
  description: string
  sourceTables: string[]
  totalFields: number
  visibleFields: number
  totalDays: number
  daysWithData: number
  rowCount: number
}

export interface FieldAuditRow {
  id: string
  domain: AuditDomain
  label: string
  backendField: string
  frontendPath: string
  coverageCount: number
  coveragePct: number
  lastDate: string | null
  lastValue: string
  visibility: FieldVisibility
  usedIn: string[]
}

export interface CorrelationCandidate {
  id: string
  title: string
  description: string
  overlapDays: number
  status: 'ready' | 'limited' | 'insufficient'
}

export interface PipelineAudit {
  sourceFiles: ParsedCsvFile[]
  pipelineSteps: PipelineStep[]
  domainSummaries: DomainSummary[]
  fieldGroups: Array<{ domain: AuditDomain; label: string; rows: FieldAuditRow[] }>
  correlationCandidates: CorrelationCandidate[]
  notes: string[]
}

type HealthMetricKey = Exclude<keyof DailyHealthMetrics, 'date' | 'interpolated'>
type MoodMetricKey = Exclude<keyof DailyMoodMetrics, 'date' | 'interpolated'>
type MedicationMetricKey = Exclude<keyof MedicationRow, 'id'>

interface SnapshotFieldDescriptor<TDomain extends AuditDomain, TKey extends string> {
  id: string
  domain: TDomain
  label: string
  key: TKey
  backendField: string
  frontendPath: string
  visibility: FieldVisibility
  usedIn: string[]
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 'source',
    title: 'Origem',
    system: 'iPhone + apps',
    detail: 'Health Auto Export, State of Mind e logs de medicacao entram como CSV ou registro manual.',
  },
  {
    id: 'ingest',
    title: 'Ingestao',
    system: 'FastAPI',
    detail: 'Parsers em backend/parsers validam o payload e normalizam os formatos para tabelas diarias.',
  },
  {
    id: 'storage',
    title: 'Persistencia',
    system: 'SQLite',
    detail: 'Aggregators fazem INSERT OR REPLACE em daily_sleep, daily_cardio, daily_activity, mood e medications.',
  },
  {
    id: 'query',
    title: 'Leitura agregada',
    system: 'GET /metrics/overview',
    detail: 'Routers consolidam sleep, cardio, activity, mood, medications e ingestion_log em um payload unico.',
  },
  {
    id: 'transform',
    title: 'Transformacao',
    system: 'src/api/client.ts',
    detail: 'buildBundleFromApiData monta dailySnapshots, medicationRows e parsedFiles e aplica interpolacao conservadora.',
  },
  {
    id: 'render',
    title: 'Renderizacao',
    system: 'Zustand + React',
    detail: 'useAppleHealthStore hidrata o frontend; hooks e secoes consomem snapshots para cards, graficos e correlacoes.',
  },
]

const HEALTH_FIELDS: Array<SnapshotFieldDescriptor<'health', HealthMetricKey>> = [
  { id: 'sleep-total', domain: 'health', label: 'Sono total', key: 'sleepTotalHours', backendField: 'daily_sleep.total_hr', frontendPath: 'dailySnapshots[].health.sleepTotalHours', visibility: 'dashboard', usedIn: ['MetricCard', 'TimelineChart', 'SleepSection', 'Anomaly engine'] },
  { id: 'sleep-asleep', domain: 'health', label: 'Sono efetivo', key: 'sleepAsleepHours', backendField: 'daily_sleep.asleep_hr', frontendPath: 'dailySnapshots[].health.sleepAsleepHours', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'sleep-in-bed', domain: 'health', label: 'Tempo na cama', key: 'sleepInBedHours', backendField: 'daily_sleep.in_bed_hr', frontendPath: 'dailySnapshots[].health.sleepInBedHours', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'sleep-core', domain: 'health', label: 'Sono core', key: 'sleepCoreHours', backendField: 'daily_sleep.core_hr', frontendPath: 'dailySnapshots[].health.sleepCoreHours', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'sleep-deep', domain: 'health', label: 'Sono profundo', key: 'sleepDeepHours', backendField: 'daily_sleep.deep_hr', frontendPath: 'dailySnapshots[].health.sleepDeepHours', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'sleep-rem', domain: 'health', label: 'Sono REM', key: 'sleepRemHours', backendField: 'daily_sleep.rem_hr', frontendPath: 'dailySnapshots[].health.sleepRemHours', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'sleep-awake', domain: 'health', label: 'Sono acordado', key: 'sleepAwakeHours', backendField: 'daily_sleep.awake_hr', frontendPath: 'dailySnapshots[].health.sleepAwakeHours', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'sleep-efficiency', domain: 'health', label: 'Eficiencia do sono', key: 'sleepEfficiencyPct', backendField: 'derived: daily_sleep.total_hr / in_bed_hr', frontendPath: 'dailySnapshots[].health.sleepEfficiencyPct', visibility: 'dashboard', usedIn: ['Hero resumo', 'TimelineChart', 'SleepSection'] },
  { id: 'resp-disturbances', domain: 'health', label: 'Disturbios respiratorios', key: 'respiratoryDisturbances', backendField: 'daily_sleep.respiratory_disturbances', frontendPath: 'dailySnapshots[].health.respiratoryDisturbances', visibility: 'section', usedIn: ['SleepSection'] },
  { id: 'active-energy', domain: 'health', label: 'Energia ativa', key: 'activeEnergyKcal', backendField: 'daily_activity.active_energy_kcal', frontendPath: 'dailySnapshots[].health.activeEnergyKcal', visibility: 'dashboard', usedIn: ['MetricCard', 'TimelineChart', 'ActivitySection', 'Correlations'] },
  { id: 'resting-energy', domain: 'health', label: 'Energia basal', key: 'restingEnergyKcal', backendField: 'daily_activity.resting_energy_kcal', frontendPath: 'dailySnapshots[].health.restingEnergyKcal', visibility: 'section', usedIn: ['ActivitySection'] },
  { id: 'hr-min', domain: 'health', label: 'FC minima', key: 'heartRateMin', backendField: 'daily_cardio.hr_min', frontendPath: 'dailySnapshots[].health.heartRateMin', visibility: 'section', usedIn: ['CardioSection'] },
  { id: 'hr-max', domain: 'health', label: 'FC maxima', key: 'heartRateMax', backendField: 'daily_cardio.hr_max', frontendPath: 'dailySnapshots[].health.heartRateMax', visibility: 'section', usedIn: ['CardioSection'] },
  { id: 'hr-mean', domain: 'health', label: 'FC media', key: 'heartRateMean', backendField: 'daily_cardio.hr_avg', frontendPath: 'dailySnapshots[].health.heartRateMean', visibility: 'section', usedIn: ['CardioSection'] },
  { id: 'rhr', domain: 'health', label: 'FC de repouso', key: 'restingHeartRate', backendField: 'daily_cardio.hr_resting', frontendPath: 'dailySnapshots[].health.restingHeartRate', visibility: 'dashboard', usedIn: ['MetricCard', 'TimelineChart', 'CardioSection', 'Correlations'] },
  { id: 'spo2', domain: 'health', label: 'SpO2', key: 'spo2', backendField: 'daily_cardio.spo2_avg', frontendPath: 'dailySnapshots[].health.spo2', visibility: 'dashboard', usedIn: ['Hero resumo', 'TimelineChart', 'CardioSection'] },
  { id: 'respiratory-rate', domain: 'health', label: 'Frequencia respiratoria', key: 'respiratoryRate', backendField: 'daily_cardio.respiratory_rate_avg', frontendPath: 'dailySnapshots[].health.respiratoryRate', visibility: 'section', usedIn: ['CardioSection'] },
  { id: 'wrist-temp', domain: 'health', label: 'Temperatura do pulso', key: 'pulseTemperatureC', backendField: 'daily_sleep.wrist_temp_sleeping', frontendPath: 'dailySnapshots[].health.pulseTemperatureC', visibility: 'inventory', usedIn: ['Ainda nao exposto'] },
  { id: 'exercise', domain: 'health', label: 'Minutos de exercicio', key: 'exerciseMinutes', backendField: 'daily_activity.exercise_minutes', frontendPath: 'dailySnapshots[].health.exerciseMinutes', visibility: 'dashboard', usedIn: ['Hero resumo', 'TimelineChart', 'ActivitySection', 'Anomaly engine'] },
  { id: 'movement', domain: 'health', label: 'Minutos de movimento', key: 'movementMinutes', backendField: 'daily_activity.movement_minutes', frontendPath: 'dailySnapshots[].health.movementMinutes', visibility: 'section', usedIn: ['ActivitySection', 'TimelineChart opcional'] },
  { id: 'standing', domain: 'health', label: 'Minutos em pe', key: 'standingMinutes', backendField: 'daily_activity.stand_minutes', frontendPath: 'dailySnapshots[].health.standingMinutes', visibility: 'section', usedIn: ['ActivitySection', 'TimelineChart opcional'] },
  { id: 'daylight', domain: 'health', label: 'Luz do dia', key: 'daylightMinutes', backendField: 'daily_activity.daylight_minutes', frontendPath: 'dailySnapshots[].health.daylightMinutes', visibility: 'dashboard', usedIn: ['Hero resumo', 'TimelineChart', 'ActivitySection', 'Correlations'] },
  { id: 'hrv', domain: 'health', label: 'HRV', key: 'hrvSdnn', backendField: 'daily_cardio.hrv_avg', frontendPath: 'dailySnapshots[].health.hrvSdnn', visibility: 'dashboard', usedIn: ['MetricCard', 'TimelineChart', 'CardioSection', 'Correlations'] },
  { id: 'record-count', domain: 'health', label: 'Linhas agregadas', key: 'recordCount', backendField: 'derived', frontendPath: 'dailySnapshots[].health.recordCount', visibility: 'inventory', usedIn: ['Qualidade do dado'] },
  { id: 'placeholder-resting', domain: 'health', label: 'Marcadores de energia placeholder', key: 'placeholderRestingEnergyRows', backendField: 'derived', frontendPath: 'dailySnapshots[].health.placeholderRestingEnergyRows', visibility: 'inventory', usedIn: ['Qualidade do dado / watch worn'] },
]

const MOOD_FIELDS: Array<SnapshotFieldDescriptor<'mood', MoodMetricKey>> = [
  { id: 'mood-valence', domain: 'mood', label: 'Valencia', key: 'valence', backendField: 'mood.valence_raw', frontendPath: 'dailySnapshots[].mood.valence', visibility: 'dashboard', usedIn: ['MetricCard', 'TimelineChart', 'MoodTimeline', 'MoodDonut', 'MoodHeatmap', 'Correlations'] },
  { id: 'mood-class', domain: 'mood', label: 'Classificacao', key: 'valenceClass', backendField: 'mood.classification', frontendPath: 'dailySnapshots[].mood.valenceClass', visibility: 'dashboard', usedIn: ['MoodHeatmap', 'MoodTimeline'] },
  { id: 'mood-count', domain: 'mood', label: 'Entradas por dia', key: 'entryCount', backendField: 'derived: count(mood rows)', frontendPath: 'dailySnapshots[].mood.entryCount', visibility: 'section', usedIn: ['MoodHeatmap tooltip'] },
  { id: 'mood-labels', domain: 'mood', label: 'Rotulos', key: 'labels', backendField: 'mood.labels', frontendPath: 'dailySnapshots[].mood.labels', visibility: 'section', usedIn: ['MoodHeatmap tooltip'] },
  { id: 'mood-associations', domain: 'mood', label: 'Associacoes', key: 'associations', backendField: 'mood.associations', frontendPath: 'dailySnapshots[].mood.associations', visibility: 'section', usedIn: ['MoodHeatmap tooltip'] },
]

const MEDICATION_FIELDS: Array<SnapshotFieldDescriptor<'medications', MedicationMetricKey>> = [
  { id: 'med-date', domain: 'medications', label: 'Timestamp da dose', key: 'date', backendField: 'medications.date + actual_time', frontendPath: 'medicationRows[].date', visibility: 'action', usedIn: ['QuickDoseLog', 'PharmaSection'] },
  { id: 'med-scheduled', domain: 'medications', label: 'Horario agendado', key: 'scheduledDate', backendField: 'medications.date + scheduled_time', frontendPath: 'medicationRows[].scheduledDate', visibility: 'section', usedIn: ['QuickDoseLog', 'Atrasos'] },
  { id: 'med-name', domain: 'medications', label: 'Medicamento', key: 'medication', backendField: 'medications.medication', frontendPath: 'medicationRows[].medication', visibility: 'dashboard', usedIn: ['QuickDoseLog', 'DoseTimeline', 'PK charts'] },
  { id: 'med-nickname', domain: 'medications', label: 'Apelido', key: 'nickname', backendField: 'medications.nickname', frontendPath: 'medicationRows[].nickname', visibility: 'section', usedIn: ['Listagens de dose'] },
  { id: 'med-dose', domain: 'medications', label: 'Dose tomada', key: 'dosage', backendField: 'medications.actual_dose', frontendPath: 'medicationRows[].dosage', visibility: 'dashboard', usedIn: ['QuickDoseLog', 'DoseTimeline', 'PK charts'] },
  { id: 'med-scheduled-dose', domain: 'medications', label: 'Dose planejada', key: 'scheduledDosage', backendField: 'medications.scheduled_dose', frontendPath: 'medicationRows[].scheduledDosage', visibility: 'section', usedIn: ['Aderencia'] },
  { id: 'med-unit', domain: 'medications', label: 'Unidade', key: 'unit', backendField: 'medications.unit', frontendPath: 'medicationRows[].unit', visibility: 'section', usedIn: ['QuickDoseLog', 'DoseTimeline'] },
  { id: 'med-status', domain: 'medications', label: 'Status', key: 'status', backendField: 'medications.status', frontendPath: 'medicationRows[].status', visibility: 'section', usedIn: ['Aderencia', 'QuickDoseLog'] },
  { id: 'med-archived', domain: 'medications', label: 'Arquivado', key: 'archived', backendField: 'medications.archived', frontendPath: 'medicationRows[].archived', visibility: 'inventory', usedIn: ['Ainda nao exposto'] },
  { id: 'med-codings', domain: 'medications', label: 'Codificacoes', key: 'codings', backendField: 'medications.codings', frontendPath: 'medicationRows[].codings', visibility: 'inventory', usedIn: ['Ainda nao exposto'] },
]

interface CorrelationBlueprint {
  id: string
  title: string
  description: string
  left: (snapshot: DailySnapshot) => number | null
  right: (snapshot: DailySnapshot) => number | null
}

const CORRELATION_BLUEPRINTS: CorrelationBlueprint[] = [
  {
    id: 'sleep-vs-mood',
    title: 'Sono total x humor',
    description: 'Base forte para reler a relacao entre descanso acumulado e valencia diaria.',
    left: (snapshot) => snapshot.health?.sleepTotalHours ?? null,
    right: (snapshot) => snapshot.mood?.valence ?? null,
  },
  {
    id: 'hrv-vs-mood',
    title: 'HRV x humor',
    description: 'Ajuda a medir variacao autonoma versus bem-estar subjetivo.',
    left: (snapshot) => snapshot.health?.hrvSdnn ?? null,
    right: (snapshot) => snapshot.mood?.valence ?? null,
  },
  {
    id: 'rhr-vs-sleep-efficiency',
    title: 'FC repouso x eficiencia do sono',
    description: 'Boa candidata para stress/fadiga, usando dois sinais com boa cobertura.',
    left: (snapshot) => snapshot.health?.restingHeartRate ?? null,
    right: (snapshot) => snapshot.health?.sleepEfficiencyPct ?? null,
  },
  {
    id: 'exercise-vs-sleep',
    title: 'Exercicio x sono total',
    description: 'Permite observar se carga de exercicio acompanha duracao do sono.',
    left: (snapshot) => snapshot.health?.exerciseMinutes ?? null,
    right: (snapshot) => snapshot.health?.sleepTotalHours ?? null,
  },
  {
    id: 'daylight-vs-mood',
    title: 'Luz do dia x humor',
    description: 'Relaciona exposicao ambiental com valencia e estabilidade de humor.',
    left: (snapshot) => snapshot.health?.daylightMinutes ?? null,
    right: (snapshot) => snapshot.mood?.valence ?? null,
  },
  {
    id: 'med-count-vs-mood',
    title: 'Carga de medicacoes x humor',
    description: 'Nao e PK ainda, mas ja mede dias com mais eventos de dose versus valencia.',
    left: (snapshot) => snapshot.medications?.count ?? null,
    right: (snapshot) => snapshot.mood?.valence ?? null,
  },
]

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString()
  }

  return value.toFixed(Math.abs(value) >= 100 ? 0 : 2)
}

function formatValue(value: unknown): string {
  if (value == null) {
    return 'Sem dado'
  }

  if (typeof value === 'number') {
    return formatNumber(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Nao'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'Vazio'
    }

    return value.slice(0, 3).join(', ')
  }

  const text = String(value)
  return text.length > 40 ? `${text.slice(0, 37)}...` : text
}

function buildCoverage(total: number, available: number): number {
  if (total === 0) {
    return 0
  }

  return Number(((available / total) * 100).toFixed(1))
}

function buildHealthRows(snapshots: DailySnapshot[]): FieldAuditRow[] {
  return HEALTH_FIELDS.map((field) => {
    const values = snapshots.map((snapshot) => ({
      date: snapshot.date,
      value: snapshot.health?.[field.key] ?? null,
    }))
    const populated = values.filter((entry) => entry.value != null)
    const last = [...populated].reverse()[0]

    return {
      id: field.id,
      domain: field.domain,
      label: field.label,
      backendField: field.backendField,
      frontendPath: field.frontendPath,
      coverageCount: populated.length,
      coveragePct: buildCoverage(snapshots.length, populated.length),
      lastDate: last?.date ?? null,
      lastValue: formatValue(last?.value ?? null),
      visibility: field.visibility,
      usedIn: field.usedIn,
    }
  })
}

function buildMoodRows(snapshots: DailySnapshot[]): FieldAuditRow[] {
  return MOOD_FIELDS.map((field) => {
    const values = snapshots.map((snapshot) => ({
      date: snapshot.date,
      value: snapshot.mood?.[field.key] ?? null,
    }))
    const populated = values.filter((entry) => {
      if (Array.isArray(entry.value)) {
        return entry.value.length > 0
      }

      return entry.value != null
    })
    const last = [...populated].reverse()[0]

    return {
      id: field.id,
      domain: field.domain,
      label: field.label,
      backendField: field.backendField,
      frontendPath: field.frontendPath,
      coverageCount: populated.length,
      coveragePct: buildCoverage(snapshots.length, populated.length),
      lastDate: last?.date ?? null,
      lastValue: formatValue(last?.value ?? null),
      visibility: field.visibility,
      usedIn: field.usedIn,
    }
  })
}

function buildMedicationRows(rows: MedicationRow[]): FieldAuditRow[] {
  return MEDICATION_FIELDS.map((field) => {
    const values = rows.map((row) => ({
      date: row.date ?? row.scheduledDate ?? null,
      value: row[field.key] ?? null,
    }))
    const populated = values.filter((entry) => {
      if (Array.isArray(entry.value)) {
        return entry.value.length > 0
      }

      return entry.value != null
    })
    const last = [...populated].reverse()[0]

    return {
      id: field.id,
      domain: field.domain,
      label: field.label,
      backendField: field.backendField,
      frontendPath: field.frontendPath,
      coverageCount: populated.length,
      coveragePct: buildCoverage(rows.length, populated.length),
      lastDate: last?.date ?? null,
      lastValue: formatValue(last?.value ?? null),
      visibility: field.visibility,
      usedIn: field.usedIn,
    }
  })
}

function buildDomainSummaries(
  snapshots: DailySnapshot[],
  medicationRows: MedicationRow[],
): DomainSummary[] {
  const healthDays = snapshots.filter((snapshot) => snapshot.health != null).length
  const moodDays = snapshots.filter((snapshot) => snapshot.mood != null).length
  const medicationDays = snapshots.filter((snapshot) => snapshot.medications != null).length

  return [
    {
      domain: 'health',
      label: 'Saude',
      description: 'Sono, cardio e atividade agregados por dia.',
      sourceTables: ['daily_sleep', 'daily_cardio', 'daily_activity', 'body_measurements'],
      totalFields: HEALTH_FIELDS.length,
      visibleFields: HEALTH_FIELDS.filter((field) => field.visibility !== 'inventory').length,
      totalDays: snapshots.length,
      daysWithData: healthDays,
      rowCount: healthDays,
    },
    {
      domain: 'mood',
      label: 'Humor',
      description: 'Valencia, classificacoes, rotulos e associacoes por dia.',
      sourceTables: ['mood'],
      totalFields: MOOD_FIELDS.length,
      visibleFields: MOOD_FIELDS.filter((field) => field.visibility !== 'inventory').length,
      totalDays: snapshots.length,
      daysWithData: moodDays,
      rowCount: moodDays,
    },
    {
      domain: 'medications',
      label: 'Medicacoes',
      description: 'Eventos de dose e metadados operacionais.',
      sourceTables: ['medications'],
      totalFields: MEDICATION_FIELDS.length,
      visibleFields: MEDICATION_FIELDS.filter((field) => field.visibility !== 'inventory').length,
      totalDays: snapshots.length,
      daysWithData: medicationDays,
      rowCount: medicationRows.length,
    },
  ]
}

function overlapDays(
  snapshots: DailySnapshot[],
  left: (snapshot: DailySnapshot) => number | null,
  right: (snapshot: DailySnapshot) => number | null,
): number {
  return snapshots.filter((snapshot) => left(snapshot) != null && right(snapshot) != null).length
}

function buildCorrelationCandidates(snapshots: DailySnapshot[]): CorrelationCandidate[] {
  return CORRELATION_BLUEPRINTS.map((candidate) => {
    const overlap = overlapDays(snapshots, candidate.left, candidate.right)
    const status =
      overlap >= 30 ? 'ready' : overlap >= 12 ? 'limited' : 'insufficient'

    return {
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      overlapDays: overlap,
      status,
    }
  })
}

function buildNotes(bundle: AppleHealthBundle | null): string[] {
  if (!bundle) {
    return [
      'Sem bundle carregado: o painel auditara o pipeline assim que /metrics/overview responder.',
    ]
  }

  const notes: string[] = []

  if (bundle.healthRows.length === 0 && bundle.moodRows.length === 0) {
    notes.push('O frontend atual ja nasce agregado: healthRows e moodRows ficam vazios e o app trabalha em cima de dailySnapshots.')
  }

  if (bundle.parsedFiles.length > 0) {
    notes.push('parsedFiles vem do ingestion_log truncado para os 3 registros mais recentes no frontend.')
  }

  if (bundle.medicationRows.some((row) => row.archived != null || row.codings != null)) {
    notes.push('Medicacoes carregam campos operacionais que ainda nao aparecem com destaque na UI: archived e codings.')
  }

  return notes
}

export function buildPipelineAudit(bundle: AppleHealthBundle | null): PipelineAudit {
  const snapshots = bundle?.dailySnapshots ?? []
  const medicationRows = bundle?.medicationRows ?? []

  return {
    sourceFiles: bundle?.parsedFiles ?? [],
    pipelineSteps: PIPELINE_STEPS,
    domainSummaries: buildDomainSummaries(snapshots, medicationRows),
    fieldGroups: [
      { domain: 'health', label: 'Saude', rows: buildHealthRows(snapshots) },
      { domain: 'mood', label: 'Humor', rows: buildMoodRows(snapshots) },
      { domain: 'medications', label: 'Medicacoes', rows: buildMedicationRows(medicationRows) },
    ],
    correlationCandidates: buildCorrelationCandidates(snapshots),
    notes: buildNotes(bundle),
  }
}
