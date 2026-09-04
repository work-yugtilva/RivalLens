import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { WebsiteRefreshTarget } from '@/lib/internal/website-collection';
import { discoveredSourceSchema } from '@rivallens/schemas';

export async function loadAuthorizedWebsiteTarget(subjectType: 'brand' | 'competitor', subjectId: string) {
  const supabase = await createServerSupabaseClient();

  if (subjectType === 'brand') {
    const { data, error } = await supabase
      .from('brands')
      .select('id, organization_id, domain')
      .eq('id', subjectId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      organizationId: data.organization_id,
      brandId: data.id,
      competitorId: null,
      subjectId: data.id,
      domain: data.domain,
    } satisfies WebsiteRefreshTarget & { domain: string };
  }

  const { data, error } = await supabase
    .from('competitors')
    .select('id, domain, brands(id, organization_id)')
    .eq('id', subjectId)
    .maybeSingle();
  const brand = Array.isArray(data?.brands) ? data.brands[0] : data?.brands;
  if (error || !data || !brand) return null;

  return {
    organizationId: brand.organization_id,
    brandId: brand.id,
    competitorId: data.id,
    subjectId: data.id,
    domain: data.domain,
  } satisfies WebsiteRefreshTarget & { domain: string };
}

export async function loadAuthorizedWebsiteSource(sourceId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('sources')
    .select('id, brand_id, competitor_id, connector_type, source_type, canonical_url, brands(organization_id)')
    .eq('id', sourceId)
    .maybeSingle();
  const brand = Array.isArray(data?.brands) ? data.brands[0] : data?.brands;
  if (error || !data || !brand) return null;

  return {
    target: {
      organizationId: brand.organization_id,
      brandId: data.brand_id,
      competitorId: data.competitor_id,
      subjectId: data.competitor_id ?? data.brand_id,
    } satisfies WebsiteRefreshTarget,
    source: discoveredSourceSchema.parse({
      connectorType: data.connector_type,
      sourceType: data.source_type,
      canonicalUrl: data.canonical_url,
    }),
  };
}
