import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  loadCurrent: vi.fn(),
  loadHistory: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/internal/competitive-signals', () => ({
  generateCompetitiveSignals: mocks.generate,
  loadCurrentCompetitiveSignals: mocks.loadCurrent,
  loadHistoricalCompetitiveSignals: mocks.loadHistory,
}));

import { GET } from '../../apps/web/src/app/api/brands/[brandId]/signals/route';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ brandId: BRAND_ID }) };

function request(query: string) {
  return new Request(`http://localhost/api/brands/${BRAND_ID}/signals?${query}`);
}

describe('GET /api/brands/:brandId/signals', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
    mocks.loadCurrent.mockResolvedValue({
      status: 'ok',
      projection: { ruleVersion: 'competitive-signals-v1', signals: [], unresolved: [] },
    });
    mocks.loadHistory.mockResolvedValue({ status: 'ok', signals: [] });
  });

  it('requires an explicit, valid view and current competitors', async () => {
    expect((await GET(request(''), context)).status).toBe(400);
    expect((await GET(request('view=current'), context)).status).toBe(400);
    expect((await GET(request('view=invalid'), context)).status).toBe(400);
  });

  it('returns a same-tenant current projection from the RLS-aware service', async () => {
    const response = await GET(request(`view=current&competitorIds=${COMPETITOR_ID}`), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ruleVersion: 'competitive-signals-v1',
      signals: [],
      unresolved: [],
    });
    expect(mocks.loadCurrent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ brandId: BRAND_ID, competitorIds: [COMPETITOR_ID] }),
    );
  });

  it('returns immutable history and maps RLS-hidden cross-tenant brands to not found', async () => {
    expect((await GET(request('view=history'), context)).status).toBe(200);
    expect(mocks.loadHistory).toHaveBeenCalledWith(expect.anything(), { brandId: BRAND_ID });

    mocks.loadCurrent.mockResolvedValueOnce({ status: 'brand_not_found' });
    expect(
      (await GET(request(`view=current&competitorIds=${COMPETITOR_ID}`), context)).status,
    ).toBe(404);
  });

  it('requires authentication before exposing either view', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET(request('view=history'), context)).status).toBe(401);
    expect(mocks.loadHistory).not.toHaveBeenCalled();
  });
});
