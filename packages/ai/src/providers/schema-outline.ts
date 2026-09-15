import type { z } from 'zod';
import { deduplicateGeminiTransportSchema, zodToGeminiCandidateSchema } from './gemini-schema-projection';

/**
 * Provider-neutral compact structure outline of a canonical RivalLens Zod schema, used by the
 * prompt-guided JSON adapters (Gemini, Anthropic) that receive no server-enforced schema. Each
 * adapter wraps this outline in its own provider-specific OUTPUT FORMAT prefix.
 *
 * Formatting guidance only -- NOT a trust boundary. `validateIntelligenceSynthesis` re-parses raw
 * model output against the full canonical Zod schema regardless of what this outline says, and
 * fine-grained refinements (lengths, counts, cross-field rules) are deliberately not reproduced.
 *
 * Reuses the existing, already-tested `zodToGeminiCandidateSchema` (plain `zod-to-json-schema`
 * conversion) and `deduplicateGeminiTransportSchema` (hoists repeated subtrees into `$defs`) so
 * repeated shapes (the grounded-claim-reference union, the numeric-claim shape) are described
 * once and referenced by name, not inlined 3x/6x. Both are structure-preserving and carry no
 * Gemini-specific keyword filtering; `projectToGeminiTransportSchema` is deliberately NOT used,
 * since it strips `pattern`/`const`/`format`, which are useful in prose.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function renderNode(node: unknown, indent: string): string {
  if (!isPlainObject(node)) return 'unknown';
  if (typeof node.$ref === 'string') return node.$ref.replace('#/$defs/', '');
  if ('const' in node) return JSON.stringify(node.const);
  if (Array.isArray(node.enum)) {
    const values = node.enum as unknown[];
    return values.length === 1 ? JSON.stringify(values[0]) : values.map((value) => JSON.stringify(value)).join(' | ');
  }
  if (Array.isArray(node.anyOf)) {
    return (node.anyOf as unknown[]).map((branch) => renderNode(branch, indent)).join(' | ');
  }
  if (node.type === 'array') return `${renderNode(node.items, indent)}[]`;
  if (node.type === 'object' && isPlainObject(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    const entries = Object.entries(node.properties).map(([name, propertySchema]) => {
      const optionalMarker = required.has(name) ? '' : '?';
      return `${indent}  ${name}${optionalMarker}: ${renderNode(propertySchema, `${indent}  `)}`;
    });
    return `{\n${entries.join(',\n')}\n${indent}}`;
  }
  if (node.type === 'string' && typeof node.pattern === 'string') {
    return `string (pattern: ${node.pattern})`;
  }
  if (node.type === 'string' && typeof node.format === 'string') {
    return `string (format: ${node.format})`;
  }
  if (typeof node.type === 'string') return node.type;
  return 'unknown';
}

function renderOutline(deduped: unknown): string {
  if (!isPlainObject(deduped)) return renderNode(deduped, '');
  const defs = isPlainObject(deduped.$defs) ? deduped.$defs : {};
  const mainNode: Record<string, unknown> = { ...deduped };
  delete mainNode.$defs;
  const mainRendered = renderNode(mainNode, '');
  const defEntries = Object.entries(defs);
  if (defEntries.length === 0) return mainRendered;
  const defsRendered = defEntries
    .map(([name, defSchema]) => `${name} = ${renderNode(defSchema, '')}`)
    .join('\n\n');
  return `${mainRendered}\n\nReferenced shapes:\n${defsRendered}`;
}

/** Renders the compact structure outline for a canonical Zod schema. Deterministic. */
export function renderCanonicalSchemaOutline(schema: z.ZodTypeAny): string {
  return renderOutline(deduplicateGeminiTransportSchema(zodToGeminiCandidateSchema(schema)));
}
