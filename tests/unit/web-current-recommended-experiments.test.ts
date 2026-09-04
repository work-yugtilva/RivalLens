import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CurrentStrategicHypothesesProjection,
  RecommendedExperimentCandidate,
} from '../../packages/schemas/src';
import {
  BRAND_ID,
  COMPETITOR_ID,
  uuid,
  shipping,
  hypotheses,
} from './fixtures/current-experiments';

const mocks = vi.hoisted(() => ({
  loadCurrent: vi.fn(),
  loadSignals: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../apps/web/src/lib/internal/strategic-hypotheses', () => ({
  loadCurrentStrategicHypotheses: mocks.loadCurrent,
}));
vi.mock('../../apps/web/src/lib/internal/competitive-signals', () => ({
  loadHistoricalCompetitiveSignals: mocks.loadSignals,
}));
vi.mock('../../apps/web/src/lib/internal/supabase-admin', () => ({
  createInternalSupabaseAdminClient: mocks.admin,
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.server }));
vi.mock(
  '@/lib/internal/recommended-experiments',
  async () => import('../../apps/web/src/lib/internal/recommended-experiments'),
);
import { GET, POST } from '../../apps/web/src/app/api/brands/[brandId]/experiments/route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let reads: Array<{ table: string; filters: Array<[string, unknown]> }>;
let current: CurrentStrategicHypothesesProjection;
let signals: ReturnType<typeof shipping>[];

// Read-only Supabase surface. Writes exist only on the separately mocked admin RPC.
function from(table: string) {
  const filters: Array<[string, unknown]> = [];
  const order: Array<[string, boolean]> = [];
  let single = false;
  reads.push({ table, filters });
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    in: (key: string, value: unknown[]) => {
      filters.push([key, value]);
      return query;
    },
    order: (key: string, options: { ascending: boolean }) => {
      order.push([key, options.ascending]);
      return query;
    },
    maybeSingle: () => {
      single = true;
      return query;
    },
    then: (done: (result: { data: Row[] | Row | null; error: null }) => unknown) => {
      const rows = (tables[table] ?? []).filter((row) =>
        filters.every(([key, value]) =>
          Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
        ),
      );
      rows.sort((left, right) => {
        for (const [key, ascending] of order) {
          const comparison = String(left[key]).localeCompare(String(right[key]));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      return Promise.resolve(done({ data: single ? (rows[0] ?? null) : rows, error: null }));
    },
  };
  return query;
}
function row(candidate: RecommendedExperimentCandidate, id: string): Row {
  return {
    id,
    owned_brand_id: candidate.ownedBrandId,
    competitor_id: candidate.competitorId,
    experiment_type: candidate.experimentType,
    title: candidate.title,
    objective: candidate.objective,
    hypothesis_under_test: candidate.hypothesisUnderTest,
    design: candidate.design,
    control_configuration: candidate.control,
    treatment_configuration: candidate.treatment,
    primary_metric: candidate.primaryMetric,
    guardrail_metrics: candidate.guardrailMetrics,
    duration_planning: candidate.durationPlanning,
    implementation_notes: candidate.implementationNotes,
    confidence_level: candidate.confidence.level,
    confidence_basis: candidate.confidence.basis,
    caveat_category: candidate.caveat.category,
    caveat_statement: candidate.caveat.statement,
    generated_at: candidate.generatedAt,
    experiment_engine_version: candidate.experimentEngineVersion,
    generation_provenance: candidate.generationProvenance,
    experiment_hash: candidate.experimentHash,
  };
}
const context = { params: Promise.resolve({ brandId: BRAND_ID }) };
const get = (view: string, competitorIds = COMPETITOR_ID) =>
  GET(
    new Request(
      `http://localhost/api/brands/${BRAND_ID}/experiments?view=${view}&competitorIds=${competitorIds}`,
    ),
    context,
  );
const post = () =>
  POST(
    new Request(`http://localhost/api/brands/${BRAND_ID}/experiments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ competitorIds: [COMPETITOR_ID] }),
    }),
    context,
  );
const rows = () => [
  tables.recommended_experiments!.length,
  tables.recommended_experiment_hypotheses!.length,
];

beforeEach(() => {
  vi.resetAllMocks();
  tables = {
    brands: [{ id: BRAND_ID }],
    competitors: [{ id: COMPETITOR_ID, brand_id: BRAND_ID }],
    recommended_experiments: [],
    recommended_experiment_hypotheses: [],
  };
  reads = [];
  signals = [shipping()];
  current = {
    hypothesisEngineVersion: 'strategic-hypotheses-v1',
    hypotheses: hypotheses(signals),
    unresolved: [],
    generationNeeded: [],
  };
  mocks.loadCurrent.mockImplementation(async () => ({ status: 'ok', projection: current }));
  mocks.loadSignals.mockImplementation(async () => ({ status: 'ok', signals }));
  mocks.getUser.mockResolvedValue({ data: { user: { id: uuid(999) } }, error: null });
  mocks.server.mockResolvedValue({ from, auth: { getUser: mocks.getUser } });
  mocks.admin.mockReturnValue({ from, rpc: mocks.rpc });
  mocks.rpc.mockImplementation(
    async (name: string, payload: { p_experiments: RecommendedExperimentCandidate[] }) => {
      expect(name).toBe('persist_recommended_experiments');
      return {
        error: null,
        data: payload.p_experiments.map((candidate) => {
          const previous = tables.recommended_experiments!.find(
            (value) => value.experiment_hash === candidate.experimentHash,
          );
          if (previous)
            return { id: previous.id, experiment_hash: candidate.experimentHash, inserted: false };
          const id = uuid(200 + tables.recommended_experiments!.length);
          tables.recommended_experiments!.push(row(candidate, id));
          candidate.sourceHypothesisIds.forEach((hypothesis_id, position) =>
            tables.recommended_experiment_hypotheses!.push({
              experiment_id: id,
              position,
              hypothesis_id,
            }),
          );
          return { id, experiment_hash: candidate.experimentHash, inserted: true };
        }),
      };
    },
  );
});

describe('experiment GET/POST service lifecycle', () => {
  it('keeps GET read-only through reappearance, and only POST persists the exact new lineage', async () => {
    expect(await (await get('current')).json()).toMatchObject({
      experiments: [],
      generationNeeded: [{ sourceHypothesisIds: [current.hypotheses[0]!.id] }],
    });
    expect(await (await get('history')).json()).toEqual([]);
    expect(rows()).toEqual([0, 0]);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();

    const first = await (await post()).json();
    expect(first).toHaveLength(1);
    expect(await (await get('current')).json()).toMatchObject({
      experiments: first,
      generationNeeded: [],
    });
    current.hypotheses = [];
    expect(await (await get('current')).json()).toMatchObject({
      experiments: [],
      unresolved: [],
      generationNeeded: [],
    });
    expect(await (await get('history')).json()).toEqual(first);
    signals = [shipping(30)];
    current.hypotheses = hypotheses(signals, 300);
    expect(await (await get('current')).json()).toMatchObject({
      experiments: [],
      generationNeeded: [{ sourceHypothesisIds: [current.hypotheses[0]!.id] }],
    });
    expect(rows()).toEqual([1, 1]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    const second = await (await post()).json();
    expect(second[0].id).not.toBe(first[0].id);
    expect(await (await get('current')).json()).toMatchObject({
      experiments: second,
      generationNeeded: [],
    });
    expect(await (await post()).json()).toEqual(second);
    const snapshot = structuredClone(tables);
    const writes = mocks.rpc.mock.calls.length;
    const adminCalls = mocks.admin.mock.calls.length;
    expect(await (await get('history')).json()).toEqual([second[0], first[0]]);
    expect((await get('current')).status).toBe(200);
    expect(tables).toEqual(snapshot);
    expect(rows()).toEqual([2, 2]);
    expect(mocks.rpc).toHaveBeenCalledTimes(writes);
    expect(mocks.admin).toHaveBeenCalledTimes(adminCalls);
  });

  it('preserves unsupported-version history but never returns it as current', async () => {
    await post();
    tables.recommended_experiments![0]!.experiment_engine_version = 'recommended-experiments-v0';
    expect(await (await get('history')).json()).toMatchObject([
      { experimentEngineVersion: 'recommended-experiments-v0' },
    ]);
    expect(await (await get('current')).json()).toMatchObject({
      experiments: [],
      generationNeeded: [{}],
    });
    expect(rows()).toEqual([1, 1]);
  });

  it('returns unresolved metadata without dereferencing signals or persisting', async () => {
    await post();
    current.hypotheses = [];
    current.unresolved = [
      {
        logicalIdentity: {
          ownedBrandId: BRAND_ID,
          competitorId: COMPETITOR_ID,
          hypothesisType: 'competitor_may_reduce_shipping_friction',
        },
        state: 'unknown',
        unresolvedSignalDependencies: [
          {
            ownedBrandId: BRAND_ID,
            competitorId: COMPETITOR_ID,
            comparisonKey: 'offer.free_shipping_threshold',
            signalFamily: 'relative_numeric',
          },
        ],
      },
    ];
    mocks.loadSignals.mockClear();
    const result = await (await get('current')).json();
    expect(result).toMatchObject({
      experiments: [],
      generationNeeded: [],
      unresolved: [
        {
          state: 'unknown',
          reason: 'hypothesis_unresolved',
          unresolvedHypothesisDependency: current.unresolved[0],
        },
      ],
    });
    expect(mocks.loadSignals).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual([1, 1]);
  });

  it.each(['current', 'history'])(
    'authorizes and scopes %s reads and rejects competitor injection',
    async (view) => {
      expect((await get(view)).status).toBe(200);
      expect(reads).toEqual(
        expect.arrayContaining([
          { table: 'brands', filters: [['id', BRAND_ID]] },
          {
            table: 'competitors',
            filters: [
              ['brand_id', BRAND_ID],
              ['id', [COMPETITOR_ID]],
            ],
          },
          {
            table: 'recommended_experiments',
            filters: [
              ['owned_brand_id', BRAND_ID],
              ['competitor_id', [COMPETITOR_ID]],
            ],
          },
        ]),
      );
      tables.competitors!.push({ id: uuid(998), brand_id: uuid(997) });
      expect((await get(view, `${COMPETITOR_ID},${uuid(998)}`)).status).toBe(404);
      tables.brands = []; // An RLS-invisible brand, as exercised against Postgres by test:db.
      expect((await get(view)).status).toBe(404);
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );

  it.each(['current', 'history'])(
    'validates %s authentication, UUIDs, and bounded competitor selection',
    async (view) => {
      mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      expect((await get(view)).status).toBe(401);
      for (const ids of [
        '',
        'invalid',
        Array.from({ length: 6 }, (_, index) => uuid(index)).join(','),
      ])
        expect((await get(view, ids)).status).toBe(400);
      expect((await get(view, `${COMPETITOR_ID},${COMPETITOR_ID}`)).status).toBe(200);
      expect(
        (
          await GET(new Request(`http://localhost/?view=${view}&competitorIds=${COMPETITOR_ID}`), {
            params: Promise.resolve({ brandId: 'bad' }),
          })
        ).status,
      ).toBe(400);
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );

  it('requires an explicit supported view and hides integrity failures', async () => {
    expect((await get('invalid')).status).toBe(400);
    expect(
      (await GET(new Request(`http://localhost/?competitorIds=${COMPETITOR_ID}`), context)).status,
    ).toBe(400);
    signals = [];
    const response = await get('current');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to load recommended experiments.' });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
