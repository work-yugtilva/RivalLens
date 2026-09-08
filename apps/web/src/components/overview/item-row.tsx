'use client';

import { ChevronRightIcon } from '@/components/app-shell/icons';
import { cn } from '@/lib/utils';

/**
 * Every report item is a single actionable control: the whole row is one
 * button, and the always-visible "Evidence ›" text is that button's label
 * rather than a second control nested inside it.
 *
 * Row padding doubles as row spacing, and the hover surface bleeds out past the
 * text column by the same amount, so the text keeps its measure while the
 * highlight reads as a band. `ItemList` cancels the bleed at the two ends.
 */
export function ItemRow({
  first,
  last,
  selected,
  variant = 'default',
  drawerId,
  onSelect,
  children,
}: {
  first: boolean;
  last: boolean;
  selected: boolean;
  /** Experiments carry more room on their inner edges. */
  variant?: 'default' | 'experiment';
  drawerId: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const experiment = variant === 'experiment';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      aria-controls={drawerId}
      className={cn(
        'group flex w-full gap-3 rounded-md text-left transition-colors duration-100',
        '-mx-4 px-4 tablet:-mx-3 tablet:px-3 xl:-mx-4 xl:gap-[14px] xl:px-4',
        'hover:bg-rl-row-hover focus-visible:shadow-[inset_0_0_0_2px_var(--color-rl-indigo)] focus-visible:outline-none',
        selected && 'bg-rl-row-selected shadow-[inset_2px_0_0_var(--color-rl-indigo)]',
        rowSpacing({ first, last, experiment }),
      )}
    >
      {children}
    </button>
  );
}

/**
 * Row padding is the row rhythm: the hairline between two rows sits midway
 * between their text, and the outer edges are flush because `ItemList` pulls
 * the bleed back. Desktop widens the experiment section's inner edges to 18px,
 * which is where its stronger hierarchy comes from.
 */
function rowSpacing({
  first,
  last,
  experiment,
}: {
  first: boolean;
  last: boolean;
  experiment: boolean;
}) {
  return cn(
    first ? 'pt-[14px]' : 'border-t border-rl-rule-item pt-4 tablet:pt-[14px] xl:pt-4',
    !first && experiment && 'xl:pt-[18px]',
    last ? 'pb-0 xl:pb-4' : 'pb-4 tablet:pb-[14px] xl:pb-4',
    !last && experiment && 'xl:pb-[18px]',
  );
}

/**
 * A row that is deliberately not actionable: an unresolved comparison or an
 * item awaiting generation. It shares the item geometry so the gutter marks and
 * value columns keep aligning down the section, but it has no control, because
 * there is nothing about one row that a reader can act on.
 */
export function StaticRow({
  first,
  last,
  variant = 'default',
  children,
}: {
  first: boolean;
  last: boolean;
  variant?: 'default' | 'experiment';
  children: React.ReactNode;
}) {
  const experiment = variant === 'experiment';

  return (
    <div className={cn('flex w-full gap-3 xl:gap-[14px]', rowSpacing({ first, last, experiment }))}>
      {children}
    </div>
  );
}

/**
 * Holds the rows and pulls the outermost bleed back so the first item's text
 * starts on the section's top edge, exactly as in the approved desktop layout.
 */
export function ItemList({
  bleedTop,
  bleedBottom,
  children,
}: {
  bleedTop: boolean;
  bleedBottom: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(bleedTop && 'xl:-mt-[14px]', bleedBottom && 'xl:-mb-4')}>
      {children}
    </div>
  );
}

/**
 * Always visible, never hover-only. Label matches the item type: Evidence ·
 * Why this? · Why this test?
 */
export function EvidenceAffordance({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        'ml-auto inline-flex flex-none items-center gap-1 text-13',
        active ? 'text-rl-indigo' : 'text-rl-faint group-hover:text-rl-indigo',
      )}
    >
      <span
        className={cn(
          'group-hover:underline group-hover:underline-offset-2',
          active && 'underline underline-offset-2',
        )}
      >
        {label}
      </span>
      <ChevronRightIcon />
    </span>
  );
}
