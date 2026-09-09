'use client';

import Link from 'next/link';
import { ChevronRightIcon, CloseIcon } from '@/components/app-shell/icons';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import type {
  ComparedPairView,
  EvidenceDrawerView,
  EvidenceRowView,
  ProvenanceStepView,
} from '@/lib/overview/provenance-types';
import { cn } from '@/lib/utils';

/**
 * "Why is RivalLens telling me this?" — answered as a chain from the sentence
 * in the report back to the pages we read. Desktop is a 480px inset panel with
 * no scrim so the report stays readable beside it; tablet is a right sheet and
 * mobile is a full-screen sheet.
 */
export function EvidenceDrawer({
  drawer,
  drawerId,
  open,
  onClose,
  returnFocus,
}: {
  drawer: EvidenceDrawerView | null;
  drawerId: string;
  open: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const isDesktop = useIsDesktop();

  return (
    <Sheet
      open={open && drawer !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      /*
       * Desktop shows no scrim and keeps the report live, so a second item can
       * be opened in one click. Tablet and mobile cover the report, so there
       * the sheet is modal and traps focus.
       */
      modal={!isDesktop}
    >
      <SheetContent
        id={drawerId}
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          // Selecting another report row updates this non-modal sheet in place.
          if (
            isDesktop &&
            event.target instanceof Element &&
            event.target.closest('[data-report-row]')
          ) {
            event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
        overlayClassName="bg-[rgba(22,24,29,0.14)] xl:!hidden"
        className={cn(
          'font-rl-sans antialiased flex w-full max-w-none flex-col gap-0 border-rl-rule bg-white p-0 shadow-none sm:max-w-none',
          'tablet:w-[480px] tablet:border-l tablet:shadow-[-12px_0_32px_rgba(16,24,40,0.05)]',
        )}
      >
        {drawer ? <DrawerBody drawer={drawer} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ drawer }: { drawer: EvidenceDrawerView }) {
  return (
    <>
      <div className="flex-none border-b border-rl-rule px-5 pt-5 pb-4 tablet:px-[26px] tablet:pt-[22px] tablet:pb-[18px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-11 tracking-[0.07em] text-rl-faint uppercase">{drawer.kindLabel}</p>
            <SheetTitle className="mt-[7px] text-16 leading-[1.35] font-semibold tracking-[-0.012em] text-rl-ink">
              {drawer.title}
            </SheetTitle>
          </div>
          <SheetClose className="flex size-11 tablet:size-7 flex-none items-center justify-center rounded-[5px] text-rl-muted hover:bg-rl-ghost-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo">
            <CloseIcon />
            <span className="sr-only">Close evidence</span>
          </SheetClose>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6 tablet:px-[26px] tablet:pt-[22px]">
        <h3 className="text-14 font-semibold text-rl-ink">{drawer.heading}</h3>

        <ol className="relative mt-[18px] list-none pl-6 before:absolute before:top-1.5 before:bottom-2.5 before:left-1 before:w-px before:bg-rl-control">
          {drawer.steps.map((step, index) => (
            <ProvenanceStep
              key={step.kind}
              step={step}
              first={index === 0}
              last={index === drawer.steps.length - 1}
            />
          ))}
        </ol>
      </div>

      <div className="flex-none flex-col items-start gap-2 border-t border-rl-rule bg-rl-ground px-5 py-[15px] tablet:flex-row tablet:items-center tablet:justify-between tablet:gap-4 tablet:px-[26px] flex">
        <p className="text-13 text-rl-faint">{drawer.footerNote}</p>
        <Link
          href="/evidence"
          className="inline-flex min-h-11 tablet:min-h-0 flex-none items-center gap-1 text-13 text-rl-indigo hover:text-rl-indigo-deep hover:underline hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo"
        >
          <span>Open in Evidence</span>
          <ChevronRightIcon />
        </Link>
      </div>
    </>
  );
}

function ProvenanceStep({
  step,
  first,
  last,
}: {
  step: ProvenanceStepView;
  first: boolean;
  last: boolean;
}) {
  return (
    <li className={cn('relative', !last && 'pb-5')}>
      <span
        aria-hidden
        className={cn(
          '-left-6 absolute top-1 size-[9px] rounded-full border-2 bg-white',
          first ? 'border-rl-indigo' : 'border-rl-hairline',
        )}
      />
      <p className="text-11 tracking-[0.07em] text-rl-faint uppercase">{step.label}</p>

      {step.kind === 'report' || step.kind === 'compared' ? (
        <p className="mt-1.5 text-14 leading-[1.5] text-rl-body">{step.text}</p>
      ) : null}

      {step.kind === 'meaning' ? (
        <>
          <p className="mt-1.5 font-rl-serif text-17 leading-[1.4] text-rl-serif-ink">
            {step.statement}
          </p>
          <p className="mt-2 text-13 leading-[1.5] text-rl-muted">{step.uncertainty}</p>
        </>
      ) : null}

      {step.kind === 'compared' && step.pair ? <ComparedPair pair={step.pair} /> : null}

      {step.kind === 'evidence' ? <EvidenceList step={step} /> : null}
    </li>
  );
}

function ComparedPair({ pair }: { pair: ComparedPairView }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-4 rounded-md border border-rl-rule bg-rl-ground px-3.5 py-3">
      <div>
        <dt className="text-11 tracking-[0.07em] text-rl-faint uppercase">{pair.ownedLabel}</dt>
        <dd
          className={cn(
            'mt-1 text-13',
            pair.ownedUnresolved ? 'text-rl-muted italic' : 'font-rl-mono font-medium text-rl-ink',
          )}
        >
          {pair.ownedValue}
        </dd>
      </div>
      <div>
        <dt className="text-11 tracking-[0.07em] text-rl-faint uppercase">
          {pair.competitorLabel}
        </dt>
        <dd
          className={cn(
            'mt-1 text-13',
            pair.competitorUnresolved
              ? 'text-rl-muted italic'
              : 'font-rl-mono font-medium text-rl-ink',
          )}
        >
          {pair.competitorValue}
        </dd>
      </div>
    </dl>
  );
}

function EvidenceList({ step }: { step: Extract<ProvenanceStepView, { kind: 'evidence' }> }) {
  if (step.rows.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-rl-rule bg-rl-ground px-3.5 py-3 text-13 leading-[1.5] text-rl-muted">
        {step.note ?? 'No page evidence is recorded for this item yet.'}
      </p>
    );
  }

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-md border border-rl-rule">
        {step.rows.map((row, index) => (
          <EvidenceRow key={row.key} row={row} first={index === 0} />
        ))}
      </div>
      {step.note ? <p className="mt-2.5 text-13 leading-[1.5] text-rl-muted">{step.note}</p> : null}
    </>
  );
}

function EvidenceRow({ row, first }: { row: EvidenceRowView; first: boolean }) {
  return (
    <div className={cn('bg-white px-3.5 py-[13px]', !first && 'border-t border-rl-rule-item')}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-[7px]">
          <span
            aria-hidden
            className={cn(
              'size-[5px] flex-none rounded-full',
              row.role === 'owned' ? 'bg-rl-indigo' : 'bg-rl-graphite',
            )}
          />
          <span className="break-all font-rl-mono text-13 text-rl-ink">{row.domain}</span>
        </div>
        <span className="text-13 text-rl-muted">{row.pageType}</span>
      </div>
      <p
        className={cn(
          'mt-[7px] text-14 leading-[1.45]',
          row.explicitlyAbsent ? 'text-rl-muted italic' : 'text-rl-body',
        )}
      >
        {row.observedFact}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-[9px] gap-y-1 text-13 text-rl-faint">
        <span className="font-rl-mono">{row.capturedLabel}</span>
        <span aria-hidden className="text-rl-hairline">
          ·
        </span>
        <span>{row.confidenceLabel}</span>
      </div>
    </div>
  );
}
