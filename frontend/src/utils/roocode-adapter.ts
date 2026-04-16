import { parse as parseDate, isValid, formatISO } from 'date-fns'

import type {
  AppleHealthBundle,
  DailySnapshot,
  HealthAutoExportRow,
  MedicationRow,
  MoodEntryRow,
} from '@/types/apple-health'
import type {
  DoseRecord,
  MetricsRecord,
  MoodRecord,
  SleepRecord,
} from '@/lib/api'

import { buildDailySnapshots } from './aggregation'

export type MoodDataQuality = 'valid' | 'corrupted' | 'empty'

export interface AdapterInput {
  sleep?: SleepRecord[]
  metrics?: MetricsRecord[]
  mood?: MoodRecord[]
  doses?: DoseRecord[]
  useMock?: boolean
}

export interface AdapterOutput {
  snapshots: DailySnapshot[]
  medicationRows: MedicationRow[]
  moodQuality: MoodDataQuality
  usedMock: boolean
}

/**
 * Converte "09-04-26" (dd-MM-yy do AutoExport) em ISO yyyy-MM-dd.
 * Retorna null se inválido.
 */
function sleepDateToIso(input: string | null | undefined): string | null {
  if (!input) return null
  const parsed = parseDate(input, 'dd-MM-yy', new Date())
  if (!isValid(parsed)) return null
  return formatISO(parsed, { representation: 'date' })
}

/**
 * Normaliza keys com trailing whitespace (ex: "Data/Hora          ").
 * O backend RooCode expõe essa inconsistência — o adapter a esconde.
 */
export function normalizeMetricsKeys(rows: MetricsRecord[]): MetricsRecord[] {
  return rows.map((row) => {
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      cleaned[key.trim()] = value
    }
    return cleaned as unknown as MetricsRecord
  })
}

/**
 * Converte SleepRecord → HealthAutoExportRow contendo só os campos de sono.
 * Campos não-sono ficam null; metrics entram em linhas separadas depois.
 */
function sleepRecordToHealthRow(record: SleepRecord): HealthAutoExportRow | null {
  const iso = sleepDateToIso(record['Date/Time'])
  if (!iso) return null

  return {
    dateTime: iso,
    sleepTotalHours: record['Total Sleep (hr)'] ?? null,
    sleepAsleepHours: record['Asleep (Unspecified) (hr)'] ?? null,
    sleepInBedHours: null,
    sleepCoreHours: record['Core (hr)'] ?? null,
    sleepDeepHours: record['Deep (hr)'] ?? null,
    sleepRemHours: record['REM (hr)'] ?? null,
    sleepAwakeHours: record['Awake (hr)'] ?? null,
    respiratoryDisturbances: null,
    activeEnergyKcal: null,
    restingEnergyKcal: null,
    heartRateMin: null,
    heartRateMax: null,
    heartRateMean: null,
    restingHeartRate: null,
    spo2: null,
    respiratoryRate: null,
    pulseTemperatureC: null,
    exerciseMinutes: null,
    movementMinutes: null,
    standingMinutes: null,
    daylightMinutes: null,
    hrvSdnn: null,
    isPlaceholderRestingEnergy: false,
  }
}

/**
 * Converte MetricsRecord (Data/Hora + 10 campos opcionais em PT-BR)
 * para HealthAutoExportRow com os campos fisiológicos preenchidos.
 */
function metricsRecordToHealthRow(record: MetricsRecord): HealthAutoExportRow | null {
  const raw = record['Data/Hora']
  if (!raw) return null
  const parsed = parseDate(raw, 'dd/MM/yyyy HH:mm:ss', new Date())
  const iso = isValid(parsed) ? formatISO(parsed, { representation: 'date' }) : raw

  return {
    dateTime: iso,
    sleepTotalHours: null,
    sleepAsleepHours: null,
    sleepInBedHours: null,
    sleepCoreHours: null,
    sleepDeepHours: null,
    sleepRemHours: null,
    sleepAwakeHours: null,
    respiratoryDisturbances: null,
    activeEnergyKcal: record['Energia Ativa (kcal)'] ?? null,
    restingEnergyKcal: null,
    heartRateMin: null,
    heartRateMax: null,
    heartRateMean: null,
    restingHeartRate: record['Frequência Cardíaca em Repouso (bpm)'] ?? null,
    spo2: record['Saturação de Oxigênio no Sangue (%)'] ?? null,
    respiratoryRate: record['Taxa Respiratória (contagem/min)'] ?? null,
    pulseTemperatureC: record['Temperatura do Pulso ao Dormir Apple (ºC)'] ?? null,
    exerciseMinutes: null,
    movementMinutes: null,
    standingMinutes: null,
    daylightMinutes: null,
    hrvSdnn: record['Variabilidade da Frequência Cardíaca (ms)'] ?? null,
    isPlaceholderRestingEnergy: false,
  }
}

/**
 * 🛠️ TODO(Anders): define a heurística de detecção.
 *
 * Contexto: o endpoint /mood hoje serve dados de sono por bug do AutoExport
 * (Anders copiou URL errada). Um MoodRecord válido tem Iniciar (ISO datetime)
 * + Associações (valence em [-1, +1] presumivelmente). Um MoodRecord corrompido
 * vai ter campos extras de sleep (Total Sleep, Core, Deep, REM) OU Associações
 * vindo como string (e.g. "0,25" locale BR) em vez de number.
 *
 * Decisões a tomar:
 * - Se QUALQUER linha tiver `Total Sleep (hr)` presente → tratar como corrupted?
 * - Ou só se A MAIORIA das linhas tiver sleep fields? (majority-vote)
 * - Associações pode vir como "0.25" string se Python export serializou mal?
 * - Empty array ([]) → 'empty' (não é erro, só não tem dados)
 *
 * Por ora stub retorna 'corrupted' se vê qualquer field sleep,
 * 'empty' se array vazio, 'valid' caso contrário. Ajusta conforme conhecimento
 * do formato real.
 */
export function detectMoodDataQuality(rows: MoodRecord[] | undefined): MoodDataQuality {
  if (!rows || rows.length === 0) return 'empty'

  // TODO(Anders): tua lógica aqui. Exemplo de detecção por campos suspeitos:
  const hasSleepFields = rows.some((row) => {
    const record = row as unknown as Record<string, unknown>
    return (
      'Total Sleep (hr)' in record ||
      'Core (hr)' in record ||
      'Deep (hr)' in record ||
      'REM (hr)' in record
    )
  })
  if (hasSleepFields) return 'corrupted'

  return 'valid'
}

/**
 * Converte MoodRecord → MoodEntryRow.
 * Assume `Associações` é valence em [-1, +1]. Se detectar corrupção,
 * retorna array vazio (caller decide se cai pra mock).
 */
function buildMoodRows(rows: MoodRecord[] | undefined): MoodEntryRow[] {
  if (!rows || detectMoodDataQuality(rows) !== 'valid') return []

  return rows.map((row) => ({
    start: row.Iniciar,
    end: null,
    type: null,
    labels: [],
    associations: [],
    valence: typeof row.Associações === 'number' ? row.Associações : null,
    valenceClass: null, // buildMoodMetrics em aggregation.ts classifica na agregação
  }))
}

/**
 * Converte DoseRecord[] → MedicationRow[] para alimentar charts de PK.
 */
export function buildMedicationRows(doses: DoseRecord[] | undefined): MedicationRow[] {
  if (!doses || doses.length === 0) return []

  return doses.map((dose) => ({
    id: null,
    date: dose.taken_at,
    scheduledDate: null,
    medication: dose.substance,
    nickname: dose.substance,
    dosage: dose.dose_mg,
    scheduledDosage: null,
    unit: 'mg',
    status: 'taken',
    archived: false,
    codings: null,
  }))
}

/**
 * Função principal: entrada são os dados crus dos hooks RooCode,
 * saída é `DailySnapshot[]` + medications + metadata de qualidade.
 *
 * Se `useMock` = true OU os dados reais forem insuficientes (< 3 dias),
 * o caller deve usar os mocks de /mocks/snapshotMock em vez deste output.
 */
export function buildSnapshotsFromAPI(input: AdapterInput): AdapterOutput {
  const { sleep = [], metrics = [], mood, doses, useMock = false } = input

  const sleepHealthRows: HealthAutoExportRow[] = sleep
    .map(sleepRecordToHealthRow)
    .filter((row): row is HealthAutoExportRow => row !== null)

  const metricsHealthRows: HealthAutoExportRow[] = normalizeMetricsKeys(metrics)
    .map(metricsRecordToHealthRow)
    .filter((row): row is HealthAutoExportRow => row !== null)

  const healthRows = [...sleepHealthRows, ...metricsHealthRows]
  const moodRows = buildMoodRows(mood)
  const medicationRows = buildMedicationRows(doses)
  const moodQuality = detectMoodDataQuality(mood)

  const bundle: Pick<AppleHealthBundle, 'healthRows' | 'moodRows' | 'medicationRows'> = {
    healthRows,
    moodRows,
    medicationRows,
  }

  const snapshots = buildDailySnapshots(bundle)

  return {
    snapshots,
    medicationRows,
    moodQuality,
    usedMock: useMock,
  }
}
