export type Tier = "Exemplary" | "Adequate" | "Developing";
export type MonotoneRisk = "low" | "moderate" | "high";
export type FillerType = "vocal" | "discourse" | "repetition" | null;
export type PauseClassification =
  | "micro_hesitation"
  | "awkward_pause"
  | "dramatic_pause";
export type MomentCategory =
  | "strength"
  | "hiccup"
  | "pacing"
  | "tone"
  | "structure";

export interface HealthResponse {
  status: string;
  vad_loaded: boolean;
  deepgram_configured: boolean;
  gemini_configured: boolean;
  gemini_model: string;
}

export interface RubricCriterionSummary {
  id: string;
  name: string;
  weight: number;
  description: string;
}

export interface RubricSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  target_min_sec: number | null;
  target_max_sec: number | null;
  criteria: RubricCriterionSummary[];
}

export interface RubricsResponse {
  rubrics: RubricSummary[];
}

export interface WordToken {
  word: string;
  start: number;
  end: number;
  confidence: number;
  is_filler: boolean;
  filler_type: FillerType;
}

export interface PaceTimelinePoint {
  start_sec: number;
  end_sec: number;
  wpm: number;
}

export interface AcousticsMetrics {
  duration_sec: number;
  speaking_time_sec: number;
  pause_time_sec: number;
  pause_ratio: number;
  overall_wpm: number;
  articulation_wpm: number;
  pitch_median_hz: number;
  pitch_variability_semitones: number;
  monotone_risk: MonotoneRisk;
  volume_dynamic_range_db: number;
  trailing_off_count: number;
  pace_timeline: PaceTimelinePoint[];
}

export interface PauseEvent {
  start: number;
  end: number;
  duration: number;
  classification: PauseClassification;
  context_before: string;
  context_after: string;
}

export interface AudibleDisfluency {
  start: number;
  end: number;
  kind: "stutter" | "vocal_filler" | "false_start" | "mumble";
  text: string;
}

export interface DisfluencyMetrics {
  total_fillers: number;
  fillers_per_minute: number;
  filler_counts: Record<string, number>;
  repetition_stutters: number;
  awkward_pause_count: number;
  dramatic_pause_count: number;
  low_confidence_mumbles: number;
  pauses: PauseEvent[];
  audible_events?: AudibleDisfluency[];
}

export interface CriterionScore {
  criterion_id: string;
  name: string;
  score: number;
  tier: Tier;
  weight: number;
  summary: string;
  evidence_timestamps: number[];
}

export interface TimestampedMoment {
  timestamp_sec: number;
  end_sec?: number | null;
  category: MomentCategory;
  title: string;
  observation: string;
  suggestion: string;
}

export interface CoachingFeedback {
  overall_score: number;
  overall_tier: Tier;
  executive_summary: string;
  vocal_delivery_impression: string;
  criterion_scores: CriterionScore[];
  timestamped_moments: TimestampedMoment[];
  top_strengths: string[];
  actionable_drills: string[];
  audible_disfluencies?: AudibleDisfluency[];
}

export interface AnalysisResponse {
  analysis_id: string;
  rubric_id: string;
  transcript: string;
  warnings: string[];
  words: WordToken[];
  acoustics: AcousticsMetrics;
  disfluencies: DisfluencyMetrics;
  coaching: CoachingFeedback;
}

export interface PracticeSession {
  id: string;
  createdAt: number;
  title: string;
  rubricId: string;
  audioBlob: Blob;
  audioMimeType: string;
  analysis: AnalysisResponse;
}

export type TimerPresetId = "free" | "tsa_prepared" | "tsa_extemp" | "custom";
