import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildGeminiOutputFormatInstruction } from '../../packages/ai/src/providers/gemini-format-instruction';
import { llmIntelligenceSynthesisOutputSchema } from '../../packages/schemas/src';

describe('gemini output-format instruction', () => {
  const instruction = buildGeminiOutputFormatInstruction(llmIntelligenceSynthesisOutputSchema);

  it('starts with the fixed OUTPUT FORMAT prefix', () => {
    expect(instruction).toMatch(/^\n\nOUTPUT FORMAT: Respond with a single JSON object/);
  });

  it('mentions every required top-level field family', () => {
    for (const field of [
      'executiveBriefing',
      'hypotheses',
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
    ]) {
      expect(instruction).toContain(field);
    }
  });

  it('preserves every required enum value', () => {
    const enumValues = [
      // theme
      'shipping_friction', 'purchase_risk_reduction', 'repeat_purchase_mechanics',
      'promotional_incentives', 'pricing_strategy', 'bundle_packaging',
      // confidence
      'medium', 'low',
      // epistemic class
      'observed', 'derived', 'estimated', 'reported',
      // unit
      'usd', 'days', 'percent', 'percentage_points',
      // valueRole
      'owned', 'competitor', 'delta', 'previous', 'current',
      // uncertainty category
      'conversion_effect_not_established', 'retention_effect_not_established',
      'promotion_impact_not_established', 'combined_business_impact_not_established',
      // caveat category
      'shipping_margin_exposure', 'policy_return_refund_exposure',
      'subscription_customer_fit_and_cancellation', 'promotion_margin_exposure',
      // experiment metric names
      'conversion_rate', 'checkout_conversion_rate', 'average_order_value',
      'contribution_margin_per_order', 'shipping_cost_per_order', 'return_rate',
      'refund_rate', 'subscription_take_rate', 'subscription_cancellation_rate',
      // design literals
      'control_vs_treatment', 'single_variable',
      // claim reference discriminator
      'comparison', 'signal', 'observation', 'change', 'snippet',
      // assertion
      'fact', 'absence',
    ];
    for (const value of enumValues) {
      expect(instruction).toContain(`"${value}"`);
    }
  });

  it('describes each repeated shape exactly once and references it elsewhere by name', () => {
    expect(instruction).toContain('Referenced shapes:');
    // The claim-reference union's "comparison" branch is reused across executiveBriefing,
    // every hypothesis, and every experiment -- its discriminator literal must appear exactly
    // once (inside the referenced-shapes section), not once per usage site.
    const comparisonBranchOccurrences = instruction.split('comparisonKey:').length - 1;
    expect(comparisonBranchOccurrences).toBe(1);
  });

  it('does not reproduce fine-grained Zod constraints (min/max length, $schema, additionalProperties)', () => {
    expect(instruction).not.toMatch(/minLength|maxLength|\$schema|additionalProperties/);
  });

  it('is byte-identical to the instruction produced before the outline renderer was shared with Anthropic', () => {
    expect(createHash('sha256').update(instruction).digest('hex')).toBe(
      '77758ac398f4f2cbf04b1a3dad283c057645158bfc268a49be551b4041f8cacc',
    );
  });

  it('is deterministic across repeated calls', () => {
    const again = buildGeminiOutputFormatInstruction(llmIntelligenceSynthesisOutputSchema);
    expect(again).toBe(instruction);
  });

  it('renders a stable hypothesis ref field with its pattern hint', () => {
    expect(instruction).toMatch(/ref\??: string \(pattern: [^)]+\)/);
  });
});
