import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { executeEval } from '../../packages/eval/src/cli/run';
import { loadGateConfigFromDisk } from '../../packages/eval/src/config/gates';
import { loadModelConfigFromDisk } from '../../packages/eval/src/config/models';
import { loadPricingFromDisk } from '../../packages/eval/src/pricing/pricing';
import { createMockProvider, resolveMockScenario } from '../../packages/eval/src/providers/factory';
import { runSuite } from '../../packages/eval/src/runner/runSuite';
import { FIXTURES, fixtureById } from './helpers/harness';

const BASE = {
  gateConfig: loadGateConfigFromDisk(),
  pricing: loadPricingFromDisk(),
  fixtures: FIXTURES,
  now: new Date('2026-09-09T00:00:00.000Z'),
};

function capture() {
  let text = '';
  return { write: (chunk: string) => (text += chunk), get text() { return text; } };
}

function rawFiles(outDir: string): string[] {
  const runDirName = readdirSync(outDir)[0]!;
  const rawDir = join(outDir, runDirName, 'raw');
  return existsSync(rawDir) ? readdirSync(rawDir).sort() : [];
}

function readEnvelope(outDir: string, filename: string): Record<string, unknown> {
  const runDirName = readdirSync(outDir)[0]!;
  return JSON.parse(readFileSync(join(outDir, runDirName, 'raw', filename), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('--capture-raw opt-in debug artifact', () => {
  it('default run (no --capture-raw) writes no raw/ directory', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-raw-default-'));
    const code = await executeEval(['--out', outDir, '--fixtures', 'B'], {
      ...BASE,
      env: {},
      stdout: capture().write,
    });
    expect(code).toBe(0);
    expect(rawFiles(outDir)).toHaveLength(0);
  });

  it('--capture-raw writes the initial attempt and a distinct validation-repair attempt', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-raw-repair-'));
    const out = capture();
    const code = await executeEval(
      [
        '--out', outDir,
        '--fixtures', 'B',
        '--mock-scenario', 'invalid_then_valid_repair',
        '--capture-raw',
      ],
      { ...BASE, env: {}, stdout: out.write },
    );
    expect(code).toBe(0);
    expect(out.text).toMatch(
      /Raw model outputs will be written locally and may contain source\/context data\./,
    );

    const files = rawFiles(outDir);
    expect(files).toHaveLength(2);
    expect(files.some((name) => name.endsWith('attempt-1-initial.json'))).toBe(true);
    expect(files.some((name) => name.endsWith('attempt-2-validation-repair.json'))).toBe(true);

    const initial = readEnvelope(outDir, files.find((name) => name.endsWith('attempt-1-initial.json'))!);
    const repair = readEnvelope(
      outDir,
      files.find((name) => name.endsWith('attempt-2-validation-repair.json'))!,
    );
    expect(initial.rawOutput).not.toEqual(repair.rawOutput);
    expect((initial.validation as { status: string }).status).not.toBe('passed');
    expect((repair.validation as { status: string }).status).toBe('passed');
  });

  it('a transport failure with no model output writes no fake artifact for that attempt', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-raw-timeout-'));
    const code = await executeEval(
      [
        '--out', outDir,
        '--fixtures', 'B',
        '--mock-scenario', 'timeout_then_valid',
        '--capture-raw',
      ],
      { ...BASE, env: {}, stdout: capture().write },
    );
    expect(code).toBe(0);
    const files = rawFiles(outDir);
    // attempt 1 timed out (no rawOutput) -> not captured; attempt 2 succeeded via transport retry.
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/attempt-2-transport-retry\.json$/);
  });

  it('a hard provider failure with no successful attempt writes no raw artifacts at all', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-raw-hardfail-'));
    const code = await executeEval(
      [
        '--out', outDir,
        '--fixtures', 'B',
        '--mock-scenario', 'hard_failure',
        '--capture-raw',
      ],
      { ...BASE, env: {}, stdout: capture().write },
    );
    expect(code).toBe(0);
    expect(rawFiles(outDir)).toHaveLength(0);
  });

  it('preserves detailed validator errors (path + message), not just error codes', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-raw-detail-'));
    await executeEval(
      [
        '--out', outDir,
        '--fixtures', 'B',
        '--mock-scenario', 'invalid_then_valid_repair',
        '--capture-raw',
      ],
      { ...BASE, env: {}, stdout: capture().write },
    );
    const files = rawFiles(outDir);
    const initial = readEnvelope(outDir, files.find((name) => name.endsWith('attempt-1-initial.json'))!);
    const validation = initial.validation as { status: string; errors: unknown[] };
    expect(validation.errors.length).toBeGreaterThan(0);
    for (const error of validation.errors) {
      const typed = error as { code: string; path: unknown[]; message: string };
      expect(typeof typed.code).toBe('string');
      expect(Array.isArray(typed.path)).toBe(true);
      expect(typeof typed.message).toBe('string');
      expect(typed.message.length).toBeGreaterThan(0);
    }
  });

  it('envelope has exactly the documented shape and never contains credential-like values', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-raw-shape-'));
    await executeEval(
      [
        '--out', outDir,
        '--fixtures', 'B',
        '--mock-scenario', 'invalid_then_valid_repair',
        '--capture-raw',
      ],
      { ...BASE, env: {}, stdout: capture().write },
    );
    const files = rawFiles(outDir);
    const envelope = readEnvelope(outDir, files.find((name) => name.endsWith('attempt-1-initial.json'))!);
    expect(Object.keys(envelope).sort()).toEqual(
      [
        'attemptKind',
        'attemptNumber',
        'contextHash',
        'fixtureId',
        'modelAlias',
        'promptVersion',
        'providerId',
        'rawOutput',
        'runId',
        'validation',
      ].sort(),
    );
    expect(JSON.stringify(envelope)).not.toMatch(/API_KEY|apiKey|sk-[A-Za-z0-9]/);
  });

  it('raw capture cannot become acceptedOutput or alter production run records', async () => {
    const modelConfig = loadModelConfigFromDisk();
    const mockModel = modelConfig.models.find((model) => model.providerId === 'deterministic-mock')!;
    const fixture = fixtureById('b-shipping-threshold-diff');
    const sharedInput = {
      benchmarkRunId: 'test-bench',
      mode: 'mock' as const,
      fixtures: [fixture],
      models: [mockModel],
      makeProvider: (_model: unknown, f: typeof fixture) =>
        createMockProvider(resolveMockScenario(f.mockScenario)),
      pricing: loadPricingFromDisk(),
      pricingDate: '2026-09-09',
      gateConfig: loadGateConfigFromDisk(),
      gitCommit: 'testcommit',
      now: () => '2026-09-09T00:00:00.000Z',
    };

    const withoutCapture = await runSuite(sharedInput);
    const rawDir = mkdtempSync(join(tmpdir(), 'eval-raw-compare-'));
    const withCapture = await runSuite({ ...sharedInput, captureRaw: true, rawDir });

    // wallClockMs is real elapsed time (non-deterministic across two live invocations); every
    // other field must be byte-identical whether or not raw capture ran alongside it.
    const stripWallClock = (value: unknown, key: string): unknown =>
      key === 'wallClockMs' ? undefined : value;
    expect(JSON.stringify(withCapture.runs, stripWallClock)).toBe(
      JSON.stringify(withoutCapture.runs, stripWallClock),
    );
    expect(JSON.stringify(withCapture.manifest)).toBe(JSON.stringify(withoutCapture.manifest));
    for (const run of withCapture.runs) {
      expect(run).not.toHaveProperty('rawOutput');
    }
  });

  it('a throwing raw-capture writer does not alter acceptedOutput/fallback/retry behavior, and warns on stderr', async () => {
    const modelConfig = loadModelConfigFromDisk();
    const mockModel = modelConfig.models.find((model) => model.providerId === 'deterministic-mock')!;
    const fixture = fixtureById('b-shipping-threshold-diff');
    const sharedInput = {
      benchmarkRunId: 'test-bench-throw',
      mode: 'mock' as const,
      fixtures: [fixture],
      models: [mockModel],
      makeProvider: (_model: unknown, f: typeof fixture) =>
        createMockProvider(resolveMockScenario(f.mockScenario)),
      pricing: loadPricingFromDisk(),
      pricingDate: '2026-09-09',
      gateConfig: loadGateConfigFromDisk(),
      gitCommit: 'testcommit',
      now: () => '2026-09-09T00:00:00.000Z',
    };

    const withoutCapture = await runSuite(sharedInput);

    // A plain file (not a directory) as rawDir forces mkdirSync/writeFileSync inside
    // writeRawAttemptCapture to throw (ENOTDIR) for every attempt.
    const parent = mkdtempSync(join(tmpdir(), 'eval-raw-throw-'));
    const bogusRawDir = join(parent, 'not-a-directory');
    writeFileSync(bogusRawDir, 'not a directory');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    let withCapture: Awaited<ReturnType<typeof runSuite>>;
    let warnings: string[];
    try {
      withCapture = await runSuite({ ...sharedInput, captureRaw: true, rawDir: bogusRawDir });
    } finally {
      // Read call history BEFORE mockRestore(), which clears mock.calls.
      warnings = stderrSpy.mock.calls.map((call) => String(call[0]));
      stderrSpy.mockRestore();
    }

    const stripWallClock = (value: unknown, key: string): unknown =>
      key === 'wallClockMs' ? undefined : value;
    expect(JSON.stringify(withCapture.runs, stripWallClock)).toBe(
      JSON.stringify(withoutCapture.runs, stripWallClock),
    );
    expect(JSON.stringify(withCapture.manifest)).toBe(JSON.stringify(withoutCapture.manifest));
    expect(existsSync(bogusRawDir)).toBe(true);

    expect(warnings.some((line) => line.includes('WARNING: Failed to write raw attempt capture:'))).toBe(
      true,
    );
    // Never leak API keys, prompts, or raw provider errors into the warning.
    for (const line of warnings) {
      expect(line).not.toMatch(/API_KEY|apiKey|sk-[A-Za-z0-9]/);
    }
  });

  it('.runs (including the new raw/ subdirectory) stays gitignored', () => {
    const gitignore = readFileSync(join(__dirname, '..', '..', '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^packages\/eval\/\.runs\/\s*$/m);
  });
});
