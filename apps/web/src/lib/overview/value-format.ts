import type { CompetitiveSignalSupportingValues } from '@rivallens/schemas';

/**
 * Value and metric grid formatting. Anything the backend has not resolved must
 * render as "Not established" — never a value, a dash, a zero, an equals sign,
 * or two matching values.
 */

export const NOT_ESTABLISHED = 'Not established';

export type ValueCell =
  | { kind: 'value'; text: string }
  | { kind: 'unresolved'; text: typeof NOT_ESTABLISHED };

export type DifferenceCell = {
  direction: 'lower' | 'higher';
  amount: string;
  qualifier: string;
};

export type ValueGrid = {
  owned: ValueCell;
  competitor: ValueCell;
  difference: DifferenceCell | null;
};

type Unit = NonNullable<CompetitiveSignalSupportingValues['unit']>;

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}

/** Renders a supporting value in the unit the backend recorded it in. */
export function formatUnitValue(
  value: string | number | boolean | undefined,
  unit: Unit | undefined,
): ValueCell {
  if (value === undefined) return { kind: 'unresolved', text: NOT_ESTABLISHED };
  if (typeof value === 'boolean') {
    return { kind: 'value', text: value ? 'Offered' : 'Not offered' };
  }
  if (typeof value === 'string') return { kind: 'value', text: value };

  switch (unit) {
    case 'usd':
      return { kind: 'value', text: `$${formatNumber(value)}` };
    case 'days':
      return { kind: 'value', text: `${formatNumber(value)} days` };
    case 'percent':
    case 'percentage_points':
      return { kind: 'value', text: `${formatNumber(value)}%` };
    default:
      return { kind: 'value', text: formatNumber(value) };
  }
}

const QUALIFIERS: Record<Unit, { lower: string; higher: string }> = {
  usd: { lower: 'lower', higher: 'higher' },
  days: { lower: 'shorter', higher: 'longer' },
  percent: { lower: 'lower', higher: 'higher' },
  percentage_points: { lower: 'lower', higher: 'higher' },
};

/**
 * The delta cell. `delta` is competitor relative to owned, so a negative delta
 * means the competitor value is the lower one.
 */
export function formatDifference(
  delta: number | undefined,
  unit: Unit | undefined,
): DifferenceCell | null {
  if (delta === undefined || delta === 0) return null;
  const direction = delta < 0 ? 'lower' : 'higher';
  const magnitude = Math.abs(delta);
  const amount = formatUnitValue(magnitude, unit);
  const qualifier = unit ? QUALIFIERS[unit][direction] : direction;
  return { direction, amount: amount.text, qualifier };
}

export function buildValueGrid(values: CompetitiveSignalSupportingValues): ValueGrid {
  return {
    owned: formatUnitValue(values.owned, values.unit),
    competitor: formatUnitValue(values.competitor, values.unit),
    difference: formatDifference(values.delta, values.unit),
  };
}

/**
 * Plain-English rendering of a normalised comparison value for the drawer's
 * evidence rows. Only the fields the comparison layer produces are read.
 */
export function observedFactSentence(
  comparisonKey: string,
  state: 'present' | 'explicitly_absent' | 'unknown',
  value: Record<string, unknown> | null,
): { text: string; explicitlyAbsent: boolean } | null {
  if (state === 'unknown') return null;

  if (state === 'explicitly_absent') {
    return {
      text: `${absenceSubject(comparisonKey)} — recorded as explicitly absent`,
      explicitlyAbsent: true,
    };
  }

  if (!value) return null;

  const threshold = value.threshold;
  if (comparisonKey === 'offer.free_shipping_threshold' && typeof threshold === 'number') {
    return { text: `Free shipping on orders over $${formatNumber(threshold)}`, explicitlyAbsent: false };
  }

  const durationDays = value.durationDays;
  if (typeof durationDays === 'number') {
    if (comparisonKey === 'policy.return_window') {
      return { text: `${formatNumber(durationDays)}-day return window`, explicitlyAbsent: false };
    }
    if (comparisonKey === 'policy.guarantee_duration') {
      return { text: `${formatNumber(durationDays)}-day guarantee`, explicitlyAbsent: false };
    }
  }

  if (comparisonKey === 'subscription.available' && typeof value.available === 'boolean') {
    return {
      text: value.available
        ? 'Subscribe-and-save option present'
        : 'No subscription option present',
      explicitlyAbsent: false,
    };
  }

  const discountPercent = value.discountPercent;
  if (comparisonKey === 'subscription.discount' && typeof discountPercent === 'number') {
    return {
      text: `${formatNumber(discountPercent)}% subscription discount`,
      explicitlyAbsent: false,
    };
  }

  const firstText = Object.values(value).find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  );
  if (firstText) return { text: firstText, explicitlyAbsent: false };

  return null;
}

function absenceSubject(comparisonKey: string): string {
  switch (comparisonKey) {
    case 'subscription.available':
    case 'subscription.discount':
      return 'No subscription option present';
    case 'offer.free_shipping_threshold':
      return 'No free-shipping threshold present';
    case 'policy.return_window':
      return 'No return window stated';
    case 'policy.guarantee_duration':
      return 'No guarantee stated';
    default:
      return 'Not present on the captured page';
  }
}
