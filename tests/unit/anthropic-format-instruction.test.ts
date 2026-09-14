import { describe, expect, it } from 'vitest';
import { buildAnthropicOutputFormatInstruction } from '../../packages/ai/src/providers/anthropic-format-instruction';
import { renderCanonicalSchemaOutline } from '../../packages/ai/src/providers/schema-outline';
import { llmIntelligenceSynthesisOutputSchema } from '../../packages/schemas/src';

describe('anthropic output-format instruction', () => {
  const instruction = buildAnthropicOutputFormatInstruction(llmIntelligenceSynthesisOutputSchema);

  it('forbids fences and surrounding prose and requires exactly one JSON object', () => {
    expect(instruction).toMatch(/^\n\nOUTPUT FORMAT: Return exactly one JSON object and nothing else\./);
    expect(instruction).toContain('Do not wrap it in markdown code fences.');
    expect(instruction).toContain('Do not write any prose, explanation, or commentary before or after the JSON.');
  });

  it('ends with the shared canonical structure outline', () => {
    expect(instruction.endsWith(renderCanonicalSchemaOutline(llmIntelligenceSynthesisOutputSchema))).toBe(true);
  });

  it('mentions every required canonical structure', () => {
    for (const field of [
      'executiveBriefing',
      'hypotheses',
      'ref',
      'supportingHypothesisRefs',
      'experiments',
      'hypothesisRef',
      'claimReferences',
      'numericClaims',
      'epistemicClassDependencies',
      'uncertainty',
      'design',
      'caveat',
      'guardrailMetrics',
      'primaryMetric',
      'claimedEpistemicClass',
      'valueRole',
    ]) {
      expect(instruction).toContain(field);
    }
    expect(instruction).toMatch(/ref: string \(pattern: [^)]+\)/);
  });

  it('preserves every required enum value', () => {
    const enumValues = [
      'shipping_friction', 'purchase_risk_reduction', 'repeat_purchase_mechanics',
      'promotional_incentives', 'pricing_strategy', 'bundle_packaging',
      'medium', 'low',
      'observed', 'derived', 'estimated', 'reported',
      'usd', 'days', 'percent', 'percentage_points',
      'owned', 'competitor', 'delta', 'previous', 'current',
      'competitor_lower', 'competitor_higher', 'increase', 'decrease', 'equal',
      'conversion_effect_not_established', 'retention_effect_not_established',
      'promotion_impact_not_established', 'combined_business_impact_not_established',
      'shipping_margin_exposure', 'policy_return_refund_exposure',
      'subscription_customer_fit_and_cancellation', 'promotion_margin_exposure',
      'conversion_rate', 'checkout_conversion_rate', 'average_order_value',
      'contribution_margin_per_order', 'shipping_cost_per_order', 'return_rate',
      'refund_rate', 'subscription_take_rate', 'subscription_cancellation_rate',
      'control_vs_treatment', 'single_variable',
      'comparison', 'signal', 'observation', 'change', 'snippet',
      'fact', 'absence',
    ];
    for (const value of enumValues) {
      expect(instruction).toContain(`"${value}"`);
    }
  });

  it('describes the original canonical claim-reference shapes, not a transport representation', () => {
    const outline = renderCanonicalSchemaOutline(llmIntelligenceSynthesisOutputSchema);
    expect(outline).toMatch(/kind: "comparison",\n\s+comparisonKey: string,\n\s+competitorId: string/);
    expect(outline).toMatch(/kind: "signal",\n\s+signalId: string/);
    expect(outline).toMatch(/kind: "observation",\n\s+observationId: string/);
    expect(outline).toMatch(/kind: "change",\n\s+changeId: string/);
    expect(outline).toMatch(/kind: "snippet",\n\s+snippetId: string/);
    expect(instruction).not.toContain('referenceId');
  });

  it('carries no JSON Schema keywords or fine-grained Zod constraints', () => {
    expect(instruction).not.toMatch(/minLength|maxLength|\$schema|\$defs|\$ref|additionalProperties/);
  });

  it('is deterministic across repeated calls', () => {
    expect(buildAnthropicOutputFormatInstruction(llmIntelligenceSynthesisOutputSchema)).toBe(instruction);
  });
});
