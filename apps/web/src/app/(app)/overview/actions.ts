'use server';

import { parseBrandComparisonRequest } from '@rivallens/domain';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import type { GenerationResult } from '@/components/overview/generation-form';
import { generateCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import { loadBrandContext, resolveCompetitorScope } from '@/lib/overview/brand-context';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const competitorIdsSchema = z.array(z.string().uuid()).max(5);

/**
 * Regenerates the whole report for the competitor set currently on screen.
 * There is no per-item equivalent: a report is composed as a whole, so it is
 * only ever regenerated as a whole.
 */
export async function regenerateReport(formData: FormData): Promise<GenerationResult> {
  const requested = competitorIdsSchema.safeParse(formData.getAll('competitorIds').map(String));

  if (!requested.success)
    return {
      status: 'error',
      message: 'The comparison selection is invalid. Reload the Overview and try again.',
    };
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) redirect('/login');

    const loaded = await loadBrandContext(supabase);
    if (loaded.status !== 'ok') redirect('/onboarding');

    const competitorIds = resolveCompetitorScope(loaded.context, requested.data);
    if (competitorIds.length === 0) redirect('/onboarding');

    const result = await generateCompetitiveIntelligenceReport(supabase, {
      brandId: loaded.context.brandId,
      competitorIds: parseBrandComparisonRequest({ competitorIds }).competitorIds,
      generatedAt: new Date().toISOString(),
    });

    if (result.status !== 'ok')
      return {
        status: 'error',
        message:
          'The brand or competitors are no longer available. Reload the Overview to update your selection.',
      };
    revalidatePath('/overview');
    return { status: 'success', message: 'The latest report is ready.' };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: 'error',
      message:
        'The report could not be generated. Your saved evidence and reports are safe. Try generating again.',
    };
  }
}
