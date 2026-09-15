begin;

select plan(85);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'llm-member-one@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'llm-member-two@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role postgres;

insert into public.organizations (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Organization one'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Organization two');
insert into public.organization_members (organization_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'member'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'member');
insert into public.brands (id, organization_id, name, domain) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Brand one', 'brand-one.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Brand two', 'brand-two.test');
insert into public.competitors (id, brand_id, name, domain) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Competitor one', 'competitor-one.test'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Competitor two', 'competitor-two.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Competitor three', 'competitor-three.test');

insert into public.competitive_signals (
  id, owned_brand_id, competitor_id, signal_type, comparison_key, statement,
  supporting_values, confidence, direction, generated_at, rule_version, signal_hash
) values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'competitor_lower_free_shipping_threshold', 'offer.free_shipping_threshold', 'Competitor one has a lower threshold.',
   '{"owned":50,"competitor":30,"unit":"usd"}', 'high', 'competitor_lower', '2026-09-04T12:00:00Z',
   'competitive-signals-v1', 'sha256:1111111111111111111111111111111111111111111111111111111111111111'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003',
   'competitor_lower_free_shipping_threshold', 'offer.free_shipping_threshold', 'Competitor three has a lower threshold.',
   '{"owned":50,"competitor":25,"unit":"usd"}', 'high', 'competitor_lower', '2026-09-04T12:00:00Z',
   'competitive-signals-v1', 'sha256:2222222222222222222222222222222222222222222222222222222222222222'),
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'competitor_longer_return_window', 'policy.return_window_days', 'Competitor one has a longer return window.',
   '{"owned":30,"competitor":60,"unit":"days"}', 'high', 'competitor_higher', '2026-09-04T12:00:00Z',
   'competitive-signals-v1', 'sha256:4444444444444444444444444444444444444444444444444444444444444444');

-- Payload builders (test-only, rolled back). They mirror llmIntelligencePersistencePayloadSchema.
create function pg_temp.llm_provenance(run_id uuid, model_id text default 'model-under-test')
returns jsonb language sql as $$
  select jsonb_build_object(
    'method', 'llm_synthesized',
    'generationRunId', run_id::text,
    'providerId', 'provider-under-test',
    'modelId', model_id,
    'promptVersion', 'intelligence-synthesis-v1',
    'intelligenceContextHash', 'sha256:' || repeat('a', 64),
    'validatorContractVersion', 'intelligence-validator-contract-2026-09-14'
  );
$$;

create function pg_temp.llm_hypothesis(
  run_id uuid,
  ref text,
  competitor_id uuid default 'cccccccc-0000-0000-0000-000000000001',
  signal_id uuid default 'dddddddd-0000-0000-0000-000000000001'
)
returns jsonb language sql as $$
  select jsonb_build_object(
    'ref', ref,
    'competitorId', competitor_id,
    'theme', 'shipping_friction',
    'statement', 'Hypothesis ' || ref || ' may reduce shipping friction.',
    'rationale', 'Derived signal evidence supports testing this possibility.',
    'confidence', 'medium',
    'uncertaintyCategory', 'conversion_effect_not_established',
    'uncertaintyStatement', 'The conversion effect is not established.',
    'assumptions', jsonb_build_array('Shipping policy is visible to customers.'),
    'epistemicClassDependencies', jsonb_build_array('observed', 'derived', 'reported'),
    'supportingSignalIds', jsonb_build_array(signal_id),
    'supportingComparisonKeys', jsonb_build_array('offer.free_shipping_threshold'),
    'claimReferences', jsonb_build_array(
      jsonb_build_object('kind', 'signal', 'signalId', signal_id, 'subjectId', competitor_id,
        'assertion', 'fact', 'claimedEpistemicClass', 'derived'),
      jsonb_build_object('kind', 'snippet', 'snippetId', 'snip-1', 'subjectId', competitor_id,
        'assertion', 'fact', 'claimedEpistemicClass', 'reported')
    ),
    'numericClaims', '[]'::jsonb,
    'hypothesisEngineVersion', 'strategic-hypotheses-v2-llm',
    'generationProvenance', pg_temp.llm_provenance(run_id),
    'hypothesisHash', 'sha256:' || encode(sha256(convert_to(run_id::text || ref, 'UTF8')), 'hex')
  );
$$;

create function pg_temp.llm_experiment(run_id uuid, hypothesis_ref text, title text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'hypothesisRef', hypothesis_ref,
    'competitorId', 'cccccccc-0000-0000-0000-000000000001',
    'title', title,
    'objective', 'Measure whether a threshold change affects checkout behavior.',
    'hypothesisUnderTest', 'A lower threshold may improve checkout completion.',
    'variableUnderTest', 'free_shipping_threshold',
    'design', jsonb_build_object(
      'comparison', 'control_vs_treatment', 'variablePolicy', 'single_variable',
      'controlDescription', 'Keep the current threshold.', 'treatmentDescription', 'Show a lower threshold.'
    ),
    'primaryMetric', 'checkout_conversion_rate',
    'guardrailMetrics', jsonb_build_array('contribution_margin_per_order'),
    'implementationNotes', jsonb_build_array('Keep non-target checkout elements consistent.', 'Review segment balance.'),
    'caveatCategory', 'shipping_margin_exposure',
    'caveatStatement', 'A lower threshold may increase shipping costs.',
    'claimReferences', jsonb_build_array(
      jsonb_build_object('kind', 'comparison', 'comparisonKey', 'offer.free_shipping_threshold',
        'competitorId', 'cccccccc-0000-0000-0000-000000000001',
        'subjectId', 'cccccccc-0000-0000-0000-000000000001', 'assertion', 'fact', 'claimedEpistemicClass', 'observed')
    ),
    'numericClaims', '[]'::jsonb,
    'experimentEngineVersion', 'recommended-experiments-v2-llm',
    'generationProvenance', pg_temp.llm_provenance(run_id),
    'experimentHash', 'sha256:' || encode(sha256(convert_to(run_id::text || title, 'UTF8')), 'hex')
  );
$$;

create function pg_temp.llm_payload(run_id uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'generationRunId', run_id,
    'ownedBrandId', 'bbbbbbbb-0000-0000-0000-000000000001',
    'competitorIds', jsonb_build_array('cccccccc-0000-0000-0000-000000000001'),
    'analysisObjective', 'general_overview',
    'contextVersion', 'intelligence-context-v1',
    'intelligenceContext', jsonb_build_object(
      'contextVersion', 'intelligence-context-v1',
      'brand', jsonb_build_object('id', 'bbbbbbbb-0000-0000-0000-000000000001', 'domain', 'brand-one.test'),
      'competitors', jsonb_build_array(
        jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000001', 'domain', 'competitor-one.test')
      ),
      'facts', '[]'::jsonb,
      'signals', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001')),
      'recentChanges', '[]'::jsonb,
      'untrustedSnippets', '[]'::jsonb,
      'analysisObjective', 'general_overview',
      'generatedAt', '2026-09-04T12:00:00.000Z'
    ),
    'intelligenceContextHash', 'sha256:' || repeat('a', 64),
    'contextGeneratedAt', '2026-09-04T12:00:00.000Z',
    'promptVersion', 'intelligence-synthesis-v1',
    'validatorContractVersion', 'intelligence-validator-contract-2026-09-14',
    'providerId', 'provider-under-test',
    'modelId', 'model-under-test',
    'modelParameters', '{"temperature":0,"maxOutputTokens":4096}'::jsonb,
    'outcome', 'llm_success',
    'fallbackReason', null::text,
    'validationStatus', 'passed',
    'validationSummary', '{"status":"passed","errors":[],"hypotheses":[],"experiments":[],"executiveBriefing":{"status":"accepted","errorCodes":[]}}'::jsonb,
    'acceptedHypothesisCount', 2,
    'acceptedExperimentCount', 2,
    'executiveBriefingAccepted', true,
    'attempts', jsonb_build_array(jsonb_build_object(
      'attemptNumber', 1, 'kind', 'initial', 'retryReason', null::text,
      'promptVersion', 'intelligence-synthesis-v1', 'latencyMs', 12,
      'inputTokens', null::int, 'outputTokens', null::int, 'totalTokens', null::int,
      'estimatedCostUsd', null::numeric, 'rawResponseId', 'resp-1', 'finishReason', 'stop',
      'providerFailure', null::text, 'providerFailureMetadata', null::jsonb,
      'rawOutputCaptured', true, 'rawOutput', '{"untrusted":"raw-model-output"}'::jsonb,
      'validationStatus', 'passed', 'validationErrorCodes', '[]'::jsonb
    )),
    -- Deliberately out of ref order: dependencies must resolve by ref, never by position.
    'hypotheses', jsonb_build_array(pg_temp.llm_hypothesis(run_id, 'h2'), pg_temp.llm_hypothesis(run_id, 'h1')),
    'experiments', jsonb_build_array(
      pg_temp.llm_experiment(run_id, 'h1', 'Experiment for h1'),
      pg_temp.llm_experiment(run_id, 'h2', 'Experiment for h2')
    ),
    'executiveBriefing', jsonb_build_object(
      'headline', 'A rival may be reducing purchase friction',
      'strategicPostureSummary', 'The evidence supports testing a lower shipping threshold.',
      'keyTakeaway', 'Treat the competitive pattern as a testable signal.',
      'supportingHypothesisRefs', jsonb_build_array('h1'),
      'claimReferences', '[]'::jsonb,
      'numericClaims', '[]'::jsonb,
      'generationProvenance', pg_temp.llm_provenance(run_id)
    )
  );
$$;

-- Direct audit-row insert helper for postgres-level integrity tests.
create function pg_temp.insert_run(
  run_id uuid,
  brand_id uuid,
  competitor_id uuid,
  hypothesis_count integer,
  experiment_count integer
)
returns void language sql as $$
  insert into public.intelligence_generation_runs (
    id, owned_brand_id, competitor_ids, analysis_objective, context_version, intelligence_context,
    intelligence_context_hash, context_generated_at, prompt_version, validator_contract_version,
    provider_id, model_id, model_parameters, outcome, fallback_reason, validation_status,
    validation_summary, accepted_hypothesis_count, accepted_experiment_count, executive_briefing_accepted
  ) values (
    run_id, brand_id, array[competitor_id], 'general_overview', 'intelligence-context-v1',
    jsonb_build_object(
      'contextVersion', 'intelligence-context-v1',
      'brand', jsonb_build_object('id', brand_id),
      'competitors', jsonb_build_array(jsonb_build_object('id', competitor_id)),
      'signals', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001')),
      'analysisObjective', 'general_overview',
      'generatedAt', '2026-09-04T12:00:00.000Z'
    ),
    'sha256:' || repeat('a', 64), '2026-09-04T12:00:00Z', 'intelligence-synthesis-v1',
    'intelligence-validator-contract-2026-09-14', 'provider-under-test', 'model-under-test', '{}',
    'llm_success', null, 'passed', '{"status":"passed"}', hypothesis_count, experiment_count, false
  );
$$;

select set_config('test.payload_run_1', pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000001')::text, true);
select set_config(
  'test.payload_unknown_ref',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000002'),
    '{experiments,1,hypothesisRef}', '"h9"'
  )::text,
  true
);
select set_config(
  'test.payload_fallback_with_items',
  (pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000003') || jsonb_build_object(
    'outcome', 'deterministic_fallback',
    'fallbackReason', 'VALIDATION_REPAIR_EXHAUSTED',
    'validationStatus', null::text,
    'validationSummary', null::jsonb,
    'acceptedHypothesisCount', 0,
    'acceptedExperimentCount', 0,
    'executiveBriefingAccepted', false
  ))::text,
  true
);
-- Claims brand two with brand two's competitor, but the frozen context the model saw is brand one's.
select set_config(
  'test.payload_brand_mismatch',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000004') || jsonb_build_object(
      'ownedBrandId', 'bbbbbbbb-0000-0000-0000-000000000002',
      'competitorIds', jsonb_build_array('cccccccc-0000-0000-0000-000000000003')
    ),
    '{intelligenceContext,competitors}', '[{"id":"cccccccc-0000-0000-0000-000000000003"}]'
  )::text,
  true
);
select set_config(
  'test.payload_cross_org_competitor',
  jsonb_set(
    jsonb_set(
      pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000005'),
      '{competitorIds}', '["cccccccc-0000-0000-0000-000000000003"]'
    ),
    '{intelligenceContext,competitors}', '[{"id":"cccccccc-0000-0000-0000-000000000003"}]'
  )::text,
  true
);
select set_config(
  'test.payload_competitor_out_of_scope',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000006'),
    '{hypotheses,0}',
    pg_temp.llm_hypothesis('eeeeeeee-0000-4000-8000-000000000006', 'h2', 'cccccccc-0000-0000-0000-000000000002')
  )::text,
  true
);
select set_config(
  'test.payload_cross_tenant_signal',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000007'),
    '{hypotheses,0}',
    pg_temp.llm_hypothesis('eeeeeeee-0000-4000-8000-000000000007', 'h2',
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002')
  )::text,
  true
);
select set_config(
  'test.payload_signal_outside_context',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000008'),
    '{hypotheses,0}',
    pg_temp.llm_hypothesis('eeeeeeee-0000-4000-8000-000000000008', 'h2',
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004')
  )::text,
  true
);
select set_config(
  'test.payload_count_mismatch',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000009'),
    '{acceptedHypothesisCount}', '3'
  )::text,
  true
);
select set_config(
  'test.payload_provenance_mismatch',
  jsonb_set(
    pg_temp.llm_payload('eeeeeeee-0000-4000-8000-000000000010'),
    '{hypotheses,0,generationProvenance}',
    pg_temp.llm_provenance('eeeeeeee-0000-4000-8000-000000000010', 'a-different-model')
  )::text,
  true
);

-- Internal service path ------------------------------------------------------------------------

set local role service_role;
select lives_ok(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_run_1')::jsonb) $$,
  'service role persists a validated LLM generation run transactionally'
);

set local role postgres;
select is(
  (select hypotheses.hypothesis_ref
   from public.llm_recommended_experiments experiments
   join public.llm_strategic_hypotheses hypotheses on hypotheses.id = experiments.hypothesis_id
   where experiments.title = 'Experiment for h1'),
  'h1',
  'experiment for h1 references the persisted h1 row despite h2 being first in the payload'
);
select is(
  (select hypotheses.hypothesis_ref
   from public.llm_recommended_experiments experiments
   join public.llm_strategic_hypotheses hypotheses on hypotheses.id = experiments.hypothesis_id
   where experiments.title = 'Experiment for h2'),
  'h2',
  'experiment for h2 references the persisted h2 row'
);
select is(
  (select count(*) from public.llm_strategic_hypotheses
   where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  2::bigint,
  'only the accepted hypotheses are persisted'
);
select is(
  (select count(*) from public.llm_strategic_hypothesis_signals),
  2::bigint,
  'hypothesis signal lineage is persisted relationally'
);
select is(
  (select links.hypothesis_id
   from public.llm_executive_briefing_hypotheses links),
  (select id from public.llm_strategic_hypotheses where hypothesis_ref = 'h1'),
  'briefing support resolves to the exact h1 hypothesis row'
);
select is(
  (select count(*) from public.intelligence_generation_attempts
   where run_id = 'eeeeeeee-0000-4000-8000-000000000001'
     and input_tokens is null and output_tokens is null and total_tokens is null
     and estimated_cost_usd is null and latency_ms = 12),
  1::bigint,
  'unavailable token telemetry and unknown cost are stored as null, not zero'
);
select is(
  (select epistemic_class_dependencies from public.llm_strategic_hypotheses where hypothesis_ref = 'h1'),
  array['observed', 'derived', 'reported']::text[],
  'epistemic class dependencies survive the round trip unchanged'
);
select ok(
  (select claim_references @> '[{"kind":"snippet","claimedEpistemicClass":"reported"}]'::jsonb
   from public.llm_strategic_hypotheses where hypothesis_ref = 'h1'),
  'reported snippet claims are not promoted to observed evidence'
);
select is(
  (select intelligence_context from public.intelligence_generation_runs
   where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  current_setting('test.payload_run_1')::jsonb -> 'intelligenceContext',
  'the exact frozen context is stored with the run'
);
select is(
  (select generation_provenance ->> 'modelId' from public.llm_recommended_experiments
   where title = 'Experiment for h1'),
  'model-under-test',
  'customer-facing rows carry provider-neutral model provenance'
);

-- Fail-closed service path: every violation rolls back the whole generation ---------------------

set local role service_role;
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_unknown_ref')::jsonb) $$,
  '%does not resolve to an accepted hypothesis%',
  'an experiment on an unknown or rejected hypothesis ref is refused'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_fallback_with_items')::jsonb) $$,
  '%requires an accepted LLM generation run%',
  'a deterministic fallback run cannot carry LLM intelligence'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_brand_mismatch')::jsonb) $$,
  '%intelligence_generation_runs_context_matches_columns%',
  'a run cannot claim a brand other than its frozen context brand'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_cross_org_competitor')::jsonb) $$,
  '%competitors must belong to the generation run brand%',
  'a run cannot scope another organization''s competitor'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_competitor_out_of_scope')::jsonb) $$,
  '%competitor must be within the generation run scope%',
  'a hypothesis cannot target a competitor outside its generation run'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_cross_tenant_signal')::jsonb) $$,
  '%supporting signal must belong to the LLM hypothesis brand%',
  'a hypothesis cannot attach another tenant''s signal'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_signal_outside_context')::jsonb) $$,
  '%must be present in the generation run frozen context%',
  'a hypothesis cannot attach a signal the model never saw'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_count_mismatch')::jsonb) $$,
  '%does not match the generation run accepted counts%',
  'declared accepted counts must equal the persisted intelligence'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_provenance_mismatch')::jsonb) $$,
  '%provenance must match its generation run%',
  'item provenance cannot diverge from its generation run'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_run_1')::jsonb) $$,
  '%duplicate key%',
  'a generation run cannot be replayed under the same identity'
);

set local role postgres;
select is(
  (select count(*) from public.intelligence_generation_runs
   where id <> 'eeeeeeee-0000-4000-8000-000000000001'),
  0::bigint,
  'refused generations leave no audit rows'
);
select is(
  (select count(*) from public.llm_strategic_hypotheses
   where generation_run_id <> 'eeeeeeee-0000-4000-8000-000000000001'),
  0::bigint,
  'refused generations leave no customer-facing hypotheses'
);
select is(
  (select count(*) from public.llm_recommended_experiments
   where generation_run_id <> 'eeeeeeee-0000-4000-8000-000000000001'),
  0::bigint,
  'refused generations leave no customer-facing experiments'
);

-- Authenticated tenants ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is((select count(*) from public.llm_strategic_hypotheses), 2::bigint, 'member can read same-organization LLM hypotheses');
select is((select count(*) from public.llm_strategic_hypothesis_signals), 2::bigint, 'member can read same-organization LLM hypothesis signals');
select is((select count(*) from public.llm_recommended_experiments), 2::bigint, 'member can read same-organization LLM experiments');
select is((select count(*) from public.llm_executive_briefings), 1::bigint, 'member can read same-organization LLM briefings');
select is((select count(*) from public.llm_executive_briefing_hypotheses), 1::bigint, 'member can read same-organization LLM briefing support');

select throws_like(
  $$ select count(*) from public.intelligence_generation_runs $$,
  '%permission denied%',
  'member cannot read generation runs or their frozen context'
);
select throws_like(
  $$ select raw_output from public.intelligence_generation_attempts $$,
  '%permission denied%',
  'member cannot read raw model output'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation(current_setting('test.payload_run_1')::jsonb) $$,
  '%permission denied%',
  'member cannot call the LLM persistence RPC'
);
select throws_like(
  $$ insert into public.intelligence_generation_runs (id, owned_brand_id, competitor_ids)
     values ('eeeeeeee-0000-4000-8000-000000000020', 'bbbbbbbb-0000-0000-0000-000000000001', array['cccccccc-0000-0000-0000-000000000001']::uuid[]) $$,
  '%permission denied%',
  'member cannot insert generation runs'
);
select throws_like(
  $$ update public.intelligence_generation_runs set model_id = 'tampered' $$,
  '%permission denied%',
  'member cannot update generation runs'
);
select throws_like(
  $$ delete from public.intelligence_generation_runs $$,
  '%permission denied%',
  'member cannot delete generation runs'
);
select throws_like(
  $$ insert into public.intelligence_generation_attempts (run_id, attempt_number, kind, prompt_version, raw_output_captured)
     values ('eeeeeeee-0000-4000-8000-000000000001', 2, 'retry', 'x', false) $$,
  '%permission denied%',
  'member cannot insert generation attempts'
);
select throws_like(
  $$ update public.intelligence_generation_attempts set raw_output = '{}' $$,
  '%permission denied%',
  'member cannot update generation attempts'
);
select throws_like(
  $$ delete from public.intelligence_generation_attempts $$,
  '%permission denied%',
  'member cannot delete generation attempts'
);
select throws_like(
  $$ insert into public.llm_strategic_hypotheses (generation_run_id, owned_brand_id, competitor_id)
     values ('eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001') $$,
  '%permission denied%',
  'member cannot insert LLM hypotheses directly'
);
select throws_like(
  $$ update public.llm_strategic_hypotheses set generation_run_id = generation_run_id $$,
  '%permission denied%',
  'member cannot reassign LLM hypothesis provenance'
);
select throws_like(
  $$ update public.llm_recommended_experiments set hypothesis_id = hypothesis_id $$,
  '%permission denied%',
  'member cannot reassign LLM experiment dependencies'
);
select throws_like(
  $$ delete from public.llm_executive_briefings $$,
  '%permission denied%',
  'member cannot delete LLM briefings'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.llm_strategic_hypotheses), 0::bigint, 'cross-organization LLM hypotheses are invisible');
select is((select count(*) from public.llm_strategic_hypothesis_signals), 0::bigint, 'cross-organization LLM hypothesis signals are invisible');
select is((select count(*) from public.llm_recommended_experiments), 0::bigint, 'cross-organization LLM experiments are invisible');
select is((select count(*) from public.llm_executive_briefings), 0::bigint, 'cross-organization LLM briefings are invisible');
select is((select count(*) from public.llm_executive_briefing_hypotheses), 0::bigint, 'cross-organization LLM briefing support is invisible');

set local role anon;
select throws_like(
  $$ select count(*) from public.llm_strategic_hypotheses $$,
  '%permission denied%',
  'anon cannot read LLM hypotheses'
);
select throws_like(
  $$ select count(*) from public.intelligence_generation_attempts $$,
  '%permission denied%',
  'anon cannot read generation attempts'
);
select throws_like(
  $$ select public.persist_llm_intelligence_generation('{}'::jsonb) $$,
  '%permission denied%',
  'anon cannot call the LLM persistence RPC'
);

-- Immutability and relational integrity (privileged role) ------------------------------------------

set local role postgres;
select throws_like(
  $$ update public.intelligence_generation_runs set model_id = 'tampered' $$,
  '%intelligence_generation_runs are append-only%',
  'generation runs are append-only'
);
select throws_like(
  $$ delete from public.intelligence_generation_runs $$,
  '%intelligence_generation_runs are append-only%',
  'generation runs cannot be deleted'
);
select throws_like(
  $$ update public.intelligence_generation_attempts set raw_output = '{}' $$,
  '%intelligence_generation_attempts are append-only%',
  'generation attempts are append-only'
);

select pg_temp.insert_run('eeeeeeee-0000-4000-8000-000000000030', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 1, 0);
select pg_temp.insert_run('eeeeeeee-0000-4000-8000-000000000031', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1, 1);

select throws_like(
  $$ update public.llm_strategic_hypotheses set generation_run_id = 'eeeeeeee-0000-4000-8000-000000000031' $$,
  '%llm_strategic_hypotheses are append-only%',
  'hypothesis generation runs cannot be reassigned'
);
select throws_like(
  $$ delete from public.llm_strategic_hypotheses $$,
  '%llm_strategic_hypotheses are append-only%',
  'LLM hypotheses cannot be deleted'
);
select throws_like(
  $$ update public.llm_recommended_experiments
     set hypothesis_id = (select id from public.llm_strategic_hypotheses where hypothesis_ref = 'h2') $$,
  '%llm_recommended_experiments are append-only%',
  'experiment dependencies cannot be reassigned'
);
select throws_like(
  $$ update public.llm_strategic_hypothesis_signals set position = 5 $$,
  '%llm_strategic_hypothesis_signals are append-only%',
  'LLM hypothesis signal lineage is append-only'
);
select throws_like(
  $$ delete from public.llm_executive_briefings $$,
  '%llm_executive_briefings are append-only%',
  'LLM briefings cannot be deleted'
);
select throws_like(
  $$ update public.llm_executive_briefing_hypotheses set hypothesis_ref = 'h2' $$,
  '%llm_executive_briefing_hypotheses are append-only%',
  'LLM briefing support is append-only'
);

select throws_like(
  $$ insert into public.llm_strategic_hypotheses (
       generation_run_id, owned_brand_id, competitor_id, hypothesis_ref, theme, statement, rationale,
       confidence, uncertainty_category, uncertainty_statement, assumptions, epistemic_class_dependencies,
       supporting_signal_ids, supporting_comparison_keys, claim_references, numeric_claims, generated_at,
       hypothesis_engine_version, generation_provenance, hypothesis_hash
     )
     select 'eeeeeeee-0000-4000-8000-000000000030', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
       'h1', theme, statement, rationale, confidence, uncertainty_category, uncertainty_statement, assumptions,
       epistemic_class_dependencies, supporting_signal_ids, supporting_comparison_keys, claim_references,
       numeric_claims, generated_at, hypothesis_engine_version,
       pg_temp.llm_provenance('eeeeeeee-0000-4000-8000-000000000030'), 'sha256:' || repeat('9', 64)
     from public.llm_strategic_hypotheses where hypothesis_ref = 'h1' $$,
  '%must belong to the generation run brand%',
  'accepted intelligence cannot be attached to another tenant''s generation run'
);
select throws_like(
  $$ insert into public.llm_strategic_hypotheses (
       generation_run_id, owned_brand_id, competitor_id, hypothesis_ref, theme, statement, rationale,
       confidence, uncertainty_category, uncertainty_statement, assumptions, epistemic_class_dependencies,
       supporting_signal_ids, supporting_comparison_keys, claim_references, numeric_claims, generated_at,
       hypothesis_engine_version, generation_provenance, hypothesis_hash
     )
     select generation_run_id, owned_brand_id, competitor_id, 'h3', theme, statement, rationale, confidence,
       uncertainty_category, uncertainty_statement, assumptions, epistemic_class_dependencies,
       supporting_signal_ids, supporting_comparison_keys, claim_references, numeric_claims, generated_at,
       hypothesis_engine_version, generation_provenance, 'sha256:' || repeat('8', 64)
     from public.llm_strategic_hypotheses where hypothesis_ref = 'h1' $$,
  '%accepted hypothesis count is already satisfied%',
  'a sealed generation run cannot gain hypotheses after persistence'
);
select throws_like(
  $$ insert into public.llm_strategic_hypotheses (
       generation_run_id, owned_brand_id, competitor_id, hypothesis_ref, theme, statement, rationale,
       confidence, uncertainty_category, uncertainty_statement, assumptions, epistemic_class_dependencies,
       supporting_signal_ids, supporting_comparison_keys, claim_references, numeric_claims, generated_at,
       hypothesis_engine_version, generation_provenance, hypothesis_hash
     )
     select 'eeeeeeee-0000-4000-8000-000000000031', owned_brand_id, competitor_id, 'h1', theme, statement,
       rationale, confidence, uncertainty_category, uncertainty_statement, assumptions, array['guessed'],
       supporting_signal_ids, supporting_comparison_keys, claim_references, numeric_claims, generated_at,
       hypothesis_engine_version, pg_temp.llm_provenance('eeeeeeee-0000-4000-8000-000000000031'),
       'sha256:' || repeat('7', 64)
     from public.llm_strategic_hypotheses where hypothesis_ref = 'h1' $$,
  '%llm_strategic_hypotheses_epistemic_class_dependencies_valid%',
  'unknown epistemic classes are rejected'
);
select throws_like(
  $$ insert into public.llm_recommended_experiments (
       generation_run_id, owned_brand_id, competitor_id, hypothesis_id, source_hypothesis_ref, title, objective,
       hypothesis_under_test, variable_under_test, design, primary_metric, guardrail_metrics,
       implementation_notes, caveat_category, caveat_statement, claim_references, numeric_claims,
       generated_at, experiment_engine_version, generation_provenance, experiment_hash
     )
     select 'eeeeeeee-0000-4000-8000-000000000031', owned_brand_id, competitor_id, hypothesis_id,
       source_hypothesis_ref, title, objective, hypothesis_under_test, variable_under_test, design,
       primary_metric, guardrail_metrics, implementation_notes, caveat_category, caveat_statement,
       claim_references, numeric_claims, generated_at, experiment_engine_version,
       pg_temp.llm_provenance('eeeeeeee-0000-4000-8000-000000000031'), 'sha256:' || repeat('6', 64)
     from public.llm_recommended_experiments where title = 'Experiment for h1' $$,
  '%llm_recommended_experiments_hypothesis_dependency_fk%',
  'an experiment cannot depend on a hypothesis from a different generation run'
);
select throws_like(
  $$ insert into public.intelligence_generation_attempts (
       run_id, attempt_number, kind, prompt_version, input_tokens, raw_output_captured
     ) values ('eeeeeeee-0000-4000-8000-000000000031', 1, 'initial', 'intelligence-synthesis-v1', -1, false) $$,
  '%intelligence_generation_attempts_input_tokens_nonnegative%',
  'negative token telemetry is rejected'
);
select throws_like(
  $$ insert into public.intelligence_generation_attempts (
       run_id, attempt_number, kind, prompt_version, provider_failure, raw_output_captured, raw_output, validation_status
     ) values ('eeeeeeee-0000-4000-8000-000000000031', 1, 'initial', 'intelligence-synthesis-v1', 'timeout', true, '{}', 'failed') $$,
  '%intelligence_generation_attempts_failure_has_no_output%',
  'a failed provider invocation cannot claim raw output'
);
select throws_like(
  $$ insert into public.intelligence_generation_attempts (
       run_id, attempt_number, kind, prompt_version, raw_output_captured, raw_output
     ) values ('eeeeeeee-0000-4000-8000-000000000031', 1, 'initial', 'intelligence-synthesis-v1', false, '{"fake":true}') $$,
  '%intelligence_generation_attempts_raw_output_capture_consistent%',
  'uncaptured attempts cannot store fabricated raw output'
);
select throws_like(
  $$ select pg_temp.insert_run('eeeeeeee-0000-4000-8000-000000000032', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 0, 0) $$,
  '%intelligence_generation_runs_accepted_items_match_outcome%',
  'an accepted LLM run must accept at least one item'
);
select throws_like(
  $$ insert into public.intelligence_generation_runs (
       id, owned_brand_id, competitor_ids, analysis_objective, context_version, intelligence_context,
       intelligence_context_hash, context_generated_at, prompt_version, validator_contract_version,
       provider_id, model_id, model_parameters, outcome, fallback_reason, accepted_hypothesis_count,
       accepted_experiment_count, executive_briefing_accepted
     ) select 'eeeeeeee-0000-4000-8000-000000000033', owned_brand_id, competitor_ids, analysis_objective,
       context_version, intelligence_context, 'sha256:not-a-hash', context_generated_at, prompt_version,
       validator_contract_version, provider_id, model_id, model_parameters, 'deterministic_fallback',
       'PROVIDER_RETRY_EXHAUSTED', 0, 0, false
     from public.intelligence_generation_runs where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '%intelligence_generation_runs_context_hash_sha256%',
  'invalid context hashes are rejected'
);
select throws_like(
  $$ insert into public.intelligence_generation_runs (
       id, owned_brand_id, competitor_ids, analysis_objective, context_version, intelligence_context,
       intelligence_context_hash, context_generated_at, prompt_version, validator_contract_version,
       provider_id, model_id, model_parameters, outcome, fallback_reason, accepted_hypothesis_count,
       accepted_experiment_count, executive_briefing_accepted
     ) select 'eeeeeeee-0000-4000-8000-000000000034', owned_brand_id, competitor_ids, analysis_objective,
       context_version, intelligence_context, intelligence_context_hash, context_generated_at, prompt_version,
       validator_contract_version, provider_id, '  ', model_parameters, 'deterministic_fallback',
       'PROVIDER_RETRY_EXHAUSTED', 0, 0, false
     from public.intelligence_generation_runs where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '%intelligence_generation_runs_model_id_not_blank%',
  'blank model identifiers are rejected'
);
select throws_like(
  $$ insert into public.intelligence_generation_runs (
       id, owned_brand_id, competitor_ids, analysis_objective, context_version, intelligence_context,
       intelligence_context_hash, context_generated_at, prompt_version, validator_contract_version,
       provider_id, model_id, model_parameters, outcome, fallback_reason, accepted_hypothesis_count,
       accepted_experiment_count, executive_briefing_accepted
     ) select 'eeeeeeee-0000-4000-8000-000000000035', owned_brand_id, competitor_ids, analysis_objective,
       context_version, intelligence_context, intelligence_context_hash, context_generated_at, prompt_version,
       validator_contract_version, provider_id, model_id, '{"apiKey":"sk-test"}', 'deterministic_fallback',
       'PROVIDER_RETRY_EXHAUSTED', 0, 0, false
     from public.intelligence_generation_runs where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '%intelligence_generation_runs_model_parameters_valid%',
  'model parameters cannot carry credentials or unknown keys'
);
select lives_ok(
  $$ insert into public.intelligence_generation_runs (
       id, owned_brand_id, competitor_ids, analysis_objective, context_version, intelligence_context,
       intelligence_context_hash, context_generated_at, prompt_version, validator_contract_version,
       provider_id, model_id, model_parameters, outcome, fallback_reason, accepted_hypothesis_count,
       accepted_experiment_count, executive_briefing_accepted
     ) select 'eeeeeeee-0000-4000-8000-000000000036', owned_brand_id, competitor_ids, analysis_objective,
       context_version, intelligence_context, intelligence_context_hash, context_generated_at, prompt_version,
       validator_contract_version, provider_id, model_id, model_parameters, 'deterministic_fallback',
       'PROVIDER_NON_RETRYABLE_FAILURE', 0, 0, false
     from public.intelligence_generation_runs where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'a deterministic fallback can be audited without validation or LLM intelligence'
);

-- Reports referencing generation runs --------------------------------------------------------------

create function pg_temp.report_payload(brand_id uuid, competitor_id uuid, competitor_name text, report_hash text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'brandId', brand_id,
    'generatedAt', '2026-09-04T13:00:00.000Z',
    'reportEngineVersion', 'competitive-report-v1',
    'reportHash', report_hash,
    'sourceStateHash', 'sha256:' || repeat('6', 64),
    'competitors', jsonb_build_array(jsonb_build_object('id', competitor_id, 'name', competitor_name)),
    'sourceIntelligence', jsonb_build_object('signalIds', '[]'::jsonb, 'hypothesisIds', '[]'::jsonb, 'experimentIds', '[]'::jsonb),
    'completeness', jsonb_build_object('state', 'complete'),
    'sections', jsonb_build_object(
      'yourAdvantages', '[]'::jsonb, 'competitorAdvantages', '[]'::jsonb,
      'appearsToBeWorking', '[]'::jsonb, 'whatToTestNext', '[]'::jsonb
    )
  );
$$;

create function pg_temp.llm_report_payload(report_hash text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'brandId', 'bbbbbbbb-0000-0000-0000-000000000001',
    'generatedAt', '2026-09-04T13:00:00.000Z',
    'reportEngineVersion', 'competitive-report-v2-llm',
    'reportHash', report_hash,
    'sourceStateHash', 'sha256:' || repeat('a', 64),
    'competitors', jsonb_build_array(jsonb_build_object(
      'id', 'cccccccc-0000-0000-0000-000000000001', 'name', 'competitor-one.test'
    )),
    'sourceIntelligence', jsonb_build_object(
      'signalIds', to_jsonb(array['dddddddd-0000-0000-0000-000000000001']::uuid[]),
      'hypothesisIds', (
        select to_jsonb(array_agg(id order by id)) from public.llm_strategic_hypotheses
        where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'
      ),
      'experimentIds', (
        select to_jsonb(array_agg(id order by id)) from public.llm_recommended_experiments
        where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'
      ),
      'executiveBriefingId', (
        select id from public.llm_executive_briefings
        where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'
      )
    ),
    'generation', jsonb_build_object('result', 'llm'),
    'executiveBriefing', jsonb_build_object(
      'headline', 'A rival may be reducing purchase friction',
      'strategicPostureSummary', 'The evidence supports testing a lower shipping threshold.',
      'keyTakeaway', 'Treat the competitive pattern as a testable signal.',
      'supportingHypothesisIds', (
        select to_jsonb(array_agg(hypothesis_id order by position))
        from public.llm_executive_briefing_hypotheses
        where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'
      ),
      'claimReferences', '[]'::jsonb,
      'numericClaims', '[]'::jsonb
    ),
    'completeness', jsonb_build_object('state', 'complete'),
    'sections', jsonb_build_object(
      'yourAdvantages', '[]'::jsonb, 'competitorAdvantages', '[]'::jsonb,
      'appearsToBeWorking', '[]'::jsonb, 'whatToTestNext', '[]'::jsonb
    )
  );
$$;

select throws_like(
  $$ insert into public.competitive_intelligence_reports (
       owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at, payload, generation_run_id
     ) values (
       'bbbbbbbb-0000-0000-0000-000000000001', array['cccccccc-0000-0000-0000-000000000001']::uuid[],
       'competitive-report-v1', 'sha256:' || repeat('5', 64), '2026-09-04T13:00:00Z',
       pg_temp.report_payload('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
         'competitor-one.test', 'sha256:' || repeat('5', 64)),
       'eeeeeeee-0000-4000-8000-000000000001'
     ) $$,
  '%competitive_intelligence_reports_payload_valid%',
  'a deterministic v1 report cannot reference a generation run'
);
select lives_ok(
  $$ insert into public.competitive_intelligence_reports (
       owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at, payload, generation_run_id
     ) values (
       'bbbbbbbb-0000-0000-0000-000000000001', array['cccccccc-0000-0000-0000-000000000001']::uuid[],
       'competitive-report-v1', 'sha256:' || repeat('4', 64), '2026-09-04T13:00:00Z',
       pg_temp.report_payload('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
         'competitor-one.test', 'sha256:' || repeat('4', 64)),
       null
     ) $$,
  'a deterministic v1 report remains valid without a generation run'
);
select throws_like(
  $$ update public.competitive_intelligence_reports set generation_run_id = null $$,
  '%competitive_intelligence_reports are append-only%',
  'report generation run references cannot be reassigned'
);

select ok(
  has_function_privilege('service_role', 'public.persist_competitive_intelligence_report_v2_llm(uuid,jsonb)', 'EXECUTE'),
  'service role can execute the v2 report persistence RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.persist_competitive_intelligence_report_v2_llm(uuid,jsonb)', 'EXECUTE'),
  'authenticated users cannot execute the v2 report persistence RPC'
);

set local role service_role;
select lives_ok(
  $$ select public.persist_competitive_intelligence_report_v2_llm(
       'eeeeeeee-0000-4000-8000-000000000001',
       pg_temp.llm_report_payload('sha256:' || repeat('b', 64))
     ) $$,
  'service role persists a v2 report over an accepted generation run'
);
select lives_ok(
  $$ select public.persist_competitive_intelligence_report_v2_llm(
       'eeeeeeee-0000-4000-8000-000000000001',
       pg_temp.llm_report_payload('sha256:' || repeat('b', 64))
     ) $$,
  'v2 report finalization is idempotent by generation run'
);

set local role postgres;
select is(
  (select count(*) from public.competitive_intelligence_reports
   where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  1::bigint,
  'one immutable report is stored for an accepted generation run'
);
select is(
  (select payload #>> '{generation,result}' from public.competitive_intelligence_reports
   where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  'llm',
  'the report generation classification matches the accepted run'
);

insert into public.intelligence_generation_runs (
  id, owned_brand_id, competitor_ids, analysis_objective, context_version, intelligence_context,
  intelligence_context_hash, context_generated_at, prompt_version, validator_contract_version,
  provider_id, model_id, model_parameters, outcome, validation_status, validation_summary,
  accepted_hypothesis_count, accepted_experiment_count, executive_briefing_accepted
) values (
  'eeeeeeee-0000-4000-8000-000000000037',
  'bbbbbbbb-0000-0000-0000-000000000002',
  array['cccccccc-0000-0000-0000-000000000003']::uuid[],
  'general_overview', 'intelligence-context-v1',
  jsonb_build_object(
    'brand', jsonb_build_object('id', 'bbbbbbbb-0000-0000-0000-000000000002'),
    'competitors', jsonb_build_array(jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000003')),
    'signals', '[]'::jsonb, 'contextVersion', 'intelligence-context-v1',
    'analysisObjective', 'general_overview', 'generatedAt', '2026-09-04T12:00:00.000Z'
  ),
  'sha256:' || repeat('a', 64), '2026-09-04T12:00:00Z', 'intelligence-synthesis-v1',
  'intelligence-validator-contract-2026-09-14', 'provider-under-test', 'model-under-test', '{}',
  'llm_success', 'passed', '{"status":"passed"}', 1, 0, false
);

set local role service_role;
select throws_like(
  $$ select public.persist_competitive_intelligence_report_v2_llm(
       'eeeeeeee-0000-4000-8000-000000000037',
       pg_temp.llm_report_payload('sha256:' || repeat('c', 64))
     ) $$,
  '%report generation run must belong to the report brand%',
  'a customer cannot attach another tenant''s generation run'
);
select throws_like(
  $$ select public.persist_competitive_intelligence_report_v2_llm(
       'eeeeeeee-0000-4000-8000-000000000036',
       pg_temp.llm_report_payload('sha256:' || repeat('d', 64))
     ) $$,
  '%must be accepted and match its exact source scope%',
  'a deterministic fallback run cannot back a v2 report'
);
select throws_like(
  $$ insert into public.competitive_intelligence_reports (
       owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at,
       payload, generation_run_id
     )
     select 'bbbbbbbb-0000-0000-0000-000000000001',
       array['cccccccc-0000-0000-0000-000000000001']::uuid[],
       'competitive-report-v2-llm', 'sha256:' || repeat('e', 64),
       '2026-09-04T13:00:00Z', candidate.payload,
       'eeeeeeee-0000-4000-8000-000000000001'
     from (
       select jsonb_set(
         pg_temp.llm_report_payload('sha256:' || repeat('e', 64)),
         '{sourceIntelligence,hypothesisIds}',
         jsonb_build_array((select id from public.llm_strategic_hypotheses
                            where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'
                            order by id limit 1))
       ) payload
     ) candidate $$,
  '%must come from the attached accepted generation run%',
  'a v2 report cannot omit accepted hypothesis rows from its source identity'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is(
  (select count(*) from public.competitive_intelligence_reports
   where generation_run_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  0::bigint,
  'cross-organization customers cannot read v2 reports'
);
select throws_like(
  $$ select public.persist_competitive_intelligence_report_v2_llm(
       'eeeeeeee-0000-4000-8000-000000000001',
       pg_temp.llm_report_payload('sha256:' || repeat('f', 64))
     ) $$,
  '%permission denied%',
  'browser-authenticated customers cannot invoke v2 report persistence'
);

select * from finish();
rollback;
