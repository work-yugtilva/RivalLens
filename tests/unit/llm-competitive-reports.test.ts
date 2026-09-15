import { describe, expect, it } from 'vitest';
import { DeterministicMockIntelligenceProvider } from '../../packages/ai/src';
import { orchestrateIntelligenceTrusted } from '../../packages/ai/src/orchestration';
import {
  buildIntelligenceContext,
  composeCompetitiveIntelligenceReport,
  composeLlmCompetitiveIntelligenceReport,
  generateStrategicHypotheses,
  intelligenceContextHash,
  prepareIntelligenceGenerationPersistence,
} from '../../packages/intelligence/src';
import { strategicHypothesisSchema } from '../../packages/schemas/src';
import { GENERATED_AT, reportInput, uuid } from './fixtures/competitive-reports';

async function inputs(runId: string) {
  const report = reportInput();
  const baseReport = composeCompetitiveIntelligenceReport(report);
  const context = buildIntelligenceContext({
    comparison: report.comparison,
    signals: report.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const currentHypotheses = generateStrategicHypotheses({
    currentSignals: report.currentSignals,
    generatedAt: GENERATED_AT,
  }).map((candidate, index) => strategicHypothesisSchema.parse({ ...candidate, id: uuid(700 + index) }));
  const trusted = await orchestrateIntelligenceTrusted({
    context,
    contextHash: intelligenceContextHash(context),
    provider: new DeterministicMockIntelligenceProvider('valid'),
    promptVersion: 'intelligence-synthesis-v1',
    systemPrompt: 'Return structured intelligence.',
    parameters: { maxOutputTokens: 32768, reasoningEffort: 'medium' },
    deterministicFallback: {
      currentSignals: report.currentSignals,
      currentHypotheses,
      generatedAt: GENERATED_AT,
    },
  });
  const prepared = prepareIntelligenceGenerationPersistence({
    generationRunId: runId,
    context: trusted.frozenContext,
    contextHash: trusted.contextHash,
    promptVersion: trusted.promptVersion,
    providerId: trusted.providerId,
    modelId: trusted.modelId,
    parameters: trusted.parameters,
    attempts: trusted.persistenceAttempts,
    generationOutcome: { kind: 'llm_candidate' },
  });
  if (prepared.status !== 'ready') throw new Error(`Unexpected preparation rejection: ${prepared.code}`);
  const payload = prepared.payload;
  const hypothesisIds = new Map(payload.hypotheses.map((hypothesis, index) => [hypothesis.ref, uuid(800 + index)]));
  const hypotheses = payload.hypotheses.map((hypothesis) => ({
    ...hypothesis,
    id: hypothesisIds.get(hypothesis.ref)!,
  }));
  const experiments = payload.experiments.map((experiment, index) => ({
    ...experiment,
    id: uuid(900 + index),
    hypothesisId: hypothesisIds.get(experiment.hypothesisRef)!,
  }));
  if (!payload.executiveBriefing) throw new Error('Expected accepted briefing.');
  const executiveBriefing = {
    ...payload.executiveBriefing,
    id: uuid(950),
    supportingHypothesisIds: payload.executiveBriefing.supportingHypothesisRefs.map(
      (ref) => hypothesisIds.get(ref)!,
    ),
  };
  return { report, baseReport, trusted, hypotheses, experiments, executiveBriefing };
}

describe('competitive-report-v2-llm composition', () => {
  it('composes only persisted accepted LLM rows while retaining evidence lineage', async () => {
    const runId = uuid(600);
    const input = await inputs(runId);
    const candidate = composeLlmCompetitiveIntelligenceReport({
      baseReport: input.baseReport,
      currentSignals: input.report.currentSignals,
      hypotheses: input.hypotheses,
      experiments: input.experiments,
      executiveBriefing: input.executiveBriefing,
      generation: {
        runId,
        outcome: 'llm_success',
        contextHash: input.trusted.contextHash,
        promptVersion: input.trusted.promptVersion,
        providerId: input.trusted.providerId,
        modelId: input.trusted.modelId,
      },
      generatedAt: GENERATED_AT,
    });

    expect(candidate.reportEngineVersion).toBe('competitive-report-v2-llm');
    expect(candidate.sections.appearsToBeWorking).toHaveLength(1);
    expect(candidate.sections.whatToTestNext).toHaveLength(1);
    expect(candidate.sections.whatToTestNext[0]!.provenance.hypotheses[0]?.hypothesisId).toBe(
      input.hypotheses[0]!.id,
    );
    expect(candidate.executiveBriefing.supportingHypothesisIds).toEqual([
      input.hypotheses[0]!.id,
    ]);
    expect(JSON.stringify(candidate)).not.toContain('rawOutput');
    expect(JSON.stringify(candidate)).not.toContain('generationRunId');
    expect(JSON.stringify(candidate)).not.toContain('providerId');
  });

  it('binds immutable report identity to the generation run and exposes only partial classification', async () => {
    const first = await inputs(uuid(601));
    const compose = (runId: string, outcome: 'llm_success' | 'llm_partial') =>
      composeLlmCompetitiveIntelligenceReport({
        baseReport: first.baseReport,
        currentSignals: first.report.currentSignals,
        hypotheses: first.hypotheses,
        experiments: first.experiments,
        executiveBriefing: first.executiveBriefing,
        generation: {
          runId,
          outcome,
          contextHash: first.trusted.contextHash,
          promptVersion: first.trusted.promptVersion,
          providerId: first.trusted.providerId,
          modelId: first.trusted.modelId,
        },
        generatedAt: GENERATED_AT,
      });

    const complete = compose(uuid(601), 'llm_success');
    const regenerated = compose(uuid(602), 'llm_success');
    const partial = compose(uuid(603), 'llm_partial');
    expect(regenerated.reportHash).not.toBe(complete.reportHash);
    expect(partial.generation).toEqual({ result: 'llm_partial' });
    expect(partial.completeness.state).toBe('partial');
  });
});
