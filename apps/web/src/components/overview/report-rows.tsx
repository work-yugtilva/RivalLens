'use client';

import type {
  AwaitingGenerationRowView,
  EmptySectionView,
  ExperimentRowView,
  FactRowView,
  HypothesisRowView,
  UnresolvedRowView,
} from '@/lib/overview/types';
import { NOT_ESTABLISHED } from '@/lib/overview/value-format';
import { ConfidenceTicks } from './confidence-ticks';
import { GutterMark } from './gutter-mark';
import { EvidenceAffordance, ItemRow, StaticRow } from './item-row';
import { MetricGrid, MicroLabel, ValueGrid } from './value-grid';

type RowPosition = { first: boolean; last: boolean };

type RowSelection = {
  selected: boolean;
  drawerId: string;
  onSelect: () => void;
};

/** Observed difference. Title, confidence, evidence affordance, statement, values. */
export function FactRow({
  row,
  position,
  selection,
}: {
  row: FactRowView;
  position: RowPosition;
  selection: RowSelection;
}) {
  return (
    <ItemRow {...position} {...selection}>
      <GutterMark variant={row.favours === 'owned' ? 'owned' : 'competitor'} />
      <span className="block min-w-0 flex-1">
        <span className="flex items-baseline gap-2.5">
          <span className="text-14 font-semibold text-rl-ink">{row.title}</span>
          <ConfidenceTicks level={row.confidence} />
          <EvidenceAffordance label={row.affordanceLabel} active={selection.selected} />
        </span>
        <span className="mt-[5px] block text-15 leading-[1.5] text-rl-body xl:mt-1.5 xl:leading-[1.55]">
          {row.statement}
        </span>
        <ValueGrid
          values={row.values}
          ownedLabel={row.ownedLabel}
          competitorLabel={row.competitorLabel}
        />
      </span>
    </ItemRow>
  );
}

/** Interpretation. Serif statement, uncertainty sentence, and no numbers at all. */
export function HypothesisRow({
  row,
  position,
  selection,
}: {
  row: HypothesisRowView;
  position: RowPosition;
  selection: RowSelection;
}) {
  return (
    <ItemRow {...position} {...selection}>
      <GutterMark variant="derived" />
      <span className="block min-w-0 flex-1">
        <span className="flex items-baseline gap-2.5">
          <span className="text-13 text-rl-muted">{row.eyebrow}</span>
          <EvidenceAffordance label={row.affordanceLabel} active={selection.selected} />
        </span>
        <span className="mt-[5px] block font-rl-serif text-19 leading-[1.35] tracking-[-0.005em] text-rl-serif-ink xl:text-20">
          {row.statement}
        </span>
        <span className="mt-2 block text-13 leading-[1.5] text-rl-muted xl:mt-2.5">
          {row.uncertainty}
        </span>
        <span className="mt-2.5 hidden text-13 text-rl-faint xl:block">{row.supportLine}</span>
      </span>
    </ItemRow>
  );
}

/**
 * Recommended test. The 15px title and the metric grid are the whole of the
 * stronger action hierarchy — there is no "Plan this test" control.
 */
export function ExperimentRow({
  row,
  position,
  selection,
}: {
  row: ExperimentRowView;
  position: RowPosition;
  selection: RowSelection;
}) {
  return (
    <ItemRow {...position} {...selection} variant="experiment">
      <GutterMark variant="derived-test" />
      <span className="block min-w-0 flex-1">
        <span className="flex items-baseline gap-2.5">
          <span className="text-15 font-semibold tracking-[-0.008em] text-rl-ink">{row.title}</span>
          <EvidenceAffordance label={row.affordanceLabel} active={selection.selected} />
        </span>
        <span className="mt-[5px] block text-15 leading-[1.5] text-rl-body xl:mt-1.5 xl:leading-[1.55]">
          {row.objective}
        </span>
        <MetricGrid
          primaryMetric={row.primaryMetric}
          guardrailLabel={row.guardrailLabel}
          readiness={row.readiness}
        />
        <span className="mt-[9px] block text-13 text-rl-nav-idle tablet:hidden">
          {row.mobileMetricLine}
        </span>
        <span className="mt-1 block text-13 text-rl-faint tablet:hidden">{row.readiness}</span>
        <span className="mt-[14px] hidden border-l border-rl-rule pl-3 text-13 leading-[1.5] text-rl-muted xl:block">
          {row.caveat}
        </span>
      </span>
    </ItemRow>
  );
}

/**
 * An unresolved comparison. Both value cells read "Not established" behind a
 * dashed underline: an unknown must never render as a value, a dash, a zero, or
 * a matching pair, because that would read as confirmed parity.
 */
export function UnresolvedRow({
  row,
  position,
}: {
  row: UnresolvedRowView;
  position: RowPosition;
}) {
  return (
    <StaticRow {...position}>
      <GutterMark variant="unresolved" />
      <div className="min-w-0 flex-1">
        <h3 className="text-14 font-semibold text-rl-muted">{row.title}</h3>
        <p className="mt-1.5 text-15 leading-[1.5] text-rl-muted xl:leading-[1.55]">
          {row.statement}
        </p>
        <div className="mt-[13px] grid grid-cols-2 gap-x-4 gap-y-3 tablet:grid-cols-[150px_150px_auto] xl:grid-cols-[168px_168px_auto] xl:gap-0">
          <div>
            <MicroLabel>{row.ownedLabel}</MicroLabel>
            <span className="mt-1 inline-block border-b border-dashed border-rl-hairline pb-px font-rl-mono text-13 text-rl-muted">
              {NOT_ESTABLISHED}
            </span>
          </div>
          <div>
            <MicroLabel>{row.competitorLabel}</MicroLabel>
            <span className="mt-1 inline-block border-b border-dashed border-rl-hairline pb-px font-rl-mono text-13 text-rl-muted">
              {NOT_ESTABLISHED}
            </span>
          </div>
          <div aria-hidden="true" />
        </div>
      </div>
    </StaticRow>
  );
}

/**
 * Intelligence that exists but is not in this report yet. It carries no
 * per-item control: regenerating is a whole-report operation and is offered
 * once, as a whole-report action, in the completeness notice above.
 */
export function AwaitingGenerationRow({
  row,
  position,
  experiment,
}: {
  row: AwaitingGenerationRowView;
  position: RowPosition;
  experiment?: boolean;
}) {
  return (
    <StaticRow {...position} variant={experiment ? 'experiment' : 'default'}>
      <GutterMark variant="unresolved" />
      <div className="min-w-0 flex-1">
        <p className="text-15 leading-[1.5] text-rl-muted xl:leading-[1.55]">{row.statement}</p>
        <p className="mt-1 text-13 text-rl-faint">{row.detail}</p>
      </div>
    </StaticRow>
  );
}

/**
 * The section stays in place and explains itself. An absence here is a gap in
 * evidence, never a finding that the brand is behind.
 */
export function EmptySection({ empty }: { empty: EmptySectionView }) {
  return (
    <div className="mt-[14px] flex gap-3 pt-1 pb-0.5 xl:mt-0">
      <GutterMark variant="empty" />
      <div>
        <p className="text-15 leading-[1.5] text-rl-muted xl:leading-[1.55]">{empty.headline}</p>
        <p className="mt-2 text-13 leading-[1.5] text-rl-faint">{empty.explanation}</p>
      </div>
    </div>
  );
}
