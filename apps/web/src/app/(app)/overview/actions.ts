'use server';

import { parseBrandComparisonRequest } from '@rivallens/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { generateCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import { loadBrandContext, resolveCompetitorScope } from '@/lib/overview/brand-context';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const competitorIdsSchema = z.array(z.string().uuid()).max(5);

/**
 * Regenerates the whole report for the competitor set currently on screen.
 * There is no per-item equivalent: a report is composed as a whole, so it is
 * only ever regenerated as a whole.
 */
export async function regenerateReport(formData: FormData): Promise<void> {
  const requested = competitorIdsSchema.safeParse(formData.getAll('competitorIds').map(String));

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect('/login');

  const loaded = await loadBrandContext(supabase);
  if (loaded.status !== 'ok') redirect('/onboarding');

  const competitorIds = resolveCompetitorScope(
    loaded.context,
    requested.success ? requested.data : undefined,
  );
  if (competitorIds.length === 0) redirect('/onboarding');

  await generateCompetitiveIntelligenceReport(supabase, {
    brandId: loaded.context.brandId,
    competitorIds: parseBrandComparisonRequest({ competitorIds }).competitorIds,
    generatedAt: new Date().toISOString(),
  });

  revalidatePath('/overview');
}
