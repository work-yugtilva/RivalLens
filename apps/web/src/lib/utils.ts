import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Direction A uses named pixel sizes (`text-13`, `text-15`, …) that Tailwind
 * v4 treats as font-size. Default tailwind-merge still sees `text-*` as colour,
 * so `cn('text-13', 'text-rl-faint')` would drop the 13px size and leave
 * inherited 14px body type. Register the scale as font-size so size and colour
 * can sit on the same node.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['11', '12', '13', '14', '15', '16', '17', '19', '20'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
