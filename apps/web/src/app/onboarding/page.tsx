import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createBrandAndCompetitors } from './actions';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect('/login');

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, organizations(name)')
    .eq('user_id', authData.user.id);

  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>Set up your brand</h1>
      <p>Phase 0 captures tenant-safe brand and competitor records. Analysis begins in Phase 1.</p>
      {created ? <p role="status">Brand foundation saved.</p> : null}
      <form action={createBrandAndCompetitors} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        {memberships && memberships.length > 0 ? (
          <label>
            Active organization
            <select required defaultValue="" name="organizationId" style={{ display: 'block', width: '100%' }}>
              <option disabled value="">
                Choose an organization
              </option>
              {memberships.map((membership) => (
                <option key={membership.organization_id} value={membership.organization_id}>
                  {membership.organizations?.[0]?.name ?? membership.organization_id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Organization name
            <input required name="organizationName" style={{ display: 'block', width: '100%' }} />
          </label>
        )}
        <label>
          Brand name
          <input required name="brandName" style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Brand domain
          <input required name="brandDomain" placeholder="example.com" style={{ display: 'block', width: '100%' }} />
        </label>
        {[0, 1, 2].map((index) => (
          <label key={index}>
            Competitor domain {index + 1}
            <input name="competitorDomain" placeholder="competitor.com" style={{ display: 'block', width: '100%' }} />
          </label>
        ))}
        <Button type="submit">Save foundation data</Button>
      </form>
    </main>
  );
}
