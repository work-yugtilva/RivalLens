// Versioned strategic-quality rubric. Subjective. Scored 1-5 per dimension by a human
// reviewer (or, later, an optional LLM judge). Subjective quality NEVER overrides a
// deterministic grounding failure or a hard eligibility gate.

export const QUALITY_RUBRIC_VERSION = 'phase-4a-rubric-v1';

export const QUALITY_RUBRIC_V1 = {
  version: QUALITY_RUBRIC_VERSION,
  scale: { min: 1, max: 5 },
  dimensions: [
    {
      id: 'strategicSynthesisDepth',
      label: 'Strategic synthesis depth',
      question:
        'Does the output combine multiple pieces of evidence into a useful strategic interpretation rather than restating facts?',
      anchors: {
        1: 'Restates the comparison facts with no interpretation.',
        2: 'Minimal interpretation; mostly paraphrase.',
        3: 'Connects some evidence into a plausible reading.',
        4: 'Integrates several signals into a coherent strategic picture.',
        5: 'Integrates the full evidence set into a sharp, decision-relevant interpretation.',
      },
    },
    {
      id: 'specificity',
      label: 'Specificity',
      question: 'Is the hypothesis specific to the supplied RivalLens evidence rather than generic D2C advice?',
      anchors: {
        1: 'Generic advice that would apply to any brand.',
        2: 'Loosely tied to the evidence.',
        3: 'References the evidence but stays broad.',
        4: 'Clearly anchored to specific signals and comparison keys.',
        5: 'Precisely scoped to this brand/competitor pair and these exact signals.',
      },
    },
    {
      id: 'experimentActionability',
      label: 'Experiment actionability',
      question: 'Could a D2C operator actually run the proposed experiment as written?',
      anchors: {
        1: 'Not runnable; vague or self-contradictory.',
        2: 'Major gaps in design or metrics.',
        3: 'Runnable with significant clarification.',
        4: 'Runnable; control/treatment/metrics are clear.',
        5: 'Immediately runnable; single variable, clean metrics, realistic guardrails.',
      },
    },
    {
      id: 'novelty',
      label: 'Novelty',
      question: 'Does the model produce a non-trivial insight beyond merely restating the comparison?',
      anchors: {
        1: 'No insight beyond the raw comparison.',
        2: 'Obvious inference only.',
        3: 'A modestly useful non-obvious point.',
        4: 'A genuinely useful insight an operator might miss.',
        5: 'A sharp, non-obvious insight that reframes the opportunity.',
      },
    },
    {
      id: 'epistemicWordingQuality',
      label: 'Epistemic wording quality',
      question: 'Does the language communicate uncertainty appropriately (possibility, not proven outcome)?',
      anchors: {
        1: 'States causal certainty or outcomes as fact.',
        2: 'Frequently overclaims.',
        3: 'Mixed; some hedged, some overclaimed.',
        4: 'Consistently hedged and calibrated.',
        5: 'Precisely calibrated throughout; uncertainty is explicit and proportionate.',
      },
    },
  ],
} as const;

export type QualityDimensionId = (typeof QUALITY_RUBRIC_V1)['dimensions'][number]['id'];

export const QUALITY_DIMENSION_IDS = QUALITY_RUBRIC_V1.dimensions.map((d) => d.id) as QualityDimensionId[];

export type QualityScores = Record<QualityDimensionId, number | null>;

export function emptyQualityScores(): QualityScores {
  return Object.fromEntries(QUALITY_DIMENSION_IDS.map((id) => [id, null])) as QualityScores;
}
