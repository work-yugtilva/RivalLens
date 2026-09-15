begin;

select plan(27);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'member-one@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'member-two@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

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
   'competitive-signals-v1', 'sha256:2222222222222222222222222222222222222222222222222222222222222222');

insert into public.strategic_hypotheses (
  id, owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence,
  uncertainty_category, uncertainty_statement, generated_at, hypothesis_engine_version,
  generation_provenance, hypothesis_hash
) values (
  'eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
  'competitor_may_reduce_shipping_friction', 'A hypothesis.', 'A rationale.', 'medium',
  'conversion_effect_not_established', 'Conversion effect is unknown.', '2026-09-04T12:00:00Z',
  'strategic-hypotheses-v1',
  '{"method":"deterministic_template","templateId":"competitor_may_reduce_shipping_friction","sourceSignalRuleVersion":"competitive-signals-v1"}',
  'sha256:3333333333333333333333333333333333333333333333333333333333333333'
);
insert into public.strategic_hypothesis_signals (hypothesis_id, position, signal_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 0, 'dddddddd-0000-0000-0000-000000000001');

insert into public.recommended_experiments (
  id, owned_brand_id, competitor_id, experiment_type, title, objective, hypothesis_under_test,
  design, control_configuration, treatment_configuration, primary_metric, guardrail_metrics,
  duration_planning, implementation_notes, confidence_level, confidence_basis, caveat_category,
  caveat_statement, generated_at, experiment_engine_version, generation_provenance, experiment_hash
) values (
  'ffffffff-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
  'free_shipping_threshold', 'Test a threshold.', 'Test shipping friction.', 'A lower threshold may improve conversion.',
  '{"comparison":"control_vs_treatment","variablePolicy":"single_variable","heldConstant":"all_non_target_experience_elements"}',
  '{"kind":"current_free_shipping_threshold","thresholdUsd":50}',
  '{"kind":"lower_free_shipping_threshold","thresholdUsd":30}',
  '{"metric":"conversion_rate","measurementReadiness":"requires_first_party_data"}',
  '[{"metric":"contribution_margin_per_order","measurementReadiness":"requires_first_party_data"}]',
  '{"status":"requires_first_party_data","requiredInputs":["baseline_primary_metric","eligible_traffic","minimum_detectable_effect","significance_level","statistical_power"]}',
  '["Estimate margin exposure before launch."]', 'medium', 'support_for_testing_rationale',
  'shipping_margin_exposure', 'Review shipping margin exposure.', '2026-09-04T12:00:00Z',
  'recommended-experiments-v1',
  '{"method":"deterministic_rule","eligibilityRuleId":"free-shipping-threshold-v1","templateId":"free_shipping_threshold","sourceHypothesisEngineVersion":"strategic-hypotheses-v1"}',
  'sha256:4444444444444444444444444444444444444444444444444444444444444444'
);
insert into public.recommended_experiment_hypotheses (experiment_id, position, hypothesis_id) values
  ('ffffffff-0000-0000-0000-000000000001', 0, 'eeeeeeee-0000-0000-0000-000000000001');

select set_config(
  'test.report_payload',
  jsonb_build_object(
    'brandId', 'bbbbbbbb-0000-0000-0000-000000000001',
    'generatedAt', '2026-09-04T13:00:00.000Z',
    'reportEngineVersion', 'competitive-report-v1',
    'reportHash', 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
    'sourceStateHash', 'sha256:6666666666666666666666666666666666666666666666666666666666666666',
    'competitors', jsonb_build_array(
      jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000001', 'name', 'competitor-one.test'),
      jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000002', 'name', 'competitor-two.test')
    ),
    'sourceIntelligence', jsonb_build_object(
      'signalIds', jsonb_build_array('dddddddd-0000-0000-0000-000000000001'),
      'hypothesisIds', jsonb_build_array('eeeeeeee-0000-0000-0000-000000000001'),
      'experimentIds', jsonb_build_array('ffffffff-0000-0000-0000-000000000001')
    ),
    'completeness', jsonb_build_object(
      'state', 'complete',
      'comparisonUnknown', '[]'::jsonb,
      'signals', jsonb_build_object('unresolved', '[]'::jsonb, 'generationNeeded', '[]'::jsonb),
      'hypotheses', jsonb_build_object('unresolved', '[]'::jsonb, 'generationNeeded', '[]'::jsonb),
      'experiments', jsonb_build_object('unresolved', '[]'::jsonb, 'generationNeeded', '[]'::jsonb),
      'sections', jsonb_build_object(
        'yourAdvantages', jsonb_build_object('state', 'no_supported_finding', 'available', 0, 'omitted', 0),
        'competitorAdvantages', jsonb_build_object('state', 'no_supported_finding', 'available', 0, 'omitted', 0),
        'appearsToBeWorking', jsonb_build_object('state', 'no_supported_finding', 'available', 0, 'omitted', 0),
        'whatToTestNext', jsonb_build_object('state', 'no_supported_finding', 'available', 0, 'omitted', 0)
      )
    ),
    'sections', jsonb_build_object(
      'yourAdvantages', '[]'::jsonb,
      'competitorAdvantages', '[]'::jsonb,
      'appearsToBeWorking', '[]'::jsonb,
      'whatToTestNext', '[]'::jsonb
    )
  )::text,
  true
);

select has_table('public', 'competitive_intelligence_reports', 'report snapshot table exists');

set local role service_role;
select is(
  (select (public.persist_competitive_intelligence_report(current_setting('test.report_payload')::jsonb)).payload ->> 'reportHash'),
  'sha256:5555555555555555555555555555555555555555555555555555555555555555',
  'service role can persist a report snapshot'
);
select is(
  (select (public.persist_competitive_intelligence_report(
    jsonb_set(current_setting('test.report_payload')::jsonb, '{generatedAt}', '"2026-09-05T13:00:00.000Z"')
  )).id),
  (select id from public.competitive_intelligence_reports limit 1),
  'timestamp-only replay returns the immutable snapshot'
);

set local role postgres;
select is((select count(*) from public.competitive_intelligence_reports), 1::bigint, 'idempotent replay stores one row');
select is(
  (select payload ->> 'generatedAt' from public.competitive_intelligence_reports limit 1),
  '2026-09-04T13:00:00.000Z',
  'idempotent replay preserves the first snapshot timestamp'
);

set local role service_role;
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  current_setting('test.report_payload')::jsonb, '{sourceStateHash}', '"sha256:7777777777777777777777777777777777777777777777777777777777777777"'
)) $$, '%report hash collision%', 'same report hash rejects different non-time state');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  current_setting('test.report_payload')::jsonb, '{competitors}',
  '[{"id":"cccccccc-0000-0000-0000-000000000003","name":"competitor-three.test"}]'
)) $$, '%competitors must belong to the report brand%', 'cross-tenant competitor injection is rejected');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  current_setting('test.report_payload')::jsonb, '{competitors}',
  '[{"id":"cccccccc-0000-0000-0000-000000000002","name":"competitor-two.test"},{"id":"cccccccc-0000-0000-0000-000000000001","name":"competitor-one.test"}]'
)) $$, '%competitors must be unique and sorted%', 'unsorted competitor scope is rejected');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  current_setting('test.report_payload')::jsonb, '{sourceIntelligence,signalIds}',
  '["dddddddd-0000-0000-0000-000000000001","dddddddd-0000-0000-0000-000000000001"]'
)) $$, '%source intelligence IDs must be unique and sorted%', 'duplicate source intelligence IDs are rejected');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  jsonb_set(current_setting('test.report_payload')::jsonb, '{reportHash}', '"sha256:8888888888888888888888888888888888888888888888888888888888888888"'),
  '{sourceIntelligence,signalIds}', '["dddddddd-0000-0000-0000-000000000002"]'
)) $$, '%source intelligence must belong to the report scope%', 'cross-tenant source intelligence is rejected');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  jsonb_set(current_setting('test.report_payload')::jsonb, '{reportHash}', '"sha256:9999999999999999999999999999999999999999999999999999999999999999"'),
  '{sourceIntelligence,signalIds}', '[]'
)) $$, '%hypothesis lineage must be included%', 'a report cannot omit a selected hypothesis supporting signal');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  jsonb_set(current_setting('test.report_payload')::jsonb, '{reportHash}', '"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'),
  '{sourceIntelligence,hypothesisIds}', '[]'
)) $$, '%experiment lineage must be included%', 'a report cannot omit a selected experiment source hypothesis');
select throws_like($$ select public.persist_competitive_intelligence_report(
  current_setting('test.report_payload')::jsonb - 'sections'
) $$, '%violates check constraint%', 'report snapshots require the exact top-level payload');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  current_setting('test.report_payload')::jsonb,
  '{sections,unexpected}',
  '[]'
)) $$, '%competitive_intelligence_reports_payload_valid%', 'report sections reject unknown keys');
select throws_like($$ select public.persist_competitive_intelligence_report(jsonb_set(
  current_setting('test.report_payload')::jsonb,
  '{sections,yourAdvantages}',
  '[{},{},{},{}]'
)) $$, '%competitive_intelligence_reports_payload_valid%', 'report sections contain at most three items');

select is(
  (select (public.persist_competitive_intelligence_report(jsonb_set(
    jsonb_set(current_setting('test.report_payload')::jsonb, '{reportHash}', '"sha256:abababababababababababababababababababababababababababababababab"'),
    '{sourceStateHash}', '"sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc"'
  ))).payload ->> 'sourceStateHash'),
  'sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc',
  'a changed source state with a new hash creates a new report snapshot'
);
select throws_like(
  $$ select public.persist_competitive_intelligence_report(jsonb_set(
    jsonb_set(current_setting('test.report_payload')::jsonb, '{reportHash}', '"sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"'),
    '{reportEngineVersion}', '"competitive-report-v2"'
  )) $$,
  '%competitive_intelligence_reports_payload_valid%',
  'unsupported report engine versions fail closed'
);
select is(
  (select jsonb_array_length((public.persist_competitive_intelligence_report(jsonb_set(
    jsonb_set(
      jsonb_set(current_setting('test.report_payload')::jsonb, '{reportHash}', '"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"'),
      '{sourceStateHash}', '"sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef"'
    ),
    '{competitors}', '[{"id":"cccccccc-0000-0000-0000-000000000001","name":"competitor-one.test"}]'
  ))).payload -> 'competitors')),
  1,
  'a changed competitor selection with a new hash creates a scoped report snapshot'
);

set local role postgres;
select is((select count(*) from public.competitive_intelligence_reports), 3::bigint, 'distinct report identities remain immutable history');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is((select count(*) from public.competitive_intelligence_reports), 3::bigint, 'organization member can read its reports');
select throws_like($$ insert into public.competitive_intelligence_reports (
  owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at, payload
) select owned_brand_id, competitor_ids, report_engine_version,
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', generated_at, payload
  from public.competitive_intelligence_reports limit 1 $$, '%permission denied%', 'authenticated users cannot insert reports');
select throws_like($$ update public.competitive_intelligence_reports set generated_at = now() $$, '%permission denied%', 'authenticated users cannot update reports');
select throws_like($$ delete from public.competitive_intelligence_reports $$, '%permission denied%', 'authenticated users cannot delete reports');
select throws_like($$ select public.persist_competitive_intelligence_report(current_setting('test.report_payload')::jsonb) $$, '%permission denied%', 'authenticated users cannot call report persistence RPC');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.competitive_intelligence_reports), 0::bigint, 'cross-organization reports are invisible');

set local role postgres;
select throws_like($$ update public.competitive_intelligence_reports set generated_at = now() $$, '%competitive_intelligence_reports are append-only%', 'report updates are rejected for postgres');
select throws_like($$ delete from public.competitive_intelligence_reports $$, '%competitive_intelligence_reports are append-only%', 'report deletes are rejected for postgres');

select * from finish();
rollback;
