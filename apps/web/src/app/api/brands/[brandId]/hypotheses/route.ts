import { parseBrandComparisonRequest } from '@rivallens/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  generateStrategicHypotheses,
  loadCurrentStrategicHypotheses,
  loadHistoricalStrategicHypotheses,
} from '@/lib/internal/strategic-hypotheses';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const brandIdSchema = z.string().uuid();
const hypothesisGenerationRequestSchema = z
  .object({
    competitorIds: z.array(z.string().uuid()).min(1).max(5),
  })
  .strict();
const hypothesesViewSchema = z.enum(['current', 'history']);

function parseCompetitorIds(url: URL): string[] | null {
  const value = url.searchParams.get('competitorIds');
  if (!value) return null;
  try {
    return parseBrandComparisonRequest({
      competitorIds: value
        .split(',')
        .map((competitorId) => competitorId.trim())
        .filter(Boolean),
    }).competitorIds;
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: { params: Promise<{ brandId: string }> }) {
  const { brandId: rawBrandId } = await context.params;
  const brandIdResult = brandIdSchema.safeParse(rawBrandId);
  if (!brandIdResult.success) {
    return NextResponse.json({ error: 'Invalid brand id.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const view = hypothesesViewSchema.safeParse(url.searchParams.get('view'));
  if (!view.success) {
    return NextResponse.json({ error: 'Invalid hypotheses view.' }, { status: 400 });
  }
  const competitorIds = parseCompetitorIds(url);
  if (!competitorIds) {
    return NextResponse.json({ error: 'Invalid comparison request.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    if (view.data === 'current') {
      const result = await loadCurrentStrategicHypotheses(supabase, {
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
      return NextResponse.json(result.projection);
    }

    const result = await loadHistoricalStrategicHypotheses(supabase, {
      brandId: brandIdResult.data,
      competitorIds,
    });
    if (result.status === 'brand_not_found') {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    if (result.status === 'competitors_not_found') {
      return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
    }
    return NextResponse.json(result.hypotheses);
  } catch {
    return NextResponse.json({ error: 'Unable to load strategic hypotheses.' }, { status: 500 });
  }
}

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

  const payload = hypothesisGenerationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!payload.success) {
    return NextResponse.json(
      { error: 'Invalid hypothesis generation request.' },
      { status: 400 },
    );
  }

  try {
    const result = await generateStrategicHypotheses(supabase, {
      brandId: brandIdResult.data,
      competitorIds: [...new Set(payload.data.competitorIds)],
      generatedAt: new Date().toISOString(),
    });
    if (result.status === 'brand_not_found') {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 });
    }
    if (result.status === 'competitors_not_found') {
      return NextResponse.json({ error: 'Competitors not found.' }, { status: 404 });
    }
    return NextResponse.json(result.hypotheses);
  } catch {
    return NextResponse.json(
      { error: 'Unable to generate strategic hypotheses.' },
      { status: 500 },
    );
  }
}
