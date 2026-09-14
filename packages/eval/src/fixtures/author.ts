import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { intelligenceContextHash } from '@rivallens/intelligence';
import { intelligenceContextSchema } from '@rivallens/schemas';
import { EVAL_SUITE_VERSION } from '../config/evaluationVersion';
import { EVAL_GENERATED_AT, buildFallbackHypotheses } from './builders';
import { FIXTURE_DEFINITIONS } from './definitions';
import { FIXTURE_DIR } from './load';
import { expectedSecuritySchema, frozenFixtureSchema } from './schema';

import { stableStringify } from '../util/stableJson';

const FIXTURE_VERSION = '1';

export type AuthoredFixtureReport = {
  readonly fixtureId: string;
  readonly scenarioLetter: string;
  readonly adversarial: boolean;
  readonly signalCount: number;
  readonly signalTypes: string[];
  readonly factCount: number;
  readonly snippetCount: number;
  readonly recentChangeCount: number;
  readonly contextHash: string;
  readonly serializedBytes: number;
};

export type AuthorResult = {
  readonly files: string[];
  readonly report: AuthoredFixtureReport[];
  readonly drift: string[];
};

export function authorFixtures(
  options: { readonly check?: boolean; readonly dir?: string } = {},
): AuthorResult {
  const dir = options.dir ?? FIXTURE_DIR;
  const check = options.check ?? false;
  if (!check) mkdirSync(dir, { recursive: true });

  const files: string[] = [];
  const report: AuthoredFixtureReport[] = [];
  const drift: string[] = [];

  for (const definition of FIXTURE_DEFINITIONS) {
    const built = definition.build();
    const context = definition.transformContext
      ? intelligenceContextSchema.parse(definition.transformContext(built.context))
      : built.context;
    const contextHash = intelligenceContextHash(context);

    const fixture = {
      fixtureId: definition.fixtureId,
      fixtureVersion: FIXTURE_VERSION,
      suiteVersion: EVAL_SUITE_VERSION,
      scenarioLetter: definition.scenarioLetter,
      description: definition.description,
      scenarioTags: [...definition.scenarioTags],
      synthetic: true as const,
      adversarial: definition.adversarial,
      context,
      contextHash,
      fallbackSeed: {
        signals: built.signals,
        hypotheses: buildFallbackHypotheses(built.signals),
        generatedAt: EVAL_GENERATED_AT,
      },
      expectedDeterministic: definition.expectedDeterministic,
      ...(definition.expectedSecurity
        ? { expectedSecurity: expectedSecuritySchema.parse(definition.expectedSecurity) }
        : {}),
      ...(definition.adversarialCharacteristics
        ? { adversarialCharacteristics: definition.adversarialCharacteristics }
        : {}),
      humanReviewNotes: definition.humanReviewNotes,
      mockScenario: definition.mockScenario,
    };

    // Fail loudly at authoring time if the artifact would not pass the loader.
    frozenFixtureSchema.parse(fixture);

    const serialized = stableStringify(fixture);
    const fileName = `${definition.fixtureId}.json`;
    const filePath = join(dir, fileName);
    files.push(fileName);

    if (check) {
      let current = '';
      try {
        current = readFileSync(filePath, 'utf8');
      } catch {
        drift.push(`${fileName}: missing`);
      }
      if (current && current !== serialized) drift.push(`${fileName}: content drift`);
    } else {
      writeFileSync(filePath, serialized, 'utf8');
    }

    report.push({
      fixtureId: definition.fixtureId,
      scenarioLetter: definition.scenarioLetter,
      adversarial: definition.adversarial,
      signalCount: context.signals.length,
      signalTypes: context.signals.map((signal) => signal.signalType),
      factCount: context.facts.length,
      snippetCount: context.untrustedSnippets.length,
      recentChangeCount: context.recentChanges.length,
      contextHash,
      serializedBytes: Buffer.byteLength(serialized, 'utf8'),
    });
  }

  if (check) {
    const expected = new Set(files);
    for (const existing of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      if (!expected.has(existing)) drift.push(`${existing}: orphaned (no matching definition)`);
    }
  }

  return { files, report, drift };
}
