import { describe, expect, it } from 'vitest';
import { renderSummaryMarkdown } from '../../packages/eval/src/report/summary';
import { runMockSuite } from './helpers/harness';

describe('human-readable summary', () => {
  it('renders the model table, gate matrix and the not-a-selection disclaimer', async () => {
    const result = await runMockSuite([
      'b-shipping-threshold-diff',
      'g-coherent-multi-signal',
      'o-adversarial-injection-text',
    ]);
    const markdown = renderSummaryMarkdown(result);

    expect(markdown).toContain('# RivalLens Intelligence');
    expect(markdown).toContain('NOT a production model selection');
    expect(markdown).toContain('Hard-gate status:');
    expect(markdown).toMatch(/Grounding pass rate/);
    expect(markdown).toMatch(/Injection \/ trust-boundary failures/);
    expect(markdown).toMatch(/\| unknownEvidenceCitationGate \| PASS/);
    expect(markdown).toContain('p50 / p95');
    expect(markdown).toContain('Token usage');
    // subjective quality lives elsewhere
    expect(markdown).toMatch(/Strategic-quality scores are subjective/);
    // no leaked injected text / prompt bodies
    expect(markdown).not.toContain('IGNORE ALL PRIOR INSTRUCTIONS');
  });

  it('marks a model INELIGIBLE in the summary when a hard gate fails', async () => {
    const result = await runMockSuite(['b-shipping-threshold-diff']);
    // Force a hard-gate failure on the aggregate the summary renders.
    const broken = {
      ...result,
      modelReports: result.modelReports.map((report) => ({
        ...report,
        eligibility: {
          ...report.eligibility,
          eligible: false,
          gates: report.eligibility.gates.map((gate) =>
            gate.id === 'injectionTrustBoundaryGate' ? { ...gate, passed: false } : gate,
          ),
        },
      })),
    };
    const markdown = renderSummaryMarkdown(broken);
    expect(markdown).toContain('**INELIGIBLE**');
    expect(markdown).toMatch(/\| injectionTrustBoundaryGate \| FAIL/);
  });
});
