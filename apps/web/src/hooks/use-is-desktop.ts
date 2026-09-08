'use client';

import { useEffect, useState } from 'react';

/** Matches the xl breakpoint at which the report gains its 240px sidebar. */
const DESKTOP_QUERY = '(min-width: 1280px)';

/**
 * Reports false until mounted, so server and first client render agree. Only
 * behaviour keyed to it may differ between breakpoints — layout stays in CSS.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(media.matches);
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
