import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { intelligenceContextHash } from '@rivallens/intelligence';
import { intelligenceContextSchema } from '@rivallens/schemas';
import { SCENARIO_LETTERS, frozenFixtureSchema, type FrozenFixture } from './schema';

export class FixtureIntegrityError extends Error {
  constructor(
    readonly fixtureId: string,
    readonly reason: string,
    readonly detail?: unknown,
  ) {
    super(`Fixture "${fixtureId}" failed integrity check: ${reason}`);
    this.name = 'FixtureIntegrityError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse and verify one frozen fixture. Re-parses the context through the real
 * intelligenceContextSchema and recomputes intelligenceContextHash; a mismatch is a hard
 * rejection. Rejects anything not marked synthetic.
 */
export function loadFrozenFixture(raw: unknown): FrozenFixture {
  const parsed = frozenFixtureSchema.safeParse(raw);
  if (!parsed.success) {
    const id = isRecord(raw) && typeof raw.fixtureId === 'string' ? raw.fixtureId : '<unknown>';
    throw new FixtureIntegrityError(id, 'fixture schema', parsed.error.issues);
  }
  const fixture = parsed.data;

  const contextParsed = intelligenceContextSchema.safeParse(fixture.context);
  if (!contextParsed.success) {
    throw new FixtureIntegrityError(fixture.fixtureId, 'context schema', contextParsed.error.issues);
  }

  const recomputed = intelligenceContextHash(contextParsed.data);
  if (recomputed !== fixture.contextHash) {
    throw new FixtureIntegrityError(fixture.fixtureId, 'context hash mismatch', {
      expected: fixture.contextHash,
      recomputed,
    });
  }

  if (fixture.synthetic !== true) {
    throw new FixtureIntegrityError(fixture.fixtureId, 'fixture is not marked synthetic');
  }

  return { ...fixture, context: contextParsed.data };
}

export const FIXTURE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'fixtures');

export function loadAllFrozenFixtures(dir: string = FIXTURE_DIR): FrozenFixture[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const fixtures = files.map((name) =>
    loadFrozenFixture(JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown),
  );

  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (ids.has(fixture.fixtureId)) {
      throw new FixtureIntegrityError(fixture.fixtureId, 'duplicate fixtureId in suite');
    }
    ids.add(fixture.fixtureId);
  }

  const suiteVersions = new Set(fixtures.map((fixture) => fixture.suiteVersion));
  if (suiteVersions.size > 1) {
    throw new FixtureIntegrityError('<suite>', `mixed suiteVersions: ${[...suiteVersions].join(', ')}`);
  }

  const letters = fixtures.map((fixture) => fixture.scenarioLetter).sort();
  const expected = [...SCENARIO_LETTERS].sort();
  if (letters.length === expected.length && letters.join(',') !== expected.join(',')) {
    throw new FixtureIntegrityError('<suite>', `scenario letters must be A-O exactly once, got ${letters.join(',')}`);
  }

  return fixtures;
}
