import type { competitiveReportSectionNames } from '@rivallens/schemas';

export type CompetitiveReportSectionName = (typeof competitiveReportSectionNames)[number];

/**
 * Human labels for the Overview. Raw comparison keys, signal/hypothesis type
 * identifiers, engine versions and UUIDs must never reach the screen, so every
 * translation here has a safe fallback rather than passing the input through.
 */

export type ReportItemType =
  | 'competitive_fact'
  | 'strategic_hypothesis'
  | 'recommended_experiment';

const PAGE_TYPE_LABELS: Record<string, string> = {
  homepage: 'Homepage',
  product: 'Product page',
  collection: 'Collection page',
  pricing_offers: 'Pricing & offers page',
  about: 'About page',
  reviews_testimonials: 'Reviews & testimonials page',
  shipping_returns: 'Shipping & returns page',
  subscription: 'Subscription page',
  unknown: 'Captured page',
};

export function pageTypeLabel(sourceType: string | null | undefined): string {
  if (!sourceType) return 'Captured page';
  return PAGE_TYPE_LABELS[sourceType] ?? 'Captured page';
}

const COMPARISON_KEY_LABELS: Record<string, string> = {
  'offer.free_shipping_threshold': 'Free-shipping threshold',
  'offer.bundle': 'Bundle offer',
  'offer.buy_x_get_y': 'Buy-one-get-one offer',
  'policy.return_window': 'Return window',
  'policy.guarantee_duration': 'Guarantee duration',
  'subscription.available': 'Subscription availability',
  'subscription.discount': 'Subscription discount',
  'positioning.homepage.headline': 'Homepage headline',
  'positioning.homepage.subheadline': 'Homepage subheadline',
  'positioning.homepage.primary_cta': 'Homepage primary call to action',
};

const COMPARISON_KEY_PREFIX_LABELS: Array<[string, string]> = [
  ['offer.discount:', 'Explicit discount'],
  ['offer.promo:', 'Promotional code'],
];

/** `offer.free_shipping_threshold` becomes `Free-shipping threshold`. */
export function comparisonKeyLabel(comparisonKey: string): string {
  const exact = COMPARISON_KEY_LABELS[comparisonKey];
  if (exact) return exact;

  for (const [prefix, label] of COMPARISON_KEY_PREFIX_LABELS) {
    if (comparisonKey.startsWith(prefix)) return label;
  }

  // Unknown key: keep the shape of a label and drop every raw identifier part.
  // Anything after a colon is a raw value (a promo code, a discount id), and
  // the leading dotted segment is a namespace, so neither may reach the screen.
  const words = comparisonKey
    .split(':')[0]!
    .split('.')
    .slice(1)
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Compared detail';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Lower-case form for mid-sentence use, e.g. "The return-window comparison". */
export function comparisonKeyPhrase(comparisonKey: string): string {
  const label = comparisonKeyLabel(comparisonKey);
  return label.charAt(0).toLowerCase() + label.slice(1);
}

const COMPARISON_KEY_SUBJECTS: Record<string, string> = {
  'offer.free_shipping_threshold': 'threshold',
  'policy.return_window': 'return window',
  'policy.guarantee_duration': 'guarantee',
  'subscription.available': 'subscription option',
  'subscription.discount': 'subscription discount',
};

/**
 * Short subject for sentences that already carry the full label, so the drawer
 * reads "Free-shipping threshold — the competitor's threshold is lower".
 */
export function comparisonKeySubject(comparisonKey: string): string {
  return COMPARISON_KEY_SUBJECTS[comparisonKey] ?? comparisonKeyPhrase(comparisonKey);
}

const METRIC_LABELS: Record<string, string> = {
  conversion_rate: 'Conversion rate',
  checkout_conversion_rate: 'Checkout conversion rate',
  average_order_value: 'Average order value',
  contribution_margin_per_order: 'Contribution margin per order',
  shipping_cost_per_order: 'Shipping cost per order',
  return_rate: 'Return rate',
  refund_rate: 'Refund rate',
  subscription_take_rate: 'Subscription take rate',
  subscription_cancellation_rate: 'Subscription cancellation rate',
};

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? 'Primary metric';
}

export function readinessLabel(readiness: 'available' | 'requires_first_party_data'): string {
  return readiness === 'available' ? 'Ready to measure' : 'Needs first-party data';
}

export const SECTION_ORDER: CompetitiveReportSectionName[] = [
  'yourAdvantages',
  'competitorAdvantages',
  'appearsToBeWorking',
  'whatToTestNext',
];

/**
 * Section titles, the subtitles that carry the epistemic frame, and the
 * closing sentence that keeps an absence from reading as a negative finding.
 */
export const SECTION_META: Record<
  CompetitiveReportSectionName,
  { title: string; subtitle: string; notAFinding: string }
> = {
  yourAdvantages: {
    title: 'Your advantages',
    subtitle: 'Observed differences favouring you',
    notAFinding: 'That is a gap in evidence, not a finding that you are behind.',
  },
  competitorAdvantages: {
    title: 'Competitor advantages',
    subtitle: 'Observed differences favouring them',
    notAFinding: 'That is a gap in evidence, not a finding that they are ahead.',
  },
  appearsToBeWorking: {
    title: 'What appears to be working',
    subtitle: 'Interpretations. Not proven performance.',
    notAFinding: 'That is a gap in evidence, not a finding about performance.',
  },
  whatToTestNext: {
    title: 'What to test next',
    subtitle: 'Tests worth considering. Not committed actions.',
    notAFinding: 'That is a gap in evidence, not a finding that no test is worthwhile.',
  },
};

/** Drawer header kind label. */
export function itemKindLabel(itemType: ReportItemType): string {
  switch (itemType) {
    case 'competitive_fact':
      return 'Observed fact';
    case 'strategic_hypothesis':
      return 'Interpretation';
    case 'recommended_experiment':
      return 'Recommended test';
  }
}

/** Evidence affordance label. Always visible, never hover-only. */
export function evidenceAffordanceLabel(itemType: ReportItemType): string {
  switch (itemType) {
    case 'competitive_fact':
      return 'Evidence';
    case 'strategic_hypothesis':
      return 'Why this?';
    case 'recommended_experiment':
      return 'Why this test?';
  }
}

const HYPOTHESIS_TITLES: Record<string, string> = {
  competitor_may_reduce_shipping_friction: 'Possible shipping-friction strategy',
  competitor_may_reduce_perceived_purchase_risk: 'Possible purchase-risk strategy',
  competitor_may_emphasize_repeat_purchase_mechanics: 'Repeat-purchase emphasis',
  competitor_may_emphasize_promotional_incentives: 'Promotional emphasis',
  competitor_may_combine_purchase_friction_and_repeat_purchase_incentives:
    'Combined incentive emphasis',
};

export function hypothesisTitle(hypothesisType: string): string {
  return HYPOTHESIS_TITLES[hypothesisType] ?? 'Possible strategy';
}

const HYPOTHESIS_PHRASES: Record<string, string> = {
  competitor_may_reduce_shipping_friction: 'shipping-friction',
  competitor_may_reduce_perceived_purchase_risk: 'purchase-risk',
  competitor_may_emphasize_repeat_purchase_mechanics: 'repeat-purchase',
  competitor_may_emphasize_promotional_incentives: 'promotional',
  competitor_may_combine_purchase_friction_and_repeat_purchase_incentives: 'combined-incentive',
};

/** Reads inside generated sentences, e.g. "from the repeat-purchase hypothesis". */
export function hypothesisPhrase(hypothesisType: string): string {
  return HYPOTHESIS_PHRASES[hypothesisType] ?? 'current';
}

const EXPERIMENT_PHRASES: Record<string, string> = {
  free_shipping_threshold: 'free-shipping-threshold',
  return_window_policy: 'return-window',
  guarantee_policy: 'guarantee',
  subscription_availability: 'subscription-availability',
  subscription_discount: 'subscription-discount',
  explicit_discount: 'explicit-discount',
  bundle_offer: 'bundle-offer',
  bogo_offer: 'BOGO-offer',
};

/** Reads inside generated sentences, e.g. "A subscription-availability test". */
export function experimentPhrase(experimentType: string): string {
  return EXPERIMENT_PHRASES[experimentType] ?? 'further';
}

const SECTION_PLACEMENT: Record<CompetitiveReportSectionName, string> = {
  yourAdvantages: 'Your advantages',
  competitorAdvantages: 'Competitor advantages',
  appearsToBeWorking: 'What appears to be working',
  whatToTestNext: 'What to test next',
};

/** The drawer's "What the report says" sentence. */
export function reportPlacementSentence(
  section: CompetitiveReportSectionName,
  kindLabel: string,
): string {
  const lowered = kindLabel.charAt(0).toLowerCase() + kindLabel.slice(1);
  return `Listed in your report under ${SECTION_PLACEMENT[section]}, as ${article(lowered)} ${lowered}.`;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

const COUNT_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** Small counts read as words inside notice sentences. */
export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Joins clauses as "a", "a and b", "a, b, and c". */
export function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0]!;
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}
