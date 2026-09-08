'use client';

import Link from 'next/link';
import { ChevronDownIcon } from '@/components/app-shell/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ShellContextView } from '@/lib/overview/types';

/**
 * Which competitors the report covers. With one competitor there is nothing to
 * choose, so the chip is inert text rather than a dead control.
 */
export function ComparisonSetMenu({ context }: { context: ShellContextView }) {
  const label = scopeLabel(context);

  if (context.competitors.length < 2) {
    return (
      <div className="flex h-[34px] items-center gap-[7px] rounded-md border border-rl-control bg-white px-[11px] text-13 text-rl-body">
        <ScopeDot />
        {label}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-[34px] items-center gap-[7px] rounded-md border border-rl-control bg-white px-[11px] text-13 text-rl-body hover:bg-rl-ghost-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rl-indigo">
        <ScopeDot />
        {label}
        <ChevronDownIcon className="text-rl-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuLabel className="text-11 tracking-[0.07em] text-rl-faint uppercase">
          Compare against
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/overview" className="font-rl-mono text-13">
            All competitors
          </Link>
        </DropdownMenuItem>
        {context.competitors.map((competitor) => (
          <DropdownMenuItem key={competitor.id} asChild>
            <Link
              href={`/overview?competitorIds=${encodeURIComponent(competitor.id)}`}
              className="font-rl-mono text-13"
            >
              {competitor.domain}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScopeDot() {
  return <span aria-hidden className="size-1.5 rounded-full bg-rl-graphite" />;
}

function scopeLabel(context: ShellContextView): string {
  const selected = context.selectedCompetitorIds;
  if (selected.length === 1) {
    const match = context.competitors.find((c) => c.id === selected[0]);
    if (match) return match.domain;
  }
  if (selected.length === 0 || selected.length === context.competitors.length) {
    return context.competitors.length === 1
      ? (context.competitors[0]?.domain ?? 'No competitor')
      : `${context.competitors.length} competitors`;
  }
  return `${selected.length} competitors`;
}
