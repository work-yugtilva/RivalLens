import { AppShell } from '@/components/app-shell/app-shell';
import type { ReportStatusView, ShellContextView } from '@/lib/overview/types';
import { ComparisonSetMenu } from './comparison-set-menu';
import {
  GenerationFeedback,
  GenerationProvider,
  type GenerateReportAction,
} from './generation-form';
import {
  MobileRegenerateButton,
  RegenerateButton,
  ReportHeader,
  StatusLine,
} from './report-header';

/** The same stable shell is used for loaded, loading, empty and error states. */
export function OverviewFrame({
  shellContext,
  brand,
  sourcesRefreshed,
  status,
  regenerate,
  children,
}: {
  shellContext: ShellContextView;
  brand: { id: string; domain: string };
  sourcesRefreshed: string | null;
  status: ReportStatusView | null;
  regenerate: GenerateReportAction;
  children: React.ReactNode;
}) {
  const domains = shellContext.competitors
    .filter((c) => shellContext.selectedCompetitorIds.includes(c.id))
    .map((c) => c.domain);
  const pair =
    domains.length === 0
      ? brand.domain
      : `${brand.domain} vs ${domains.length === 1 ? domains[0] : `${domains.length} competitors`}`;
  return (
    <GenerationProvider generate={regenerate}>
      <a
        href="#overview-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-white focus:p-3 focus:text-rl-indigo focus:outline-2"
      >
        Skip to report
      </a>
      <AppShell
        nav={{
          brands: [brand],
          activeBrandId: brand.id,
          activeDomain: brand.domain,
          sourcesRefreshed,
        }}
        screenName="Overview"
        comparisonPair={pair}
        tabletActions={
          <div className="flex items-center gap-2">
            <ComparisonSetMenu context={shellContext} />
            <RegenerateButton competitorIds={shellContext.selectedCompetitorIds} variant="ghost" />
          </div>
        }
        mobileAction={
          <MobileRegenerateButton
            key="mobile-regenerate"
            competitorIds={shellContext.selectedCompetitorIds}
          />
        }
      >
        <main
          id="overview-content"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col focus:outline-none"
        >
          <h1 className="sr-only">Latest competitive intelligence report</h1>
          {status ? (
            <StatusLine
              status={status}
              className="flex-none border-b border-rl-rule-item px-4 py-[13px] tablet:hidden"
            />
          ) : null}
          <ReportHeader status={status} context={shellContext} />
          <div data-report-scroll className="min-h-0 flex-1 overflow-y-auto">
            <div className="pt-0 tablet:px-8 tablet:pt-6 xl:pt-10 xl:pr-0 xl:pl-16">
              {status ? (
                <StatusLine status={status} className="mb-5 hidden tablet:flex xl:hidden" />
              ) : null}
              <GenerationFeedback />
              {children}
            </div>
          </div>
        </main>
      </AppShell>
    </GenerationProvider>
  );
}
