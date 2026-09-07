import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const uuidSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ brandId: string; reportId: string }> },
) {
  const params = await context.params;
  const brandId = uuidSchema.safeParse(params.brandId);
  const reportId = uuidSchema.safeParse(params.reportId);
  if (!brandId.success || !reportId.success) {
    return NextResponse.json({ error: 'Invalid report request.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const result = await loadCompetitiveIntelligenceReport(supabase, {
      brandId: brandId.data,
      reportId: reportId.data,
    });
    if (result.status === 'brand_not_found') {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    if (result.status === 'competitors_not_found' || result.status === 'report_not_found') {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }
    return NextResponse.json(result.report);
  } catch {
    return NextResponse.json({ error: 'Unable to load report.' }, { status: 500 });
  }
}
