import { z } from 'zod';
import {
  competitiveSignalSchema,
  intelligenceContextSchema,
  strategicHypothesisSchema,
} from '@rivallens/schemas';

export const SCENARIO_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
] as const;
export type ScenarioLetter = (typeof SCENARIO_LETTERS)[number];

export const validatorTerminalStatusSchema = z.enum(['passed', 'partial', 'failed']);

// Deterministic expectations a FAITHFUL model may satisfy. Deliberately permissive on
// non-adversarial fixtures (safe strategic variation is allowed).
export const expectedDeterministicSchema = z
  .object({
    schemaValidatable: z.literal(true),
    validatorStatusIn: z.array(validatorTerminalStatusSchema).min(1).optional(),
    fallbackAllowed: z.boolean().optional(),
    fallbackExpected: z.boolean().optional(),
    maxAcceptedHypotheses: z.number().int().nonnegative().optional(),
    maxAcceptedExperiments: z.number().int().nonnegative().optional(),
    mustRejectAllItems: z.boolean().optional(),
  })
  .strict();
export type ExpectedDeterministic = z.infer<typeof expectedDeterministicSchema>;

// Fixture-level, machine-checkable trust-boundary invariants for adversarial fixtures.
// A violation of ANY of these on an adversarial run is an injection / trust-boundary
// failure. Safe strategic variation is NOT a violation.
export const expectedSecuritySchema = z
  .object({
    // Substrings that must never appear verbatim in any accepted statement / rationale / summary.
    forbiddenClaimSubstrings: z.array(z.string().min(1)).default([]),
    // Evidence identifiers (signal ids, snippet ids, comparison keys, ...) that must never be cited.
    forbiddenReferenceIds: z.array(z.string().min(1)).default([]),
    // Reference kinds that must never back a claimedEpistemicClass stronger than the source allows.
    forbidEpistemicPromotion: z.boolean().default(true),
    // If set, accepted output may only attribute claims to these competitor ids.
    allowedCompetitorIds: z.array(z.string().uuid()).default([]),
    // Upper bounds on accepted synthesis size for this fixture.
    maxAcceptedHypotheses: z.number().int().nonnegative().optional(),
    maxAcceptedExperiments: z.number().int().nonnegative().optional(),
    // The run must end in deterministic fallback OR a non-passed validator status
    // (i.e. the model must not sail an adversarial context straight through).
    requireFallbackOrNonPassed: z.boolean().default(false),
  })
  .strict();
export type ExpectedSecurity = z.infer<typeof expectedSecuritySchema>;

export const frozenFixtureSchema = z
  .object({
    fixtureId: z.string().min(1),
    fixtureVersion: z.string().min(1),
    suiteVersion: z.string().min(1),
    scenarioLetter: z.enum(SCENARIO_LETTERS),
    description: z.string().min(1),
    scenarioTags: z.array(z.string().min(1)),
    synthetic: z.literal(true),
    adversarial: z.boolean(),
    // The frozen IntelligenceContext. Immutable. Verified against contextHash on load.
    context: intelligenceContextSchema,
    contextHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    // Inputs for the Phase 3C deterministic fallback path, frozen alongside the context so
    // the benchmark never rebuilds them at run time.
    fallbackSeed: z
      .object({
        signals: z.array(competitiveSignalSchema),
        hypotheses: z.array(strategicHypothesisSchema),
        generatedAt: z.string().min(1),
      })
      .strict(),
    expectedDeterministic: expectedDeterministicSchema,
    expectedSecurity: expectedSecuritySchema.optional(),
    expectedFacts: z
      .object({
        comparisonKeys: z.array(z.string()).optional(),
        signalIds: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    adversarialCharacteristics: z
      .object({
        injectionVector: z.string().min(1),
        expectedDefense: z.string().min(1),
      })
      .strict()
      .optional(),
    humanReviewNotes: z.string(),
    // A DeterministicMockScenario or DETERMINISTIC_MOCK_SEQUENCES key used to exercise this
    // fixture through the real orchestrator offline (tests + `--mock-scenario` default).
    mockScenario: z.string().min(1),
  })
  .strict();

export type FrozenFixture = z.infer<typeof frozenFixtureSchema>;
