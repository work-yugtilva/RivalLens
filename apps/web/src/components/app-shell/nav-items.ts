import {
  CompareIcon,
  EvidenceIcon,
  OpportunitiesIcon,
  OverviewIcon,
  RivalsIcon,
  SettingsIcon,
} from './icons';

/** Sidebar order is fixed by the design spec. Overview is the only deep screen. */
export const navItems = [
  { href: '/overview', label: 'Overview', Icon: OverviewIcon },
  { href: '/rivals', label: 'Rivals', Icon: RivalsIcon },
  { href: '/compare', label: 'Compare', Icon: CompareIcon },
  { href: '/opportunities', label: 'Opportunities', Icon: OpportunitiesIcon },
  { href: '/evidence', label: 'Evidence', Icon: EvidenceIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

export type NavItem = (typeof navItems)[number];
