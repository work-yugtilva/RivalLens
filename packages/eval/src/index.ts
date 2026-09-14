// @rivallens/eval — Phase 4A frozen-fixture real-model evaluation harness.
// Provider-neutral. Does not select a production model. Does not persist.
// The CLI lives at ./cli/main.ts (`pnpm eval:intelligence`).

export * from './config/evaluationVersion';
export * from './config/models';
export * from './config/env';
export * from './config/gates';
export * from './metrics/mapping';
export * from './metrics/latency';
export * from './metrics/perRun';
export * from './metrics/aggregate';
export * from './pricing/pricing';
export * from './rubric/rubric';
export * from './rubric/template';
export * from './rubric/judge';
export * from './gates/trustBoundary';
export * from './gates/eligibility';
export * from './fixtures/schema';
export * from './fixtures/load';
export * from './fixtures/builders';
export * from './fixtures/definitions';
export * from './fixtures/author';
export * from './providers/factory';
export * from './runner/runFixtureModel';
export * from './runner/runSuite';
export * from './report/runRecord';
export * from './report/summary';
export * from './report/write';
export * from './cli/args';
export * from './cli/plan';
export * from './cli/run';
