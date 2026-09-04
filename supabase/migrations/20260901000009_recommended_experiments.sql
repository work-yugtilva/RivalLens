create table public.recommended_experiments (
  id uuid primary key default gen_random_uuid(),
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_id uuid not null,
  experiment_type text not null check (experiment_type in (
    'free_shipping_threshold', 'return_window_policy', 'guarantee_policy',
    'subscription_availability', 'subscription_discount', 'explicit_discount',
    'bundle_offer', 'bogo_offer'
  )),
  title text not null check (char_length(trim(title)) > 0),
  objective text not null check (char_length(trim(objective)) > 0),
  hypothesis_under_test text not null check (char_length(trim(hypothesis_under_test)) > 0),
  design jsonb not null constraint recommended_experiments_design_valid check (
    jsonb_typeof(design) = 'object'
    and design = '{"comparison":"control_vs_treatment","variablePolicy":"single_variable","heldConstant":"all_non_target_experience_elements"}'::jsonb
  ),
  control_configuration jsonb not null check (jsonb_typeof(control_configuration) = 'object'),
  treatment_configuration jsonb not null check (jsonb_typeof(treatment_configuration) = 'object'),
  primary_metric jsonb not null constraint recommended_experiments_primary_metric_valid check (
    jsonb_typeof(primary_metric) = 'object'
    and primary_metric ?& array['metric', 'measurementReadiness']
    and primary_metric - 'metric' - 'measurementReadiness' = '{}'::jsonb
    and primary_metric ->> 'metric' in (
      'conversion_rate', 'checkout_conversion_rate', 'average_order_value',
      'contribution_margin_per_order', 'shipping_cost_per_order', 'return_rate',
      'refund_rate', 'subscription_take_rate', 'subscription_cancellation_rate'
    )
    and primary_metric ->> 'measurementReadiness' in ('available', 'requires_first_party_data')
  ),
  guardrail_metrics jsonb not null check (
    jsonb_typeof(guardrail_metrics) = 'array' and jsonb_array_length(guardrail_metrics) > 0
  ),
  duration_planning jsonb not null constraint recommended_experiments_duration_planning_valid check (
    duration_planning = '{"status":"requires_first_party_data","requiredInputs":["baseline_primary_metric","eligible_traffic","minimum_detectable_effect","significance_level","statistical_power"]}'::jsonb
  ),
  implementation_notes jsonb not null check (
    jsonb_typeof(implementation_notes) = 'array' and jsonb_array_length(implementation_notes) > 0
  ),
  confidence_level text not null check (confidence_level in ('medium', 'low')),
  confidence_basis text not null check (confidence_basis = 'support_for_testing_rationale'),
  caveat_category text not null check (caveat_category in (
    'shipping_margin_exposure', 'policy_return_refund_exposure',
    'subscription_customer_fit_and_cancellation', 'promotion_margin_exposure'
  )),
  caveat_statement text not null check (char_length(trim(caveat_statement)) > 0),
  generated_at timestamptz not null,
  experiment_engine_version text not null check (char_length(trim(experiment_engine_version)) > 0),
  generation_provenance jsonb not null constraint recommended_experiments_generation_provenance_valid check (
    jsonb_typeof(generation_provenance) = 'object'
    and generation_provenance ?& array['method', 'eligibilityRuleId', 'templateId', 'sourceHypothesisEngineVersion']
    and generation_provenance - 'method' - 'eligibilityRuleId' - 'templateId' - 'sourceHypothesisEngineVersion' = '{}'::jsonb
    and generation_provenance ->> 'method' = 'deterministic_rule'
    and generation_provenance ->> 'templateId' = experiment_type
    and char_length(trim(generation_provenance ->> 'eligibilityRuleId')) > 0
    and char_length(trim(generation_provenance ->> 'sourceHypothesisEngineVersion')) > 0
  ),
  experiment_hash text not null check (experiment_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint recommended_experiments_competitor_matches_brand_fk
    foreign key (competitor_id, owned_brand_id)
    references public.competitors(id, brand_id)
    on delete restrict,
  constraint recommended_experiments_owned_brand_id_experiment_hash_key
    unique (owned_brand_id, experiment_hash)
);

create table public.recommended_experiment_hypotheses (
  experiment_id uuid not null references public.recommended_experiments(id) on delete restrict,
  position smallint not null check (position >= 0),
  hypothesis_id uuid not null references public.strategic_hypotheses(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (experiment_id, position),
  unique (experiment_id, hypothesis_id)
);

create index recommended_experiments_owned_brand_id_generated_at_idx
on public.recommended_experiments (owned_brand_id, generated_at desc);

create index recommended_experiments_competitor_id_generated_at_idx
on public.recommended_experiments (competitor_id, generated_at desc);

create index recommended_experiment_hypotheses_hypothesis_id_idx
on public.recommended_experiment_hypotheses (hypothesis_id);

create function public.prevent_recommended_experiment_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% are append-only', tg_table_name;
end;
$$;

create trigger recommended_experiments_prevent_mutation
before update or delete on public.recommended_experiments
for each row execute function public.prevent_recommended_experiment_mutation();

create trigger recommended_experiment_hypotheses_prevent_mutation
before update or delete on public.recommended_experiment_hypotheses
for each row execute function public.prevent_recommended_experiment_mutation();

create function public.validate_recommended_experiment_hypothesis()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  experiment_brand_id uuid;
  experiment_competitor_id uuid;
  hypothesis_brand_id uuid;
  hypothesis_competitor_id uuid;
begin
  select owned_brand_id, competitor_id
  into experiment_brand_id, experiment_competitor_id
  from public.recommended_experiments
  where id = new.experiment_id;

  if experiment_brand_id is null then
    raise exception 'recommended experiment hypothesis requires an existing experiment';
  end if;

  select owned_brand_id, competitor_id
  into hypothesis_brand_id, hypothesis_competitor_id
  from public.strategic_hypotheses
  where id = new.hypothesis_id;

  if hypothesis_brand_id is null then
    raise exception 'recommended experiment hypothesis requires an existing strategic hypothesis';
  end if;
  if hypothesis_brand_id is distinct from experiment_brand_id then
    raise exception 'supporting hypothesis must belong to the experiment brand';
  end if;
  if hypothesis_competitor_id is distinct from experiment_competitor_id then
    raise exception 'supporting hypothesis must belong to the experiment competitor';
  end if;
  return new;
end;
$$;

create trigger recommended_experiment_hypotheses_validate
before insert on public.recommended_experiment_hypotheses
for each row execute function public.validate_recommended_experiment_hypothesis();

alter table public.recommended_experiments enable row level security;
alter table public.recommended_experiment_hypotheses enable row level security;

revoke all on public.recommended_experiments, public.recommended_experiment_hypotheses from public, anon, authenticated;
grant select on public.recommended_experiments, public.recommended_experiment_hypotheses to authenticated;

create policy "brand organization members can view recommended experiments"
on public.recommended_experiments for select to authenticated
using (public.is_brand_member(owned_brand_id));

create policy "brand organization members can view recommended experiment hypotheses"
on public.recommended_experiment_hypotheses for select to authenticated
using (
  exists (
    select 1 from public.recommended_experiments
    where recommended_experiments.id = recommended_experiment_hypotheses.experiment_id
      and public.is_brand_member(recommended_experiments.owned_brand_id)
  )
);

create function public.persist_recommended_experiments(p_experiments jsonb)
returns table (id uuid, experiment_hash text, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate jsonb;
  hypothesis_reference jsonb;
  hypothesis_position bigint;
  persisted_experiment_id uuid;
  candidate_experiment_hash text;
  was_inserted boolean;
begin
  if p_experiments is null or jsonb_typeof(p_experiments) <> 'array' then
    raise exception 'p_experiments must be a JSON array';
  end if;

  for candidate in select value from jsonb_array_elements(p_experiments)
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'each recommended experiment candidate must be a JSON object';
    end if;
    if jsonb_typeof(candidate -> 'sourceHypothesisIds') <> 'array'
       or jsonb_array_length(candidate -> 'sourceHypothesisIds') = 0 then
      raise exception 'recommended experiment source hypothesis IDs must be a non-empty JSON array';
    end if;

    candidate_experiment_hash := candidate ->> 'experimentHash';
    persisted_experiment_id := null;

    insert into public.recommended_experiments (
      owned_brand_id, competitor_id, experiment_type, title, objective,
      hypothesis_under_test, design, control_configuration, treatment_configuration,
      primary_metric, guardrail_metrics, duration_planning, implementation_notes,
      confidence_level, confidence_basis, caveat_category, caveat_statement,
      generated_at, experiment_engine_version, generation_provenance, experiment_hash
    ) values (
      (candidate ->> 'ownedBrandId')::uuid,
      (candidate ->> 'competitorId')::uuid,
      candidate ->> 'experimentType',
      candidate ->> 'title',
      candidate ->> 'objective',
      candidate ->> 'hypothesisUnderTest',
      candidate -> 'design',
      candidate -> 'control',
      candidate -> 'treatment',
      candidate -> 'primaryMetric',
      candidate -> 'guardrailMetrics',
      candidate -> 'durationPlanning',
      candidate -> 'implementationNotes',
      candidate #>> '{confidence,level}',
      candidate #>> '{confidence,basis}',
      candidate #>> '{caveat,category}',
      candidate #>> '{caveat,statement}',
      (candidate ->> 'generatedAt')::timestamptz,
      candidate ->> 'experimentEngineVersion',
      candidate -> 'generationProvenance',
      candidate_experiment_hash
    )
    on conflict on constraint recommended_experiments_owned_brand_id_experiment_hash_key do nothing
    returning recommended_experiments.id into persisted_experiment_id;

    was_inserted := persisted_experiment_id is not null;
    if not was_inserted then
      select recommended_experiments.id into persisted_experiment_id
      from public.recommended_experiments
      where recommended_experiments.owned_brand_id = (candidate ->> 'ownedBrandId')::uuid
        and recommended_experiments.experiment_hash = candidate_experiment_hash;
    else
      for hypothesis_reference, hypothesis_position in
        select value, ordinality - 1
        from jsonb_array_elements(candidate -> 'sourceHypothesisIds') with ordinality
      loop
        if jsonb_typeof(hypothesis_reference) <> 'string' then
          raise exception 'each recommended experiment source hypothesis ID must be a JSON string';
        end if;
        insert into public.recommended_experiment_hypotheses (experiment_id, position, hypothesis_id)
        values (
          persisted_experiment_id,
          hypothesis_position::smallint,
          trim(both '"' from hypothesis_reference::text)::uuid
        );
      end loop;
    end if;

    id := persisted_experiment_id;
    experiment_hash := candidate_experiment_hash;
    inserted := was_inserted;
    return next;
  end loop;
end;
$$;

revoke all on function public.persist_recommended_experiments(jsonb) from public, anon, authenticated;
grant execute on function public.persist_recommended_experiments(jsonb) to service_role;
