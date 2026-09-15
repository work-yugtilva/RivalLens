import type { IntelligenceContext } from '@rivallens/schemas';
import type { IntelligenceValidationResult } from '@rivallens/intelligence';
import { QUALITY_RUBRIC_V1, type QualityDimensionId } from './rubric';

// LLM-as-judge is an INTERFACE ONLY for Phase 4A. No judge model is selected, no judge is
// constructed, and nothing calls it. Judge output (if ever produced) is a subjective metric:
// it is stored on a separate field, tagged `llm_judge_subjective`, and is read by NO module
// under src/metrics/ or src/gates/. It can never modify deterministic grounding metrics or
// hard eligibility gates.

export const NO_DEFAULT_JUDGE = null;

export type JudgeScoreResult = {
  readonly source: 'llm_judge_subjective';
  readonly judgeId: string;
  readonly judgeProviderId: string;
  readonly judgeModelId: string;
  readonly judgePromptVersion: string;
  readonly rubricVersion: string;
  readonly scores: Record<QualityDimensionId, number>;
};

export interface QualityJudge {
  readonly judgeId: string;
  readonly judgeProviderId: string;
  readonly judgeModelId: string;
  readonly judgePromptVersion: string;
  score(input: {
    readonly rubric: typeof QUALITY_RUBRIC_V1;
    readonly context: IntelligenceContext;
    readonly acceptedOutput: IntelligenceValidationResult['acceptedOutput'];
    readonly fixtureId: string;
  }): Promise<JudgeScoreResult>;
}

// Guard against circular evaluation: a candidate model must never judge itself (or its
// siblings in the same benchmark) by default.
export function assertJudgeIsNotCandidate(
  judgeModelId: string,
  candidateModelIds: readonly string[],
): void {
  if (candidateModelIds.includes(judgeModelId)) {
    throw new Error(
      `Circular evaluation: judge model "${judgeModelId}" is also a benchmark candidate. Use an independent judge.`,
    );
  }
}
