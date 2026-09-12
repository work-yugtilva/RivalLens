import { createHash } from 'node:crypto';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

/**
 * Gemini-only transport-schema projection.
 *
 * Google's `responseJsonSchema` field on `generateContent` only supports a documented
 * subset of JSON Schema keywords (see the `GenerateContentConfig.responseJsonSchema` doc
 * comment shipped in `@google/genai`, and https://ai.google.dev/gemini-api/docs/structured-output).
 * `zod-to-json-schema` emits several keywords outside that subset (`$schema`, `pattern`,
 * `minLength`, `maxLength`, `const`), which makes Google's API reject the request with an
 * HTTP 400 before any generation happens.
 *
 * This projector produces a Gemini-compatible transport schema from that raw output. It is
 * strictly an aid to model generation, not a trust boundary: `validateIntelligenceSynthesis`
 * always re-validates the model's raw output against the full, untouched canonical Zod schema,
 * which still enforces every constraint dropped here. OpenAI, Anthropic, and the OpenAI-compatible
 * adapters are untouched by this module and keep their own (stronger) structured-output schemas.
 */

const GEMINI_SUPPORTED_KEYWORDS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

// Keywords `zod-to-json-schema` may emit that only relax a constraint (the property/type/
// required-ness they sit on is untouched) and have no Gemini-supported equivalent. Dropping
// them narrows what the transport schema nudges the model toward; it never changes what shape
// a conforming value has to take, so it's safe -- the canonical Zod schema still enforces them.
const DROPPABLE_KEYWORDS = new Set(['pattern', 'minLength', 'maxLength', '$schema']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function projectNode(node: unknown, path: string): unknown {
  if (Array.isArray(node)) {
    return node.map((item, index) => projectNode(item, `${path}[${index}]`));
  }
  if (!isPlainObject(node)) {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'const') {
      // `enum` is Gemini-supported and a single-value enum is an exact semantic match for
      // `const` -- a translation, not a loosened constraint.
      result.enum = [value];
      continue;
    }
    if (key === 'properties' && isPlainObject(value)) {
      // Keys here are field names, not JSON Schema keywords -- never keyword-filter them,
      // only project each field's own schema.
      result.properties = Object.fromEntries(
        Object.entries(value).map(([propertyName, propertySchema]) => [
          propertyName,
          projectNode(propertySchema, `${path}.properties.${propertyName}`),
        ]),
      );
      continue;
    }
    if (DROPPABLE_KEYWORDS.has(key)) {
      continue;
    }
    if (!GEMINI_SUPPORTED_KEYWORDS.has(key)) {
      // Fail closed: an unrecognized keyword might carry structural meaning (allOf, not,
      // if/then/else, a new $ref/$defs shape, ...) that we have no safe translation for.
      // Silently dropping it could ship a transport schema whose shape no longer matches
      // the canonical schema's. Surface it instead so the projector's allowlist/translation
      // table gets extended deliberately.
      throw new Error(
        `Gemini transport schema projection: unsupported JSON Schema keyword "${key}" at ${path}. ` +
          'Extend gemini-schema-projection.ts (allowlist or translation) before this can be sent to Gemini.',
      );
    }
    result[key] = projectNode(value, `${path}.${key}`);
  }
  return result;
}

/**
 * Converts a canonical Zod schema to JSON Schema with the exact options the Gemini adapter
 * relies on ($refStrategy 'none': fully inline, no $ref/$defs, since the projector has no
 * translation for those). Exported so tests exercise the same conversion the adapter uses,
 * without duplicating `zod-to-json-schema` as a direct dependency outside `packages/ai`.
 */
export function zodToGeminiCandidateSchema(schema: z.ZodTypeAny): unknown {
  return zodToJsonSchema(schema, { $refStrategy: 'none' });
}

/** Projects a `zod-to-json-schema` output tree onto Gemini's supported `responseJsonSchema` keyword subset. */
export function projectToGeminiTransportSchema(schema: unknown): unknown {
  return projectNode(schema, '$');
}

// A subtree must repeat at least this many times, and be at least this large, to be worth
// hoisting into `$defs` -- keeps trivial nodes (e.g. `{"type":"string"}`) inline and avoids
// churning `$defs` for repeats that don't meaningfully shrink the schema.
const DEDUP_MIN_OCCURRENCES = 2;
const DEDUP_MIN_BYTES = 150;

function canonicalize(node: unknown): string {
  return JSON.stringify(node);
}

function countSubtreeOccurrences(node: unknown, counts: Map<string, number>): void {
  if (Array.isArray(node)) {
    for (const item of node) countSubtreeOccurrences(item, counts);
    return;
  }
  if (!isPlainObject(node)) return;
  const key = canonicalize(node);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const [childKey, value] of Object.entries(node)) {
    if ((childKey === 'properties' || childKey === '$defs') && isPlainObject(value)) {
      // The `properties`/`$defs` MAP (name -> schema) is not itself a schema -- `$ref` can only
      // stand in for a whole schema, never for this keyword's value. Count each named entry's
      // schema as its own independent candidate; never the map.
      for (const fieldSchema of Object.values(value)) countSubtreeOccurrences(fieldSchema, counts);
      continue;
    }
    countSubtreeOccurrences(value, counts);
  }
}

function assertCleanRefs(node: unknown, path: string, defsKeys: ReadonlySet<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => assertCleanRefs(item, `${path}[${index}]`, defsKeys));
    return;
  }
  if (!isPlainObject(node)) return;
  if ('$ref' in node) {
    const siblingKeys = Object.keys(node).filter((key) => key !== '$ref');
    if (siblingKeys.length > 0) {
      throw new Error(
        `Gemini transport schema deduplication produced an illegal $ref with sibling keys at ${path}: ${siblingKeys.join(', ')}. Gemini requires $ref to be the only key in its object.`,
      );
    }
    const target = node.$ref;
    const name = typeof target === 'string' ? target.replace('#/$defs/', '') : undefined;
    if (name === undefined || !defsKeys.has(name)) {
      throw new Error(`Gemini transport schema deduplication produced an unresolved $ref at ${path}: ${String(target)}`);
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    assertCleanRefs(value, `${path}.${key}`, defsKeys);
  }
}

/**
 * Hoists repeated subtrees (post keyword-projection) into a top-level `$defs` dictionary,
 * replacing each occurrence with a bare `{ "$ref": "#/$defs/<name>" }`. This is a pure size/
 * depth optimization for Gemini's transport schema -- the canonical Zod schema (and the
 * validator that checks raw model output against it) is untouched and remains authoritative,
 * since `$ref` resolution is semantically identical to inlining under JSON Schema. Must run
 * *after* `projectToGeminiTransportSchema` so identical-after-projection shapes are recognized
 * as one (e.g. two nodes that only differed by a stripped `pattern`).
 */
export function deduplicateGeminiTransportSchema(schema: unknown): unknown {
  const occurrenceCounts = new Map<string, number>();
  countSubtreeOccurrences(schema, occurrenceCounts);

  const defs: Record<string, unknown> = {};
  const nameByCanonicalForm = new Map<string, string>();

  function nameFor(canonicalForm: string): string {
    const existing = nameByCanonicalForm.get(canonicalForm);
    if (existing) return existing;
    // Deterministic (content-hash-based) so the emitted schema -- and any frozen regression
    // fixture built from it -- is stable across runs given the same input schema.
    const digest = createHash('sha256').update(canonicalForm).digest('hex').slice(0, 10);
    const name = `Def_${digest}`;
    nameByCanonicalForm.set(canonicalForm, name);
    return name;
  }

  function rewriteChildren(node: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'properties' || key === '$defs') && isPlainObject(value)) {
        // See countSubtreeOccurrences: never replace this keyword's map value with a $ref --
        // only the individual named schemas inside it are ever dedup candidates.
        out[key] = Object.fromEntries(
          Object.entries(value).map(([name, fieldSchema]) => [name, rewrite(fieldSchema)]),
        );
        continue;
      }
      out[key] = rewrite(value);
    }
    return out;
  }

  function rewrite(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(rewrite);
    if (!isPlainObject(node)) return node;

    const canonicalForm = canonicalize(node);
    const occurrences = occurrenceCounts.get(canonicalForm) ?? 1;
    const eligible =
      occurrences >= DEDUP_MIN_OCCURRENCES && Buffer.byteLength(canonicalForm, 'utf8') >= DEDUP_MIN_BYTES;

    if (eligible) {
      const name = nameFor(canonicalForm);
      if (!(name in defs)) {
        defs[name] = rewriteChildren(node);
      }
      return { $ref: `#/$defs/${name}` };
    }

    return rewriteChildren(node);
  }

  const rewritten = rewrite(schema);
  const result =
    Object.keys(defs).length === 0
      ? rewritten
      : { ...(rewritten as Record<string, unknown>), $defs: defs };

  assertCleanRefs(result, '$', new Set(Object.keys(defs)));
  return result;
}
