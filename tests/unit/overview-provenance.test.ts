import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  previewEvidence,
  previewReport,
  previewDrawers,
  PREVIEW_NOW,
} from '../../apps/web/src/lib/overview/preview-fixtures';
import {
  buildReportProvenance,
  resolveReportProvenance,
} from '../../apps/web/src/lib/overview/provenance';
import { buildReportView } from '../../apps/web/src/lib/overview/report-view';

function fixture() {
  return previewEvidence(previewReport('complete')!);
}
function evidenceText(drawer: ReturnType<typeof previewDrawers>[string]) {
  return JSON.stringify(drawer.steps.find((step) => step.kind === 'evidence'));
}
function client(tables: Record<string, Record<string, unknown>[]>) {
  const reads: { table: string; ids?: unknown[] }[] = [];
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    let single = false;
    const read: (typeof reads)[number] = { table };
    reads.push(read);
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        rows = rows.filter((r) => r[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        if (key === 'id') read.ids = values;
        rows = rows.filter((r) => values.includes(r[key]));
        return query;
      },
      maybeSingle: () => {
        single = true;
        return query;
      },
      then: (done: (value: unknown) => unknown) =>
        Promise.resolve(done({ data: single ? (rows[0] ?? null) : rows, error: null })),
    };
    return query;
  };
  return { supabase: { from } as unknown as Parameters<typeof resolveReportProvenance>[0], reads };
}

describe('Overview saved provenance', () => {
  it('retains referenced captures after newer observations arrive and limits reads to their IDs', async () => {
    const { report, evidence } = fixture();
    const original = evidence.observations.find((r) => r.fact_type === 'offer.free_shipping')!;
    const newerSnapshot = {
      ...evidence.snapshots.find((row) => row.id === original.snapshot_id)!,
      id: '88888888-8888-4888-8888-888888888888',
      captured_at: '2026-09-07T10:00:00Z',
    };
    const newer = {
      ...original,
      id: '99999999-9999-4999-8999-999999999999',
      snapshot_id: newerSnapshot.id,
      payload: { threshold: 999 },
      observed_at: '2026-09-07T10:00:00Z',
    };
    const { supabase, reads } = client({
      brands: [{ id: report.brandId, domain: evidence.ownedDomain }],
      sources: evidence.sources,
      snapshots: [...evidence.snapshots, newerSnapshot],
      observations: [...evidence.observations, newer],
    });
    const result = await resolveReportProvenance(supabase, report);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Missing result');
    expect(result.provenance).toEqual(buildReportProvenance(report, evidence));
    expect(reads.find((r) => r.table === 'observations')!.ids).not.toContain(newer.id);
    expect(reads.find((r) => r.table === 'snapshots')!.ids).not.toContain(newerSnapshot.id);
    expect(JSON.stringify(result.provenance)).not.toContain('$999');
  });

  it.each(['missing', 'wrong snapshot', 'wrong subject', 'wrong brand'] as const)(
    'explains %s evidence without substituting values',
    (failure) => {
      const { report, evidence } = fixture();
      const target = evidence.observations.find((r) => r.fact_type === 'policy.return_window')!;
      if (failure === 'missing')
        evidence.observations = evidence.observations.filter((r) => r !== target);
      if (failure === 'wrong snapshot') target.snapshot_id = evidence.snapshots[2]!.id;
      if (failure === 'wrong subject') target.subject_id = report.competitors[0]!.id;
      if (failure === 'wrong brand') evidence.sources[0]!.brand_id = report.competitors[0]!.id;
      const drawer = buildReportProvenance(report, evidence)['yourAdvantages:0']!;
      expect(evidenceText(drawer)).toContain('no longer available');
      expect(evidenceText(drawer)).not.toContain('60-day');
      expect(evidenceText(drawer)).toContain('30-day');
    },
  );

  it('keeps return, shipping, subscription, and experiment chains distinct', () => {
    const drawers = previewDrawers(previewReport('complete')!);
    expect(evidenceText(drawers['yourAdvantages:0']!)).toContain('60-day return window');
    expect(evidenceText(drawers['yourAdvantages:0']!)).not.toContain('shipping on orders');
    expect(evidenceText(drawers['competitorAdvantages:0']!)).toContain('over $75');
    for (const key of ['competitorAdvantages:1', 'appearsToBeWorking:1', 'whatToTestNext:1']) {
      expect(evidenceText(drawers[key]!)).toContain('recorded as explicitly absent');
      expect(evidenceText(drawers[key]!)).toContain('Subscription page');
      expect(evidenceText(drawers[key]!)).not.toContain('$75');
    }
    for (const key of ['whatToTestNext:0', 'whatToTestNext:1']) {
      expect(drawers[key]!.steps.map((s) => s.kind)).toEqual([
        'report',
        'meaning',
        'compared',
        'evidence',
      ]);
    }
    expect(JSON.stringify(drawers)).not.toMatch(/sha256:|00000000-|subscription\.available/);
  });

  it('validates externally loaded observations before domain mapping', async () => {
    const { report, evidence } = fixture();
    const { supabase } = client({
      brands: [{ id: report.brandId, domain: evidence.ownedDomain }],
      sources: evidence.sources,
      snapshots: evidence.snapshots,
      observations: evidence.observations.map((r) => ({ ...r, confidence: 200 })),
    });
    await expect(resolveReportProvenance(supabase, report)).rejects.toThrow();
  });

  it('does not query evidence outside a brand visible to the authenticated client', async () => {
    const { report, evidence } = fixture();
    const { supabase, reads } = client({ brands: [], observations: evidence.observations });
    expect(await resolveReportProvenance(supabase, report)).toEqual({ status: 'scope_not_found' });
    expect(reads).toEqual([{ table: 'brands' }]);
  });

  it('loads the exact experiment parent when the report section omits that hypothesis', async () => {
    const { report, evidence } = fixture();
    const parent = report.sections.appearsToBeWorking.pop()!;
    const id = parent.provenance.hypotheses[0]!.hypothesisId;
    const { supabase, reads } = client({
      brands: [{ id: report.brandId, domain: evidence.ownedDomain }],
      sources: evidence.sources,
      snapshots: evidence.snapshots,
      observations: evidence.observations,
      strategic_hypotheses: [
        {
          id,
          owned_brand_id: report.brandId,
          competitor_id: parent.competitorId,
          hypothesis_type: parent.hypothesisType,
          statement: parent.statement,
          uncertainty_statement: parent.uncertainty.statement,
        },
      ],
    });
    const result = await resolveReportProvenance(supabase, report);
    if (result.status !== 'ok') throw new Error('Missing result');
    expect(
      result.provenance['whatToTestNext:1']!.steps.find((step) => step.kind === 'meaning'),
    ).toMatchObject({ statement: parent.statement, uncertainty: parent.uncertainty.statement });
    expect(reads.find((read) => read.table === 'strategic_hypotheses')?.ids).toEqual([id]);
  });
});

describe('Overview completeness regressions', () => {
  it('counts the two distinct unresolved comparisons and one pending test once each', () => {
    const view = buildReportView({ report: previewReport('partial')!, now: PREVIEW_NOW });
    expect(view.status.gapCountLabel).toBe('3 gaps');
    expect(view.sections[1]!.unresolved.map((r) => r.title)).toEqual([
      'Guarantee duration',
      'Return window',
    ]);
    expect(view.sections[3]!.countLine).toBe('1 of 2 shown · 1 awaiting generation');
  });
  it('deduplicates matching comparison/signal unknowns and preserves insufficient status', () => {
    expect(
      buildReportView({ report: previewReport('unresolved')!, now: PREVIEW_NOW }).status
        .gapCountLabel,
    ).toBe('1 gap');
    expect(
      buildReportView({ report: previewReport('insufficient')!, now: PREVIEW_NOW }).status.label,
    ).toBe('Insufficient');
  });
});
