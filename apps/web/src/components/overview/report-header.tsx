import type { ReportStatusView, ShellContextView } from '@/lib/overview/types';
import { cn } from '@/lib/utils';
import {
  CompleteIcon,
  MobileRefreshIcon,
  PartialIcon,
  RegenerateIcon,
} from '@/components/app-shell/icons';
import { ComparisonSetMenu } from './comparison-set-menu';

/**
 * The header states what the report is and how complete it is, then offers the
 * two things you can do to the report as a whole: change which competitors it
 * covers, and regenerate it. Neither is a per-item action.
 */
export function ReportHeader({
  status,
  context,
  regenerate,
}: {
  status: ReportStatusView;
  context: ShellContextView;
  regenerate: (formData: FormData) => Promise<void>;
}) {
  return (
    <header className="hidden h-20 flex-none items-center justify-between border-b border-rl-rule bg-white pr-8 pl-16 xl:flex">
      <div>
        <h1 className="text-15 font-semibold tracking-[-0.012em]">
          Latest competitive intelligence report
        </h1>
        <StatusLine status={status} className="mt-1.5" />
      </div>
      <div className="flex items-center gap-2">
        <ComparisonSetMenu context={context} />
        <RegenerateButton
          regenerate={regenerate}
          competitorIds={context.selectedCompetitorIds}
          variant="ghost"
        />
      </div>
    </header>
  );
}

/** Completeness, coverage and age, in that order, on one 13px line. */
export function StatusLine({
  status,
  className,
}: {
  status: ReportStatusView;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 text-13 text-rl-muted', className)}
    >
      <span className="inline-flex items-center gap-[5px] text-rl-body">
        {status.state === 'complete' ? (
          <CompleteIcon className="text-rl-indigo" />
        ) : (
          <PartialIcon className="text-rl-notice-ring" />
        )}
        {status.label}
      </span>
      <Dot />
      <span>{status.competitorCountLabel}</span>
      <Dot />
      <span>{status.generatedLabel}</span>
      {status.gapCountLabel ? (
        <>
          <Dot />
          <span className="text-rl-notice-count">{status.gapCountLabel}</span>
        </>
      ) : null}
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-rl-hairline">
      ·
    </span>
  );
}

/**
 * Regeneration always rebuilds the whole report, so the accessible name says so
 * even where the approved visual label is the shorter "Regenerate".
 */
export function RegenerateButton({
  regenerate,
  competitorIds,
  variant,
  label = 'Regenerate',
}: {
  regenerate: (formData: FormData) => Promise<void>;
  competitorIds: string[];
  variant: 'ghost' | 'primary';
  label?: string;
}) {
  return (
    <form action={regenerate}>
      {competitorIds.map((id) => (
        <input key={id} type="hidden" name="competitorIds" value={id} />
      ))}
      <button
        type="submit"
        aria-label="Regenerate the whole report"
        className={cn(
          'inline-flex items-center rounded-md text-13 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo',
          variant === 'ghost'
            ? 'h-[34px] gap-1.5 px-[11px] text-rl-nav-idle hover:bg-rl-ghost-hover'
            : 'h-[30px] gap-1.5 bg-rl-indigo px-[13px] font-medium text-white hover:bg-rl-indigo-deep',
        )}
      >
        <RegenerateIcon />
        {label}
      </button>
    </form>
  );
}

/** The mobile app bar's refresh control. Icon only, with a spoken label. */
export function MobileRegenerateButton({
  regenerate,
  competitorIds,
}: {
  regenerate: (formData: FormData) => Promise<void>;
  competitorIds: string[];
}) {
  return (
    <form action={regenerate}>
      {competitorIds.map((id) => (
        <input key={id} type="hidden" name="competitorIds" value={id} />
      ))}
      <button
        type="submit"
        className="-mr-2 flex size-11 items-center justify-center rounded-md text-rl-nav-idle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo"
      >
        <MobileRefreshIcon />
        <span className="sr-only">Regenerate the whole report</span>
      </button>
    </form>
  );
}
