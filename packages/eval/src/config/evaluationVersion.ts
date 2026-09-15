import { INTELLIGENCE_SYNTHESIS_PROMPT_VERSION } from '@rivallens/intelligence';
import { METRICS_MAPPING_VERSION } from '../metrics/mapping';
import { QUALITY_RUBRIC_VERSION } from '../rubric/rubric';

// Benchmark results are only comparable when prompt / schema / validator behaviour is held
// fixed. This bundle records every version axis for a run. If any changes, bump
// `evaluationVersion` and treat prior results as a different, non-comparable evaluation.

export const EVAL_REPAIR_PROMPT_SUFFIX = ':repair-v1';
export const EVAL_SYNTHESIS_SCHEMA_NAME = 'llm-intelligence-synthesis-v1';
export const EVAL_CONTEXT_VERSION = 'intelligence-context-v1';
// No validator-version constant exists in @rivallens/intelligence. The validator's BEHAVIOUR
// is pinned by metrics/mapping.ts (the `satisfies` guard) plus version-contract.test.ts.
// Bump this string deliberately when either tripwire fires.
export const EVAL_VALIDATOR_CONTRACT_VERSION = 'intelligence-validator-contract-2026-09-14';
export const EVAL_GATES_VERSION = 'phase-4a-gates-v1';
// The FIXTURE suite is unchanged since Phase 4A (same 15 frozen contexts, same hashes).
export const EVAL_SUITE_VERSION = 'phase-4a-v1';
// Phase 4B added comparability axes to the RUN: the candidate model pool, the reasoning-effort
// control, and the raised output-token ceiling. v2 (2026-09-14) fixes a validator false positive:
// DELTA_DIRECTION_MISMATCH previously fired on any schema-legal, factually correct `direction`
// attached to a non-delta numeric claim (owned/competitor/previous/current), independent of
// evidence. Direction is now verified against authoritative evidence regardless of valueRole.
// Prior (v1) results are not comparable -- error counts/eligibility for any model whose output
// used direction on a non-delta claim will differ.
export const EVALUATION_VERSION_ID = 'phase-4b-eval-v2';

export const EVALUATION_VERSION = {
  evaluationVersion: EVALUATION_VERSION_ID,
  suiteVersion: EVAL_SUITE_VERSION,
  systemPromptVersion: INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
  repairPromptSuffix: EVAL_REPAIR_PROMPT_SUFFIX,
  contextVersion: EVAL_CONTEXT_VERSION,
  synthesisSchemaName: EVAL_SYNTHESIS_SCHEMA_NAME,
  validatorContractVersion: EVAL_VALIDATOR_CONTRACT_VERSION,
  metricsMappingVersion: METRICS_MAPPING_VERSION,
  rubricVersion: QUALITY_RUBRIC_VERSION,
  gatesVersion: EVAL_GATES_VERSION,
} as const;

export type EvaluationVersion = typeof EVALUATION_VERSION;
