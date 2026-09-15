import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompetitiveIntelligenceReportCandidate } from '../../packages/schemas/src';
import { previewReport } from '../../apps/web/src/lib/overview/preview-fixtures';
import { reportInput, BRAND_ID, COMPETITOR_ID, GENERATED_AT, uuid } from './fixtures/competitive-reports';

const mocks = vi.hoisted(() => ({
  loadComparison: vi.fn(),
  loadSignals: vi.fn(),
  loadHypotheses: vi.fn(),
  loadExperiments: vi.fn(),
  admin: vi.fn(),
  server: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../apps/web/src/lib/internal/brand-comparison', () => ({
  loadBrandComparison: mocks.loadComparison,
}));
vi.mock('../../apps/web/src/lib/internal/competitive-signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/web/src/lib/internal/competitive-signals')>()),
  loadHistoricalCompetitiveSignals: mocks.loadSignals,
}));
vi.mock('../../apps/web/src/lib/internal/strategic-hypotheses', () => ({
  loadHistoricalStrategicHypotheses: mocks.loadHypotheses,
}));
vi.mock('../../apps/web/src/lib/internal/recommended-experiments', () => ({
  loadHistoricalRecommendedExperiments: mocks.loadExperiments,
}));
vi.mock('../../apps/web/src/lib/internal/supabase-admin', () => ({
  createInternalSupabaseAdminClient: mocks.admin,
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.server }));
vi.mock(
  '@/lib/internal/competitive-reports',
  async () => import('../../apps/web/src/lib/internal/competitive-reports'),
);

import { POST } from '../../apps/web/src/app/api/brands/[brandId]/reports/route';
import { GET as GET_LATEST } from '../../apps/web/src/app/api/brands/[brandId]/reports/latest/route';
import { GET as GET_BY_ID } from '../../apps/web/src/app/api/brands/[brandId]/reports/[reportId]/route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let reads: Array<{ table: string; filters: Array<[string, unknown]> }>;

function same(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && typeof right === 'string' && /^\{.*\}$/.test(right)) {
    return JSON.stringify(left) === JSON.stringify(right.slice(1, -1).split(','));
  }
  return Array.isArray(left) && Array.isArray(right)
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right;
}

function from(table: string) {
  const filters: Array<[string, unknown]> = [];
  const orders: Array<[string, boolean]> = [];
  let maximum: number | undefined;
  let single = false;
  reads.push({ table, filters });
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    in: (key: string, values: unknown[]) => {
      filters.push([key, values]);
      return query;
    },
    order: (key: string, options: { ascending: boolean }) => {
      orders.push([key, options.ascending]);
      return query;
    },
    limit: (value: number) => {
      maximum = value;
      return query;
    },
    maybeSingle: () => {
      single = true;
      return query;
    },
    then: (done: (result: { data: Row | Row[] | null; error: null }) => unknown) => {
      let rows = (tables[table] ?? []).filter((row) =>
        filters.every(([key, value]) =>
          Array.isArray(value) && key !== 'competitor_ids'
            ? value.includes(row[key])
            : same(row[key], value),
        ),
      );
      rows.sort((left, right) => {
        for (const [key, ascending] of orders) {
          const comparison = String(left[key]).localeCompare(String(right[key]));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      if (maximum !== undefined) rows = rows.slice(0, maximum);
      return Promise.resolve(done({ data: single ? (rows[0] ?? null) : rows, error: null }));
    },
  };
  return query;
}

const context = { params: Promise.resolve({ brandId: BRAND_ID }) };
const post = (body: unknown = { competitorIds: [COMPETITOR_ID] }) =>
  POST(
    new Request(`http://localhost/api/brands/${BRAND_ID}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context,
  );
const latest = (ids = COMPETITOR_ID) =>
  GET_LATEST(
    new Request(`http://localhost/api/brands/${BRAND_ID}/reports/latest?competitorIds=${ids}`),
    context,
  );
const byId = (reportId: string) =>
  GET_BY_ID(new Request(`http://localhost/api/brands/${BRAND_ID}/reports/${reportId}`), {
    params: Promise.resolve({ brandId: BRAND_ID, reportId }),
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(GENERATED_AT));
  vi.resetAllMocks();
  const fixture = reportInput();
  tables = {
    brands: [{ id: BRAND_ID }],
    competitors: [{ id: COMPETITOR_ID, brand_id: BRAND_ID }],
    competitive_intelligence_reports: [],
  };
  reads = [];
  mocks.loadComparison.mockResolvedValue({
    status: 'ok',
    value: { comparison: fixture.comparison, subjectsEvidence: [] },
  });
  mocks.loadSignals.mockResolvedValue({ status: 'ok', signals: fixture.currentSignals });
  mocks.loadHypotheses.mockResolvedValue({
    status: 'ok',
    hypotheses: fixture.hypothesisProjection.hypotheses,
  });
  mocks.loadExperiments.mockResolvedValue({
    status: 'ok',
    experiments: fixture.experimentProjection.experiments,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: uuid(999) } }, error: null });
  mocks.server.mockResolvedValue({ from, auth: { getUser: mocks.getUser } });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(
    async (name: string, args: { p_report: CompetitiveIntelligenceReportCandidate }) => {
      expect(name).toBe('persist_competitive_intelligence_report');
      const previous = tables.competitive_intelligence_reports!.find(
        (row) => row.report_hash === args.p_report.reportHash,
      );
      if (previous) return { data: [{ id: previous.id, payload: previous.payload }], error: null };
      const id = uuid(500 + tables.competitive_intelligence_reports!.length);
      const payload = structuredClone(args.p_report);
      tables.competitive_intelligence_reports!.push({
        id,
        owned_brand_id: payload.brandId,
        competitor_ids: payload.competitors.map(({ id: competitorId }) => competitorId),
        report_engine_version: payload.reportEngineVersion,
        report_hash: payload.reportHash,
        generated_at: payload.generatedAt,
        payload,
      });
      return { data: [{ id, payload }], error: null };
    },
  );
});

afterEach(() => vi.useRealTimers());

describe('competitive report snapshot lifecycle', () => {
  it('persists a deterministic current report once and keeps both GET paths read-only', async () => {
    expect((await latest()).status).toBe(404);
    expect((await byId(uuid(888))).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
    const firstResponse = await post();
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json();
    expect(first).toMatchObject({
      id: uuid(500),
      brandId: BRAND_ID,
      competitors: [{ id: COMPETITOR_ID, name: 'rival.test' }],
      reportEngineVersion: 'competitive-report-v1',
      completeness: { state: 'complete' },
    });
    expect(first.sections.competitorAdvantages).toHaveLength(1);
    expect(mocks.loadComparison).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(tables.competitive_intelligence_reports).toHaveLength(1);

    vi.setSystemTime(new Date('2026-09-04T13:00:00.000Z'));
    expect(await (await post()).json()).toEqual(first);
    expect(tables.competitive_intelligence_reports).toHaveLength(1);
    const historyReads = [
      mocks.loadComparison.mock.calls.length,
      mocks.loadSignals.mock.calls.length,
      mocks.loadHypotheses.mock.calls.length,
      mocks.loadExperiments.mock.calls.length,
    ];
    const writes = mocks.rpc.mock.calls.length;
    const adminCalls = mocks.admin.mock.calls.length;
    const snapshot = structuredClone(tables);
    expect(await (await latest()).json()).toEqual(first);
    expect(await (await byId(first.id)).json()).toEqual(first);
    expect(tables).toEqual(snapshot);
    expect(mocks.rpc).toHaveBeenCalledTimes(writes);
    expect(mocks.admin).toHaveBeenCalledTimes(adminCalls);
    expect([
      mocks.loadComparison.mock.calls.length,
      mocks.loadSignals.mock.calls.length,
      mocks.loadHypotheses.mock.calls.length,
      mocks.loadExperiments.mock.calls.length,
    ]).toEqual(historyReads);
  });

  it('sorts and deduplicates latest scope, then requires exact array equality', async () => {
    const first = await (await post()).json();
    expect((await latest(`${COMPETITOR_ID},${COMPETITOR_ID}`)).status).toBe(200);
    expect(reads).toEqual(
      expect.arrayContaining([
        {
          table: 'competitive_intelligence_reports',
          filters: [
            ['owned_brand_id', BRAND_ID],
            ['competitor_ids', `{${COMPETITOR_ID}}`],
          ],
        },
      ]),
    );
    tables.competitive_intelligence_reports![0]!.competitor_ids = [COMPETITOR_ID, uuid(700)];
    expect((await latest()).status).toBe(404);
    expect((await byId(first.id)).status).toBe(404);
  });

  it('fails closed for an unsupported historical report engine', async () => {
    const first = await (await post()).json();
    const row = tables.competitive_intelligence_reports![0]!;
    row.report_engine_version = 'competitive-report-v2';
    row.generated_at = '2026-09-04T08:00:00-04:00';
    (row.payload as Record<string, unknown>).reportEngineVersion = 'competitive-report-v2';
    expect((await latest()).status).toBe(500);
    expect((await byId(first.id)).status).toBe(500);
  });

  it('hydrates v2 history through its explicit parser without exposing its generation run', async () => {
    const report = previewReport('llm-complete');
    const generationRunId = uuid(650);
    tables.competitive_intelligence_reports = [{
      id: report.id,
      owned_brand_id: report.brandId,
      competitor_ids: report.competitors.map(({ id }) => id),
      report_engine_version: report.reportEngineVersion,
      report_hash: report.reportHash,
      generated_at: report.generatedAt,
      generation_run_id: generationRunId,
      payload: Object.fromEntries(Object.entries(report).filter(([key]) => key !== 'id')),
    }];

    const loaded = await (await latest()).json();
    expect(loaded).toMatchObject({ id: report.id, reportEngineVersion: 'competitive-report-v2-llm' });
    expect(loaded).not.toHaveProperty('generationRunId');
    expect(JSON.stringify(loaded)).not.toContain(generationRunId);
  });

  it('snapshots generation gaps without creating upstream intelligence', async () => {
    mocks.loadSignals.mockResolvedValue({ status: 'ok', signals: [] });
    mocks.loadHypotheses.mockResolvedValue({ status: 'ok', hypotheses: [] });
    mocks.loadExperiments.mockResolvedValue({ status: 'ok', experiments: [] });

    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sourceIntelligence: { signalIds: [], hypothesisIds: [], experimentIds: [] },
      completeness: {
        state: 'insufficient',
        signals: { generationNeeded: [{}] },
        sections: {
          competitorAdvantages: { state: 'generation_required' },
          appearsToBeWorking: { state: 'generation_required' },
          whatToTestNext: { state: 'generation_required' },
        },
      },
      sections: {
        competitorAdvantages: [],
        appearsToBeWorking: [],
        whatToTestNext: [],
      },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0]?.[0]).toBe('persist_competitive_intelligence_report');
  });

  it('snapshots unresolved comparison and projection state', async () => {
    const unresolved = reportInput([
      {
        key: 'offer.free_shipping_threshold',
        owned: null,
        competitor: { threshold: 50 },
        numeric: { field: 'threshold', unit: 'usd' },
      },
    ]);
    mocks.loadComparison.mockResolvedValue({
      status: 'ok',
      value: { comparison: unresolved.comparison, subjectsEvidence: [] },
    });
    mocks.loadSignals.mockResolvedValue({ status: 'ok', signals: reportInput().currentSignals });
    mocks.loadHypotheses.mockResolvedValue({ status: 'ok', hypotheses: [] });
    mocks.loadExperiments.mockResolvedValue({ status: 'ok', experiments: [] });

    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      completeness: {
        state: 'insufficient',
        comparisonUnknown: [
          {
            competitorId: COMPETITOR_ID,
            comparisonKey: 'offer.free_shipping_threshold',
            subjectIds: [BRAND_ID],
          },
        ],
        signals: { unresolved: [{ state: 'unknown' }], generationNeeded: [] },
        sections: {
          competitorAdvantages: { state: 'unresolved' },
          appearsToBeWorking: { state: 'unresolved' },
          whatToTestNext: { state: 'unresolved' },
        },
      },
    });
  });
});

describe('competitive report route boundaries', () => {
  it('validates UUIDs, authentication, and strict bounded competitor input', async () => {
    expect(
      (
        await POST(new Request('http://localhost/', { method: 'POST', body: '{}' }), {
          params: Promise.resolve({ brandId: 'bad' }),
        })
      ).status,
    ).toBe(400);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await post()).status).toBe(401);
    expect((await post({ competitorIds: [COMPETITOR_ID], extra: true })).status).toBe(400);
    expect((await post({ competitorIds: [] })).status).toBe(400);
    expect(
      (await post({ competitorIds: Array.from({ length: 5 }, () => COMPETITOR_ID) })).status,
    ).toBe(200);
    expect(
      (await post({ competitorIds: Array.from({ length: 6 }, (_, index) => uuid(index + 10)) }))
        .status,
    ).toBe(400);
    expect((await latest('invalid')).status).toBe(400);
    expect((await latest('')).status).toBe(400);
    expect((await byId('invalid')).status).toBe(400);
  });

  it('maps RLS-hidden scope to tenant-safe 404 responses without privileged writes', async () => {
    tables.brands = [];
    expect((await latest()).status).toBe(404);
    expect((await byId(uuid(500))).status).toBe(404);
    mocks.loadComparison.mockResolvedValueOnce({ status: 'brand_not_found' });
    expect((await post()).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();

    tables.brands = [{ id: BRAND_ID }];
    tables.competitors = [];
    expect((await latest()).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('hides integrity and persistence failures', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ id: uuid(500), payload: { brandId: BRAND_ID } }],
      error: null,
    });
    expect(await (await post()).json()).toEqual({ error: 'Unable to generate report.' });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'report hash collision' },
    });
    const collision = await post();
    expect(collision.status).toBe(500);
    expect(await collision.json()).toEqual({ error: 'Unable to generate report.' });

    await post();
    const payload = structuredClone(
      tables.competitive_intelligence_reports![0]!.payload,
    ) as CompetitiveIntelligenceReportCandidate;
    payload.sourceStateHash =
      'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    mocks.rpc.mockResolvedValueOnce({
      data: [{ id: uuid(500), payload }],
      error: null,
    });
    const mismatched = await post();
    expect(mismatched.status).toBe(500);
    expect(await mismatched.json()).toEqual({ error: 'Unable to generate report.' });

    tables.competitive_intelligence_reports![0]!.report_hash =
      'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const response = await latest();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to load report.' });
  });
});
