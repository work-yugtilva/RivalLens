import { describe, expect, it } from 'vitest';
import * as ai from '../../packages/ai/src';
import {
  buildIntelligenceContext,
  intelligenceContextHash,
} from '../../packages/intelligence/src';
import type { IntelligenceContext } from '../../packages/schemas/src';
import {
  GENERATED_AT,
  reportInput,
} from './fixtures/competitive-reports';

type GenerationApi = {
  generateIntelligence?: (input: {
    context: IntelligenceContext;
    contextHash: string;
    provider: unknown;
    promptVersion: string;
    systemPrompt: string;
  }) => Promise<unknown>;
  DeterministicMockIntelligenceProvider?: new (scenario: string) => unknown;
};

function fixture(): IntelligenceContext {
  const input = reportInput();
  return buildIntelligenceContext({
    comparison: input.comparison,
    signals: input.currentSignals,
    generatedAt: GENERATED_AT,
  });
}

async function generate(
  scenario: string,
  context = fixture(),
  contextHash = intelligenceContextHash(context),
): Promise<unknown> {
  const api = ai as unknown as GenerationApi;
  expect(api.generateIntelligence).toBeTypeOf('function');
  expect(api.DeterministicMockIntelligenceProvider).toBeTypeOf('function');
  if (!api.generateIntelligence || !api.DeterministicMockIntelligenceProvider) return undefined;

  return api.generateIntelligence({
    context,
    contextHash,
    provider: new api.DeterministicMockIntelligenceProvider(scenario),
    promptVersion: 'phase-3a-test',
    systemPrompt: 'Return the requested structured intelligence synthesis.',
  });
}

function record(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function validation(result: unknown): Record<string, unknown> {
  const generated = record(result);
  expect(generated.kind).toBe('validated');
  return record(generated.validation);
}

function errorCodes(result: unknown): string[] {
  const errors = validation(result).errors;
  expect(Array.isArray(errors)).toBe(true);
  return (errors as Array<unknown>).map((error) => String(record(error).code));
}

function contextWithSnippet(): IntelligenceContext {
  const context = fixture();
  return {
    ...context,
    untrustedSnippets: [
      {
        snippetId: 'reported-shipping-snippet',
        subjectId: context.competitors[0]!.id,
        subjectRole: 'competitor',
        sourceUrl: 'https://rival.test/',
        sourceId: '00000000-0000-4000-8000-000000000901',
        snapshotId: '00000000-0000-4000-8000-000000000911',
        observationId: '00000000-0000-4000-8000-000000001002',
        field: 'positioning.homepage.headline',
        text: 'Free delivery on every order.',
        epistemicClass: 'reported',
      },
    ],
  };
}

function contextWithChange(): IntelligenceContext {
  const context = fixture();
  return {
    ...context,
    recentChanges: [
      {
        id: '00000000-0000-4000-8000-000000000701',
        subjectId: context.competitors[0]!.id,
        subjectRole: 'competitor',
        factType: 'offer.free_shipping',
        changeType: 'offer.free_shipping.threshold_changed',
        detectedAt: GENERATED_AT,
        beforeValue: { threshold: 75, unrelated: 11 },
        afterValue: { threshold: 50, unrelated: 99 },
        epistemicClass: 'derived',
        evidence: {
          sourceId: '00000000-0000-4000-8000-000000000901',
          currentSnapshotId: '00000000-0000-4000-8000-000000000911',
          previousSnapshotId: '00000000-0000-4000-0000-000000000910',
          currentObservationId: '00000000-0000-4000-8000-000000001002',
          previousObservationId: '00000000-0000-4000-8000-000000001001',
        },
      },
    ],
  };
}

describe('generateIntelligence', () => {
  it('validates deterministic mock output before making it eligible as accepted intelligence', async () => {
    const result = record(await generate('valid'));

    expect(result.kind).toBe('validated');
    const validation = record(result.validation);
    expect(validation.status).toBe('passed');
    expect(record(validation.acceptedOutput).hypotheses).toHaveLength(1);
    expect(result.rawOutput).not.toBe(validation.acceptedOutput);
  });

  it.each([
    ['malformed_schema', 'INVALID_OUTPUT_SCHEMA'],
    ['unknown_evidence_id', 'UNKNOWN_SIGNAL_ID'],
    ['invented_experiment_number', 'UNSUPPORTED_NUMERIC_CLAIM'],
    ['numeric_role_laundering', 'COMPETITOR_ATTRIBUTION_MISMATCH'],
    ['wrong_numeric_unit', 'UNIT_MISMATCH'],
    ['wrong_delta_direction', 'DELTA_DIRECTION_MISMATCH'],
    ['unknown_hypothesis_ref', 'INVALID_HYPOTHESIS_REFERENCE'],
    ['duplicate_hypothesis_refs', 'INVALID_HYPOTHESIS_REFERENCE'],
    ['empty_hypotheses', 'INVALID_OUTPUT_SCHEMA'],
    ['over_limit_hypotheses', 'INVALID_OUTPUT_SCHEMA'],
    ['unsupported_briefing_claim', 'UNSUPPORTED_BRIEFING_CLAIM'],
  ])('routes %s through the deterministic validator', async (scenario, expectedCode) => {
    expect(errorCodes(await generate(scenario))).toContain(expectedCode);
  });

  it('rejects a reported snippet promoted to observed evidence', async () => {
    expect(errorCodes(await generate('snippet_observed_promotion', contextWithSnippet()))).toContain(
      'EPISTEMIC_CLASS_VIOLATION',
    );
  });

  it('removes an experiment whose hypothesis is rejected', async () => {
    const result = validation(await generate('invalid_hypothesis_with_dependent_experiment'));
    const experiments = result.experiments as Array<unknown>;

    expect(record(experiments[0]).status).toBe('rejected');
    expect(errorCodes({ kind: 'validated', validation: result })).toContain(
      'EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS',
    );
  });

  it('preserves stable refs for partially accepted output', async () => {
    const result = validation(await generate('partial_stable_refs'));
    const acceptedOutput = record(result.acceptedOutput);
    const hypotheses = acceptedOutput.hypotheses as Array<Record<string, unknown>>;
    const experiments = acceptedOutput.experiments as Array<Record<string, unknown>>;

    expect(result.status).toBe('partial');
    expect(hypotheses.map((hypothesis) => hypothesis.ref)).toEqual(['h2']);
    expect(experiments.map((experiment) => experiment.hypothesisRef)).toEqual(['h2']);
  });

  it('rejects a decoy number from an observed-change field', async () => {
    expect(errorCodes(await generate('decoy_change_field', contextWithChange()))).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it.each([
    ['provider_exception', 'provider_exception'],
    ['timeout', 'timeout'],
  ])('returns a controlled %s failure', async (scenario, code) => {
    const result = record(await generate(scenario));

    expect(result).toMatchObject({ kind: 'provider_failure', code });
    expect(result.validation).toBeUndefined();
  });

  it('fails before generation when the supplied context hash is stale', async () => {
    const context = fixture();
    const result = record(await generate('provider_exception', context, 'sha256:stale'));

    expect(result).toMatchObject({ kind: 'context_failure', code: 'CONTEXT_HASH_MISMATCH' });
  });

  it('fails closed when a supplied context duplicates a signal ID', async () => {
    const context = fixture();
    const duplicateContext = {
      ...context,
      signals: [...context.signals, context.signals[0]!],
    } as IntelligenceContext;
    const result = record(await generate('provider_exception', duplicateContext));

    expect(result).toMatchObject({ kind: 'context_failure', code: 'INVALID_CONTEXT' });
  });

  it('produces identical validation results for repeated deterministic mock runs', async () => {
    const context = fixture();
    const [first, second] = await Promise.all([generate('valid', context), generate('valid', context)]);

    expect(validation(first)).toEqual(validation(second));
  });
});
