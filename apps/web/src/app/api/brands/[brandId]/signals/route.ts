import { parseBrandComparisonRequest } from '@rivallens/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateCompetitiveSignals } from '@/lib/internal/competitive-signals';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const brandIdSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ brandId: string }> }) {
  const { brandId: rawBrandId } = await context.params;
  const brandIdResult = brandIdSchema.safeParse(rawBrandId);
  if (!brandIdResult.success) {
    return NextResponse.json({ error: 'Invalid brand id.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let competitorIds: string[];
  try {
    ({ competitorIds } = parseBrandComparisonRequest(await request.json()));
  } catch {
    return NextResponse.json({ error: 'Invalid comparison request.' }, { status: 400 });
  }

  try {
    const result = await generateCompetitiveSignals(supabase, {
      brandId: brandIdResult.data,
      competitorIds,
      generatedAt: new Date().toISOString(),
    });
    if (result.status === 'brand_not_found') {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    if (result.status === 'competitors_not_found') {
      return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
    }
    return NextResponse.json(result.signals);
  } catch {
    return NextResponse.json({ error: 'Unable to generate competitive signals.' }, { status: 500 });
  }
}
