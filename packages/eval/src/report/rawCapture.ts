import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AttemptDebugInfo } from '@rivallens/ai';
import { stableStringify } from '../util/stableJson';

// Opt-in, eval/debug-only artifact. The envelope carries the SAME untrusted rawOutput and
// full validation detail that generateAttempt already computed for the real production
// flow — nothing here is fetched separately, and nothing here feeds back into orchestration,
// acceptedOutput, or the normal runs.jsonl/SUMMARY.md artifacts.
export type RawCaptureEnvelope = {
  readonly runId: string;
  readonly fixtureId: string;
  readonly modelAlias: string;
  readonly providerId: string;
  readonly attemptNumber: 1 | 2;
  readonly attemptKind: 'initial' | 'validation-repair' | 'transport-retry';
  readonly contextHash: string;
  readonly promptVersion: string;
  readonly rawOutput: unknown;
  readonly validation: {
    readonly status: string;
    readonly errors: readonly { code: string; path: readonly (string | number)[]; message: string }[];
  };
};

export type RawCaptureMeta = {
  readonly runId: string;
  readonly fixtureId: string;
  readonly modelAlias: string;
  readonly providerId: string;
  readonly runIndex: number;
};

function attemptKindLabel(attempt: AttemptDebugInfo): RawCaptureEnvelope['attemptKind'] {
  if (attempt.kind === 'initial') return 'initial';
  return attempt.retryReason === 'validation_repair' ? 'validation-repair' : 'transport-retry';
}

export function writeRawAttemptCapture(
  rawDir: string,
  meta: RawCaptureMeta,
  attempt: AttemptDebugInfo,
): void {
  mkdirSync(rawDir, { recursive: true, mode: 0o700 });
  const attemptKind = attemptKindLabel(attempt);
  const filename = `${meta.modelAlias}--${meta.fixtureId}--${meta.runIndex}--attempt-${attempt.attemptNumber}-${attemptKind}.json`;
  const envelope: RawCaptureEnvelope = {
    runId: meta.runId,
    fixtureId: meta.fixtureId,
    modelAlias: meta.modelAlias,
    providerId: meta.providerId,
    attemptNumber: attempt.attemptNumber,
    attemptKind,
    contextHash: attempt.contextHash,
    promptVersion: attempt.promptVersion,
    rawOutput: attempt.rawOutput,
    validation: {
      status: attempt.validation.status,
      errors: attempt.validation.errors,
    },
  };
  writeFileSync(join(rawDir, filename), stableStringify(envelope), { encoding: 'utf8', mode: 0o600 });
}
