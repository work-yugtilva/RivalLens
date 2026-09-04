import { parseBrandComparisonRequest } from '@rivallens/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadBrandComparison } from '@/lib/internal/brand-comparison';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const brandIdSchema = z.string().uuid();

export async function GET(request: Request, context: { params: Promise<{ brandId: string }> }) {
  const { brandId: rawBrandId } = await context.params;
  const brandIdResult = brandIdSchema.safeParse(rawBrandId);
  if (!brandIdResult.success) {
    return NextResponse.json({ error: 'Invalid brand id.' }, { status: 400 });
  }
  const brandId = brandIdResult.data;

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const competitorIdsParam = new URL(request.url).searchParams.get('competitorIds');
  const competitorIdsInput = competitorIdsParam
    ? competitorIdsParam
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  let competitorIds: string[];
  try {
    ({ competitorIds } = parseBrandComparisonRequest({ competitorIds: competitorIdsInput }));
  } catch {
    return NextResponse.json({ error: 'Invalid comparison request.' }, { status: 400 });
  }

  let loaded;
  try {
    loaded = await loadBrandComparison(supabase, {
      brandId,
      competitorIds,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load comparison.' }, { status: 500 });
  }
  if (loaded.status === 'brand_not_found') {
    return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
  }
  if (loaded.status === 'competitors_not_found') {
    return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
  }

  return NextResponse.json(loaded.value.comparison);
}
