import { DeltaDownIcon, DeltaUpIcon } from '@/components/app-shell/icons';
import type { ValueCell, ValueGrid as ValueGridModel } from '@/lib/overview/value-format';
import { cn } from '@/lib/utils';

/**
 * Values align vertically down the whole report, and that alignment is the
 * scanning mechanism, so the track widths are fixed rather than fluid:
 * 168/168/auto on desktop, 150/150/auto on tablet, two equal columns on mobile
 * with the difference spanning both.
 */
const GRID =
  'grid grid-cols-2 gap-x-4 gap-y-3 tablet:grid-cols-[150px_150px_auto] xl:grid-cols-[168px_168px_auto] xl:gap-0';

export function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-11 tracking-[0.07em] text-rl-faint uppercase">{children}</span>
  );
}

function Value({ cell }: { cell: ValueCell }) {
  return (
    <span
      className={cn(
        'mt-1 font-rl-mono text-13',
        cell.kind === 'unresolved'
          ? 'inline-block border-b border-dashed border-rl-hairline pb-px text-rl-muted'
          : 'block font-medium text-rl-ink',
      )}
    >
      {cell.text}
    </span>
  );
}

export function ValueGrid({
  values,
  ownedLabel,
  competitorLabel,
}: {
  values: ValueGridModel;
  ownedLabel: string;
  competitorLabel: string;
}) {
  const { difference } = values;
  const DeltaIcon = difference?.direction === 'lower' ? DeltaDownIcon : DeltaUpIcon;

  return (
    <span className={cn('mt-[13px]', GRID)}>
      <span className="block">
        <MicroLabel>{ownedLabel}</MicroLabel>
        <Value cell={values.owned} />
      </span>
      <span className="block">
        <MicroLabel>{competitorLabel}</MicroLabel>
        <Value cell={values.competitor} />
      </span>
      {difference ? (
        <span className="col-span-2 block tablet:col-span-1">
          <MicroLabel>Difference</MicroLabel>
          <span className="mt-1 flex items-baseline gap-1.5">
            <DeltaIcon className="self-center text-rl-graphite" />
            <span className="font-rl-mono text-13 font-medium text-rl-ink">
              {difference.amount}
            </span>
            <span className="text-12 text-rl-faint">{difference.qualifier}</span>
          </span>
        </span>
      ) : (
        <span aria-hidden="true" className="hidden tablet:block" />
      )}
    </span>
  );
}

/**
 * Experiments use their own grid. This grid plus the 15px title is the whole of
 * the stronger hierarchy for "What to test next".
 */
export function MetricGrid({
  primaryMetric,
  guardrailLabel,
  readiness,
}: {
  primaryMetric: string;
  guardrailLabel: string;
  readiness: string;
}) {
  return (
    <span className="mt-[14px] hidden tablet:grid tablet:grid-cols-[232px_116px_auto]">
      <span className="block">
        <MicroLabel>Primary metric</MicroLabel>
        <span className="mt-1 block text-13 text-rl-ink">{primaryMetric}</span>
      </span>
      <span className="block">
        <MicroLabel>Guardrails</MicroLabel>
        <span className="mt-1 block text-13 text-rl-ink">{guardrailLabel}</span>
      </span>
      <span className="block">
        <MicroLabel>Readiness</MicroLabel>
        <span className="mt-1 block text-13 text-rl-muted">{readiness}</span>
      </span>
    </span>
  );
}
