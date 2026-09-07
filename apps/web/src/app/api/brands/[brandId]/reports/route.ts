import { parseBrandComparisonRequest } from '@rivallens/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const brandIdSchema = z.string().uuid();
const reportGenerationRequestSchema = z
  .object({ competitorIds: z.array(z.string().uuid()).min(1).max(5) })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ brandId: string }> }) {
  const { brandId: rawBrandId } = await context.params;
  const brandId = brandIdSchema.safeParse(rawBrandId);
  if (!brandId.success) {
    return NextResponse.json({ error: 'Invalid brand id.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const payload = reportGenerationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid report generation request.' }, { status: 400 });
  }

  try {
    const { competitorIds } = parseBrandComparisonRequest({
      competitorIds: [...new Set(payload.data.competitorIds)],
    });
    const result = await generateCompetitiveIntelligenceReport(supabase, {
      brandId: brandId.data,
      competitorIds,
      generatedAt: new Date().toISOString(),
    });
    if (result.status === 'brand_not_found') {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    if (result.status === 'competitors_not_found') {
      return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
    }
    return NextResponse.json(result.report);
  } catch {
    return NextResponse.json({ error: 'Unable to generate report.' }, { status: 500 });
  }
}
