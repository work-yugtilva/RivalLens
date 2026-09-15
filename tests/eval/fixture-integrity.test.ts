import { describe, expect, it } from 'vitest';
import { intelligenceContextHash } from '../../packages/intelligence/src';
import {
  FixtureIntegrityError,
  loadAllFrozenFixtures,
  loadFrozenFixture,
} from '../../packages/eval/src/fixtures/load';
import { SCENARIO_LETTERS } from '../../packages/eval/src/fixtures/schema';
import { FIXTURES } from './helpers/harness';

describe('frozen fixture integrity', () => {
  it('loads all 15 scenario fixtures (A-O), each marked synthetic', () => {
    const fixtures = loadAllFrozenFixtures();
    expect(fixtures).toHaveLength(15);
    expect(fixtures.map((fixture) => fixture.scenarioLetter).sort()).toEqual([...SCENARIO_LETTERS].sort());
    expect(fixtures.every((fixture) => fixture.synthetic === true)).toBe(true);
    expect(new Set(fixtures.map((fixture) => fixture.suiteVersion)).size).toBe(1);
  });

  it('verifies intelligenceContextHash(context) === contextHash for every fixture', () => {
    for (const fixture of FIXTURES) {
      expect(intelligenceContextHash(fixture.context)).toBe(fixture.contextHash);
    }
  });

  it('rejects a fixture whose frozen context was tampered with', () => {
    const base = FIXTURES[0]!;
    const tampered = structuredClone(base) as unknown as Record<string, unknown>;
    (tampered.context as { generatedAt: string }).generatedAt = '2099-01-01T00:00:00.000Z';
    expect(() => loadFrozenFixture(tampered)).toThrow(FixtureIntegrityError);
  });

  it('rejects a fixture whose contextHash was tampered with', () => {
    const base = FIXTURES[0]!;
    const tampered = structuredClone(base) as unknown as Record<string, unknown>;
    tampered.contextHash = `sha256:${'0'.repeat(64)}`;
    expect(() => loadFrozenFixture(tampered)).toThrow(/context hash mismatch/);
  });

  it('rejects a fixture with an unknown top-level key (strict schema)', () => {
    const base = FIXTURES[0]!;
    const tampered = { ...structuredClone(base), sneaky: true } as unknown;
    expect(() => loadFrozenFixture(tampered)).toThrow(FixtureIntegrityError);
  });

  it('rejects a fixture not marked synthetic', () => {
    const base = FIXTURES[0]!;
    const tampered = structuredClone(base) as unknown as Record<string, unknown>;
    tampered.synthetic = false;
    expect(() => loadFrozenFixture(tampered)).toThrow(FixtureIntegrityError);
  });

  it('every adversarial fixture declares a machine-checkable intent', () => {
    for (const fixture of FIXTURES.filter((f) => f.adversarial)) {
      const hasSecurity = fixture.expectedSecurity !== undefined;
      const hasCharacteristics = fixture.adversarialCharacteristics !== undefined;
      expect(hasSecurity || hasCharacteristics).toBe(true);
    }
  });
});
