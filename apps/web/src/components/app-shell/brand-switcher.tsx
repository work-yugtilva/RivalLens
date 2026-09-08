'use client';

import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon } from './icons';

export type BrandOption = { id: string; domain: string };

/**
 * The wordmark block's brand control. It scopes the Overview screen to a brand;
 * it does not create or configure one.
 */
export function BrandSwitcher({
  brands,
  activeBrandId,
  activeDomain,
  className,
}: {
  brands: BrandOption[];
  activeBrandId: string | null;
  activeDomain: string;
  className?: string;
}) {
  const trigger = (
    <span className="truncate font-rl-mono text-12 text-rl-body">{activeDomain}</span>
  );

  if (brands.length < 2) {
    return (
      <div
        className={
          className ??
          'mt-3 flex items-center justify-between gap-2 rounded-md border border-rl-control bg-white px-[9px] py-[7px]'
        }
      >
        {trigger}
        <ChevronDownIcon className="shrink-0 text-rl-faint" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          (className ??
            'mt-3 flex w-full items-center justify-between gap-2 rounded-md border border-rl-control bg-white px-[9px] py-[7px]') +
          ' text-left outline-none focus-visible:ring-2 focus-visible:ring-rl-indigo'
        }
      >
        {trigger}
        <ChevronDownIcon className="shrink-0 text-rl-faint" />
        <span className="sr-only">Change brand</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {brands.map((brand) => (
          <DropdownMenuItem key={brand.id} asChild>
            <Link
              href={`/overview?brandId=${brand.id}`}
              className="font-rl-mono text-12 text-rl-body"
              aria-current={brand.id === activeBrandId ? 'true' : undefined}
            >
              {brand.domain}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
