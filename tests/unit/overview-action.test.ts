import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  server: vi.fn(),
  getUser: vi.fn(),
  context: vi.fn(),
  scope: vi.fn(),
  generate: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('../../apps/web/node_modules/next/cache.js', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('../../apps/web/node_modules/next/navigation.js', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT:')) throw error;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.server }));
vi.mock('@/lib/overview/brand-context', () => ({
  loadBrandContext: mocks.context,
  resolveCompetitorScope: mocks.scope,
}));
vi.mock('@/lib/internal/competitive-reports', () => ({
  generateCompetitiveIntelligenceReport: mocks.generate,
}));
import { regenerateReport } from '../../apps/web/src/app/(app)/overview/actions';

const brandId = '00000000-0000-4000-8000-000000000001';
const competitorId = '00000000-0000-4000-8000-000000000002';
const supabase = { auth: { getUser: mocks.getUser } };
function request() {
  const data = new FormData();
  data.set('competitorIds', competitorId);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.server.mockResolvedValue(supabase);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
  mocks.context.mockResolvedValue({ status: 'ok', context: { brandId } });
  mocks.scope.mockReturnValue([competitorId]);
  mocks.generate.mockResolvedValue({ status: 'ok' });
});

describe('whole-report generation feedback', () => {
  it('uses the authenticated client and only refreshes after successful generation', async () => {
    expect(await regenerateReport(request())).toEqual({
      status: 'success',
      message: 'The latest report is ready.',
    });
    expect(mocks.generate).toHaveBeenCalledWith(supabase, {
      brandId,
      competitorIds: [competitorId],
      generatedAt: expect.any(String),
    });
    expect(mocks.revalidate).toHaveBeenCalledWith('/overview');
  });
  it('validates selection before loading or generating', async () => {
    const data = request();
    data.set('competitorIds', 'invalid');
    expect((await regenerateReport(data)).status).toBe('error');
    expect(mocks.server).not.toHaveBeenCalled();
  });
  it('returns recoverable scope failure without announcing success', async () => {
    mocks.generate.mockResolvedValue({ status: 'scope_not_found' });
    expect((await regenerateReport(request())).message).toContain('Reload the Overview');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('handles failures without exposing internal exception details', async () => {
    mocks.generate.mockRejectedValue(new Error('sensitive provider or database detail'));
    expect(await regenerateReport(request())).toEqual({
      status: 'error',
      message:
        'The report could not be generated. Your saved evidence and reports are safe. Try generating again.',
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('handles connection/context failures as recoverable errors', async () => {
    mocks.context.mockRejectedValue(new Error('connection failed'));
    expect((await regenerateReport(request())).status).toBe('error');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('preserves the framework login redirect for an expired session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(regenerateReport(request())).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
