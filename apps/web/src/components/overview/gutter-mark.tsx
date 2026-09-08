import { cn } from '@/lib/utils';

/**
 * The 3px-wide mark that opens every item. A solid mark means an observed
 * difference, a hairline means an interpretation or a test, and dashed means
 * unresolved — dashed carries no other meaning anywhere in the report.
 */
export type GutterMarkVariant =
  | 'owned'
  | 'competitor'
  | 'derived'
  | 'derived-test'
  | 'unresolved'
  | 'empty';

const DASHED = 'bg-[repeating-linear-gradient(#E4E6EB_0_3px,transparent_3px_6px)]';

const VARIANTS: Record<GutterMarkVariant, string> = {
  owned: 'h-[22px] tablet:h-5 mt-[3px] rounded-[2px] bg-rl-indigo',
  competitor: 'h-[22px] tablet:h-5 mt-[3px] rounded-[2px] bg-rl-graphite',
  derived: 'h-6 mt-1.5 border-l border-rl-hairline',
  'derived-test': 'h-6 mt-1 border-l border-rl-hairline',
  unresolved: `h-[22px] tablet:h-5 mt-[3px] rounded-[2px] ${DASHED}`,
  empty: 'h-5 mt-[3px] rounded-[2px] bg-rl-control',
};

export function GutterMark({
  variant,
  as: As = 'span',
}: {
  variant: GutterMarkVariant;
  as?: 'span' | 'div';
}) {
  return <As aria-hidden="true" className={cn('block w-[3px] flex-none', VARIANTS[variant])} />;
}
