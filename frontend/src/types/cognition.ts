export type RotatingType = 'A' | 'B' | 'C'
export type SpanKind = 'digit' | 'corsi'
export type FluencyMode = 'phonemic' | 'semantic'
export type FlankerResponse = 'left' | 'right'

export interface CognitiveSessionChartRow {
  id: string
  date: string
  started_at: string
  rotating_type: RotatingType
  mood: number | null
  energy: number | null
  anxiety: number | null
  pvt_lapses: number | null
  pvt_response_speed: number | null
  pvt_median_rt_ms: number | null
  span_primary: number | null
  venvanse_ng_ml: number | null
  hours_since_dose: number | null
  slot_label: string
  slot_primary: number | null
  slot_exploratory: boolean
  baseline_phase: boolean
}

export interface PreparedCognitionPlan {
  rotating_type: RotatingType
  span_kind: SpanKind
  pvt: {
    duration_ms: number
    isi_min_ms: number
    isi_max_ms: number
  }
  flanker: {
    trial_count: number
    stimulus_timeout_ms: number
    fixation_ms: number
  }
  fluency?: {
    mode: FluencyMode
    criterion: string
  }
  reading?: {
    passage: string
    idea_units: string[]
    source_theme: string | null
  }
}

export interface CognitiveSessionStatus {
  today_session: CognitiveSessionRecord | null
  timeline: CognitiveSessionChartRow[]
  baseline_session_count: number
  baseline_complete: boolean
  next_plan: PreparedCognitionPlan | null
  session_count: number
}

export interface CognitiveSessionRecord {
  id: string
  user_id: string
  started_at: string
  rotating_type: RotatingType
  context: {
    sleep_hours: number | null
    caffeine_taken: boolean
    caffeine_amount_mg: number | null
    vyvanse_taken_at: string | null
    lunch_completed: boolean | null
  }
  vas: {
    mood: number
    energy: number
    anxiety: number
    rested?: number | null
  }
  pvt: {
    duration_ms: number
    trials: CognitivePvtTrial[]
    stimuli_count: number
    mean_rt_ms: number | null
    median_rt_ms: number | null
    response_speed_mean: number | null
    fastest_10pct_mean_ms: number | null
    slowest_10pct_mean_ms: number | null
    lapses_count: number
    false_starts_count: number
  }
  span: {
    kind: SpanKind
    attempts: CognitiveSpanAttempt[]
    max_forward: number
    max_backward: number | null
    primary_score: number
  }
  fluency: {
    type: FluencyMode
    criterion: string
    words: string[]
    valid_count: number
    invalid: string[]
    repeats: string[]
    clusters: Array<{ members: string[] }>
    mean_cluster_size: number | null
    switch_count: number | null
  } | null
  reading: {
    passage: string
    idea_units: string[]
    source_theme: string | null
    reading_time_ms: number
    recall_text: string
    recovered: string[]
    recovered_count: number
    total_units: number
    gist_score: number
    detail_score: number
    intrusions: string[]
    semantic_similarity: number
  } | null
  flanker: {
    trials: CognitiveFlankerTrial[]
    congruent_mean_rt_ms: number | null
    incongruent_mean_rt_ms: number | null
    congruent_accuracy: number | null
    incongruent_accuracy: number | null
    interference_ms: number | null
    exploratory: boolean
  } | null
  pk_context: {
    venvanse_ng_ml: number
    hours_since_dose: number
    dose_mg: number
    dose_source: 'dose_log' | 'context_hhmm'
  } | null
  scoring_model: string | null
  embedding_model: string | null
  baseline_phase: boolean
  created_at: string
}

export interface CognitivePvtTrial {
  stimulus_delay_ms: number
  false_starts: number
  reaction_time_ms: number | null
}

export interface CognitiveSpanAttempt {
  direction: 'forward' | 'backward'
  length: number
  sequence: number[]
  response: number[]
  correct: boolean
}

export interface CognitiveFlankerTrial {
  congruent: boolean
  expected_response: FlankerResponse
  response: FlankerResponse | null
  reaction_time_ms: number | null
  correct: boolean
}

export interface CognitiveContextInput {
  sleep_hours: number | null
  caffeine_taken: boolean
  caffeine_amount_mg: number | null
  vyvanse_taken_at: string | null
  lunch_completed: boolean | null
}

export interface CognitiveVasInput {
  mood: number
  energy: number
  anxiety: number
  rested: number | null
}

export interface CompleteCognitiveSessionInput {
  started_at: string
  plan: {
    rotating_type: RotatingType
    span_kind: SpanKind
    fluency_mode: FluencyMode | null
    fluency_criterion: string | null
    reading_passage: string | null
    reading_idea_units: string[]
    reading_source_theme: string | null
  }
  context: CognitiveContextInput
  vas: CognitiveVasInput
  pvt: {
    duration_ms: number
    trials: CognitivePvtTrial[]
  }
  span: {
    kind: SpanKind
    attempts: CognitiveSpanAttempt[]
  }
  fluency: {
    words: string[]
  } | null
  reading: {
    reading_time_ms: number
    recall_text: string
  } | null
  flanker: {
    trials: CognitiveFlankerTrial[]
  } | null
}

export interface CompleteCognitiveSessionResponse {
  session: CognitiveSessionRecord
  summary: CognitiveSessionChartRow
}
