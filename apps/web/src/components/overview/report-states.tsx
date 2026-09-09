'use client';

import { GenerationForm } from './generation-form';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyReportIcon, ErrorIcon, NoticeIcon } from '@/components/app-shell/icons';
import { SECTION_META, SECTION_ORDER } from '@/lib/overview/labels';
import type { InsufficientView } from '@/lib/overview/types';

/**
 * First run. The report structure is described rather than mocked, so nothing
 * on screen can be mistaken for a finding.
 */
export function NoReportState({
  competitorLabels,
  ownedLabel,
  competitorIds,
}: {
  competitorLabels: string[];
  ownedLabel: string;
  competitorIds: string[];
}) {
  const captured =
    competitorLabels.length > 0
      ? `RivalLens has captured ${ownedLabel} and ${listSentence(competitorLabels)}.`
      : `RivalLens has captured ${ownedLabel}.`;

  return (
    <div className="flex flex-col items-start px-4 py-10 tablet:px-0 tablet:py-11 xl:w-[896px]">
      <EmptyReportIcon className="text-rl-hairline" />
      <h2 className="mt-4 text-17 font-semibold tracking-[-0.015em]">No report yet</h2>
      <p className="mt-2 max-w-[420px] text-14 leading-[1.55] text-rl-muted">
        {captured} Generating the first report compares them and derives the four sections from that
        evidence.
      </p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <GenerationForm competitorIds={competitorIds}>
          {(pending) => (
            <button
              disabled={pending}
              type="submit"
              className="inline-flex h-11 tablet:h-[34px] items-center rounded-md bg-rl-indigo px-3.5 text-13 font-medium text-white hover:bg-rl-indigo-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo"
            >
              {pending ? 'Generating…' : 'Generate first report'}
            </button>
          )}
        </GenerationForm>
        <Link
          href="/rivals"
          className="inline-flex h-11 tablet:h-[34px] items-center rounded-md border border-rl-control px-3.5 text-13 text-rl-body hover:bg-rl-ghost-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo"
        >
          Add another competitor
        </Link>
      </div>
    </div>
  );
}

/**
 * Layout-shaped, with the real section labels and no spinner: the reader learns
 * the shape of the answer while it loads.
 */
export function ReportSkeleton() {
  const widths = [
    ['62%', '88%', '34%'],
    ['54%', '92%', '40%'],
    ['70%', '58%'],
    ['66%', '84%', '38%'],
  ];

  return (
    <>
      <p role="status" className="sr-only">
        Loading the latest competitive intelligence report
      </p>
      <div className="px-4 tablet:px-0 xl:w-[896px]" aria-busy="true">
        {SECTION_ORDER.map((name, index) => (
          <div
            key={name}
            className={
              index === 0
                ? 'pb-[22px] xl:grid xl:grid-cols-[152px_704px] xl:gap-10'
                : 'border-t border-rl-rule-item py-[22px] xl:grid xl:grid-cols-[152px_704px] xl:gap-10'
            }
          >
            <p className="text-13 font-semibold text-rl-faint">{SECTION_META[name].title}</p>
            <div className="mt-3 flex flex-col gap-[9px] xl:mt-0">
              {widths[index]?.map((width, lineIndex) => (
                <span
                  key={width + String(lineIndex)}
                  className="block rounded-[3px] bg-rl-skeleton"
                  style={{ width, height: lineIndex === 0 ? 12 : 11 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * A report that resolved nothing. The four sections stay, each saying why it is
 * empty, so the screen reads as informative rather than broken.
 */
export function InsufficientReport({ insufficient }: { insufficient: InsufficientView }) {
  return (
    <div className="px-4 tablet:px-0 xl:w-[896px]">
      <div className="flex items-start gap-2.5 pb-[18px]">
        <NoticeIcon size={14} className="mt-0.5 flex-none text-rl-notice-ring" />
        <div>
          <h2 className="text-14 font-semibold">{insufficient.title}</h2>
          <p className="mt-1 text-13 leading-[1.5] text-rl-muted">{insufficient.body}</p>
        </div>
      </div>

      <dl className="m-0">
        {insufficient.reasons.map((reason) => (
          <div
            key={reason.title}
            className="border-t border-rl-rule-item py-[15px] xl:grid xl:grid-cols-[168px_1fr] xl:gap-6"
          >
            <dt className="text-13 font-semibold">{reason.title}</dt>
            <dd className="mt-1 text-13 leading-[1.5] text-rl-muted xl:mt-0">{reason.reason}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <Link
          href="/evidence"
          className="inline-flex h-11 tablet:h-8 items-center rounded-md bg-rl-indigo px-[13px] text-13 font-medium text-white hover:bg-rl-indigo-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo"
        >
          Capture more sources
        </Link>
        {insufficient.captureNote ? (
          <p className="text-13 text-rl-faint">{insufficient.captureNote}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The load failed. It says what is still safe, because the first question a
 * reader has is whether their evidence survived.
 */
export function ReportError({ detail }: { detail?: string }) {
  const router = useRouter();

  return (
    <div className="px-4 tablet:px-0 xl:w-[896px]">
      <div className="flex items-start gap-3" role="alert">
        <ErrorIcon className="mt-0.5 flex-none text-rl-error" />
        <div className="flex-1">
          <h2 className="text-14 font-semibold">The report could not be loaded</h2>
          <p className="mt-[5px] text-13 leading-[1.5] text-rl-muted">
            Your evidence and previous reports are safe. Nothing was regenerated.
          </p>
          {detail ? <p className="mt-1.5 text-13 text-rl-faint">{detail}</p> : null}
          <div className="mt-4 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex h-11 tablet:h-[30px] items-center rounded-md border border-rl-control px-3 text-13 text-rl-body hover:bg-rl-ghost-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function listSentence(values: string[]): string {
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}
