import { executeEval } from './run';

// `pnpm eval:intelligence [flags]` — see ./args.ts for the flag list.
// Without --live no provider network request is made. Never run a paid benchmark from
// normal verification.
executeEval(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
