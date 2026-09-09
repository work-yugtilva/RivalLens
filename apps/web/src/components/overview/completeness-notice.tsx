import Link from 'next/link';
import { ChevronRightIcon, NoticeIcon } from '@/components/app-shell/icons';
import type { CompletenessNoticeView, GenerationNoticeView } from '@/lib/overview/types';
import { RegenerateButton } from './report-header';

/**
 * Says what is missing and, just as importantly, that what remains is still
 * verified. It links to Evidence rather than offering a repair action, because
 * unresolved comparisons are an evidence problem, not a regeneration problem.
 */
export function CompletenessNotice({ notice }: { notice: CompletenessNoticeView }) {
  return (
    <div className="mx-4 mb-5 flex items-start gap-[11px] rounded-md border border-rl-notice-border border-l-2 border-l-rl-notice-edge bg-rl-notice-ground px-4 py-[14px] tablet:mx-0 tablet:mb-6 xl:mb-7 xl:w-[896px]">
      <NoticeIcon className="mt-0.5 flex-none text-rl-notice-icon" />
      <div className="flex-1">
        <h2 className="text-14 font-semibold text-rl-notice-title">{notice.title}</h2>
        <p className="mt-[5px] text-13 leading-[1.5] text-rl-notice-body">{notice.body}</p>
      </div>
      <Link
        href="/evidence"
        className="hidden flex-none items-center gap-1 text-13 text-rl-indigo hover:text-rl-indigo-deep hover:underline hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo tablet:inline-flex"
      >
        <span>Review gaps</span>
        <ChevronRightIcon />
      </Link>
    </div>
  );
}

/**
 * Whole-report regeneration lives here and only here: one notice, describing
 * everything a regeneration would pick up, with the action labelled as the
 * whole-report action it is.
 */
export function GenerationNotice({
  notice,
  competitorIds,
}: {
  notice: GenerationNoticeView;
  competitorIds: string[];
}) {
  return (
    <div className="mx-4 mb-5 flex flex-col gap-3 rounded-md border border-rl-control bg-rl-ground p-[14px] tablet:mx-0 tablet:mb-6 tablet:flex-row tablet:items-center tablet:gap-3.5 xl:mb-7 xl:w-[896px]">
      <div className="flex-1">
        <h2 className="text-14 font-semibold">{notice.title}</h2>
        <p className="mt-[3px] text-13 leading-[1.5] text-rl-muted">{notice.detail}</p>
      </div>
      <div className="flex-none">
        <RegenerateButton
          competitorIds={competitorIds}
          variant="primary"
          label="Regenerate report"
        />
      </div>
    </div>
  );
}
