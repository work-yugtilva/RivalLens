import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateRecommendedExperiments } from '@/lib/internal/recommended-experiments';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const brandIdSchema = z.string().uuid();
const experimentGenerationRequestSchema = z
  .object({
    competitorIds: z.array(z.string().uuid()).min(1).max(5),
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ brandId: string }> }) {
  const { brandId: rawBrandId } = await context.params;
  const brandId = brandIdSchema.safeParse(rawBrandId);
  if (!brandId.success) return NextResponse.json({ error: 'Invalid brand id.' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const payload = experimentGenerationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid experiment generation request.' }, { status: 400 });
  }

  try {
    const result = await generateRecommendedExperiments(supabase, {
      brandId: brandId.data,
      competitorIds: [...new Set(payload.data.competitorIds)],
      generatedAt: new Date().toISOString(),
    });
    if (result.status === 'brand_not_found')
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    if (result.status === 'competitors_not_found')
      return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
    return NextResponse.json(result.experiments);
  } catch {
    return NextResponse.json(
      { error: 'Unable to generate recommended experiments.' },
      { status: 500 },
    );
  }
}
