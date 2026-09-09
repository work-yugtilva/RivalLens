import { notFound } from 'next/navigation';
import { OverviewFrame } from '@/components/overview/overview-frame';
import { OverviewReport } from '@/components/overview/overview-report';
import type { GenerationResult } from '@/components/overview/generation-form';
import { NoReportState, ReportError, ReportSkeleton } from '@/components/overview/report-states';
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

async function noop(): Promise<GenerationResult> {
  'use server';
  return { status: 'success', message: 'Preview report is ready. No saved data was changed.' };
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
    <OverviewFrame
      shellContext={SHELL_CONTEXT}
      brand={{ id: BRAND_ID, domain: PREVIEW_OWNED_DOMAIN }}
      sourcesRefreshed={SHELL_CONTEXT.sourcesRefreshedLabel}
      status={view?.status ?? null}
      regenerate={noop}
    >
      {view ? (
        <OverviewReport report={view} drawers={previewDrawers(report!)} competitorIds={[]} />
      ) : null}

      {state === 'no-report' ? (
        <NoReportState
          competitorLabels={['rival.test']}
          ownedLabel={PREVIEW_OWNED_DOMAIN}
          competitorIds={[]}
        />
      ) : null}
      {state === 'loading' ? <ReportSkeleton /> : null}
      {state === 'error' ? <ReportError /> : null}
    </OverviewFrame>
  );
}
