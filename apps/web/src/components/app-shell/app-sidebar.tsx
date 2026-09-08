'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BrandSwitcher, type BrandOption } from './brand-switcher';
import { WordmarkIcon } from './icons';
import { navItems } from './nav-items';

/** Desktop sidebar: 240px, #F7F8FA, hairline right border. */
export function AppSidebar({
  brands,
  activeBrandId,
  activeDomain,
  sourcesRefreshed,
}: {
  brands: BrandOption[];
  activeBrandId: string | null;
  activeDomain: string;
  sourcesRefreshed: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 flex-none flex-col border-r border-rl-rule bg-rl-sidebar xl:flex">
      <div className="border-b border-rl-rule pt-5 pr-4 pb-4 pl-5">
        <div className="flex items-center gap-2">
          <WordmarkIcon className="text-rl-indigo" />
          <span className="text-14 font-semibold tracking-[-0.02em]">RivalLens</span>
        </div>
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} activeDomain={activeDomain} />
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-px p-3">
        {navItems.map(({ href, label, Icon }) => {
          const selected = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-13 outline-none',
                'focus-visible:shadow-[inset_0_0_0_2px_#4338CA]',
                selected
                  ? 'bg-rl-nav-selected font-medium text-rl-ink'
                  : 'text-rl-nav-idle hover:bg-rl-nav-hover hover:text-rl-ink',
              )}
            >
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-r-[2px] bg-rl-indigo"
                />
              ) : null}
              <Icon className={selected ? 'text-rl-indigo' : undefined} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-rl-rule px-5 py-4">
        <div className="text-11 tracking-[0.07em] text-rl-faint uppercase">Sources refreshed</div>
        <div className="mt-1 font-rl-mono text-12 text-rl-muted">
          {sourcesRefreshed ?? 'Not yet collected'}
        </div>
      </div>
    </aside>
  );
}
