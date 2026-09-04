import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  generate: vi.fn(),
  loadCurrent: vi.fn(),
  loadHistory: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/internal/strategic-hypotheses', () => ({
  generateStrategicHypotheses: mocks.generate,
  loadCurrentStrategicHypotheses: mocks.loadCurrent,
  loadHistoricalStrategicHypotheses: mocks.loadHistory,
}));

import { GET, POST } from '../../apps/web/src/app/api/brands/[brandId]/hypotheses/route';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_COMPETITOR_ID = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ brandId: BRAND_ID }) };

function request(body: unknown) {
  return new Request(`http://localhost/api/brands/${BRAND_ID}/hypotheses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(view: 'current' | 'history', competitorIds = COMPETITOR_ID) {
  return new Request(
    `http://localhost/api/brands/${BRAND_ID}/hypotheses?view=${view}&competitorIds=${competitorIds}`,
  );
}

describe('POST /api/brands/:brandId/hypotheses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
    mocks.generate.mockResolvedValue({ status: 'ok', hypotheses: [] });
  });

  it('requires a valid brand ID', async () => {
    const response = await POST(request({ competitorIds: [COMPETITOR_ID] }), {
      params: Promise.resolve({ brandId: 'invalid' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('requires authentication before accepting a generation request', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await POST(request({ competitorIds: [COMPETITOR_ID] }), context);

    expect(response.status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { competitorIds: [] },
    { competitorIds: ['invalid'] },
    { competitorIds: [COMPETITOR_ID], signalIds: [COMPETITOR_ID] },
  ])('rejects a non-strict generation payload', async (body) => {
    const response = await POST(request(body), context);

    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('passes deduplicated multi-competitor scope to the RLS-aware service', async () => {
    const response = await POST(
      request({ competitorIds: [COMPETITOR_ID, SECOND_COMPETITOR_ID, COMPETITOR_ID] }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        brandId: BRAND_ID,
        competitorIds: [COMPETITOR_ID, SECOND_COMPETITOR_ID],
      }),
    );
  });

  it.each([
    ['brand_not_found', 'Brand not found.'],
    ['competitors_not_found', 'Competitors not found.'],
  ] as const)('maps %s to a tenant-safe not-found response', async (status, error) => {
    mocks.generate.mockResolvedValueOnce({ status });

    const response = await POST(request({ competitorIds: [COMPETITOR_ID] }), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error });
  });

  it('does not expose internal generation errors', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('private database detail'));

    const response = await POST(request({ competitorIds: [COMPETITOR_ID] }), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to generate strategic hypotheses.' });
  });
});

describe('GET /api/brands/:brandId/hypotheses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
    mocks.loadCurrent.mockResolvedValue({
      status: 'ok',
      projection: {
        hypothesisEngineVersion: 'strategic-hypotheses-v1',
        hypotheses: [],
        unresolved: [],
        generationNeeded: [],
      },
    });
    mocks.loadHistory.mockResolvedValue({ status: 'ok', hypotheses: [] });
  });

  it.each([
    ['missing', new Request(`http://localhost/api/brands/${BRAND_ID}/hypotheses?competitorIds=${COMPETITOR_ID}`)],
    ['invalid', new Request(`http://localhost/api/brands/${BRAND_ID}/hypotheses?view=current&competitorIds=invalid`)],
  ])('rejects %s current-view input', async (_name, request) => {
    const response = await GET(request, context);

    expect(response.status).toBe(400);
    expect(mocks.loadCurrent).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('loads the current projection without invoking the generation write boundary', async () => {
    const response = await GET(getRequest('current'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hypothesisEngineVersion: 'strategic-hypotheses-v1' });
    expect(mocks.loadCurrent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ brandId: BRAND_ID, competitorIds: [COMPETITOR_ID] }),
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('returns immutable history through the separately authorized read path', async () => {
    const response = await GET(getRequest('history'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mocks.loadHistory).toHaveBeenCalledWith(expect.anything(), {
      brandId: BRAND_ID,
      competitorIds: [COMPETITOR_ID],
    });
    expect(mocks.loadCurrent).not.toHaveBeenCalled();
  });

  it.each([
    ['brand_not_found', 'Brand not found.'],
    ['competitors_not_found', 'Competitors not found.'],
  ] as const)('keeps current-view authorization failures tenant-safe', async (status, error) => {
    mocks.loadCurrent.mockResolvedValueOnce({ status });

    const response = await GET(getRequest('current'), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error });
  });
});
