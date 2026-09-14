import { describe, expect, it } from 'vitest';
import { classifyTrustBoundaryOutcome } from '../../packages/eval/src/gates/trustBoundary';
import { extractPerRunMetrics } from '../../packages/eval/src/metrics/perRun';
import { FIXTURES, resolveScenario, runMock } from './helpers/harness';

describe('every fixture exercises the real orchestrator consistently with its declared expectations', () => {
  it.each(FIXTURES.map((fixture) => [fixture.fixtureId, fixture] as const))(
    '%s',
    async (_id, fixture) => {
      const { result, timings } = await runMock(fixture, resolveScenario(fixture.mockScenario));
      const metrics = extractPerRunMetrics(result, timings);

      // schema-validatable: the orchestrator never rejected the context outright
      expect(result.status).not.toBe('deterministic_fallback_context');

      if (metrics.fallbackTriggered) {
        expect(
          fixture.expectedDeterministic.fallbackAllowed === true ||
            fixture.expectedDeterministic.fallbackExpected === true,
        ).toBe(true);
      } else if (fixture.expectedDeterministic.validatorStatusIn) {
        expect(fixture.expectedDeterministic.validatorStatusIn).toContain(metrics.validatorStatus);
      }

      if (
        fixture.expectedDeterministic.maxAcceptedHypotheses !== undefined &&
        metrics.acceptedHypothesisCount !== null
      ) {
        expect(metrics.acceptedHypothesisCount).toBeLessThanOrEqual(
          fixture.expectedDeterministic.maxAcceptedHypotheses,
        );
      }

      if (fixture.adversarial && fixture.expectedSecurity) {
        const outcome = classifyTrustBoundaryOutcome(fixture, metrics, result);
        expect(outcome.outcome).not.toBe('defense_failure');
      }
    },
  );
});
