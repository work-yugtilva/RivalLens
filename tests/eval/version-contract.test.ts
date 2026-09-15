import { describe, expect, it } from 'vitest';
import {
  INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
  INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
} from '../../packages/intelligence/src';
import { EVALUATION_VERSION } from '../../packages/eval/src/config/evaluationVersion';
import { fixtureById, runMock } from './helpers/harness';

describe('prompt / schema / validator version control', () => {
  it('bundles every version axis for a benchmark run', () => {
    expect(EVALUATION_VERSION).toEqual({
      evaluationVersion: 'phase-4b-eval-v2',
      suiteVersion: 'phase-4a-v1',
      systemPromptVersion: 'intelligence-synthesis-v1',
      repairPromptSuffix: ':repair-v1',
      contextVersion: 'intelligence-context-v1',
      synthesisSchemaName: 'llm-intelligence-synthesis-v1',
      validatorContractVersion: 'intelligence-validator-contract-2026-09-14',
      metricsMappingVersion: 'phase-4a-metrics-v1',
      rubricVersion: 'phase-4a-rubric-v1',
      gatesVersion: 'phase-4a-gates-v1',
    });
    expect(EVALUATION_VERSION.systemPromptVersion).toBe(INTELLIGENCE_SYNTHESIS_PROMPT_VERSION);
  });

  it('pins the production-intended synthesis prompt (grounded, not fixture-tuned)', () => {
    const prompt = INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT;
    expect(prompt.length).toBeGreaterThan(400);
    for (const rule of ['unknown', 'observed', 'reported', 'untrusted', 'causal', 'single']) {
      expect(prompt.toLowerCase()).toContain(rule);
    }
    // must not reference any evaluation fixture id / scenario tag
    expect(prompt).not.toMatch(/fixture|eval-|scenario[A-O]/i);
  });

  it("matches the frozen contexts' contextVersion", () => {
    expect(fixtureById('b-shipping-threshold-diff').context.contextVersion).toBe(
      EVALUATION_VERSION.contextVersion,
    );
  });

  it('drives the real orchestrator with the pinned schema name and repair prompt suffix', async () => {
    const { provider, result } = await runMock(fixtureById('b-shipping-threshold-diff'), [
      'unknown_evidence_id',
      'valid',
    ]);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]!.schemaName).toBe(EVALUATION_VERSION.synthesisSchemaName);
    expect(provider.requests[0]!.promptVersion).toBe(EVALUATION_VERSION.systemPromptVersion);
    expect(provider.requests[1]!.promptVersion).toBe(
      `${EVALUATION_VERSION.systemPromptVersion}${EVALUATION_VERSION.repairPromptSuffix}`,
    );
    expect(result.status).toBe('llm_success');
  });
});
