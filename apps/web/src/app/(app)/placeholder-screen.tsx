import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { loadBrandContext } from '@/lib/overview/brand-context';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * The other five nav destinations exist so that navigation, active states and
 * the Overview's outbound links are real. They are deliberately not built out:
 * only Overview is in scope for this slice.
 */
export async function PlaceholderScreen({
  screenName,
  summary,
}: {
  screenName: string;
  summary: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect('/login');

  const loaded = await loadBrandContext(supabase);
  if (loaded.status !== 'ok') redirect('/onboarding');

  const context = loaded.context;

  return (
    <AppShell
      nav={{
        brands: [{ id: context.brandId, domain: context.ownedDomain }],
        activeBrandId: context.brandId,
        activeDomain: context.ownedDomain,
        sourcesRefreshed: context.sourcesRefreshedLabel,
      }}
      screenName={screenName}
      comparisonPair={context.ownedDomain}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="hidden h-20 flex-none items-center border-b border-rl-rule bg-white pr-8 pl-16 xl:flex">
          <h1 className="text-15 font-semibold tracking-[-0.012em]">{screenName}</h1>
        </header>
        <div className="px-4 pt-6 tablet:px-8 xl:max-w-[896px] xl:pt-10 xl:pl-16">
          <h2 className="text-17 font-semibold tracking-[-0.015em] xl:hidden">{screenName}</h2>
          <p className="mt-2 text-14 leading-[1.55] text-rl-muted xl:mt-0">{summary}</p>
        </div>
      </div>
    </AppShell>
  );
}
