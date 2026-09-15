import { randomUUID } from 'node:crypto';
import {
  DeterministicMockIntelligenceProvider,
  type DeterministicMockScenario,
  type DeterministicMockSequence,
  type IntelligenceModelProvider,
} from '../../packages/ai/src';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateCompetitiveSignals } from '../../apps/web/src/lib/internal/competitive-signals';
import {
  loadLatestCompetitiveIntelligenceReport,
} from '../../apps/web/src/lib/internal/competitive-reports';
import { generateCompetitiveIntelligenceReport } from '../../apps/web/src/lib/internal/llm-report-runtime';
import {
  PRODUCTION_PROVIDER_DESCRIPTORS,
  type ProductionProviderId,
  type ProductionProviderSelection,
} from '../../apps/web/src/lib/internal/llm-provider-policy';
import { resolveReportProvenance } from '../../apps/web/src/lib/overview/provenance';

const GENERATED_AT = '2026-09-14T12:00:00.000Z';

type Fixture = {
  member: SupabaseClient;
  outsider: SupabaseClient;
  admin: SupabaseClient;
  brandId: string;
  competitorId: string;
  outsiderBrandId: string;
};

let fixture: Fixture;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local integration environment: ${name}`);
  return value;
}

async function assertWrite(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

async function createMember(admin: SupabaseClient, email: string) {
  const password = `Local-${randomUUID()}-pass`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'Missing user');
  const client = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(signedIn.error.message);
  return client;
}

async function onboard(client: SupabaseClient, suffix: string) {
  const { data, error } = await client.rpc('create_onboarding_brand', {
    target_organization_id: null,
    organization_name: `Runtime ${suffix}`,
    brand_name: `Brand ${suffix}`,
    brand_domain: `brand-${suffix}.test`,
    competitor_domains: [`competitor-${suffix}.test`],
  });
  if (error) throw new Error(error.message);
  const brandId = data[0]!.brand_id as string;
  const competitor = await client
    .from('competitors')
    .select('id')
    .eq('brand_id', brandId)
    .single();
  if (competitor.error) throw new Error(competitor.error.message);
  return { brandId, competitorId: competitor.data.id as string };
}

async function seedEvidence(admin: SupabaseClient, brandId: string, competitorId: string) {
  const ownedSourceId = randomUUID();
  const competitorSourceId = randomUUID();
  const ownedSnapshotId = randomUUID();
  const competitorSnapshotId = randomUUID();
  await assertWrite(
    await admin.from('sources').insert([
      {
        id: ownedSourceId,
        brand_id: brandId,
        competitor_id: null,
        connector_type: 'website',
        source_type: 'pricing_offers',
        canonical_url: 'https://brand-runtime.test/offers',
      },
      {
        id: competitorSourceId,
        brand_id: brandId,
        competitor_id: competitorId,
        connector_type: 'website',
        source_type: 'pricing_offers',
        canonical_url: 'https://competitor-runtime.test/offers',
      },
    ]),
  );
  await assertWrite(
    await admin.from('snapshots').insert([
      {
        id: ownedSnapshotId,
        source_id: ownedSourceId,
        captured_at: GENERATED_AT,
        final_url: 'https://brand-runtime.test/offers',
        http_status: 200,
        content_type: 'text/html',
        raw_content_hash: `sha256:${'1'.repeat(64)}`,
        content_hash: `sha256:${'2'.repeat(64)}`,
        raw_artifact_path: 'local-e2e/owned.html.gz',
      },
      {
        id: competitorSnapshotId,
        source_id: competitorSourceId,
        captured_at: GENERATED_AT,
        final_url: 'https://competitor-runtime.test/offers',
        http_status: 200,
        content_type: 'text/html',
        raw_content_hash: `sha256:${'3'.repeat(64)}`,
        content_hash: `sha256:${'4'.repeat(64)}`,
        raw_artifact_path: 'local-e2e/competitor.html.gz',
      },
    ]),
  );
  await assertWrite(
    await admin.from('observations').insert([
      {
        id: randomUUID(),
        snapshot_id: ownedSnapshotId,
        subject_id: brandId,
        fact_type: 'offer.free_shipping',
        source_url: 'https://brand-runtime.test/offers',
        payload: { threshold: 75 },
        extraction_method: 'dom',
        confidence: 0.95,
        extractor_version: 'local-e2e-v1',
        candidate_hash: `sha256:${'5'.repeat(64)}`,
        observed_at: GENERATED_AT,
      },
      {
        id: randomUUID(),
        snapshot_id: competitorSnapshotId,
        subject_id: competitorId,
        fact_type: 'offer.free_shipping',
        source_url: 'https://competitor-runtime.test/offers',
        payload: { threshold: 50 },
        extraction_method: 'dom',
        confidence: 0.95,
        extractor_version: 'local-e2e-v1',
        candidate_hash: `sha256:${'6'.repeat(64)}`,
        observed_at: GENERATED_AT,
      },
    ]),
  );
}

function pinnedProvider(
  providerId: ProductionProviderId,
  scenario: DeterministicMockScenario | DeterministicMockSequence,
) {
  const inner = new DeterministicMockIntelligenceProvider(scenario);
  const descriptor = PRODUCTION_PROVIDER_DESCRIPTORS[providerId];
  const provider: IntelligenceModelProvider = {
    providerId,
    modelId: descriptor.modelId,
    async generateStructured(request) {
      const response = await inner.generateStructured(request);
      return {
        ...response,
        telemetry: { ...response.telemetry, providerId, modelId: descriptor.modelId },
      };
    },
  };
  return { descriptor, provider, calls: () => inner.calls };
}

function selection(
  primary: ReturnType<typeof pinnedProvider>,
): ProductionProviderSelection {
  return { status: 'ready', primary: { descriptor: primary.descriptor, provider: primary.provider } };
}

beforeAll(async () => {
  const admin = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const member = await createMember(admin, `runtime-member-${randomUUID()}@example.test`);
  const outsider = await createMember(admin, `runtime-outsider-${randomUUID()}@example.test`);
  const owned = await onboard(member, randomUUID());
  const other = await onboard(outsider, randomUUID());
  await seedEvidence(admin, owned.brandId, owned.competitorId);
  const signals = await generateCompetitiveSignals(member, {
    brandId: owned.brandId,
    competitorIds: [owned.competitorId],
    generatedAt: GENERATED_AT,
  });
  if (signals.status !== 'ok' || signals.signals.length === 0) {
    throw new Error('Local source state did not produce persisted deterministic signals.');
  }
  fixture = {
    member,
    outsider,
    admin,
    brandId: owned.brandId,
    competitorId: owned.competitorId,
    outsiderBrandId: other.brandId,
  };
}, 30_000);

describe.sequential('local production LLM report runtime', () => {
  it('runs authorization → context → Phase 5 → accepted llm_* rows → v2 loader/evidence', async () => {
    const provider = pinnedProvider('anthropic', 'valid');
    const runId = randomUUID();
    const generated = await generateCompetitiveIntelligenceReport(
      fixture.member,
      { brandId: fixture.brandId, competitorIds: [fixture.competitorId], generatedAt: GENERATED_AT },
      { resolveProviders: () => selection(provider), createGenerationRunId: () => runId },
    );
    expect(generated.status).toBe('ok');
    if (generated.status !== 'ok') return;
    expect(generated.report.reportEngineVersion).toBe('competitive-report-v2-llm');
    expect(provider.calls()).toBe(1);

    const run = await fixture.admin
      .from('intelligence_generation_runs')
      .select('id, provider_id, model_id, outcome')
      .eq('id', runId)
      .single();
    expect(run.error).toBeNull();
    expect(run.data).toMatchObject({
      provider_id: 'anthropic',
      model_id: 'claude-sonnet-4-6',
      outcome: 'llm_success',
    });
    const hypotheses = await fixture.admin
      .from('llm_strategic_hypotheses')
      .select('id')
      .eq('generation_run_id', runId);
    expect(hypotheses.error).toBeNull();
    expect(hypotheses.data?.length).toBeGreaterThan(0);

    const loaded = await loadLatestCompetitiveIntelligenceReport(fixture.member, {
      brandId: fixture.brandId,
      competitorIds: [fixture.competitorId],
    });
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.report.id).toBe(generated.report.id);
    expect(JSON.stringify(loaded.report)).not.toContain(runId);
    const provenance = await resolveReportProvenance(fixture.member, loaded.report);
    expect(provenance.status).toBe('ok');

    const auditRead = await fixture.member.from('intelligence_generation_attempts').select('*');
    expect(auditRead.error).not.toBeNull();
  }, 30_000);

  it('persists bounded provider failure audit and returns deterministic v1', async () => {
    const provider = pinnedProvider('gemini', ['timeout', 'timeout']);
    const runId = randomUUID();
    const generated = await generateCompetitiveIntelligenceReport(
      fixture.member,
      { brandId: fixture.brandId, competitorIds: [fixture.competitorId], generatedAt: GENERATED_AT },
      { resolveProviders: () => selection(provider), createGenerationRunId: () => runId },
    );
    expect(generated.status).toBe('ok');
    if (generated.status !== 'ok') return;
    expect(generated.report.reportEngineVersion).toBe('competitive-report-v1');
    expect(provider.calls()).toBe(2);
    const audit = await fixture.admin
      .from('intelligence_generation_runs')
      .select('outcome, fallback_reason')
      .eq('id', runId)
      .single();
    expect(audit.data).toEqual({
      outcome: 'deterministic_fallback',
      fallback_reason: 'PROVIDER_RETRY_EXHAUSTED',
    });
    const reportRow = await fixture.admin
      .from('competitive_intelligence_reports')
      .select('generation_run_id')
      .eq('id', generated.report.id)
      .single();
    expect(reportRow.data?.generation_run_id).toBeNull();
  }, 30_000);

  it('denies a cross-organization request before provider or privileged persistence', async () => {
    const resolveProviders = () => {
      throw new Error('provider selection must not run');
    };
    const before = await fixture.admin
      .from('intelligence_generation_runs')
      .select('id', { count: 'exact', head: true });
    const result = await generateCompetitiveIntelligenceReport(
      fixture.outsider,
      { brandId: fixture.brandId, competitorIds: [fixture.competitorId], generatedAt: GENERATED_AT },
      { resolveProviders },
    );
    expect(result).toEqual({ status: 'brand_not_found' });
    const after = await fixture.admin
      .from('intelligence_generation_runs')
      .select('id', { count: 'exact', head: true });
    expect(after.count).toBe(before.count);
    expect(fixture.outsiderBrandId).not.toBe(fixture.brandId);
  });
});
