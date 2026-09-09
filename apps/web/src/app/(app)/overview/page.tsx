import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OverviewFrame } from '@/components/overview/overview-frame';
import { OverviewReport } from '@/components/overview/overview-report';
import { NoReportState, ReportError, ReportSkeleton } from '@/components/overview/report-states';
import { loadLatestCompetitiveIntelligenceReport } from '@/lib/internal/competitive-reports';
import {
  loadBrandContext,
  resolveCompetitorScope,
  type BrandContext,
} from '@/lib/overview/brand-context';
import { resolveReportProvenance, unavailableReportProvenance } from '@/lib/overview/provenance';
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
    regenerate: regenerateReport,
  };
  return (
    <Suspense
      key={competitorIds.join(',')}
      fallback={
        <OverviewFrame {...frameProps} status={null}>
          <ReportSkeleton />
        </OverviewFrame>
      }
    >
      <LoadedOverview
        supabase={supabase}
        context={context}
        shellContext={shellContext}
        competitorIds={competitorIds}
      />
    </Suspense>
  );
}

async function LoadedOverview({
  supabase,
  context,
  shellContext,
  competitorIds,
}: {
  supabase: SupabaseClient;
  context: BrandContext;
  shellContext: ShellContextView;
  competitorIds: string[];
}) {
  const frameProps = {
    shellContext,
    brand: { id: context.brandId, domain: context.ownedDomain },
    sourcesRefreshed: context.sourcesRefreshedLabel,
    regenerate: regenerateReport,
  };

  if (competitorIds.length === 0) {
    return (
      <OverviewFrame {...frameProps} status={null}>
        <NoReportState competitorLabels={[]} ownedLabel={context.ownedDomain} competitorIds={[]} />
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
    provenance = { status: 'ok', provenance: unavailableReportProvenance(result.report) };
  }

  return (
    <OverviewFrame {...frameProps} status={view.status}>
      <OverviewReport
        key={result.report.id}
        report={view}
        drawers={
          provenance.status === 'ok'
            ? provenance.provenance
            : unavailableReportProvenance(result.report)
        }
        competitorIds={competitorIds}
      />
    </OverviewFrame>
  );
}

function requestedIds(raw: string | string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function competitorDomains(
  context: { competitors: { id: string; domain: string }[] },
  competitorIds: string[],
): string[] {
  return competitorIds
    .map((id) => context.competitors.find((competitor) => competitor.id === id)?.domain)
    .filter((domain): domain is string => domain !== undefined);
}
