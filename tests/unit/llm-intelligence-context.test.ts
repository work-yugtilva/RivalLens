import { describe, expect, it } from 'vitest';
import {
  buildIntelligenceContext,
  canonicalContext,
  intelligenceContextHash,
} from '../../packages/intelligence/src';
import {
  epistemicClassSchema,
  intelligenceContextSchema,
  llmIntelligenceSynthesisOutputSchema,
  llmRecommendedExperimentOutputSchema,
  llmStrategicHypothesisOutputSchema,
  type ContextUntrustedSnippet,
  type ObservedChange,
} from '../../packages/schemas/src';
import {
  BRAND_ID,
  COMPETITOR_ID,
  GENERATED_AT,
  reportInput,
  uuid,
} from './fixtures/competitive-reports';

describe('LLM Intelligence Context & Contracts', () => {
  const sampleInput = reportInput([
    {
      key: 'offer.free_shipping_threshold',
      owned: { threshold: 75 },
      competitor: { threshold: 50 },
      numeric: { field: 'threshold', unit: 'usd' },
    },
    {
      key: 'policy.return_window',
      owned: { durationDays: 30 },
      competitor: { durationDays: 60 },
      numeric: { field: 'durationDays', unit: 'days' },
    },
  ]);

  it('validates epistemic classes', () => {
    expect(epistemicClassSchema.parse('observed')).toBe('observed');
    expect(epistemicClassSchema.parse('derived')).toBe('derived');
    expect(epistemicClassSchema.parse('estimated')).toBe('estimated');
    expect(epistemicClassSchema.parse('reported')).toBe('reported');
    expect(() => epistemicClassSchema.parse('hallucinated')).toThrow();
  });

  it('preserves first-class provenance across facts, signals, and changes', () => {
    const mockChange: ObservedChange = {
      id: uuid(301),
      subjectId: COMPETITOR_ID,
      sourceId: uuid(901),
      factType: 'offer.free_shipping',
      changeType: 'offer.free_shipping.threshold_changed',
      previousSnapshotId: uuid(910),
      currentSnapshotId: uuid(911),
      previousObservationId: uuid(1001),
      currentObservationId: uuid(1002),
      factIdentity: 'offer.free_shipping',
      beforeValue: { threshold: 75 },
      afterValue: { threshold: 50 },
      detectedAt: GENERATED_AT,
      detectorVersion: 'v1',
      changeHash: `sha256:${'a'.repeat(64)}`,
    };

    const context = buildIntelligenceContext({
      comparison: sampleInput.comparison,
      signals: sampleInput.currentSignals,
      observedChanges: [mockChange],
      generatedAt: GENERATED_AT,
    });

    expect(intelligenceContextSchema.parse(context)).toBeDefined();

    // Check facts have first-class subject identity and provenance
    expect(context.facts.length).toBeGreaterThan(0);
    const firstFact = context.facts[0]!;
    expect(firstFact.owned.subjectId).toBe(BRAND_ID);
    expect(firstFact.owned.subjectRole).toBe('owned');
    expect(firstFact.owned.provenance).toMatchObject({
      sourceId: expect.any(String),
      snapshotId: expect.any(String),
      sourceUrl: 'https://owned.test/',
      confidence: 0.95,
    });
    expect(firstFact.competitor.subjectId).toBe(COMPETITOR_ID);
    expect(firstFact.competitor.subjectRole).toBe('competitor');
    expect(firstFact.competitor.provenance).toMatchObject({
      sourceId: expect.any(String),
      snapshotId: expect.any(String),
      sourceUrl: 'https://rival.test/',
      confidence: 0.95,
    });

    // Check signals retain first-class evidence references and enriched source URLs
    expect(context.signals.length).toBeGreaterThan(0);
    const firstSignal = context.signals[0]!;
    expect(firstSignal.epistemicClass).toBe('derived');
    expect(firstSignal.evidence.length).toBeGreaterThan(0);
    expect(firstSignal.evidence[0]).toMatchObject({
      sourceId: expect.any(String),
      snapshotId: expect.any(String),
      confidence: expect.any(Number),
      sourceUrl: expect.any(String),
    });

    // Check changes retain first-class evidence
    expect(context.recentChanges.length).toBe(1);
    const firstChange = context.recentChanges[0]!;
    expect(firstChange.subjectRole).toBe('competitor');
    expect(firstChange.evidence).toMatchObject({
      sourceId: uuid(901),
      currentSnapshotId: uuid(911),
      previousSnapshotId: uuid(910),
      currentObservationId: uuid(1002),
    });
  });

  it('guarantees deterministic ordering and hash stability across scrambled inputs', () => {
    const input1 = buildIntelligenceContext({
      comparison: sampleInput.comparison,
      signals: sampleInput.currentSignals,
      generatedAt: GENERATED_AT,
    });

    // Scramble signals order in input2
    const scrambledSignals = [...sampleInput.currentSignals].reverse();
    const input2 = buildIntelligenceContext({
      comparison: sampleInput.comparison,
      signals: scrambledSignals,
      generatedAt: GENERATED_AT,
    });

    expect(canonicalContext(input1)).toBe(canonicalContext(input2));
    expect(intelligenceContextHash(input1)).toBe(intelligenceContextHash(input2));
    expect(intelligenceContextHash(input1)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('excludes untrusted snippets by default and includes them when requested as structured data', () => {
    const snippet: ContextUntrustedSnippet = {
      snippetId: 'snip-1',
      subjectId: COMPETITOR_ID,
      subjectRole: 'competitor',
      sourceUrl: 'https://rival.test/',
      sourceId: uuid(901),
      snapshotId: uuid(911),
      observationId: uuid(1002),
      field: 'positioning.homepage.headline',
      text: 'Free 2-day delivery on all summer essentials!',
      epistemicClass: 'observed',
    };

    // Default: excluded
    const contextDefault = buildIntelligenceContext({
      comparison: sampleInput.comparison,
      signals: sampleInput.currentSignals,
      untrustedSnippets: [snippet],
      generatedAt: GENERATED_AT,
    });
    expect(contextDefault.untrustedSnippets).toEqual([]);

    // Explicitly included
    const contextWithSnippets = buildIntelligenceContext({
      comparison: sampleInput.comparison,
      signals: sampleInput.currentSignals,
      untrustedSnippets: [snippet],
      includeSnippets: true,
      generatedAt: GENERATED_AT,
    });
    expect(contextWithSnippets.untrustedSnippets.length).toBe(1);
    expect(contextWithSnippets.untrustedSnippets[0]).toMatchObject({
      snippetId: 'snip-1',
      subjectRole: 'competitor',
      text: 'Free 2-day delivery on all summer essentials!',
      epistemicClass: 'observed',
    });
  });

  it('enforces deduplication and deterministic budget limits', () => {
    // Pass duplicate signals
    const duplicatedSignals = [...sampleInput.currentSignals, ...sampleInput.currentSignals];

    const context = buildIntelligenceContext({
      comparison: sampleInput.comparison,
      signals: duplicatedSignals,
      generatedAt: GENERATED_AT,
      limits: {
        maxSignals: 1, // Restrict budget
      },
    });

    expect(context.signals.length).toBe(1);
  });

  it('enforces maximum serialized byte budget', () => {
    expect(() =>
      buildIntelligenceContext({
        comparison: sampleInput.comparison,
        signals: sampleInput.currentSignals,
        generatedAt: GENERATED_AT,
        limits: {
          maxSerializedBytes: 50, // Tiny budget to trigger error
        },
      }),
    ).toThrow(/exceeds maximum serialized byte limit/);
  });

  it('validates structured LLM output contracts and rejects invalid guardrails or non-unique IDs', () => {
    const validOutput = {
      executiveBriefing: {
        headline: 'Competitor aggressively reduces purchase friction',
        strategicPostureSummary:
          'Rival brand combines a lower shipping threshold with a longer return window.',
        keyTakeaway: 'Immediate risk to top-of-funnel checkout conversion.',
        supportingHypothesisIndexes: [0],
        claimReferences: [
          {
            kind: 'comparison' as const,
            comparisonKey: 'offer.free_shipping_threshold',
            competitorId: COMPETITOR_ID,
            subjectId: COMPETITOR_ID,
            assertion: 'fact' as const,
            claimedEpistemicClass: 'observed' as const,
          },
        ],
        numericClaims: [],
      },
      hypotheses: [
        {
          competitorId: COMPETITOR_ID,
          theme: 'shipping_friction',
          statement:
            'Competitor is lowering shipping thresholds to capture margin-sensitive buyers.',
          rationale: 'The competitor offers free shipping at $50 vs owned brand at $75.',
          supportingSignalIds: [sampleInput.currentSignals[0]!.id],
          supportingComparisonKeys: ['offer.free_shipping_threshold'],
          confidence: 'medium' as const,
          uncertainty: {
            category: 'conversion_effect_not_established' as const,
            statement: 'Public evidence does not establish net impact on basket size.',
          },
          assumptions: ['Competitor logistics costs allow absorbing shipping subsidies.'],
          epistemicClassDependencies: ['derived' as const, 'observed' as const],
          claimReferences: [
            {
              kind: 'signal' as const,
              signalId: sampleInput.currentSignals[0]!.id,
              subjectId: COMPETITOR_ID,
              assertion: 'fact' as const,
              claimedEpistemicClass: 'derived' as const,
            },
            {
              kind: 'comparison' as const,
              comparisonKey: 'offer.free_shipping_threshold',
              competitorId: COMPETITOR_ID,
              subjectId: COMPETITOR_ID,
              assertion: 'fact' as const,
              claimedEpistemicClass: 'observed' as const,
            },
          ],
          numericClaims: [
            {
              value: 50,
              unit: 'usd' as const,
              valueRole: 'competitor' as const,
              reference: {
                kind: 'comparison' as const,
                comparisonKey: 'offer.free_shipping_threshold',
                competitorId: COMPETITOR_ID,
                subjectId: COMPETITOR_ID,
                assertion: 'fact' as const,
                claimedEpistemicClass: 'observed' as const,
              },
            },
          ],
        },
      ],
      experiments: [
        {
          competitorId: COMPETITOR_ID,
          hypothesisIndex: 0,
          title: 'Test lowering free shipping threshold to $55',
          objective: 'Evaluate conversion lift vs shipping margin subsidy.',
          hypothesisUnderTest: 'A lower shipping threshold will increase checkout completion rate.',
          variableUnderTest: 'free_shipping_threshold',
          design: {
            comparison: 'control_vs_treatment' as const,
            variablePolicy: 'single_variable' as const,
            controlDescription: 'Standard $75 free shipping threshold',
            treatmentDescription: 'Lower $55 free shipping threshold',
          },
          primaryMetric: 'checkout_conversion_rate' as const,
          guardrailMetrics: [
            'contribution_margin_per_order' as const,
            'shipping_cost_per_order' as const,
          ],
          implementationNotes: [
            'Configure treatment in Shopify checkout scripts.',
            'Hold promotional banners constant during the 14-day test.',
          ],
          caveat: {
            category: 'shipping_margin_exposure' as const,
            statement: 'Subsidizing shipping without higher AOV degrades margin.',
          },
        },
      ],
    };

    expect(llmIntelligenceSynthesisOutputSchema.parse(validOutput)).toBeDefined();

    // Rejects experiment where primaryMetric is duplicated in guardrailMetrics
    expect(() =>
      llmRecommendedExperimentOutputSchema.parse({
        ...validOutput.experiments[0]!,
        primaryMetric: 'checkout_conversion_rate',
        guardrailMetrics: ['checkout_conversion_rate', 'contribution_margin_per_order'],
      }),
    ).toThrow(/Guardrail metrics must not include the primary metric/);

    // Rejects non-unique supporting signal IDs
    expect(() =>
      llmStrategicHypothesisOutputSchema.parse({
        ...validOutput.hypotheses[0]!,
        supportingSignalIds: [sampleInput.currentSignals[0]!.id, sampleInput.currentSignals[0]!.id],
      }),
    ).toThrow(/Supporting signal IDs must be unique/);
  });
});
