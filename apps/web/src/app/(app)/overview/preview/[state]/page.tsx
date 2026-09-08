import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { OverviewReport } from '@/components/overview/overview-report';
import {
  MobileRegenerateButton,
  RegenerateButton,
  ReportHeader,
  StatusLine,
} from '@/components/overview/report-header';
import {
  NoReportState,
  ReportError,
  ReportSkeleton,
} from '@/components/overview/report-states';
import { ComparisonSetMenu } from '@/components/overview/comparison-set-menu';
import {
  isPreviewState,
  PREVIEW_CAPTURED_AT,
  PREVIEW_CAPTURED_PAGE_TYPES,
  PREVIEW_NOW,
  PREVIEW_OWNED_DOMAIN,
  PREVIEW_STATES,
  previewDrawers,
  previewReport,
} from '@/lib/overview/preview-fixtures';
import { buildReportView } from '@/lib/overview/report-view';
import type { ShellContextView } from '@/lib/overview/types';

/**
 * Development-only preview of every approved Overview state, so each one can be
 * compared against docs/design/final/ at a fixed width without a database. It
 * returns 404 in production.
 */
export const dynamic = 'force-static';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';

const SHELL_CONTEXT: ShellContextView = {
  ownedDomain: PREVIEW_OWNED_DOMAIN,
  competitors: [{ id: COMPETITOR_ID, domain: 'rival.test' }],
  selectedCompetitorIds: [COMPETITOR_ID],
  sourcesRefreshedLabel: '4 Sept 2026, 09:16',
};

export function generateStaticParams() {
  return PREVIEW_STATES.map((state) => ({ state }));
}

async function noop(): Promise<void> {
  'use server';
}

export default async function OverviewPreviewPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { state } = await params;
  if (!isPreviewState(state)) notFound();

  const report = previewReport(state);
  const view =
    report === null
      ? null
      : buildReportView({
          report,
          sourcesCapturedAt: PREVIEW_CAPTURED_AT,
          capturedPageTypes: PREVIEW_CAPTURED_PAGE_TYPES,
          now: PREVIEW_NOW,
        });

  return (
    <AppShell
      nav={{
        brands: [{ id: BRAND_ID, domain: PREVIEW_OWNED_DOMAIN }],
        activeBrandId: BRAND_ID,
        activeDomain: PREVIEW_OWNED_DOMAIN,
        sourcesRefreshed: SHELL_CONTEXT.sourcesRefreshedLabel,
      }}
      screenName="Overview"
      comparisonPair={`${PREVIEW_OWNED_DOMAIN} vs rival.test`}
      tabletActions={
        <div className="flex items-center gap-2">
          <ComparisonSetMenu context={SHELL_CONTEXT} />
          <RegenerateButton regenerate={noop} competitorIds={[]} variant="ghost" />
        </div>
      }
      mobileAction={<MobileRegenerateButton regenerate={noop} competitorIds={[]} />}
    >
      {view ? (
        <StatusLine
          status={view.status}
          className="border-b border-rl-rule-item px-4 py-[13px] tablet:hidden"
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view ? (
          <ReportHeader status={view.status} context={SHELL_CONTEXT} regenerate={noop} />
        ) : null}
        <div className="pt-0 tablet:px-8 tablet:pt-6 xl:pt-10 xl:pr-0 xl:pl-16">
          {view ? (
            <StatusLine status={view.status} className="mb-5 hidden tablet:flex xl:hidden" />
          ) : null}

          {view ? (
            <OverviewReport
              report={view}
              drawers={previewDrawers(view)}
              competitorIds={[]}
              regenerate={noop}
            />
          ) : null}

          {state === 'no-report' ? (
            <NoReportState
              competitorLabels={['rival.test']}
              ownedLabel={PREVIEW_OWNED_DOMAIN}
              generate={noop}
              competitorIds={[]}
            />
          ) : null}
          {state === 'loading' ? <ReportSkeleton /> : null}
          {state === 'error' ? <ReportError /> : null}
        </div>
      </div>
    </AppShell>
  );
}
