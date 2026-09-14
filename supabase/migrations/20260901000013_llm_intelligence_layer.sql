-- LLM intelligence persistence layer (additive).
--
--   * intelligence_generation_runs / intelligence_generation_attempts are SERVICE-ONLY audit
--     tables: they hold the exact frozen IntelligenceContext and untrusted raw model output.
--     RLS is enabled with no policies and no grants to anon/authenticated.
--   * llm_strategic_hypotheses / llm_recommended_experiments / llm_executive_briefings (and their
--     link tables) hold ONLY validator-accepted intelligence, readable by brand members.
--   * persist_llm_intelligence_generation(jsonb) is the single transactional writer and is
--     executable by service_role only. Grounding semantics stay in the TypeScript validator;
--     this schema owns relational integrity, tenancy, provenance consistency and immutability.
--   * Deterministic v1 tables, RPCs and data are unchanged; competitive_intelligence_reports
--     only gains a nullable generation_run_id.

-- Audit: generation runs -------------------------------------------------------------------

create table public.intelligence_generation_runs (
  id uuid primary key default gen_random_uuid(),
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_ids uuid[] not null constraint intelligence_generation_runs_competitor_count check (
    cardinality(competitor_ids) between 1 and 5
  ),
  analysis_objective text not null constraint intelligence_generation_runs_analysis_objective_allowed check (
    analysis_objective in ('general_overview', 'pricing_focus', 'friction_reduction', 'retention', 'promotions')
  ),
  context_version text not null constraint intelligence_generation_runs_context_version_not_blank check (
    char_length(trim(context_version)) > 0
  ),
  intelligence_context jsonb not null,
  intelligence_context_hash text not null constraint intelligence_generation_runs_context_hash_sha256 check (
    intelligence_context_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  context_generated_at timestamptz not null,
  prompt_version text not null constraint intelligence_generation_runs_prompt_version_not_blank check (
    char_length(trim(prompt_version)) > 0
  ),
  validator_contract_version text not null constraint intelligence_generation_runs_validator_contract_version_not_blank check (
    char_length(trim(validator_contract_version)) > 0
  ),
  provider_id text not null constraint intelligence_generation_runs_provider_id_not_blank check (
    char_length(trim(provider_id)) > 0
  ),
  model_id text not null constraint intelligence_generation_runs_model_id_not_blank check (
    char_length(trim(model_id)) > 0
  ),
  model_parameters jsonb not null constraint intelligence_generation_runs_model_parameters_valid check (
    jsonb_typeof(model_parameters) = 'object'
    and model_parameters - 'temperature' - 'maxOutputTokens' - 'reasoningEffort' = '{}'::jsonb
  ),
  outcome text not null constraint intelligence_generation_runs_outcome_allowed check (
    outcome in ('llm_success', 'llm_partial', 'llm_rejected', 'deterministic_fallback')
  ),
  fallback_reason text constraint intelligence_generation_runs_fallback_reason_allowed check (
    fallback_reason in (
      'CONTEXT_HASH_MISMATCH', 'INVALID_CONTEXT', 'MALFORMED_OUTPUT',
      'VALIDATION_REPAIR_EXHAUSTED', 'PROVIDER_RETRY_EXHAUSTED', 'PROVIDER_NON_RETRYABLE_FAILURE'
    )
  ),
  validation_status text constraint intelligence_generation_runs_validation_status_allowed check (
    validation_status in ('passed', 'partial', 'failed')
  ),
  validation_summary jsonb,
  accepted_hypothesis_count integer not null constraint intelligence_generation_runs_accepted_hypothesis_count_nonnegative check (
    accepted_hypothesis_count >= 0
  ),
  accepted_experiment_count integer not null constraint intelligence_generation_runs_accepted_experiment_count_nonnegative check (
    accepted_experiment_count >= 0
  ),
  executive_briefing_accepted boolean not null,
  created_at timestamptz not null default now(),
  constraint intelligence_generation_runs_context_matches_columns check (
    jsonb_typeof(intelligence_context) = 'object'
    and (intelligence_context #>> '{brand,id}')::uuid = owned_brand_id
    and intelligence_context ->> 'contextVersion' = context_version
    and intelligence_context ->> 'analysisObjective' = analysis_objective
    and (intelligence_context ->> 'generatedAt')::timestamptz = context_generated_at
  ),
  constraint intelligence_generation_runs_fallback_reason_matches_outcome check (
    (outcome = 'deterministic_fallback') = (fallback_reason is not null)
  ),
  constraint intelligence_generation_runs_validation_matches_outcome check (
    (outcome = 'llm_success' and validation_status = 'passed')
    or (outcome = 'llm_partial' and validation_status = 'partial')
    or (outcome = 'llm_rejected' and validation_status = 'failed')
    or outcome = 'deterministic_fallback'
  ),
  constraint intelligence_generation_runs_validation_summary_valid check (
    (validation_status is null) = (validation_summary is null)
    and (
      validation_summary is null
      or (
        jsonb_typeof(validation_summary) = 'object'
        and validation_summary ->> 'status' = validation_status
      )
    )
  ),
  constraint intelligence_generation_runs_accepted_items_match_outcome check (
    case
      when outcome in ('llm_success', 'llm_partial') then
        accepted_hypothesis_count + accepted_experiment_count
          + (case when executive_briefing_accepted then 1 else 0 end) > 0
      else
        accepted_hypothesis_count = 0
        and accepted_experiment_count = 0
        and not executive_briefing_accepted
    end
  )
);

create index intelligence_generation_runs_owned_brand_id_created_at_idx
on public.intelligence_generation_runs (owned_brand_id, created_at desc);

create function public.validate_intelligence_generation_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  context_competitor_ids uuid[];
begin
  if jsonb_typeof(new.intelligence_context -> 'competitors') <> 'array' then
    raise exception 'generation run context competitors must be a JSON array';
  end if;

  select coalesce(array_agg((competitor.value ->> 'id')::uuid order by competitor.ordinality), '{}')
  into context_competitor_ids
  from jsonb_array_elements(new.intelligence_context -> 'competitors')
    with ordinality as competitor(value, ordinality);

  if new.competitor_ids is distinct from context_competitor_ids then
    raise exception 'generation run competitor scope must match its frozen context';
  end if;
  if new.competitor_ids is distinct from (
    select coalesce(array_agg(value order by value), '{}')
    from (select distinct unnest(new.competitor_ids) as value) values
  ) then
    raise exception 'generation run competitors must be unique and sorted';
  end if;
  if (
    select count(*)
    from public.competitors
    where id = any(new.competitor_ids)
      and brand_id = new.owned_brand_id
  ) <> cardinality(new.competitor_ids) then
    raise exception 'generation run competitors must belong to the generation run brand';
  end if;

  return new;
end;
$$;

create trigger intelligence_generation_runs_validate
before insert on public.intelligence_generation_runs
for each row execute function public.validate_intelligence_generation_run();

-- Audit: provider attempts -----------------------------------------------------------------

create table public.intelligence_generation_attempts (
  run_id uuid not null references public.intelligence_generation_runs(id) on delete restrict,
  attempt_number smallint not null constraint intelligence_generation_attempts_attempt_number_allowed check (
    attempt_number in (1, 2)
  ),
  kind text not null constraint intelligence_generation_attempts_kind_allowed check (
    kind in ('initial', 'retry')
  ),
  retry_reason text constraint intelligence_generation_attempts_retry_reason_allowed check (
    retry_reason in ('transport', 'validation_repair')
  ),
  prompt_version text not null constraint intelligence_generation_attempts_prompt_version_not_blank check (
    char_length(trim(prompt_version)) > 0
  ),
  latency_ms integer constraint intelligence_generation_attempts_latency_ms_nonnegative check (latency_ms >= 0),
  input_tokens integer constraint intelligence_generation_attempts_input_tokens_nonnegative check (input_tokens >= 0),
  output_tokens integer constraint intelligence_generation_attempts_output_tokens_nonnegative check (output_tokens >= 0),
  total_tokens integer constraint intelligence_generation_attempts_total_tokens_nonnegative check (total_tokens >= 0),
  estimated_cost_usd numeric(14, 6) constraint intelligence_generation_attempts_estimated_cost_usd_nonnegative check (
    estimated_cost_usd >= 0
  ),
  raw_response_id text,
  finish_reason text,
  provider_failure text constraint intelligence_generation_attempts_provider_failure_allowed check (
    provider_failure in (
      'timeout', 'rate_limit', 'provider_unavailable', 'authentication_configuration',
      'invalid_request', 'provider_exception'
    )
  ),
  provider_failure_metadata jsonb constraint intelligence_generation_attempts_provider_failure_metadata_valid check (
    provider_failure_metadata is null
    or (
      jsonb_typeof(provider_failure_metadata) = 'object'
      and provider_failure_metadata - 'httpStatus' - 'providerRequestId'
        - 'providerErrorCode' - 'fieldViolationPaths' = '{}'::jsonb
    )
  ),
  raw_output_captured boolean not null,
  raw_output jsonb,
  validation_status text constraint intelligence_generation_attempts_validation_status_allowed check (
    validation_status in ('passed', 'partial', 'failed')
  ),
  validation_error_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (run_id, attempt_number),
  constraint intelligence_generation_attempts_kind_matches_number check (
    (attempt_number = 1 and kind = 'initial' and retry_reason is null)
    or (attempt_number = 2 and kind = 'retry' and retry_reason is not null)
  ),
  constraint intelligence_generation_attempts_failure_has_no_output check (
    provider_failure is null
    or (
      not raw_output_captured
      and latency_ms is null and input_tokens is null and output_tokens is null
      and total_tokens is null and estimated_cost_usd is null
      and raw_response_id is null and finish_reason is null
    )
  ),
  constraint intelligence_generation_attempts_failure_metadata_requires_failure check (
    provider_failure is not null or provider_failure_metadata is null
  ),
  constraint intelligence_generation_attempts_raw_output_capture_consistent check (
    (raw_output_captured or raw_output is null)
    and (raw_output_captured = (validation_status is not null))
    and (validation_status is not null or cardinality(validation_error_codes) = 0)
  )
);

-- Customer-facing: accepted LLM hypotheses -------------------------------------------------

create table public.llm_strategic_hypotheses (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references public.intelligence_generation_runs(id) on delete restrict,
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_id uuid not null,
  hypothesis_ref text not null constraint llm_strategic_hypotheses_hypothesis_ref_format check (
    hypothesis_ref ~ '^h[1-9][0-9]*$'
  ),
  theme text not null constraint llm_strategic_hypotheses_theme_allowed check (
    theme in (
      'shipping_friction', 'purchase_risk_reduction', 'repeat_purchase_mechanics',
      'promotional_incentives', 'pricing_strategy', 'bundle_packaging'
    )
  ),
  statement text not null constraint llm_strategic_hypotheses_statement_not_blank check (
    char_length(trim(statement)) > 0
  ),
  rationale text not null constraint llm_strategic_hypotheses_rationale_not_blank check (
    char_length(trim(rationale)) > 0
  ),
  confidence text not null constraint llm_strategic_hypotheses_confidence_allowed check (
    confidence in ('medium', 'low')
  ),
  uncertainty_category text not null constraint llm_strategic_hypotheses_uncertainty_category_allowed check (
    uncertainty_category in (
      'conversion_effect_not_established', 'retention_effect_not_established',
      'promotion_impact_not_established', 'combined_business_impact_not_established'
    )
  ),
  uncertainty_statement text not null constraint llm_strategic_hypotheses_uncertainty_statement_not_blank check (
    char_length(trim(uncertainty_statement)) > 0
  ),
  assumptions jsonb not null constraint llm_strategic_hypotheses_assumptions_array check (
    jsonb_typeof(assumptions) = 'array' and jsonb_array_length(assumptions) > 0
  ),
  epistemic_class_dependencies text[] not null constraint llm_strategic_hypotheses_epistemic_class_dependencies_valid check (
    cardinality(epistemic_class_dependencies) > 0
    and epistemic_class_dependencies <@ array['observed', 'derived', 'estimated', 'reported']::text[]
  ),
  supporting_signal_ids uuid[] not null constraint llm_strategic_hypotheses_supporting_signal_ids_not_empty check (
    cardinality(supporting_signal_ids) > 0
  ),
  supporting_comparison_keys text[] not null constraint llm_strategic_hypotheses_supporting_comparison_keys_not_empty check (
    cardinality(supporting_comparison_keys) > 0
  ),
  claim_references jsonb not null constraint llm_strategic_hypotheses_claim_references_array check (
    jsonb_typeof(claim_references) = 'array' and jsonb_array_length(claim_references) > 0
  ),
  numeric_claims jsonb not null constraint llm_strategic_hypotheses_numeric_claims_array check (
    jsonb_typeof(numeric_claims) = 'array'
  ),
  generated_at timestamptz not null,
  hypothesis_engine_version text not null constraint llm_strategic_hypotheses_engine_version_allowed check (
    hypothesis_engine_version = 'strategic-hypotheses-v2-llm'
  ),
  generation_provenance jsonb not null constraint llm_strategic_hypotheses_generation_provenance_valid check (
    jsonb_typeof(generation_provenance) = 'object'
    and generation_provenance ->> 'method' = 'llm_synthesized'
    and generation_provenance ->> 'generationRunId' = generation_run_id::text
  ),
  hypothesis_hash text not null constraint llm_strategic_hypotheses_hypothesis_hash_sha256 check (
    hypothesis_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  constraint llm_strategic_hypotheses_competitor_matches_brand_fk
    foreign key (competitor_id, owned_brand_id)
    references public.competitors(id, brand_id)
    on delete restrict,
  constraint llm_strategic_hypotheses_generation_run_id_hypothesis_ref_key
    unique (generation_run_id, hypothesis_ref),
  constraint llm_strategic_hypotheses_ref_identity_key
    unique (id, generation_run_id, hypothesis_ref),
  constraint llm_strategic_hypotheses_dependency_identity_key
    unique (id, generation_run_id, hypothesis_ref, competitor_id),
  constraint llm_strategic_hypotheses_owned_brand_id_hypothesis_hash_key
    unique (owned_brand_id, hypothesis_hash)
);

create index llm_strategic_hypotheses_owned_brand_id_generated_at_idx
on public.llm_strategic_hypotheses (owned_brand_id, generated_at desc);

create table public.llm_strategic_hypothesis_signals (
  hypothesis_id uuid not null references public.llm_strategic_hypotheses(id) on delete restrict,
  position smallint not null constraint llm_strategic_hypothesis_signals_position_nonnegative check (position >= 0),
  signal_id uuid not null references public.competitive_signals(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (hypothesis_id, position),
  constraint llm_strategic_hypothesis_signals_hypothesis_id_signal_id_key unique (hypothesis_id, signal_id)
);

create index llm_strategic_hypothesis_signals_signal_id_idx
on public.llm_strategic_hypothesis_signals (signal_id);

-- Customer-facing: accepted LLM experiments ------------------------------------------------

create table public.llm_recommended_experiments (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references public.intelligence_generation_runs(id) on delete restrict,
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_id uuid not null,
  hypothesis_id uuid not null,
  source_hypothesis_ref text not null constraint llm_recommended_experiments_source_hypothesis_ref_format check (
    source_hypothesis_ref ~ '^h[1-9][0-9]*$'
  ),
  title text not null constraint llm_recommended_experiments_title_not_blank check (char_length(trim(title)) > 0),
  objective text not null constraint llm_recommended_experiments_objective_not_blank check (
    char_length(trim(objective)) > 0
  ),
  hypothesis_under_test text not null constraint llm_recommended_experiments_hypothesis_under_test_not_blank check (
    char_length(trim(hypothesis_under_test)) > 0
  ),
  variable_under_test text not null constraint llm_recommended_experiments_variable_under_test_not_blank check (
    char_length(trim(variable_under_test)) > 0
  ),
  design jsonb not null constraint llm_recommended_experiments_design_valid check (
    jsonb_typeof(design) = 'object'
    and design ?& array['comparison', 'variablePolicy', 'controlDescription', 'treatmentDescription']
    and design - 'comparison' - 'variablePolicy' - 'controlDescription' - 'treatmentDescription' = '{}'::jsonb
    and design ->> 'comparison' = 'control_vs_treatment'
    and design ->> 'variablePolicy' = 'single_variable'
    and jsonb_typeof(design -> 'controlDescription') = 'string'
    and jsonb_typeof(design -> 'treatmentDescription') = 'string'
  ),
  primary_metric text not null constraint llm_recommended_experiments_primary_metric_allowed check (
    primary_metric in (
      'conversion_rate', 'checkout_conversion_rate', 'average_order_value',
      'contribution_margin_per_order', 'shipping_cost_per_order', 'return_rate',
      'refund_rate', 'subscription_take_rate', 'subscription_cancellation_rate'
    )
  ),
  guardrail_metrics text[] not null constraint llm_recommended_experiments_guardrail_metrics_valid check (
    cardinality(guardrail_metrics) > 0
    and guardrail_metrics <@ array[
      'conversion_rate', 'checkout_conversion_rate', 'average_order_value',
      'contribution_margin_per_order', 'shipping_cost_per_order', 'return_rate',
      'refund_rate', 'subscription_take_rate', 'subscription_cancellation_rate'
    ]::text[]
    and not (primary_metric = any(guardrail_metrics))
  ),
  implementation_notes jsonb not null constraint llm_recommended_experiments_implementation_notes_array check (
    jsonb_typeof(implementation_notes) = 'array' and jsonb_array_length(implementation_notes) > 0
  ),
  caveat_category text not null constraint llm_recommended_experiments_caveat_category_allowed check (
    caveat_category in (
      'shipping_margin_exposure', 'policy_return_refund_exposure',
      'subscription_customer_fit_and_cancellation', 'promotion_margin_exposure'
    )
  ),
  caveat_statement text not null constraint llm_recommended_experiments_caveat_statement_not_blank check (
    char_length(trim(caveat_statement)) > 0
  ),
  claim_references jsonb not null constraint llm_recommended_experiments_claim_references_array check (
    jsonb_typeof(claim_references) = 'array' and jsonb_array_length(claim_references) > 0
  ),
  numeric_claims jsonb not null constraint llm_recommended_experiments_numeric_claims_array check (
    jsonb_typeof(numeric_claims) = 'array'
  ),
  generated_at timestamptz not null,
  experiment_engine_version text not null constraint llm_recommended_experiments_engine_version_allowed check (
    experiment_engine_version = 'recommended-experiments-v2-llm'
  ),
  generation_provenance jsonb not null constraint llm_recommended_experiments_generation_provenance_valid check (
    jsonb_typeof(generation_provenance) = 'object'
    and generation_provenance ->> 'method' = 'llm_synthesized'
    and generation_provenance ->> 'generationRunId' = generation_run_id::text
  ),
  experiment_hash text not null constraint llm_recommended_experiments_experiment_hash_sha256 check (
    experiment_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  constraint llm_recommended_experiments_competitor_matches_brand_fk
    foreign key (competitor_id, owned_brand_id)
    references public.competitors(id, brand_id)
    on delete restrict,
  -- The dependency is the exact accepted hypothesis ref of the SAME run and competitor.
  constraint llm_recommended_experiments_hypothesis_dependency_fk
    foreign key (hypothesis_id, generation_run_id, source_hypothesis_ref, competitor_id)
    references public.llm_strategic_hypotheses(id, generation_run_id, hypothesis_ref, competitor_id)
    on delete restrict,
  constraint llm_recommended_experiments_owned_brand_id_experiment_hash_key
    unique (owned_brand_id, experiment_hash)
);

create index llm_recommended_experiments_owned_brand_id_generated_at_idx
on public.llm_recommended_experiments (owned_brand_id, generated_at desc);

create index llm_recommended_experiments_generation_run_id_idx
on public.llm_recommended_experiments (generation_run_id);

create index llm_recommended_experiments_hypothesis_id_idx
on public.llm_recommended_experiments (hypothesis_id);

-- Customer-facing: accepted executive briefings -------------------------------------------

create table public.llm_executive_briefings (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references public.intelligence_generation_runs(id) on delete restrict,
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  headline text not null constraint llm_executive_briefings_headline_not_blank check (char_length(trim(headline)) > 0),
  strategic_posture_summary text not null constraint llm_executive_briefings_strategic_posture_summary_not_blank check (
    char_length(trim(strategic_posture_summary)) > 0
  ),
  key_takeaway text not null constraint llm_executive_briefings_key_takeaway_not_blank check (
    char_length(trim(key_takeaway)) > 0
  ),
  supporting_hypothesis_refs text[] not null,
  claim_references jsonb not null constraint llm_executive_briefings_claim_references_array check (
    jsonb_typeof(claim_references) = 'array'
  ),
  numeric_claims jsonb not null constraint llm_executive_briefings_numeric_claims_array check (
    jsonb_typeof(numeric_claims) = 'array'
  ),
  generated_at timestamptz not null,
  generation_provenance jsonb not null constraint llm_executive_briefings_generation_provenance_valid check (
    jsonb_typeof(generation_provenance) = 'object'
    and generation_provenance ->> 'method' = 'llm_synthesized'
    and generation_provenance ->> 'generationRunId' = generation_run_id::text
  ),
  created_at timestamptz not null default now(),
  constraint llm_executive_briefings_generation_run_id_key unique (generation_run_id),
  constraint llm_executive_briefings_run_identity_key unique (id, generation_run_id),
  constraint llm_executive_briefings_support_declared check (
    cardinality(supporting_hypothesis_refs) > 0 or jsonb_array_length(claim_references) > 0
  )
);

create index llm_executive_briefings_owned_brand_id_generated_at_idx
on public.llm_executive_briefings (owned_brand_id, generated_at desc);

create table public.llm_executive_briefing_hypotheses (
  briefing_id uuid not null,
  generation_run_id uuid not null,
  position smallint not null constraint llm_executive_briefing_hypotheses_position_nonnegative check (position >= 0),
  hypothesis_id uuid not null,
  hypothesis_ref text not null,
  created_at timestamptz not null default now(),
  primary key (briefing_id, position),
  constraint llm_executive_briefing_hypotheses_briefing_id_hypothesis_id_key unique (briefing_id, hypothesis_id),
  constraint llm_executive_briefing_hypotheses_briefing_fk
    foreign key (briefing_id, generation_run_id)
    references public.llm_executive_briefings(id, generation_run_id)
    on delete restrict,
  constraint llm_executive_briefing_hypotheses_hypothesis_fk
    foreign key (hypothesis_id, generation_run_id, hypothesis_ref)
    references public.llm_strategic_hypotheses(id, generation_run_id, hypothesis_ref)
    on delete restrict
);

create index llm_executive_briefing_hypotheses_hypothesis_id_idx
on public.llm_executive_briefing_hypotheses (hypothesis_id);

-- Reports may reference the generation run that produced their intelligence -----------------

alter table public.competitive_intelligence_reports
  add column generation_run_id uuid references public.intelligence_generation_runs(id) on delete restrict;

create index competitive_intelligence_reports_generation_run_id_idx
on public.competitive_intelligence_reports (generation_run_id)
where generation_run_id is not null;

create function public.validate_competitive_intelligence_report_generation_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run_brand_id uuid;
  run_competitor_ids uuid[];
begin
  if new.generation_run_id is null then
    return new;
  end if;

  select owned_brand_id, competitor_ids
  into run_brand_id, run_competitor_ids
  from public.intelligence_generation_runs
  where id = new.generation_run_id;

  if run_brand_id is distinct from new.owned_brand_id then
    raise exception 'report generation run must belong to the report brand';
  end if;
  if not (new.competitor_ids <@ run_competitor_ids) then
    raise exception 'report competitor scope must be within its generation run scope';
  end if;

  return new;
end;
$$;

create trigger competitive_intelligence_reports_validate_generation_run
before insert on public.competitive_intelligence_reports
for each row execute function public.validate_competitive_intelligence_report_generation_run();

-- Immutability ------------------------------------------------------------------------------

create function public.prevent_llm_intelligence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% are append-only', tg_table_name;
end;
$$;

create trigger intelligence_generation_runs_prevent_mutation
before update or delete on public.intelligence_generation_runs
for each row execute function public.prevent_llm_intelligence_mutation();

create trigger intelligence_generation_attempts_prevent_mutation
before update or delete on public.intelligence_generation_attempts
for each row execute function public.prevent_llm_intelligence_mutation();

create trigger llm_strategic_hypotheses_prevent_mutation
before update or delete on public.llm_strategic_hypotheses
for each row execute function public.prevent_llm_intelligence_mutation();

create trigger llm_strategic_hypothesis_signals_prevent_mutation
before update or delete on public.llm_strategic_hypothesis_signals
for each row execute function public.prevent_llm_intelligence_mutation();

create trigger llm_recommended_experiments_prevent_mutation
before update or delete on public.llm_recommended_experiments
for each row execute function public.prevent_llm_intelligence_mutation();

create trigger llm_executive_briefings_prevent_mutation
before update or delete on public.llm_executive_briefings
for each row execute function public.prevent_llm_intelligence_mutation();

create trigger llm_executive_briefing_hypotheses_prevent_mutation
before update or delete on public.llm_executive_briefing_hypotheses
for each row execute function public.prevent_llm_intelligence_mutation();

-- Run scope and sealing for customer-facing rows -------------------------------------------

-- Locks the run and asserts that a customer-facing row is attached to an accepted LLM run of the
-- same tenant scope, with provenance and generation time copied exactly from that run.
create function public.assert_llm_intelligence_run_scope(
  target_run_id uuid,
  target_owned_brand_id uuid,
  target_competitor_id uuid,
  target_generation_provenance jsonb,
  target_generated_at timestamptz
)
returns public.intelligence_generation_runs
language plpgsql
set search_path = public
as $$
declare
  run public.intelligence_generation_runs;
begin
  select *
  into run
  from public.intelligence_generation_runs
  where id = target_run_id
  for update;

  if run.id is null then
    raise exception 'LLM intelligence requires an existing generation run';
  end if;
  if run.owned_brand_id is distinct from target_owned_brand_id then
    raise exception 'LLM intelligence must belong to the generation run brand';
  end if;
  if target_competitor_id is not null and not (target_competitor_id = any(run.competitor_ids)) then
    raise exception 'LLM intelligence competitor must be within the generation run scope';
  end if;
  if run.outcome not in ('llm_success', 'llm_partial') then
    raise exception 'LLM intelligence requires an accepted LLM generation run';
  end if;
  if target_generated_at is distinct from run.context_generated_at then
    raise exception 'LLM intelligence generation time must match the generation run context';
  end if;
  if target_generation_provenance is distinct from jsonb_build_object(
    'method', 'llm_synthesized',
    'generationRunId', run.id::text,
    'providerId', run.provider_id,
    'modelId', run.model_id,
    'promptVersion', run.prompt_version,
    'intelligenceContextHash', run.intelligence_context_hash,
    'validatorContractVersion', run.validator_contract_version
  ) then
    raise exception 'LLM intelligence provenance must match its generation run';
  end if;

  return run;
end;
$$;

revoke all on function public.assert_llm_intelligence_run_scope(uuid, uuid, uuid, jsonb, timestamptz)
from public, anon, authenticated;

create function public.validate_llm_strategic_hypothesis()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run public.intelligence_generation_runs;
begin
  run := public.assert_llm_intelligence_run_scope(
    new.generation_run_id, new.owned_brand_id, new.competitor_id,
    new.generation_provenance, new.generated_at
  );
  if (
    select count(*) from public.llm_strategic_hypotheses
    where generation_run_id = new.generation_run_id
  ) >= run.accepted_hypothesis_count then
    raise exception 'generation run accepted hypothesis count is already satisfied';
  end if;
  return new;
end;
$$;

create trigger llm_strategic_hypotheses_validate
before insert on public.llm_strategic_hypotheses
for each row execute function public.validate_llm_strategic_hypothesis();

create function public.validate_llm_strategic_hypothesis_signal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  hypothesis public.llm_strategic_hypotheses;
  signal_brand_id uuid;
  signal_competitor_id uuid;
begin
  select * into hypothesis from public.llm_strategic_hypotheses where id = new.hypothesis_id;
  if hypothesis.id is null then
    raise exception 'LLM hypothesis signal requires an existing LLM hypothesis';
  end if;
  if new.signal_id is distinct from hypothesis.supporting_signal_ids[new.position + 1] then
    raise exception 'LLM hypothesis signal must match the declared supporting signal at its position';
  end if;

  select owned_brand_id, competitor_id
  into signal_brand_id, signal_competitor_id
  from public.competitive_signals
  where id = new.signal_id;

  if signal_brand_id is distinct from hypothesis.owned_brand_id then
    raise exception 'supporting signal must belong to the LLM hypothesis brand';
  end if;
  if signal_competitor_id is distinct from hypothesis.competitor_id then
    raise exception 'supporting signal must belong to the LLM hypothesis competitor';
  end if;
  if not exists (
    select 1
    from public.intelligence_generation_runs runs,
      jsonb_array_elements(runs.intelligence_context -> 'signals') as context_signal(value)
    where runs.id = hypothesis.generation_run_id
      and context_signal.value ->> 'id' = new.signal_id::text
  ) then
    raise exception 'supporting signal must be present in the generation run frozen context';
  end if;
  return new;
end;
$$;

create trigger llm_strategic_hypothesis_signals_validate
before insert on public.llm_strategic_hypothesis_signals
for each row execute function public.validate_llm_strategic_hypothesis_signal();

create function public.validate_llm_recommended_experiment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run public.intelligence_generation_runs;
begin
  run := public.assert_llm_intelligence_run_scope(
    new.generation_run_id, new.owned_brand_id, new.competitor_id,
    new.generation_provenance, new.generated_at
  );
  if (
    select count(*) from public.llm_recommended_experiments
    where generation_run_id = new.generation_run_id
  ) >= run.accepted_experiment_count then
    raise exception 'generation run accepted experiment count is already satisfied';
  end if;
  return new;
end;
$$;

create trigger llm_recommended_experiments_validate
before insert on public.llm_recommended_experiments
for each row execute function public.validate_llm_recommended_experiment();

create function public.validate_llm_executive_briefing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run public.intelligence_generation_runs;
begin
  run := public.assert_llm_intelligence_run_scope(
    new.generation_run_id, new.owned_brand_id, null,
    new.generation_provenance, new.generated_at
  );
  if not run.executive_briefing_accepted then
    raise exception 'generation run did not accept an executive briefing';
  end if;
  return new;
end;
$$;

create trigger llm_executive_briefings_validate
before insert on public.llm_executive_briefings
for each row execute function public.validate_llm_executive_briefing();

create function public.validate_llm_executive_briefing_hypothesis()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  declared_ref text;
begin
  select supporting_hypothesis_refs[new.position + 1]
  into declared_ref
  from public.llm_executive_briefings
  where id = new.briefing_id;

  if declared_ref is null or declared_ref is distinct from new.hypothesis_ref then
    raise exception 'briefing hypothesis must match the declared supporting hypothesis ref at its position';
  end if;
  return new;
end;
$$;

create trigger llm_executive_briefing_hypotheses_validate
before insert on public.llm_executive_briefing_hypotheses
for each row execute function public.validate_llm_executive_briefing_hypothesis();

-- RLS and grants ------------------------------------------------------------------------------

alter table public.intelligence_generation_runs enable row level security;
alter table public.intelligence_generation_attempts enable row level security;
alter table public.llm_strategic_hypotheses enable row level security;
alter table public.llm_strategic_hypothesis_signals enable row level security;
alter table public.llm_recommended_experiments enable row level security;
alter table public.llm_executive_briefings enable row level security;
alter table public.llm_executive_briefing_hypotheses enable row level security;

-- Audit tables: no end-user access of any kind. No policies are defined.
revoke all on public.intelligence_generation_runs, public.intelligence_generation_attempts
from public, anon, authenticated;

revoke all on
  public.llm_strategic_hypotheses,
  public.llm_strategic_hypothesis_signals,
  public.llm_recommended_experiments,
  public.llm_executive_briefings,
  public.llm_executive_briefing_hypotheses
from public, anon, authenticated;

grant select on
  public.llm_strategic_hypotheses,
  public.llm_strategic_hypothesis_signals,
  public.llm_recommended_experiments,
  public.llm_executive_briefings,
  public.llm_executive_briefing_hypotheses
to authenticated;

create policy "brand organization members can view LLM strategic hypotheses"
on public.llm_strategic_hypotheses for select to authenticated
using (public.is_brand_member(owned_brand_id));

create policy "brand organization members can view LLM strategic hypothesis signals"
on public.llm_strategic_hypothesis_signals for select to authenticated
using (
  exists (
    select 1 from public.llm_strategic_hypotheses
    where llm_strategic_hypotheses.id = llm_strategic_hypothesis_signals.hypothesis_id
      and public.is_brand_member(llm_strategic_hypotheses.owned_brand_id)
  )
);

create policy "brand organization members can view LLM recommended experiments"
on public.llm_recommended_experiments for select to authenticated
using (public.is_brand_member(owned_brand_id));

create policy "brand organization members can view LLM executive briefings"
on public.llm_executive_briefings for select to authenticated
using (public.is_brand_member(owned_brand_id));

create policy "brand organization members can view LLM executive briefing hypotheses"
on public.llm_executive_briefing_hypotheses for select to authenticated
using (
  exists (
    select 1 from public.llm_executive_briefings
    where llm_executive_briefings.id = llm_executive_briefing_hypotheses.briefing_id
      and public.is_brand_member(llm_executive_briefings.owned_brand_id)
  )
);

-- Transactional writer ------------------------------------------------------------------------

create function public.persist_llm_intelligence_generation(p_generation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.intelligence_generation_runs;
  attempt jsonb;
  attempt_position bigint;
  candidate jsonb;
  candidate_position bigint;
  reference jsonb;
  reference_position bigint;
  persisted_id uuid;
  resolved_hypothesis_id uuid;
  hypothesis_ids_by_ref jsonb := '{}'::jsonb;
  persisted_hypotheses jsonb := '[]'::jsonb;
  persisted_experiments jsonb := '[]'::jsonb;
  persisted_briefing_id uuid;
begin
  if p_generation is null or jsonb_typeof(p_generation) <> 'object' then
    raise exception 'p_generation must be a JSON object';
  end if;
  if jsonb_typeof(p_generation -> 'competitorIds') <> 'array'
     or jsonb_typeof(p_generation -> 'attempts') <> 'array'
     or jsonb_array_length(p_generation -> 'attempts') = 0
     or jsonb_typeof(p_generation -> 'hypotheses') <> 'array'
     or jsonb_typeof(p_generation -> 'experiments') <> 'array'
     or jsonb_typeof(p_generation -> 'executiveBriefing') not in ('object', 'null') then
    raise exception 'generation payload is missing required collections';
  end if;

  insert into public.intelligence_generation_runs (
    id, owned_brand_id, competitor_ids, analysis_objective, context_version,
    intelligence_context, intelligence_context_hash, context_generated_at,
    prompt_version, validator_contract_version, provider_id, model_id, model_parameters,
    outcome, fallback_reason, validation_status, validation_summary,
    accepted_hypothesis_count, accepted_experiment_count, executive_briefing_accepted
  ) values (
    (p_generation ->> 'generationRunId')::uuid,
    (p_generation ->> 'ownedBrandId')::uuid,
    array(
      select value::uuid
      from jsonb_array_elements_text(p_generation -> 'competitorIds') with ordinality as id(value, ordinality)
      order by ordinality
    ),
    p_generation ->> 'analysisObjective',
    p_generation ->> 'contextVersion',
    p_generation -> 'intelligenceContext',
    p_generation ->> 'intelligenceContextHash',
    (p_generation ->> 'contextGeneratedAt')::timestamptz,
    p_generation ->> 'promptVersion',
    p_generation ->> 'validatorContractVersion',
    p_generation ->> 'providerId',
    p_generation ->> 'modelId',
    p_generation -> 'modelParameters',
    p_generation ->> 'outcome',
    p_generation ->> 'fallbackReason',
    p_generation ->> 'validationStatus',
    nullif(p_generation -> 'validationSummary', 'null'::jsonb),
    (p_generation ->> 'acceptedHypothesisCount')::integer,
    (p_generation ->> 'acceptedExperimentCount')::integer,
    (p_generation ->> 'executiveBriefingAccepted')::boolean
  )
  returning * into run;

  for attempt, attempt_position in
    select value, ordinality from jsonb_array_elements(p_generation -> 'attempts') with ordinality
  loop
    if jsonb_typeof(attempt) <> 'object' then
      raise exception 'each generation attempt must be a JSON object';
    end if;
    if (attempt ->> 'attemptNumber')::smallint is distinct from attempt_position::smallint then
      raise exception 'generation attempts must be sequential';
    end if;

    insert into public.intelligence_generation_attempts (
      run_id, attempt_number, kind, retry_reason, prompt_version,
      latency_ms, input_tokens, output_tokens, total_tokens, estimated_cost_usd,
      raw_response_id, finish_reason, provider_failure, provider_failure_metadata,
      raw_output_captured, raw_output, validation_status, validation_error_codes
    ) values (
      run.id,
      attempt_position::smallint,
      attempt ->> 'kind',
      attempt ->> 'retryReason',
      attempt ->> 'promptVersion',
      (attempt ->> 'latencyMs')::integer,
      (attempt ->> 'inputTokens')::integer,
      (attempt ->> 'outputTokens')::integer,
      (attempt ->> 'totalTokens')::integer,
      (attempt ->> 'estimatedCostUsd')::numeric,
      attempt ->> 'rawResponseId',
      attempt ->> 'finishReason',
      attempt ->> 'providerFailure',
      nullif(attempt -> 'providerFailureMetadata', 'null'::jsonb),
      (attempt ->> 'rawOutputCaptured')::boolean,
      case when (attempt ->> 'rawOutputCaptured')::boolean then attempt -> 'rawOutput' end,
      attempt ->> 'validationStatus',
      array(select jsonb_array_elements_text(attempt -> 'validationErrorCodes'))
    );
  end loop;

  for candidate, candidate_position in
    select value, ordinality - 1 from jsonb_array_elements(p_generation -> 'hypotheses') with ordinality
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'each LLM hypothesis must be a JSON object';
    end if;

    insert into public.llm_strategic_hypotheses (
      generation_run_id, owned_brand_id, competitor_id, hypothesis_ref, theme, statement,
      rationale, confidence, uncertainty_category, uncertainty_statement, assumptions,
      epistemic_class_dependencies, supporting_signal_ids, supporting_comparison_keys,
      claim_references, numeric_claims, generated_at, hypothesis_engine_version,
      generation_provenance, hypothesis_hash
    ) values (
      run.id,
      run.owned_brand_id,
      (candidate ->> 'competitorId')::uuid,
      candidate ->> 'ref',
      candidate ->> 'theme',
      candidate ->> 'statement',
      candidate ->> 'rationale',
      candidate ->> 'confidence',
      candidate ->> 'uncertaintyCategory',
      candidate ->> 'uncertaintyStatement',
      candidate -> 'assumptions',
      array(select jsonb_array_elements_text(candidate -> 'epistemicClassDependencies')),
      array(
        select value::uuid
        from jsonb_array_elements_text(candidate -> 'supportingSignalIds') with ordinality as id(value, ordinality)
        order by ordinality
      ),
      array(select jsonb_array_elements_text(candidate -> 'supportingComparisonKeys')),
      candidate -> 'claimReferences',
      candidate -> 'numericClaims',
      run.context_generated_at,
      candidate ->> 'hypothesisEngineVersion',
      candidate -> 'generationProvenance',
      candidate ->> 'hypothesisHash'
    )
    returning id into persisted_id;

    hypothesis_ids_by_ref := hypothesis_ids_by_ref
      || jsonb_build_object(candidate ->> 'ref', persisted_id);
    persisted_hypotheses := persisted_hypotheses
      || jsonb_build_array(jsonb_build_object('ref', candidate ->> 'ref', 'id', persisted_id));

    for reference, reference_position in
      select value, ordinality - 1
      from jsonb_array_elements(candidate -> 'supportingSignalIds') with ordinality
    loop
      insert into public.llm_strategic_hypothesis_signals (hypothesis_id, position, signal_id)
      values (persisted_id, reference_position::smallint, (reference #>> '{}')::uuid);
    end loop;
  end loop;

  for candidate, candidate_position in
    select value, ordinality - 1 from jsonb_array_elements(p_generation -> 'experiments') with ordinality
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'each LLM experiment must be a JSON object';
    end if;

    -- Dependencies resolve ONLY through the stable ref -> persisted hypothesis id map of this run.
    resolved_hypothesis_id := (hypothesis_ids_by_ref ->> (candidate ->> 'hypothesisRef'))::uuid;
    if resolved_hypothesis_id is null then
      raise exception 'LLM experiment hypothesis ref % does not resolve to an accepted hypothesis of this generation run',
        coalesce(candidate ->> 'hypothesisRef', '<missing>');
    end if;

    insert into public.llm_recommended_experiments (
      generation_run_id, owned_brand_id, competitor_id, hypothesis_id, source_hypothesis_ref,
      title, objective, hypothesis_under_test, variable_under_test, design, primary_metric,
      guardrail_metrics, implementation_notes, caveat_category, caveat_statement,
      claim_references, numeric_claims, generated_at, experiment_engine_version,
      generation_provenance, experiment_hash
    ) values (
      run.id,
      run.owned_brand_id,
      (candidate ->> 'competitorId')::uuid,
      resolved_hypothesis_id,
      candidate ->> 'hypothesisRef',
      candidate ->> 'title',
      candidate ->> 'objective',
      candidate ->> 'hypothesisUnderTest',
      candidate ->> 'variableUnderTest',
      candidate -> 'design',
      candidate ->> 'primaryMetric',
      array(select jsonb_array_elements_text(candidate -> 'guardrailMetrics')),
      candidate -> 'implementationNotes',
      candidate ->> 'caveatCategory',
      candidate ->> 'caveatStatement',
      candidate -> 'claimReferences',
      candidate -> 'numericClaims',
      run.context_generated_at,
      candidate ->> 'experimentEngineVersion',
      candidate -> 'generationProvenance',
      candidate ->> 'experimentHash'
    )
    returning id into persisted_id;

    persisted_experiments := persisted_experiments || jsonb_build_array(jsonb_build_object(
      'position', candidate_position,
      'hypothesisRef', candidate ->> 'hypothesisRef',
      'id', persisted_id
    ));
  end loop;

  candidate := p_generation -> 'executiveBriefing';
  if jsonb_typeof(candidate) = 'object' then
    insert into public.llm_executive_briefings (
      generation_run_id, owned_brand_id, headline, strategic_posture_summary, key_takeaway,
      supporting_hypothesis_refs, claim_references, numeric_claims, generated_at,
      generation_provenance
    ) values (
      run.id,
      run.owned_brand_id,
      candidate ->> 'headline',
      candidate ->> 'strategicPostureSummary',
      candidate ->> 'keyTakeaway',
      array(
        select value
        from jsonb_array_elements_text(candidate -> 'supportingHypothesisRefs') with ordinality as ref(value, ordinality)
        order by ordinality
      ),
      candidate -> 'claimReferences',
      candidate -> 'numericClaims',
      run.context_generated_at,
      candidate -> 'generationProvenance'
    )
    returning id into persisted_briefing_id;

    for reference, reference_position in
      select value, ordinality - 1
      from jsonb_array_elements(candidate -> 'supportingHypothesisRefs') with ordinality
    loop
      resolved_hypothesis_id := (hypothesis_ids_by_ref ->> (reference #>> '{}'))::uuid;
      if resolved_hypothesis_id is null then
        raise exception 'LLM briefing hypothesis ref % does not resolve to an accepted hypothesis of this generation run',
          reference #>> '{}';
      end if;
      insert into public.llm_executive_briefing_hypotheses (
        briefing_id, generation_run_id, position, hypothesis_id, hypothesis_ref
      ) values (
        persisted_briefing_id, run.id, reference_position::smallint,
        resolved_hypothesis_id, reference #>> '{}'
      );
    end loop;
  end if;

  if jsonb_array_length(persisted_hypotheses) <> run.accepted_hypothesis_count
     or jsonb_array_length(persisted_experiments) <> run.accepted_experiment_count
     or (persisted_briefing_id is not null) <> run.executive_briefing_accepted then
    raise exception 'persisted LLM intelligence does not match the generation run accepted counts';
  end if;

  return jsonb_build_object(
    'generationRunId', run.id,
    'outcome', run.outcome,
    'hypotheses', persisted_hypotheses,
    'experiments', persisted_experiments,
    'executiveBriefingId', persisted_briefing_id
  );
end;
$$;

revoke all on function public.persist_llm_intelligence_generation(jsonb) from public, anon, authenticated;
grant execute on function public.persist_llm_intelligence_generation(jsonb) to service_role;
