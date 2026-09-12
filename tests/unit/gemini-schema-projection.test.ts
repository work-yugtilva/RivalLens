import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deduplicateGeminiTransportSchema,
  projectToGeminiTransportSchema,
  zodToGeminiCandidateSchema,
} from '../../packages/ai/src/providers/gemini-schema-projection';
import {
  llmExecutiveBriefingSchema,
  llmIntelligenceSynthesisOutputSchema,
  llmRecommendedExperimentOutputSchema,
} from '../../packages/schemas/src';

const GEMINI_SUPPORTED_KEYWORDS = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items',
  'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties',
  'additionalProperties', 'required', 'propertyOrdering',
]);

const DISALLOWED_KEYWORDS = ['pattern', 'minLength', 'maxLength', 'const', '$schema'] as const;

function collectKeywordUsage(node: unknown, keywords: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectKeywordUsage(item, keywords);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if ((key === 'properties' || key === '$defs') && value && typeof value === 'object') {
      // Field/definition names live here, not schema keywords -- only recurse into each schema.
      for (const nested of Object.values(value as Record<string, unknown>)) {
        collectKeywordUsage(nested, keywords);
      }
      continue;
    }
    keywords.add(key);
    collectKeywordUsage(value, keywords);
  }
}

/** Fully expands every `{ $ref }` node back into its `$defs` content, for equivalence checks against a pre-dedup tree. */
function resolveRefs(node: unknown, defs: Record<string, unknown>): unknown {
  if (Array.isArray(node)) return node.map((item) => resolveRefs(item, defs));
  if (node === null || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  if (typeof record.$ref === 'string') {
    const name = record.$ref.replace('#/$defs/', '');
    return resolveRefs(defs[name], defs);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === '$defs') continue;
    out[key] = resolveRefs(value, defs);
  }
  return out;
}

function collectRefSiblingViolations(node: unknown, path: string, violations: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectRefSiblingViolations(item, `${path}[${index}]`, violations));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if ('$ref' in record) {
    const siblings = Object.keys(record).filter((key) => key !== '$ref');
    if (siblings.length > 0) violations.push(`${path}: ${siblings.join(',')}`);
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    collectRefSiblingViolations(value, `${path}.${key}`, violations);
  }
}

function collectRefTargets(node: unknown, targets: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefTargets(item, targets);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.$ref === 'string') targets.push(record.$ref);
  for (const value of Object.values(record)) collectRefTargets(value, targets);
}

function maxDepth(node: unknown, depth = 0): number {
  if (Array.isArray(node)) {
    return (node as unknown[]).reduce((m: number, item) => Math.max(m, maxDepth(item, depth + 1)), depth);
  }
  if (node === null || typeof node !== 'object') return depth;
  return Object.values(node as Record<string, unknown>).reduce(
    (m: number, value) => Math.max(m, maxDepth(value, depth + 1)),
    depth,
  );
}

function collectPropertyPaths(node: unknown, prefix: string, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectPropertyPaths(item, `${prefix}[${index}]`, out));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.properties && typeof record.properties === 'object') {
    for (const [name, schema] of Object.entries(record.properties as Record<string, unknown>)) {
      const propPath = `${prefix}.${name}`;
      out.add(propPath);
      collectPropertyPaths(schema, propPath, out);
    }
  }
  for (const value of Object.values(record)) {
    if (value !== record.properties) collectPropertyPaths(value, prefix, out);
  }
}

describe('gemini transport schema projection', () => {
  it('canonical synthesis schema still enforces every constraint the transport projection drops', () => {
    // regex
    expect(
      llmIntelligenceSynthesisOutputSchema.shape.hypotheses.element.shape.ref.safeParse('h1').success,
    ).toBe(true);
    expect(
      llmIntelligenceSynthesisOutputSchema.shape.hypotheses.element.shape.ref.safeParse('bad-ref').success,
    ).toBe(false);
    // min/max length -- executiveBriefing/experiment are `.refine()`-wrapped (ZodEffects),
    // so unwrap via `.innerType()` to reach the underlying object's field schemas.
    expect(
      llmExecutiveBriefingSchema.innerType().shape.headline.safeParse('short').success,
    ).toBe(false);
    // literal
    expect(
      llmRecommendedExperimentOutputSchema
        .innerType()
        .shape.design.shape.comparison.safeParse('not_control_vs_treatment').success,
    ).toBe(false);
  });

  it('raw zod-to-json-schema output (undecorated) still contains the keywords Gemini rejects', () => {
    // Proves the projection is Gemini-local: OpenAI/Anthropic adapters call zodToJsonSchema
    // directly (no projector) and are therefore unaffected by this change.
    const raw = zodToGeminiCandidateSchema(llmIntelligenceSynthesisOutputSchema);
    const keywords = new Set<string>();
    collectKeywordUsage(raw, keywords);
    for (const keyword of DISALLOWED_KEYWORDS) {
      expect(keywords.has(keyword)).toBe(true);
    }
  });

  it('projected transport schema contains only Gemini-supported keywords', () => {
    const raw = zodToGeminiCandidateSchema(llmIntelligenceSynthesisOutputSchema);
    const projected = projectToGeminiTransportSchema(raw);
    const keywords = new Set<string>();
    collectKeywordUsage(projected, keywords);
    for (const keyword of keywords) {
      expect(GEMINI_SUPPORTED_KEYWORDS.has(keyword)).toBe(true);
    }
    for (const keyword of DISALLOWED_KEYWORDS) {
      expect(keywords.has(keyword)).toBe(false);
    }
  });

  it('preserves required-ness and property structure exactly (same fields, same nesting)', () => {
    const raw = zodToGeminiCandidateSchema(llmIntelligenceSynthesisOutputSchema);
    const projected = projectToGeminiTransportSchema(raw);
    const rawPaths = new Set<string>();
    const projectedPaths = new Set<string>();
    collectPropertyPaths(raw, '$', rawPaths);
    collectPropertyPaths(projected, '$', projectedPaths);
    expect([...projectedPaths].sort()).toEqual([...rawPaths].sort());
  });

  it('translates every const into a single-value enum with the same value', () => {
    const raw = zodToGeminiCandidateSchema(llmIntelligenceSynthesisOutputSchema);
    const constValues: unknown[] = [];
    (function collect(node: unknown) {
      if (Array.isArray(node)) return node.forEach(collect);
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'const') constValues.push(value);
        collect(value);
      }
    })(raw);
    expect(constValues.length).toBeGreaterThan(0);

    const projected = projectToGeminiTransportSchema(raw);
    const enumSingles: unknown[] = [];
    (function collect(node: unknown) {
      if (Array.isArray(node)) return node.forEach(collect);
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'enum' && Array.isArray(value) && value.length === 1) enumSingles.push(value[0]);
        collect(value);
      }
    })(projected);
    expect(enumSingles.sort()).toEqual([...constValues].sort());
  });

  it('matches the frozen regression fixture (fails loudly on silent drift)', () => {
    const raw = zodToGeminiCandidateSchema(llmIntelligenceSynthesisOutputSchema);
    const projected = projectToGeminiTransportSchema(raw);
    const deduped = deduplicateGeminiTransportSchema(projected);
    const fixturePath = path.join(__dirname, 'gemini-schema-projection.fixture.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
    expect(deduped).toEqual(fixture);
  });

  describe('$defs/$ref deduplication', () => {
    function buildDeduped() {
      const raw = zodToGeminiCandidateSchema(llmIntelligenceSynthesisOutputSchema);
      const projected = projectToGeminiTransportSchema(raw);
      const deduped = deduplicateGeminiTransportSchema(projected);
      return { projected, deduped };
    }

    it('produces $defs/$ref (the real schema has repeated subtrees worth hoisting)', () => {
      const { deduped } = buildDeduped();
      const record = deduped as Record<string, unknown>;
      expect(record.$defs).toBeDefined();
      expect(Object.keys(record.$defs as object).length).toBeGreaterThan(0);
    });

    it('never emits a $ref with sibling keys', () => {
      const { deduped } = buildDeduped();
      const violations: string[] = [];
      collectRefSiblingViolations(deduped, '$', violations);
      expect(violations).toEqual([]);
    });

    it('every $ref resolves to an existing $defs entry', () => {
      const { deduped } = buildDeduped();
      const defsKeys = new Set(Object.keys((deduped as Record<string, unknown>).$defs as object));
      const targets: string[] = [];
      collectRefTargets(deduped, targets);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(defsKeys.has(target.replace('#/$defs/', ''))).toBe(true);
      }
    });

    it('$defs entries contain only Gemini-supported keywords', () => {
      const { deduped } = buildDeduped();
      const keywords = new Set<string>();
      collectKeywordUsage(deduped, keywords);
      for (const keyword of keywords) {
        expect(GEMINI_SUPPORTED_KEYWORDS.has(keyword)).toBe(true);
      }
    });

    it('is semantically equivalent to the pre-dedup projected tree (round-trips through $ref resolution)', () => {
      const { projected, deduped } = buildDeduped();
      const defs = ((deduped as Record<string, unknown>).$defs ?? {}) as Record<string, unknown>;
      const resolved = resolveRefs(deduped, defs);
      expect(resolved).toEqual(projected);
    });

    it('preserves required-ness and property structure exactly, once $refs are resolved', () => {
      const { projected, deduped } = buildDeduped();
      const defs = ((deduped as Record<string, unknown>).$defs ?? {}) as Record<string, unknown>;
      const resolved = resolveRefs(deduped, defs);
      const projectedPaths = new Set<string>();
      const resolvedPaths = new Set<string>();
      collectPropertyPaths(projected, '$', projectedPaths);
      collectPropertyPaths(resolved, '$', resolvedPaths);
      expect([...resolvedPaths].sort()).toEqual([...projectedPaths].sort());
    });

    it('stays within a self-imposed complexity budget (regression guard, not a documented Gemini limit)', () => {
      const { deduped } = buildDeduped();
      const bytes = Buffer.byteLength(JSON.stringify(deduped), 'utf8');
      // Measured today: ~7.5KB / depth 9 after dedup (down from ~18.8KB / depth 8 pre-dedup --
      // dedup shrinks bytes a lot but the flat $defs dictionary itself adds a few levels back).
      // Budget is set with margin so ordinary schema growth doesn't trip it; a large jump is
      // worth a second look given Gemini's own "overly complex schemas may be rejected" warning.
      expect(bytes).toBeLessThan(12_000);
      expect(maxDepth(deduped)).toBeLessThanOrEqual(12);
    });

    it('is a no-op (returns the input unchanged) when nothing repeats', () => {
      const input = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a', 'b'] };
      expect(deduplicateGeminiTransportSchema(input)).toEqual(input);
    });

    it('does not extract small repeated nodes below the size threshold', () => {
      const input = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
        },
        required: ['a', 'b', 'c'],
      };
      const result = deduplicateGeminiTransportSchema(input) as Record<string, unknown>;
      expect(result.$defs).toBeUndefined();
      expect(result).toEqual(input);
    });
  });

  it('fails closed on an unsupported keyword with no defined translation', () => {
    expect(() => projectToGeminiTransportSchema({ type: 'object', not: { type: 'string' } })).toThrow(
      /unsupported JSON Schema keyword "not"/,
    );
    expect(() =>
      projectToGeminiTransportSchema({ type: 'number', multipleOf: 5 }),
    ).toThrow(/unsupported JSON Schema keyword "multipleOf"/);
    expect(() =>
      projectToGeminiTransportSchema({ allOf: [{ type: 'string' }] }),
    ).toThrow(/unsupported JSON Schema keyword "allOf"/);
  });

  it('leaves supported keywords (type, format, enum, items, min/maxItems, min/maximum) untouched', () => {
    const input = {
      type: 'object',
      properties: {
        n: { type: 'number', minimum: 1, maximum: 10 },
        list: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        e: { type: 'string', enum: ['a', 'b'] },
        f: { type: 'string', format: 'uuid' },
      },
      required: ['n', 'list', 'e', 'f'],
      additionalProperties: false,
    };
    expect(projectToGeminiTransportSchema(input)).toEqual(input);
  });
});
