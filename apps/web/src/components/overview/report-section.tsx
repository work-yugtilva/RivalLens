'use client';

import type { SectionView } from '@/lib/overview/types';
import { cn } from '@/lib/utils';
import { ItemList } from './item-row';
import {
  AwaitingGenerationRow,
  EmptySection,
  ExperimentRow,
  FactRow,
  HypothesisRow,
  UnresolvedRow,
} from './report-rows';

/**
 * One report section. Desktop puts the title and its epistemic subtitle in a
 * 152px gutter beside the items; tablet sets them on a shared baseline; mobile
 * stacks them with the item count on the right. The subtitle is what frames the
 * section, which is why no item needs a badge.
 */
export function ReportSection({
  section,
  first,
  last,
  selectedKey,
  drawerId,
  onSelect,
}: {
  section: SectionView;
  first: boolean;
  last: boolean;
  selectedKey: string | null;
  drawerId: string;
  onSelect: (itemKey: string) => void;
}) {
  const gapRows = [...section.unresolved, ...section.awaitingGeneration];
  const total = section.rows.length + gapRows.length;
  const experiment = section.name === 'whatToTestNext';

  return (
    <section
      className={cn(
        'px-4 tablet:px-0 xl:grid xl:grid-cols-[152px_704px] xl:gap-10',
        first
          ? 'pt-[18px] pb-4 tablet:pt-0 tablet:pb-5 xl:pt-0 xl:pb-9'
          : 'border-t border-rl-rule py-4 tablet:py-5 xl:py-9',
        last && 'xl:pb-[52px]',
      )}
    >
      <div className="tablet:flex tablet:items-baseline tablet:gap-3 xl:block">
        <div className="flex items-baseline justify-between tablet:contents">
          <h2 className="text-13 font-semibold tablet:text-14 xl:tracking-[-0.012em]">
            {section.title}
          </h2>
          {total > 0 ? (
            <span className="text-11 text-rl-faint tablet:hidden">{total}</span>
          ) : null}
        </div>
        <p className="mt-[5px] text-13 leading-[1.45] text-rl-faint tablet:mt-0 tablet:text-rl-muted xl:mt-[7px]">
          {section.subtitle}
        </p>
      </div>

      <div className="mt-3.5 xl:mt-0">
        {section.countLine ? (
          <p className="mb-[14px] text-13 text-rl-faint">{section.countLine}</p>
        ) : null}

        <ItemList
          bleedTop={section.countLine === null && total > 0}
          bleedBottom={total > 0 && section.empty === null}
        >
          {section.rows.map((row, index) => {
            const position = { first: index === 0, last: index === total - 1 };
            const selection = {
              selected: selectedKey === row.key,
              drawerId,
              onSelect: () => onSelect(row.key),
            };

            if (row.itemType === 'competitive_fact') {
              return <FactRow key={row.key} row={row} position={position} selection={selection} />;
            }
            if (row.itemType === 'strategic_hypothesis') {
              return (
                <HypothesisRow key={row.key} row={row} position={position} selection={selection} />
              );
            }
            return (
              <ExperimentRow key={row.key} row={row} position={position} selection={selection} />
            );
          })}

          {gapRows.map((row, gapIndex) => {
            const index = section.rows.length + gapIndex;
            const position = { first: index === 0, last: index === total - 1 };
            return 'title' in row ? (
              <UnresolvedRow key={row.key} row={row} position={position} />
            ) : (
              <AwaitingGenerationRow key={row.key} row={row} position={position} experiment={experiment} />
            );
          })}
        </ItemList>

        {section.empty ? <EmptySection empty={section.empty} /> : null}
      </div>
    </section>
  );
}
