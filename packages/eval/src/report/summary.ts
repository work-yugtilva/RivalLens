import type { ModelAggregate } from '../metrics/aggregate';
import { costForSuite } from '../pricing/pricing';
import type { BenchmarkResult, ModelReport } from '../runner/runSuite';

function pct(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function ratioPct(ratio: { numerator: number; denominator: number; rate: number | null }): string {
  return `${ratio.numerator}/${ratio.denominator} (${pct(ratio.rate)})`;
}

function ms(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(0)}ms`;
}


function tokens(value: number | null): string {
  return value === null ? 'n/a' : value.toLocaleString('en-US');
}

function notableFailures(aggregate: ModelAggregate): string {
  const notes: string[] = [];
  if ((aggregate.unknownIdCitationRate.rate ?? 0) > 0) notes.push('unknown-evidence citations');
  if ((aggregate.numericPrecision ?? 1) < 1) notes.push('numeric grounding errors');
  if ((aggregate.competitorAttributionAccuracy ?? 1) < 1) notes.push('competitor attribution errors');
  if ((aggregate.epistemicComplianceRate ?? 1) < 1) notes.push('epistemic-class violations');
  if (aggregate.totalUnknownAsAbsenceCount > 0) notes.push('unknown-as-absence');
  if ((aggregate.injectionDefenseFailureRate.rate ?? 0) > 0) notes.push('injection / trust-boundary failures');
  if ((aggregate.fallbackRate.rate ?? 0) > 0) notes.push('deterministic fallbacks');
  return notes.length > 0 ? notes.join('; ') : 'none';
}

function modelSection(report: ModelReport, runCosts: readonly (number | null)[]): string {
  const a = report.aggregate;
  const cost = costForSuite(runCosts);
  const lines: string[] = [];
  lines.push(`### ${a.modelAlias}  (${a.providerId}:${a.modelId})`);
  lines.push('');
  lines.push(`- Hard-gate status: **${report.eligibility.eligible ? 'ELIGIBLE' : 'INELIGIBLE'}**`);
  lines.push(`- Fixtures: ${a.fixtureCount}  |  Total runs: ${a.runCount}  |  Model-quality-eligible runs: ${a.eligibleRunCount}`);
  lines.push('');
  lines.push('| Dimension | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Grounding pass rate | ${ratioPct(a.groundingPassRate)} |`);
  lines.push(`| Grounding pass-or-partial rate | ${ratioPct(a.groundingPassOrPartialRate)} |`);
  lines.push(`| Unknown-ID citation rate | ${ratioPct(a.unknownIdCitationRate)} |`);
  lines.push(`| Numeric grounding precision | ${pct(a.numericPrecision)} |`);
  lines.push(`| Competitor attribution accuracy | ${pct(a.competitorAttributionAccuracy)} |`);
  lines.push(`| Epistemic compliance rate | ${pct(a.epistemicComplianceRate)} |`);
  lines.push(`| Unknown-as-absence count (all runs) | ${a.totalUnknownAsAbsenceCount} |`);
  lines.push(`| Structured-output success rate | ${ratioPct(a.structuredOutputSuccessRate)} |`);
  lines.push(`| Repair rate | ${ratioPct(a.repairRate)} |`);
  lines.push(`| Transport-retry rate | ${ratioPct(a.transportRetryRate)} |`);
  lines.push(`| Fallback rate | ${ratioPct(a.fallbackRate)} |`);
  lines.push(`| Mean provider invocations / run | ${a.meanProviderInvocationCount?.toFixed(2) ?? 'n/a'} |`);
  lines.push(`| Mean accepted hypotheses (eligible) | ${a.meanAcceptedHypotheses?.toFixed(2) ?? 'n/a'} |`);
  lines.push(`| Mean accepted experiments (eligible) | ${a.meanAcceptedExperiments?.toFixed(2) ?? 'n/a'} |`);
  lines.push(`| Injection / trust-boundary failures | ${ratioPct(a.injectionDefenseFailureRate)} |`);
  lines.push(`| Latency — first model attempt (p50 / p95) | ${ms(a.latency.firstAttemptModelMs.p50)} / ${ms(a.latency.firstAttemptModelMs.p95)} |`);
  lines.push(`| Latency — repair call (p50 / p95) | ${ms(a.latency.repairMs.p50)} / ${ms(a.latency.repairMs.p95)} |`);
  lines.push(`| Latency — total orchestration (p50 / p95) | ${ms(a.latency.totalOrchestrationMs.p50)} / ${ms(a.latency.totalOrchestrationMs.p95)} |`);
  lines.push(`| Token usage (input / output / total) | ${tokens(a.tokenUsage.inputTokens)} / ${tokens(a.tokenUsage.outputTokens)} / ${tokens(a.tokenUsage.totalTokens)} |`);
  lines.push(
    `| Estimated cost (known / runs w/o pricing) | ${cost ? `$${cost.knownUsd.toFixed(4)}` : 'unknown'} / ${cost ? cost.unknownRuns : 'n/a'} |`,
  );
  lines.push('');
  lines.push('| Hard gate | Result | Observed | Threshold |');
  lines.push('| --- | --- | --- | --- |');
  for (const gate of report.eligibility.gates) {
    const observed = gate.observed === null ? 'n/a' : gate.observed.toString();
    const comparator = gate.comparator === 'lte' ? '<=' : '>=';
    lines.push(`| ${gate.id} | ${gate.passed ? 'PASS' : 'FAIL'} | ${observed} | ${comparator} ${gate.threshold} |`);
  }
  lines.push('');
  lines.push(`Notable failure categories: ${notableFailures(a)}`);
  lines.push('');
  return lines.join('\n');
}

export function renderSummaryMarkdown(result: BenchmarkResult): string {
  const m = result.manifest;
  const lines: string[] = [];
  lines.push('# RivalLens Intelligence — Frozen-Fixture Model Benchmark');
  lines.push('');
  lines.push('> This is a benchmark, **NOT a production model selection**. No winner is chosen here.');
  lines.push('> Inspect the separate dimensions (grounding reliability, strategic quality, cost, latency) before deciding.');
  lines.push('');
  lines.push(`- benchmarkRunId: \`${m.benchmarkRunId}\``);
  lines.push(`- mode: **${m.mode.toUpperCase()}**`);
  lines.push(`- evaluationVersion: \`${m.evaluationVersion.evaluationVersion}\`  |  suiteVersion: \`${m.evaluationVersion.suiteVersion}\`  |  promptVersion: \`${m.evaluationVersion.systemPromptVersion}\``);
  lines.push(`- pricingVersion: \`${m.pricingVersion}\`  |  gatesVersion: \`${m.evaluationVersion.gatesVersion}\`  |  rubricVersion: \`${m.evaluationVersion.rubricVersion}\``);
  lines.push(`- fixtures: ${m.fixtureIds.length}  |  models: ${m.models.length}  |  total runs: ${m.totalRuns}`);
  lines.push(`- started ${m.startedAt}  |  finished ${m.finishedAt}${m.gitCommit ? `  |  commit \`${m.gitCommit}\`` : ''}`);
  lines.push('');
  lines.push('## Per-model results');
  lines.push('');
  for (const report of result.modelReports) {
    const runCosts = result.runs
      .filter((run) => run.modelAlias === report.aggregate.modelAlias)
      .map((run) => run.estimatedCostUsd);
    lines.push(modelSection(report, runCosts));
  }
  lines.push('## Strategic quality');
  lines.push('');
  lines.push('Strategic-quality scores are subjective and are collected separately (human review, or an optional');
  lines.push('LLM judge that is never run by default). They are NOT in this file and can never override a hard-gate');
  lines.push('failure. Export `human-scoring-template.json` with `--emit-rubric-template`.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function renderGateSummary(result: BenchmarkResult): string {
  const lines = ['', 'Hard-gate eligibility:'];
  for (const report of result.modelReports) {
    const failed = report.eligibility.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
    lines.push(
      `  ${report.aggregate.modelAlias.padEnd(22)} ${report.eligibility.eligible ? 'ELIGIBLE' : `INELIGIBLE (${failed.join(', ')})`}`,
    );
  }
  return lines.join('\n');
}
