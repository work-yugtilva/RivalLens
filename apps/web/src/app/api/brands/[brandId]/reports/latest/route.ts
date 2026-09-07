import { parseBrandComparisonRequest } from '@rivallens/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadLatestCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const brandIdSchema = z.string().uuid();

export async function GET(request: Request, context: { params: Promise<{ brandId: string }> }) {
  const { brandId: rawBrandId } = await context.params;
  const brandId = brandIdSchema.safeParse(rawBrandId);
  if (!brandId.success) {
    return NextResponse.json({ error: 'Invalid brand id.' }, { status: 400 });
  }

  let competitorIds: string[];
  try {
    competitorIds = parseBrandComparisonRequest({
      competitorIds: (new URL(request.url).searchParams.get('competitorIds') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    }).competitorIds.sort();
  } catch {
    return NextResponse.json({ error: 'Invalid report request.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const result = await loadLatestCompetitiveIntelligenceReport(supabase, {
      brandId: brandId.data,
      competitorIds,
    });
    if (result.status === 'brand_not_found') {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    if (result.status === 'competitors_not_found') {
      return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
    }
    if (result.status === 'report_not_found') {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }
    return NextResponse.json(result.report);
  } catch {
    return NextResponse.json({ error: 'Unable to load report.' }, { status: 500 });
  }
}
