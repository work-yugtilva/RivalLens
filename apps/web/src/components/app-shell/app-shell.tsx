import { AppMobileBar } from './app-mobile-bar';
import { AppSidebar } from './app-sidebar';
import { AppTopBar } from './app-topbar';
import type { BrandOption } from './brand-switcher';

export type ShellNav = {
  brands: BrandOption[];
  activeBrandId: string | null;
  activeDomain: string;
  sourcesRefreshed: string | null;
};

/**
 * Fixed shell with a single scrolling content region. The sidebar is desktop
 * only; the tab strip covers tablet; the app bar covers mobile. Exactly one is
 * rendered at any width, so the hidden ones stay out of the a11y tree.
 */
export function AppShell({
  nav,
  screenName,
  comparisonPair,
  tabletActions,
  mobileAction,
  children,
}: {
  nav: ShellNav;
  screenName: string;
  comparisonPair: string;
  tabletActions?: React.ReactNode;
  mobileAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rl-surface flex h-dvh overflow-hidden bg-rl-ground font-rl-sans text-14 text-rl-ink">
      <AppSidebar {...nav} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <AppTopBar activeDomain={nav.activeDomain} actions={tabletActions} />
        <AppMobileBar
          screenName={screenName}
          comparisonPair={comparisonPair}
          refreshAction={mobileAction}
        />
        {children}
      </div>
    </div>
  );
}
