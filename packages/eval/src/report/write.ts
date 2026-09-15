import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stableStringify } from '../util/stableJson';
import { buildHumanScoringTemplate } from '../rubric/template';
import type { BenchmarkResult } from '../runner/runSuite';
import {
  serializeManifest,
  serializeModelAggregates,
  serializeRunsJsonl,
} from './runRecord';
import { renderSummaryMarkdown } from './summary';

export function writeBenchmarkOutputs(
  outDir: string,
  result: BenchmarkResult,
  options: { readonly emitRubricTemplate?: boolean } = {},
): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const write = (name: string, content: string): void => {
    writeFileSync(join(outDir, name), content, 'utf8');
    written.push(name);
  };

  write('manifest.json', serializeManifest(result));
  write('runs.jsonl', serializeRunsJsonl(result.runs));
  write('model-aggregates.json', serializeModelAggregates(result));
  write('SUMMARY.md', renderSummaryMarkdown(result));

  if (options.emitRubricTemplate) {
    write(
      'human-scoring-template.json',
      stableStringify(
        buildHumanScoringTemplate(
          result.manifest.benchmarkRunId,
          result.runs.map((run) => ({
            runId: run.runId,
            providerId: run.providerId,
            modelId: run.modelId,
            modelAlias: run.modelAlias,
            fixtureId: run.fixtureId,
            status: run.status,
          })),
        ),
      ),
    );
  }

  return written;
}
