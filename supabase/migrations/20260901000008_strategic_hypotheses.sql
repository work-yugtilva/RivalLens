create table public.strategic_hypotheses (
  id uuid primary key default gen_random_uuid(),
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_id uuid not null,
  hypothesis_type text not null check (hypothesis_type in (
    'competitor_may_reduce_shipping_friction',
    'competitor_may_reduce_perceived_purchase_risk',
    'competitor_may_emphasize_repeat_purchase_mechanics',
    'competitor_may_emphasize_promotional_incentives',
    'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives'
  )),
  statement text not null check (char_length(trim(statement)) > 0),
  rationale text not null check (char_length(trim(rationale)) > 0),
  confidence text not null check (confidence in ('medium', 'low')),
  uncertainty_category text not null check (uncertainty_category in (
    'conversion_effect_not_established',
    'retention_effect_not_established',
    'promotion_impact_not_established',
    'combined_business_impact_not_established'
  )),
  uncertainty_statement text not null check (char_length(trim(uncertainty_statement)) > 0),
  generated_at timestamptz not null,
  hypothesis_engine_version text not null check (char_length(trim(hypothesis_engine_version)) > 0),
  generation_provenance jsonb not null constraint strategic_hypotheses_generation_provenance_valid check (
    jsonb_typeof(generation_provenance) = 'object'
    and generation_provenance ?& array['method', 'templateId', 'sourceSignalRuleVersion']
    and generation_provenance - 'method' - 'templateId' - 'sourceSignalRuleVersion' = '{}'::jsonb
    and generation_provenance ->> 'method' = 'deterministic_template'
    and char_length(trim(generation_provenance ->> 'templateId')) > 0
    and char_length(trim(generation_provenance ->> 'sourceSignalRuleVersion')) > 0
  ),
  hypothesis_hash text not null check (hypothesis_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint strategic_hypotheses_competitor_matches_brand_fk
    foreign key (competitor_id, owned_brand_id)
    references public.competitors(id, brand_id)
    on delete restrict,
  constraint strategic_hypotheses_owned_brand_id_hypothesis_hash_key
    unique (owned_brand_id, hypothesis_hash)
);

create table public.strategic_hypothesis_signals (
  hypothesis_id uuid not null references public.strategic_hypotheses(id) on delete restrict,
  position smallint not null check (position >= 0),
  signal_id uuid not null references public.competitive_signals(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (hypothesis_id, position),
  unique (hypothesis_id, signal_id)
);

create index strategic_hypotheses_owned_brand_id_generated_at_idx
on public.strategic_hypotheses (owned_brand_id, generated_at desc);

create index strategic_hypotheses_competitor_id_generated_at_idx
on public.strategic_hypotheses (competitor_id, generated_at desc);

create index strategic_hypothesis_signals_signal_id_idx
on public.strategic_hypothesis_signals (signal_id);

create function public.prevent_strategic_hypothesis_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% are append-only', tg_table_name;
end;
$$;

create trigger strategic_hypotheses_prevent_mutation
before update or delete on public.strategic_hypotheses
for each row execute function public.prevent_strategic_hypothesis_mutation();

create trigger strategic_hypothesis_signals_prevent_mutation
before update or delete on public.strategic_hypothesis_signals
for each row execute function public.prevent_strategic_hypothesis_mutation();

create function public.validate_strategic_hypothesis_signal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  hypothesis_brand_id uuid;
  hypothesis_competitor_id uuid;
  signal_brand_id uuid;
  signal_competitor_id uuid;
begin
  select owned_brand_id, competitor_id
  into hypothesis_brand_id, hypothesis_competitor_id
  from public.strategic_hypotheses
  where id = new.hypothesis_id;

  if hypothesis_brand_id is null then
    raise exception 'strategic hypothesis signal requires an existing hypothesis';
  end if;

  select owned_brand_id, competitor_id
  into signal_brand_id, signal_competitor_id
  from public.competitive_signals
  where id = new.signal_id;

  if signal_brand_id is null then
    raise exception 'strategic hypothesis signal requires an existing competitive signal';
  end if;

  if signal_brand_id is distinct from hypothesis_brand_id then
    raise exception 'supporting signal must belong to the hypothesis brand';
  end if;

  if signal_competitor_id is distinct from hypothesis_competitor_id then
    raise exception 'supporting signal must belong to the hypothesis competitor';
  end if;

  return new;
end;
$$;

create trigger strategic_hypothesis_signals_validate
before insert on public.strategic_hypothesis_signals
for each row execute function public.validate_strategic_hypothesis_signal();

alter table public.strategic_hypotheses enable row level security;
alter table public.strategic_hypothesis_signals enable row level security;

revoke all on public.strategic_hypotheses, public.strategic_hypothesis_signals from public, anon, authenticated;
grant select on public.strategic_hypotheses, public.strategic_hypothesis_signals to authenticated;

create policy "brand organization members can view strategic hypotheses"
on public.strategic_hypotheses for select to authenticated
using (public.is_brand_member(owned_brand_id));

create policy "brand organization members can view strategic hypothesis signals"
on public.strategic_hypothesis_signals for select to authenticated
using (
  exists (
    select 1
    from public.strategic_hypotheses
    where strategic_hypotheses.id = strategic_hypothesis_signals.hypothesis_id
      and public.is_brand_member(strategic_hypotheses.owned_brand_id)
  )
);

create function public.persist_strategic_hypotheses(p_hypotheses jsonb)
returns table (id uuid, hypothesis_hash text, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate jsonb;
  signal_reference jsonb;
  signal_position bigint;
  persisted_hypothesis_id uuid;
  candidate_hypothesis_hash text;
  was_inserted boolean;
begin
  if p_hypotheses is null or jsonb_typeof(p_hypotheses) <> 'array' then
    raise exception 'p_hypotheses must be a JSON array';
  end if;

  for candidate in
    select value
    from jsonb_array_elements(p_hypotheses)
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'each strategic hypothesis candidate must be a JSON object';
    end if;
    if jsonb_typeof(candidate -> 'supportingSignalIds') <> 'array'
       or jsonb_array_length(candidate -> 'supportingSignalIds') = 0 then
      raise exception 'strategic hypothesis supporting signal IDs must be a non-empty JSON array';
    end if;

    candidate_hypothesis_hash := candidate ->> 'hypothesisHash';
    persisted_hypothesis_id := null;

    insert into public.strategic_hypotheses (
      owned_brand_id,
      competitor_id,
      hypothesis_type,
      statement,
      rationale,
      confidence,
      uncertainty_category,
      uncertainty_statement,
      generated_at,
      hypothesis_engine_version,
      generation_provenance,
      hypothesis_hash
    ) values (
      (candidate ->> 'ownedBrandId')::uuid,
      (candidate ->> 'competitorId')::uuid,
      candidate ->> 'hypothesisType',
      candidate ->> 'statement',
      candidate ->> 'rationale',
      candidate ->> 'confidence',
      candidate #>> '{uncertainty,category}',
      candidate #>> '{uncertainty,statement}',
      (candidate ->> 'generatedAt')::timestamptz,
      candidate ->> 'hypothesisEngineVersion',
      candidate -> 'generationProvenance',
      candidate_hypothesis_hash
    )
    on conflict on constraint strategic_hypotheses_owned_brand_id_hypothesis_hash_key do nothing
    returning strategic_hypotheses.id into persisted_hypothesis_id;

    was_inserted := persisted_hypothesis_id is not null;

    if not was_inserted then
      select strategic_hypotheses.id
      into persisted_hypothesis_id
      from public.strategic_hypotheses
      where strategic_hypotheses.owned_brand_id = (candidate ->> 'ownedBrandId')::uuid
        and strategic_hypotheses.hypothesis_hash = candidate_hypothesis_hash;
    else
      for signal_reference, signal_position in
        select value, ordinality - 1
        from jsonb_array_elements(candidate -> 'supportingSignalIds') with ordinality
      loop
        if jsonb_typeof(signal_reference) <> 'string' then
          raise exception 'each strategic hypothesis supporting signal ID must be a JSON string';
        end if;

        insert into public.strategic_hypothesis_signals (
          hypothesis_id,
          position,
          signal_id
        ) values (
          persisted_hypothesis_id,
          signal_position::smallint,
          trim(both '"' from signal_reference::text)::uuid
        );
      end loop;
    end if;

    id := persisted_hypothesis_id;
    hypothesis_hash := candidate_hypothesis_hash;
    inserted := was_inserted;
    return next;
  end loop;
end;
$$;

revoke all on function public.persist_strategic_hypotheses(jsonb) from public, anon, authenticated;
grant execute on function public.persist_strategic_hypotheses(jsonb) to service_role;
