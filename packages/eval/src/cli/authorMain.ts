import { parseArgs } from 'node:util';
import { authorFixtures } from '../fixtures/author';

// `pnpm eval:author-fixtures [--check]`
// Regenerates the 15 committed frozen fixture JSON artifacts from FIXTURE_DEFINITIONS.
// Not run at benchmark time and not wired into CI. `--check` verifies the committed files
// are byte-identical to a fresh regeneration and exits non-zero on drift.
function main(): number {
  const { values } = parseArgs({
    options: { check: { type: 'boolean', default: false } },
  });

  const result = authorFixtures({ check: values.check });

  process.stdout.write(`\nPhase 4A fixture suite (${result.files.length} fixtures)\n`);
  process.stdout.write(
    `${'letter'.padEnd(7)}${'signals'.padEnd(9)}${'facts'.padEnd(7)}${'snip'.padEnd(6)}${'chg'.padEnd(5)}fixtureId\n`,
  );
  for (const row of result.report) {
    process.stdout.write(
      `${row.scenarioLetter.padEnd(7)}${String(row.signalCount).padEnd(9)}${String(row.factCount).padEnd(7)}${String(
        row.snippetCount,
      ).padEnd(6)}${String(row.recentChangeCount).padEnd(5)}${row.fixtureId}${
        row.adversarial ? '  [adversarial]' : ''
      }\n`,
    );
    if (row.signalCount > 0) {
      process.stdout.write(`${''.padEnd(7)}  -> ${row.signalTypes.join(', ')}\n`);
    }
  }

  if (values.check) {
    if (result.drift.length > 0) {
      process.stderr.write(`\nFIXTURE DRIFT:\n${result.drift.map((line) => `  - ${line}`).join('\n')}\n`);
      return 1;
    }
    process.stdout.write('\nNo drift: committed fixtures match a fresh regeneration.\n');
  } else {
    process.stdout.write(`\nWrote ${result.files.length} fixture files.\n`);
  }
  return 0;
}

process.exit(main());
