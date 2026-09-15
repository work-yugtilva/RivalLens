import { QUALITY_RUBRIC_VERSION, emptyQualityScores, type QualityScores } from './rubric';

// A run is eligible for strategic-quality scoring ONLY when the candidate model itself
// produced accepted output. Deterministic-fallback runs are excluded here (and everywhere
// quality is scored) — fallback quality is not candidate-model quality.
export const MODEL_QUALITY_ELIGIBLE_STATUSES = ['llm_success', 'llm_partial'] as const;
export type ModelQualityEligibleStatus = (typeof MODEL_QUALITY_ELIGIBLE_STATUSES)[number];

export type ScorableRun = {
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelAlias: string;
  readonly fixtureId: string;
  readonly status: string;
};

export type HumanScoringRow = {
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelAlias: string;
  readonly fixtureId: string;
  readonly status: ModelQualityEligibleStatus;
  readonly rubricVersion: string;
  scores: QualityScores;
  reviewerNotes: string;
};

export type HumanScoringTemplate = {
  readonly benchmarkRunId: string;
  readonly rubricVersion: string;
  readonly rows: HumanScoringRow[];
};

export function isModelQualityEligible(status: string): status is ModelQualityEligibleStatus {
  return (MODEL_QUALITY_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

export function buildHumanScoringTemplate(
  benchmarkRunId: string,
  runs: readonly ScorableRun[],
): HumanScoringTemplate {
  return {
    benchmarkRunId,
    rubricVersion: QUALITY_RUBRIC_VERSION,
    rows: runs
      .filter((run) => isModelQualityEligible(run.status))
      .map((run) => ({
        runId: run.runId,
        providerId: run.providerId,
        modelId: run.modelId,
        modelAlias: run.modelAlias,
        fixtureId: run.fixtureId,
        status: run.status as ModelQualityEligibleStatus,
        rubricVersion: QUALITY_RUBRIC_VERSION,
        scores: emptyQualityScores(),
        reviewerNotes: '',
      })),
  };
}
