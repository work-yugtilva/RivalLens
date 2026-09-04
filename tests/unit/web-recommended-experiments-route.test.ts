import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), generate: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/internal/recommended-experiments', () => ({
  generateRecommendedExperiments: mocks.generate,
}));

import { POST } from '../../apps/web/src/app/api/brands/[brandId]/experiments/route';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_ID = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ brandId: BRAND_ID }) };
const request = (body: unknown) =>
  new Request(`http://localhost/api/brands/${BRAND_ID}/experiments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/brands/:brandId/experiments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
    mocks.generate.mockResolvedValue({ status: 'ok', experiments: [] });
  });

  it('validates brand, authentication, and a strict payload', async () => {
    expect(
      (
        await POST(request({ competitorIds: [COMPETITOR_ID] }), {
          params: Promise.resolve({ brandId: 'invalid' }),
        })
      ).status,
    ).toBe(400);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(request({ competitorIds: [COMPETITOR_ID] }), context)).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-id' } }, error: null });
    expect(
      (
        await POST(
          request({ competitorIds: [COMPETITOR_ID], hypothesisIds: [COMPETITOR_ID] }),
          context,
        )
      ).status,
    ).toBe(400);
  });

  it('deduplicates competitor scope and returns persisted experiments', async () => {
    const response = await POST(
      request({ competitorIds: [COMPETITOR_ID, SECOND_ID, COMPETITOR_ID] }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        brandId: BRAND_ID,
        competitorIds: [COMPETITOR_ID, SECOND_ID],
      }),
    );
  });

  it.each([
    ['brand_not_found', 'Brand not found.'],
    ['competitors_not_found', 'Competitors not found.'],
  ] as const)('maps %s to tenant-safe 404', async (status, error) => {
    mocks.generate.mockResolvedValueOnce({ status });
    const response = await POST(request({ competitorIds: [COMPETITOR_ID] }), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error });
  });

  it('hides internal failures', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('private detail'));
    const response = await POST(request({ competitorIds: [COMPETITOR_ID] }), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to generate recommended experiments.' });
  });
});
