'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function normalizeDomain(value: string) {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!url.hostname || url.username || url.password || url.port) throw new Error('Enter a public domain only.');
  return url.hostname.toLowerCase();
}

function requiredFormValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export async function createBrandAndCompetitors(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect('/login');

  const selectedOrganizationId = String(formData.get('organizationId') ?? '').trim() || null;
  const organizationName = selectedOrganizationId ? null : requiredFormValue(formData, 'organizationName');
  const brandName = requiredFormValue(formData, 'brandName');
  const brandDomain = normalizeDomain(requiredFormValue(formData, 'brandDomain'));
  const competitorValues = formData
    .getAll('competitorDomain')
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map(normalizeDomain);

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', authData.user.id);
  if (membershipError) throw new Error(membershipError.message);

  const organizationMemberships = memberships ?? [];
  if (organizationMemberships.length > 0 && !selectedOrganizationId) {
    throw new Error('Choose an active organization.');
  }

  if (
    selectedOrganizationId &&
    !organizationMemberships.some((membership) => membership.organization_id === selectedOrganizationId)
  ) {
    throw new Error('You do not belong to the selected organization.');
  }

  const { error: onboardingError } = await supabase.rpc('create_onboarding_brand', {
    target_organization_id: selectedOrganizationId,
    organization_name: selectedOrganizationId ? null : organizationName,
    brand_name: brandName,
    brand_domain: brandDomain,
    competitor_domains: competitorValues,
  });
  if (onboardingError) throw new Error(onboardingError.message);

  revalidatePath('/onboarding');
  redirect('/onboarding?created=1');
}
