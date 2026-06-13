import type { ReadinessStatus } from './data-readiness'

export type EvidenceSourceKind = 'primary' | 'proxy' | 'derived'
export type InterpolationPolicy = 'none' | 'visual_only' | 'score_with_penalty'

export type IndexEvidenceId =
  | 'NightQuality'
  | 'RecoveryIndex'
  | 'SleepRegularity'
  | 'SleepArchitecture'
  | 'RespiratoryLoad'
  | 'SleepContinuity'
  | 'AutonomicBalance'
  | 'HRVVariability'
  | 'HRRange'
  | 'CardiovascularAge'
  | 'ActivityReadiness'
  | 'FunctionalCapacityIndex'
  | 'CircadianRobustness'
  | 'MovementEfficiency'

export type IndexEvidenceReason =
  | 'ok'
  | 'baseline_missing'
  | 'inputs_missing'
  | 'insufficient_readiness'

export interface IndexEvidenceSource {
  field: string
  kind: EvidenceSourceKind
  note: string
}

export interface IndexEvidenceSpec {
  id: IndexEvidenceId
  domain: 'recuperacao' | 'capacidade' | 'sono'
  interpolationPolicy: InterpolationPolicy
  minimumInputs: number
  readinessKey: string
  confidenceRule: string
  primarySources: ReadonlyArray<IndexEvidenceSource>
  proxySources: ReadonlyArray<IndexEvidenceSource>
  derivedSources: ReadonlyArray<IndexEvidenceSource>
}

export interface IndexEvidenceReport {
  eligible: boolean
  reason: IndexEvidenceReason
  inputsUsed: string[]
  inputsMissing: string[]
  proxiesUsed: string[]
  usedInterpolated: boolean
  confidencePenalty: number
  readiness: ReadinessStatus | 'unknown'
}

interface BuildEvidenceReportInput {
  eligible: boolean
  reason: IndexEvidenceReason
  inputsUsed: ReadonlyArray<string>
  inputsMissing: ReadonlyArray<string>
  proxiesUsed: ReadonlyArray<string>
  usedInterpolated: boolean
  confidencePenalty: number
  readiness: ReadinessStatus | 'unknown'
}

export function buildIndexEvidenceReport(input: BuildEvidenceReportInput): IndexEvidenceReport {
  return {
    eligible: input.eligible,
    reason: input.reason,
    inputsUsed: [...input.inputsUsed],
    inputsMissing: [...input.inputsMissing],
    proxiesUsed: [...input.proxiesUsed],
    usedInterpolated: input.usedInterpolated,
    confidencePenalty: input.confidencePenalty,
    readiness: input.readiness,
  }
}

export const INDEX_EVIDENCE_MATRIX: Record<IndexEvidenceId, IndexEvidenceSpec> = {
  NightQuality: {
    id: 'NightQuality',
    domain: 'recuperacao',
    interpolationPolicy: 'score_with_penalty',
    minimumInputs: 4,
    readinessKey: 'nightQualityIndex',
    confidenceRule: 'confidence = interpPenalty(0.7 quando interpolado) x cobertura de componentes usados',
    primarySources: [
      { field: 'sleepEfficiencyPct', kind: 'primary', note: 'eficiencia direta do sono' },
      { field: 'sleepDeepHours', kind: 'primary', note: 'fase deep agregada noturna' },
      { field: 'sleepRemHours', kind: 'primary', note: 'fase REM agregada noturna' },
      { field: 'sleepAwakeHours', kind: 'primary', note: 'tempo acordado noturno' },
      { field: 'respiratoryDisturbances', kind: 'primary', note: 'sinal respiratorio noturno' },
      { field: 'spo2', kind: 'primary', note: 'oxigenacao noturna' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'pulseTemperatureC_z', kind: 'derived', note: 'flag autonômica via baseline pessoal' },
      { field: 'respiratoryRate_z', kind: 'derived', note: 'flag autonômica via baseline pessoal' },
    ],
  },
  RecoveryIndex: {
    id: 'RecoveryIndex',
    domain: 'recuperacao',
    interpolationPolicy: 'score_with_penalty',
    minimumInputs: 3,
    readinessKey: 'recoveryIndex',
    confidenceRule: 'confidence = interpPenalty x completude_inputs x proxyPenalty_temperatura',
    primarySources: [
      { field: 'sleepQualityScore', kind: 'derived', note: 'score noturno consolidado' },
      { field: 'sleepDebt7d', kind: 'derived', note: 'debito acumulado em 7 dias' },
      { field: 'hrvSdnn', kind: 'primary', note: 'baseline autonomico' },
      { field: 'restingHeartRate', kind: 'primary', note: 'baseline cardiaco basal' },
      { field: 'pulseTemperatureC', kind: 'primary', note: 'temperatura noturna do pulso' },
    ],
    proxySources: [
      { field: 'pulseTemperatureProxy', kind: 'proxy', note: 'interpolacao leve/trend curta quando falta temp real' },
    ],
    derivedSources: [
      { field: 'zscore_hrv_rhr_temp', kind: 'derived', note: 'padronizacao por baseline pessoal' },
    ],
  },
  SleepRegularity: {
    id: 'SleepRegularity',
    domain: 'recuperacao',
    interpolationPolicy: 'none',
    minimumInputs: 5,
    readinessKey: 'sleepRegularityIndex',
    confidenceRule: 'confidence proporcional ao preenchimento da janela de regularidade',
    primarySources: [
      { field: 'sleepStartAt', kind: 'primary', note: 'horario de inicio da noite' },
      { field: 'sleepEndAt', kind: 'primary', note: 'horario de fim da noite' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'SRI_proxy', kind: 'derived', note: 'consistencia de onset/offset em janela rolante' },
      { field: 'socialJetLag', kind: 'derived', note: 'delta de midpoint util vs fim de semana' },
    ],
  },
  SleepArchitecture: {
    id: 'SleepArchitecture',
    domain: 'sono',
    interpolationPolicy: 'score_with_penalty',
    minimumInputs: 3,
    readinessKey: 'sleepArchitectureIndex',
    confidenceRule: 'confidence = 1 para real, 0.7 para interpolado; score exige deep+rem+core reais',
    primarySources: [
      { field: 'sleepDeepHours', kind: 'primary', note: 'fase deep agregada noturna' },
      { field: 'sleepRemHours', kind: 'primary', note: 'fase REM agregada noturna' },
      { field: 'sleepCoreHours', kind: 'primary', note: 'fase core/light agregada noturna' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'pctDeep', kind: 'derived', note: 'fracao de deep sobre estagios classificados' },
      { field: 'pctRem', kind: 'derived', note: 'fracao de REM sobre estagios classificados' },
      { field: 'architectureScore', kind: 'derived', note: 'desvio das faixas de referencia deep/REM' },
    ],
  },
  RespiratoryLoad: {
    id: 'RespiratoryLoad',
    domain: 'sono',
    interpolationPolicy: 'visual_only',
    minimumInputs: 1,
    readinessKey: 'respiratoryLoadIndex',
    confidenceRule: 'confidence = 1 real / 0.7 interpolado; flags (atípico/dessaturação/co-ocorrência) só em dias reais',
    primarySources: [
      { field: 'respiratoryDisturbances', kind: 'primary', note: 'proxy de AHI da Apple, agregado por noite — não episódios individuais' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'spo2', kind: 'derived', note: 'co-sinal de dessaturação; piso pessoal p10 (fallback 95%)' },
      { field: 'respiratoryRate', kind: 'derived', note: 'co-sinal de carga respiratória noturna' },
      { field: 'personalP90', kind: 'derived', note: 'limiar de noite atípica vs distribuição pessoal' },
    ],
  },
  SleepContinuity: {
    id: 'SleepContinuity',
    domain: 'sono',
    interpolationPolicy: 'visual_only',
    minimumInputs: 1,
    readinessKey: 'sleepContinuityIndex',
    confidenceRule: 'confidence = 1 real / 0.7 interpolado; leitura direta sem score composto',
    primarySources: [
      { field: 'sleepEfficiencyPct', kind: 'primary', note: 'eficiência do sono (asleep/inBed), faixa AASM >=85%' },
      { field: 'sleepAwakeHours', kind: 'primary', note: 'WASO — tempo acordado, faixa AASM <30min' },
    ],
    proxySources: [
      { field: 'sleepAsleepHours+sleepInBedHours', kind: 'proxy', note: 'recálculo de eficiência quando sleepEfficiencyPct falta' },
    ],
    derivedSources: [],
  },
  AutonomicBalance: {
    id: 'AutonomicBalance',
    domain: 'recuperacao',
    interpolationPolicy: 'score_with_penalty',
    minimumInputs: 2,
    readinessKey: 'autonomicBalanceChart',
    confidenceRule: 'confidence = 1 para real, 0.7 para interpolado/forecasted',
    primarySources: [
      { field: 'hrvSdnn', kind: 'primary', note: 'variabilidade cardiaca basal' },
      { field: 'restingHeartRate', kind: 'primary', note: 'frequencia cardiaca de repouso' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'ln(HRV/RHR)', kind: 'derived', note: 'normalizacao logaritimica' },
      { field: 'zscore_ABI', kind: 'derived', note: 'z pessoal do log ratio' },
    ],
  },
  HRVVariability: {
    id: 'HRVVariability',
    domain: 'recuperacao',
    interpolationPolicy: 'score_with_penalty',
    minimumInputs: 1,
    readinessKey: 'hrvVariabilityChart',
    confidenceRule: 'confidence = 1 para real, 0.7 para interpolado/forecasted',
    primarySources: [
      { field: 'hrvSdnn', kind: 'primary', note: 'HRV diario observado' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'sma7_sma30', kind: 'derived', note: 'tendencia curta e longa' },
      { field: 'rollingSd7', kind: 'derived', note: 'variabilidade intrajanela' },
    ],
  },
  HRRange: {
    id: 'HRRange',
    domain: 'recuperacao',
    interpolationPolicy: 'visual_only',
    minimumInputs: 1,
    readinessKey: 'hrRangeChart',
    confidenceRule: 'leitura de range usa dias reais; interpolado/forecastado nao entra em veredito principal',
    primarySources: [
      { field: 'heartRateMin', kind: 'primary', note: 'fc minima diaria' },
      { field: 'heartRateMax', kind: 'primary', note: 'fc maxima diaria' },
      { field: 'heartRateMean', kind: 'primary', note: 'fc media diaria' },
      { field: 'restingHeartRate', kind: 'primary', note: 'fc de repouso para interpretação' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'meanSma7', kind: 'derived', note: 'suavizacao longitudinal do sinal medio' },
    ],
  },
  CardiovascularAge: {
    id: 'CardiovascularAge',
    domain: 'recuperacao',
    interpolationPolicy: 'visual_only',
    minimumInputs: 3,
    readinessKey: 'cardiovascularAgeIndex',
    confidenceRule: 'confidence cresce com dias reais, clamp 35%-100%',
    primarySources: [
      { field: 'restingHeartRate', kind: 'primary', note: 'sinal basal cardiovascular' },
      { field: 'hrvSdnn', kind: 'primary', note: 'tônus vagal basal' },
      { field: 'vo2Max', kind: 'primary', note: 'capacidade aeróbica, quando disponível' },
    ],
    proxySources: [
      { field: 'vo2FromRhr', kind: 'proxy', note: 'estimativa de VO2 via FC repouso quando VO2 falta' },
    ],
    derivedSources: [
      { field: 'cardiovascularAge', kind: 'derived', note: 'composite interpretativo não diagnóstico' },
    ],
  },
  ActivityReadiness: {
    id: 'ActivityReadiness',
    domain: 'capacidade',
    interpolationPolicy: 'visual_only',
    minimumInputs: 3,
    readinessKey: 'activityReadinessIndex',
    confidenceRule: 'score só com >=3 fatores válidos; baseline de 30 dias reais para comparação',
    primarySources: [
      { field: 'steps', kind: 'primary', note: 'volume locomotor diário' },
      { field: 'activeEnergyKcal', kind: 'primary', note: 'carga metabólica de atividade' },
      { field: 'walkingSpeedKmh', kind: 'primary', note: 'vital sign locomotor' },
      { field: 'walkingStepLengthCm', kind: 'primary', note: 'amplitude de marcha' },
      { field: 'walkingAsymmetryPct', kind: 'primary', note: 'assimetria funcional de marcha' },
      { field: 'physicalEffort', kind: 'primary', note: 'esforço relativo diário' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'baselineRatioByFactor', kind: 'derived', note: 'fator a fator contra baseline pessoal' },
    ],
  },
  FunctionalCapacityIndex: {
    id: 'FunctionalCapacityIndex',
    domain: 'capacidade',
    interpolationPolicy: 'visual_only',
    minimumInputs: 3,
    readinessKey: 'functionalCapacityIndex',
    confidenceRule: 'score exige sinais de esforço reais, peso zero para componentes ausentes',
    primarySources: [
      { field: 'restingHeartRate', kind: 'primary', note: 'base para reserva e VO2 predito' },
      { field: 'walkingHeartRateAvg', kind: 'primary', note: 'resposta cronotrópica de marcha' },
      { field: 'sixMinuteWalkMeters', kind: 'primary', note: 'evento funcional 6MWT' },
      { field: 'cardioRecoveryBpm', kind: 'primary', note: 'queda de FC no 1o minuto' },
      { field: 'vo2Max', kind: 'primary', note: 'VO2 direto quando existe' },
    ],
    proxySources: [
      { field: 'vo2FromRhr', kind: 'proxy', note: 'estimativa Uth-Sorensen quando VO2 direto falta' },
    ],
    derivedSources: [
      { field: 'heartRateReserve', kind: 'derived', note: 'reserva cardiaca estimada' },
      { field: 'chronotropicZ', kind: 'derived', note: 'z pessoal de resposta cronotrópica' },
    ],
  },
  CircadianRobustness: {
    id: 'CircadianRobustness',
    domain: 'capacidade',
    interpolationPolicy: 'score_with_penalty',
    minimumInputs: 3,
    readinessKey: 'circadianRobustnessIndex',
    confidenceRule: 'score parcial permitido com proxy térmica; requer dias completos crescentes para robustez',
    primarySources: [
      { field: 'sleepStartAt', kind: 'primary', note: 'base para regularidade de sono' },
      { field: 'sleepEndAt', kind: 'primary', note: 'base para regularidade de sono' },
      { field: 'daylightMinutes', kind: 'primary', note: 'exposição a zeitgebers diurnos' },
      { field: 'heartRateMean', kind: 'primary', note: 'sinal de carga cardiovascular diária' },
      { field: 'restingHeartRate', kind: 'primary', note: 'referência basal para contraste' },
      { field: 'pulseTemperatureC', kind: 'primary', note: 'temperatura noturna do pulso' },
    ],
    proxySources: [
      { field: 'pulseTemperatureProxy', kind: 'proxy', note: 'interpolação leve / tendência curta para lacunas térmicas curtas' },
    ],
    derivedSources: [
      { field: 'SRI_proxy', kind: 'derived', note: 'regularidade de onset/offset' },
      { field: 'heartRateContrast', kind: 'derived', note: 'FC média menos FC repouso' },
      { field: 'thermalDeviationScore', kind: 'derived', note: 'desvio absoluto vs baseline térmico' },
    ],
  },
  MovementEfficiency: {
    id: 'MovementEfficiency',
    domain: 'capacidade',
    interpolationPolicy: 'visual_only',
    minimumInputs: 3,
    readinessKey: 'movementEfficiencyIndex',
    confidenceRule: 'score só com marcha real; componentes ausentes recebem peso zero',
    primarySources: [
      { field: 'walkingAsymmetryPct', kind: 'primary', note: 'risco motor principal' },
      { field: 'walkingDoubleSupportPct', kind: 'primary', note: 'proxy de estabilidade de marcha' },
      { field: 'walkingSpeedKmh', kind: 'primary', note: 'vital sign locomotor' },
      { field: 'walkingStepLengthCm', kind: 'primary', note: 'amplitude mecânica' },
      { field: 'runningGroundContactTimeMs', kind: 'primary', note: 'mecânica de corrida quando presente' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'asymmetryPersistence14d', kind: 'derived', note: 'alerta de assimetria persistente' },
      { field: 'lowSpeedPersistence14d', kind: 'derived', note: 'alerta de velocidade baixa persistente' },
    ],
  },
}
