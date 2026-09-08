import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { pageTypeLabel } from './labels';
import { formatDateTime } from './time';

/**
 * The Overview's brand scope. Every read here goes through the RLS-aware
 * client, so organization membership is what decides visibility.
 */

const brandRowSchema = z
  .object({ id: z.string().uuid(), name: z.string().min(1), domain: z.string().min(1) })
  .strict();

const competitorRowSchema = z
  .object({ id: z.string().uuid(), name: z.string().min(1), domain: z.string().min(1) })
  .strict();

const sourceRowSchema = z
  .object({
    source_type: z.string().min(1),
    competitor_id: z.string().uuid().nullable(),
    last_collected_at: z.string().nullable(),
  })
  .strict();

export type BrandContext = {
  brandId: string;
  brandName: string;
  ownedDomain: string;
  competitors: { id: string; name: string; domain: string }[];
  /** Latest source collection instant across the brand, formatted for display. */
  sourcesRefreshedLabel: string | null;
  sourcesRefreshedAt: string | null;
  /** Human page-type labels captured for the competitors in scope. */
  capturedPageTypes: string[];
};

export type BrandContextResult =
  | { status: 'ok'; context: BrandContext }
  | { status: 'no_brand' };

export async function loadBrandContext(supabase: SupabaseClient): Promise<BrandContextResult> {
  const { data: brandRows, error: brandError } = await supabase
    .from('brands')
    .select('id, name, domain')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);
  if (brandError) throw new Error(brandError.message);

  const brand = brandRows?.[0] ? brandRowSchema.parse(brandRows[0]) : null;
  if (!brand) return { status: 'no_brand' };

  const { data: competitorRows, error: competitorError } = await supabase
    .from('competitors')
    .select('id, name, domain')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (competitorError) throw new Error(competitorError.message);

  const competitors = (competitorRows ?? []).map((row) => competitorRowSchema.parse(row));

  const { data: sourceRows, error: sourceError } = await supabase
    .from('sources')
    .select('source_type, competitor_id, last_collected_at')
    .eq('brand_id', brand.id)
    .eq('connector_type', 'website');
  if (sourceError) throw new Error(sourceError.message);

  const sources = (sourceRows ?? []).map((row) => sourceRowSchema.parse(row));
  const refreshedAt = sources.reduce<string | null>((latest, source) => {
    const collected = source.last_collected_at;
    if (!collected) return latest;
    return !latest || collected > latest ? collected : latest;
  }, null);

  const capturedPageTypes = [
    ...new Set(
      sources
        .filter((source) => source.competitor_id !== null)
        .map((source) => pageTypeLabel(source.source_type)),
    ),
  ].sort();

  return {
    status: 'ok',
    context: {
      brandId: brand.id,
      brandName: brand.name,
      ownedDomain: brand.domain,
      competitors,
      sourcesRefreshedLabel: refreshedAt ? formatDateTime(refreshedAt) : null,
      sourcesRefreshedAt: refreshedAt,
      capturedPageTypes,
    },
  };
}

/** Reports are keyed by their exact competitor set, and the contract caps it at five. */
const MAX_COMPETITORS_PER_REPORT = 5;

/**
 * Resolves the competitor scope for a report request. An explicit selection is
 * honoured only when every id belongs to the brand; otherwise the report covers
 * every competitor, so that reading and generating always use the same key.
 */
export function resolveCompetitorScope(
  context: BrandContext,
  requested: string[] | undefined,
): string[] {
  const owned = new Set(context.competitors.map((competitor) => competitor.id));
  const selected = [...new Set((requested ?? []).filter((id) => owned.has(id)))];
  if (selected.length > 0) return selected.slice(0, MAX_COMPETITORS_PER_REPORT).sort();
  return context.competitors
    .slice(0, MAX_COMPETITORS_PER_REPORT)
    .map((competitor) => competitor.id)
    .sort();
}
