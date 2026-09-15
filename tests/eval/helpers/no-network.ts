// Proves the evaluation-harness unit suite performs zero network I/O.
// Any attempt to call fetch() during `pnpm test:eval` throws immediately.
const blocked = () => {
  throw new Error('tests/eval must not perform network I/O (mock-only). A live provider call was attempted.');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = blocked;
