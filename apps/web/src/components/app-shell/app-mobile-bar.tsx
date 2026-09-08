'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { MenuIcon, WordmarkIcon } from './icons';
import { navItems } from './nav-items';

/**
 * Mobile app bar: 52px, menu control, screen name with the comparison pair
 * beneath it, and a refresh control. The desktop nav is not reproduced
 * horizontally — it moves into a left sheet.
 */
export function AppMobileBar({
  screenName,
  comparisonPair,
  refreshAction,
}: {
  screenName: string;
  comparisonPair: string;
  refreshAction?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-13 items-center gap-3 border-b border-rl-rule px-4 tablet:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="-ml-3 inline-flex h-11 w-11 flex-none items-center justify-center text-rl-body outline-none focus-visible:shadow-[inset_0_0_0_2px_#4338CA]"
          aria-label="Open navigation"
        >
          <MenuIcon />
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[264px] gap-0 border-r border-rl-rule bg-rl-sidebar font-rl-sans p-0 sm:max-w-[264px]"
        >
          <div className="flex items-center gap-2 border-b border-rl-rule px-5 py-4">
            <WordmarkIcon className="text-rl-indigo" />
            <SheetTitle className="text-14 font-semibold tracking-[-0.02em] text-rl-ink">
              RivalLens
            </SheetTitle>
          </div>
          <nav aria-label="Primary" className="flex flex-col gap-px p-3">
            {navItems.map(({ href, label, Icon }) => {
              const selected = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-13 outline-none',
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
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-semibold tracking-[-0.01em]">{screenName}</div>
        <div className="mt-px truncate font-rl-mono text-11 text-rl-faint">{comparisonPair}</div>
      </div>

      {refreshAction}
    </header>
  );
}
