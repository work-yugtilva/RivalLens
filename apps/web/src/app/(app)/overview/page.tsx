import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { ComparisonSetMenu } from '@/components/overview/comparison-set-menu';
import { OverviewReport } from '@/components/overview/overview-report';
import {
  MobileRegenerateButton,
  RegenerateButton,
  ReportHeader,
  StatusLine,
} from '@/components/overview/report-header';
import { NoReportState, ReportError } from '@/components/overview/report-states';
import { loadLatestCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import { loadBrandContext, resolveCompetitorScope } from '@/lib/overview/brand-context';
import { resolveReportProvenance } from '@/lib/overview/provenance';
import { buildReportView } from '@/lib/overview/report-view';
import type { ShellContextView } from '@/lib/overview/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { regenerateReport } from './actions';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ competitorIds?: string | string[] }>;
}) {
  const { competitorIds: rawCompetitorIds } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect('/login');

  const loaded = await loadBrandContext(supabase);
  if (loaded.status !== 'ok') redirect('/onboarding');

  const context = loaded.context;
  const competitorIds = resolveCompetitorScope(context, requestedIds(rawCompetitorIds));
  const shellContext: ShellContextView = {
    ownedDomain: context.ownedDomain,
    competitors: context.competitors.map(({ id, domain }) => ({ id, domain })),
    selectedCompetitorIds: competitorIds,
    sourcesRefreshedLabel: context.sourcesRefreshedLabel,
  };

  const frameProps = {
    shellContext,
    brand: { id: context.brandId, domain: context.ownedDomain },
    sourcesRefreshed: context.sourcesRefreshedLabel,
  };

  if (competitorIds.length === 0) {
    return (
      <OverviewFrame {...frameProps} status={null}>
        <NoReportState
          competitorLabels={[]}
          ownedLabel={context.ownedDomain}
          generate={regenerateReport}
          competitorIds={[]}
        />
      </OverviewFrame>
    );
  }

  let result: Awaited<ReturnType<typeof loadLatestCompetitiveIntelligenceReport>>;
  try {
    result = await loadLatestCompetitiveIntelligenceReport(supabase, {
      brandId: context.brandId,
      competitorIds,
    });
  } catch {
    return (
      <OverviewFrame {...frameProps} status={null}>
        <ReportError />
      </OverviewFrame>
    );
  }

  if (result.status !== 'ok') {
    if (result.status === 'report_not_found') {
      return (
        <OverviewFrame {...frameProps} status={null}>
          <NoReportState
            competitorLabels={competitorDomains(context, competitorIds)}
            ownedLabel={context.ownedDomain}
            generate={regenerateReport}
            competitorIds={competitorIds}
          />
        </OverviewFrame>
      );
    }
    return (
      <OverviewFrame {...frameProps} status={null}>
        <ReportError detail="The brand or competitors for this report are no longer available." />
      </OverviewFrame>
    );
  }

  const view = buildReportView({
    report: result.report,
    sourcesCapturedAt: context.sourcesRefreshedAt,
    capturedPageTypes: context.capturedPageTypes,
    now: Date.now(),
  });

  let provenance: Awaited<ReturnType<typeof resolveReportProvenance>>;
  try {
    provenance = await resolveReportProvenance(supabase, result.report);
  } catch {
    return (
      <OverviewFrame {...frameProps} status={null}>
        <ReportError detail="The evidence behind this report could not be read." />
      </OverviewFrame>
    );
  }

  return (
    <OverviewFrame {...frameProps} status={view.status}>
      <OverviewReport
        report={view}
        drawers={provenance.status === 'ok' ? provenance.provenance : {}}
        competitorIds={competitorIds}
        regenerate={regenerateReport}
      />
    </OverviewFrame>
  );
}

/**
 * Shell plus report column. The header, the tablet meta line and the mobile
 * meta line all read from the same status, so completeness is stated once at
 * every width.
 */
function OverviewFrame({
  shellContext,
  brand,
  sourcesRefreshed,
  status,
  children,
}: {
  shellContext: ShellContextView;
  brand: { id: string; domain: string };
  sourcesRefreshed: string | null;
  status: React.ComponentProps<typeof StatusLine>['status'] | null;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      nav={{
        brands: [brand],
        activeBrandId: brand.id,
        activeDomain: brand.domain,
        sourcesRefreshed,
      }}
      screenName="Overview"
      comparisonPair={comparisonPair(brand.domain, shellContext)}
      tabletActions={
        <div className="flex items-center gap-2">
          <ComparisonSetMenu context={shellContext} />
          <RegenerateButton
            regenerate={regenerateReport}
            competitorIds={shellContext.selectedCompetitorIds}
            variant="ghost"
          />
        </div>
      }
      mobileAction={
        <MobileRegenerateButton
          regenerate={regenerateReport}
          competitorIds={shellContext.selectedCompetitorIds}
        />
      }
    >
      {status ? (
        <StatusLine
          status={status}
          className="border-b border-rl-rule-item px-4 py-[13px] tablet:hidden"
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status ? (
          <ReportHeader status={status} context={shellContext} regenerate={regenerateReport} />
        ) : null}
        <div className="pt-0 tablet:px-8 tablet:pt-6 xl:pt-10 xl:pr-0 xl:pl-16">
          {status ? (
            <StatusLine status={status} className="mb-5 hidden tablet:flex xl:hidden" />
          ) : null}
          {children}
        </div>
      </div>
    </AppShell>
  );
}

function requestedIds(raw: string | string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const values = Array.isArray(raw) ? raw : [raw];
  return values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function competitorDomains(
  context: { competitors: { id: string; domain: string }[] },
  competitorIds: string[],
): string[] {
  return competitorIds
    .map((id) => context.competitors.find((competitor) => competitor.id === id)?.domain)
    .filter((domain): domain is string => domain !== undefined);
}

function comparisonPair(ownedDomain: string, shellContext: ShellContextView): string {
  const domains = competitorDomains(shellContext, shellContext.selectedCompetitorIds);
  if (domains.length === 0) return ownedDomain;
  if (domains.length === 1) return `${ownedDomain} vs ${domains[0]}`;
  return `${ownedDomain} vs ${domains.length} competitors`;
}
