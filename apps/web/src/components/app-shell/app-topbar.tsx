'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { WordmarkIcon } from './icons';
import { navItems } from './nav-items';

/**
 * Tablet navigation: a 56px identity row over a 44px tab strip. Replaces the
 * sidebar between 834 and 1279.
 */
export function AppTopBar({
  activeDomain,
  actions,
}: {
  activeDomain: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="hidden border-b border-rl-rule bg-white tablet:block xl:hidden">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <WordmarkIcon className="text-rl-indigo" />
          <span className="text-14 font-semibold tracking-[-0.02em]">RivalLens</span>
          <span className="ml-1 font-rl-mono text-12 text-rl-faint">{activeDomain}</span>
        </div>
        {actions}
      </div>
      <nav
        aria-label="Primary"
        className="flex items-center gap-0.5 overflow-x-auto border-t border-rl-rule-item px-4"
      >
        {navItems.map(({ href, label }) => {
          const selected = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'relative inline-flex h-11 flex-none items-center px-3 text-13 outline-none',
                'focus-visible:shadow-[inset_0_0_0_2px_#4338CA]',
                selected ? 'font-medium text-rl-ink' : 'text-rl-nav-idle hover:text-rl-ink',
              )}
            >
              {label}
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute right-2 bottom-0 left-2 h-0.5 bg-rl-indigo"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
