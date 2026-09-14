import type { z } from 'zod';
import { renderCanonicalSchemaOutline } from './schema-outline';

/**
 * Gemini-only compact output-format instruction.
 *
 * Gemini no longer receives a server-enforced `responseJsonSchema` (see gemini.ts) -- Google
 * rejected the fully keyword-legal, deduplicated transport schema from pass 2 with the same
 * pre-generation HTTP 400. Instead Gemini gets `responseMimeType: 'application/json'` plus this
 * compact, prompt-level description of the expected shape, the same category of "JSON mode"
 * transport the OpenAI-compatible adapters already use (see `OUTPUT_FORMAT_INSTRUCTION` in
 * openai-compatible.ts). This is formatting guidance only -- it carries no strategic/grounding
 * content (that stays in `INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT`) and is not a trust boundary:
 * `validateIntelligenceSynthesis` re-parses the raw output against the full canonical Zod schema
 * regardless of what this instruction says.
 *
 * The structure outline itself is the provider-neutral `renderCanonicalSchemaOutline` (shared
 * with the Anthropic adapter); only this prefix is Gemini-specific.
 */

const OUTPUT_FORMAT_PREFIX =
  '\n\nOUTPUT FORMAT: Respond with a single JSON object shaped exactly like this ' +
  '(structure only -- full validation happens after generation):\n';

/** Builds the Gemini-only compact output-format instruction for a given canonical Zod schema. */
export function buildGeminiOutputFormatInstruction(schema: z.ZodTypeAny): string {
  return OUTPUT_FORMAT_PREFIX + renderCanonicalSchemaOutline(schema);
}
