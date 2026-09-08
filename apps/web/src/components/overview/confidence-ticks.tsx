import type { ConfidenceLevel } from '@/lib/overview/types';

const FILLED: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

/**
 * Three 3×10px bars. Only facts carry confidence — never a hypothesis and never
 * an experiment. Unfilled bars use the non-text hairline tone so a lower
 * confidence stays a neutral tint of the same family rather than a warning.
 */
export function ConfidenceTicks({ level }: { level: ConfidenceLevel }) {
  const filled = FILLED[level];

  return (
    <span className="hidden self-center gap-0.5 xl:inline-flex">
      <span className="sr-only">{`Confidence ${level}`}</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`block h-2.5 w-[3px] rounded-px ${
            index < filled ? 'bg-rl-graphite' : 'bg-rl-hairline'
          }`}
        />
      ))}
    </span>
  );
}
