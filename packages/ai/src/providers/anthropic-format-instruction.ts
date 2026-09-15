import type { z } from 'zod';
import { renderCanonicalSchemaOutline } from './schema-outline';

/**
 * Anthropic-only compact output-format instruction.
 *
 * Anthropic receives no server-enforced schema (see anthropic.ts), so Claude is told the output
 * contract in the system instruction instead. The prefix is Anthropic-specific because the
 * Messages API has no JSON mode at all: nothing on the server stops markdown fences or prose, so
 * the instruction forbids them explicitly. The structure outline is the provider-neutral
 * `renderCanonicalSchemaOutline` (shared with Gemini) and describes the ORIGINAL canonical claim
 * reference shapes -- there is no transport representation and no normalization step.
 *
 * Formatting guidance only, not a trust boundary: a fixed source constant plus an outline derived
 * from the trusted response schema, never from request context. `validateIntelligenceSynthesis`
 * remains the sole acceptance path; fenced or prose-wrapped output simply fails closed.
 */

const ANTHROPIC_OUTPUT_FORMAT_PREFIX =
  '\n\nOUTPUT FORMAT: Return exactly one JSON object and nothing else. ' +
  'Do not wrap it in markdown code fences. Do not write any prose, explanation, or commentary before or after the JSON. ' +
  'The first character of your response must be "{" and the last character must be "}". ' +
  'The object must follow the RivalLens synthesis structure below exactly: use these field names, include every field ' +
  'not marked "?", and use only the quoted enum/literal values shown. "X[]" means a JSON array of X; a union of quoted ' +
  'values followed by "[]" means an array whose items are each one of those values. Names like Def_xxxxxxxxxx are shapes defined ' +
  'under "Referenced shapes" and reused wherever they appear. Each claim reference is exactly one of the kind-specific ' +
  'shapes: kind "comparison" uses comparisonKey and competitorId, kind "signal" uses signalId, kind "observation" uses ' +
  'observationId, kind "change" uses changeId, kind "snippet" uses snippetId. ' +
  'Structure only -- full validation happens after generation:\n';

/** Builds the Anthropic-only compact output-format instruction for a given canonical Zod schema. */
export function buildAnthropicOutputFormatInstruction(schema: z.ZodTypeAny): string {
  return ANTHROPIC_OUTPUT_FORMAT_PREFIX + renderCanonicalSchemaOutline(schema);
}
