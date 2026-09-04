create table public.competitive_signals (
  id uuid primary key default gen_random_uuid(),
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_id uuid not null,
  signal_type text not null check (signal_type in (
    'competitor_lower_free_shipping_threshold',
    'competitor_higher_free_shipping_threshold',
    'competitor_longer_return_window',
    'competitor_shorter_return_window',
    'competitor_longer_guarantee_duration',
    'competitor_shorter_guarantee_duration',
    'competitor_offers_subscription_owned_does_not',
    'owned_offers_subscription_competitor_does_not',
    'competitor_higher_subscription_discount',
    'competitor_lower_subscription_discount',
    'competitor_higher_explicit_percentage_discount',
    'competitor_lower_explicit_percentage_discount',
    'competitor_offers_explicit_discount_owned_does_not',
    'owned_offers_explicit_discount_competitor_does_not',
    'competitor_offers_promotion_owned_does_not',
    'owned_offers_promotion_competitor_does_not',
    'competitor_offers_bundle_owned_does_not',
    'owned_offers_bundle_competitor_does_not',
    'competitor_offers_bogo_owned_does_not',
    'owned_offers_bogo_competitor_does_not',
    'positioning_differs',
    'competitor_lowered_free_shipping_threshold',
    'competitor_raised_free_shipping_threshold',
    'competitor_increased_explicit_percentage_discount',
    'competitor_decreased_explicit_percentage_discount',
    'competitor_added_subscription',
    'competitor_removed_subscription',
    'competitor_increased_subscription_discount',
    'competitor_decreased_subscription_discount',
    'competitor_extended_guarantee_duration',
    'competitor_shortened_guarantee_duration',
    'competitor_extended_return_window',
    'competitor_shortened_return_window',
    'competitor_changed_homepage_headline',
    'competitor_added_promotion',
    'competitor_removed_promotion'
  )),
  comparison_key text not null check (char_length(trim(comparison_key)) > 0),
  statement text not null check (char_length(trim(statement)) > 0),
  supporting_values jsonb not null check (
    jsonb_typeof(supporting_values) = 'object'
    and supporting_values <> '{}'::jsonb
  ),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  direction text check (direction in ('competitor_lower', 'competitor_higher', 'different', 'added', 'removed')),
  generated_at timestamptz not null,
  rule_version text not null check (char_length(trim(rule_version)) > 0),
  signal_hash text not null check (signal_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint competitive_signals_competitor_matches_brand_fk
    foreign key (competitor_id, owned_brand_id)
    references public.competitors(id, brand_id)
    on delete restrict,
  constraint competitive_signals_owned_brand_id_signal_hash_key
    unique (owned_brand_id, signal_hash)
);

create table public.competitive_signal_evidence (
  signal_id uuid not null references public.competitive_signals(id) on delete restrict,
  position smallint not null check (position >= 0),
  role text not null check (role in ('owned', 'competitor', 'previous', 'previous_evaluation', 'current', 'evaluation')),
  source_id uuid not null references public.sources(id) on delete restrict,
  snapshot_id uuid not null references public.snapshots(id) on delete restrict,
  observation_id uuid references public.observations(id) on delete restrict,
  prior_snapshot_id uuid references public.snapshots(id) on delete restrict,
  prior_observation_id uuid references public.observations(id) on delete restrict,
  observed_change_id uuid references public.observed_changes(id) on delete restrict,
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (signal_id, position),
  check (role not in ('previous', 'previous_evaluation', 'current') or observation_id is not null),
  check (role <> 'evaluation' or observation_id is null),
  check (role not in ('previous', 'previous_evaluation', 'current', 'evaluation') or observed_change_id is not null)
);

create index competitive_signals_owned_brand_id_generated_at_idx
on public.competitive_signals (owned_brand_id, generated_at desc);

create index competitive_signals_competitor_id_generated_at_idx
on public.competitive_signals (competitor_id, generated_at desc)
where competitor_id is not null;

create index competitive_signal_evidence_source_id_idx
on public.competitive_signal_evidence (source_id);

create index competitive_signal_evidence_snapshot_id_idx
on public.competitive_signal_evidence (snapshot_id);

create index competitive_signal_evidence_observation_id_idx
on public.competitive_signal_evidence (observation_id)
where observation_id is not null;

create index competitive_signal_evidence_prior_snapshot_id_idx
on public.competitive_signal_evidence (prior_snapshot_id)
where prior_snapshot_id is not null;

create index competitive_signal_evidence_prior_observation_id_idx
on public.competitive_signal_evidence (prior_observation_id)
where prior_observation_id is not null;

create index competitive_signal_evidence_observed_change_id_idx
on public.competitive_signal_evidence (observed_change_id)
where observed_change_id is not null;

create function public.prevent_competitive_signal_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% are append-only', tg_table_name;
end;
$$;

create trigger competitive_signals_prevent_mutation
before update or delete on public.competitive_signals
for each row execute function public.prevent_competitive_signal_mutation();

create trigger competitive_signal_evidence_prevent_mutation
before update or delete on public.competitive_signal_evidence
for each row execute function public.prevent_competitive_signal_mutation();

create function public.validate_competitive_signal_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  signal_brand_id uuid;
  signal_competitor_id uuid;
  evidence_subject_id uuid;
  evidence_source_brand_id uuid;
  evidence_source_competitor_id uuid;
  resolved_snapshot_source_id uuid;
  resolved_observation_snapshot_id uuid;
  resolved_observation_subject_id uuid;
  resolved_prior_snapshot_source_id uuid;
  resolved_prior_observation_snapshot_id uuid;
  resolved_prior_observation_subject_id uuid;
  change_subject_id uuid;
  change_source_id uuid;
  change_previous_snapshot_id uuid;
  change_current_snapshot_id uuid;
  change_previous_observation_id uuid;
  change_current_observation_id uuid;
begin
  if new.role in ('previous', 'previous_evaluation', 'current', 'evaluation')
     and new.observed_change_id is null then
    raise exception 'temporal evidence requires an observed change';
  end if;

  select owned_brand_id, competitor_id
  into signal_brand_id, signal_competitor_id
  from public.competitive_signals
  where id = new.signal_id;

  if signal_brand_id is null then
    raise exception 'competitive signal evidence requires an existing signal';
  end if;

  select brand_id, competitor_id
  into evidence_source_brand_id, evidence_source_competitor_id
  from public.sources
  where id = new.source_id;

  if evidence_source_brand_id is distinct from signal_brand_id then
    raise exception 'evidence source must belong to the signal brand';
  end if;

  if new.role = 'owned' then
    evidence_subject_id := signal_brand_id;
    if evidence_source_competitor_id is not null then
      raise exception 'owned evidence must use an owned source';
    end if;
  else
    evidence_subject_id := signal_competitor_id;
    if signal_competitor_id is null
       or evidence_source_competitor_id is distinct from signal_competitor_id then
      raise exception '% evidence source must belong to the signal competitor', new.role;
    end if;
  end if;

  select source_id
  into resolved_snapshot_source_id
  from public.snapshots
  where id = new.snapshot_id;

  if resolved_snapshot_source_id is distinct from new.source_id then
    raise exception 'evidence snapshot must belong to the evidence source';
  end if;

  if new.observation_id is not null then
    select snapshot_id, subject_id
    into resolved_observation_snapshot_id, resolved_observation_subject_id
    from public.observations
    where id = new.observation_id;

    if resolved_observation_snapshot_id is distinct from new.snapshot_id then
      raise exception 'evidence observation must belong to the evidence snapshot';
    end if;
    if resolved_observation_subject_id is distinct from evidence_subject_id then
      raise exception 'evidence observation subject does not match the evidence role';
    end if;
  end if;

  if new.prior_snapshot_id is not null then
    select source_id
    into resolved_prior_snapshot_source_id
    from public.snapshots
    where id = new.prior_snapshot_id;

    if resolved_prior_snapshot_source_id is distinct from new.source_id then
      raise exception 'prior evidence snapshot must belong to the evidence source';
    end if;
  end if;

  if new.prior_observation_id is not null then
    if new.prior_snapshot_id is null then
      raise exception 'prior evidence observation requires a prior snapshot';
    end if;

    select snapshot_id, subject_id
    into resolved_prior_observation_snapshot_id, resolved_prior_observation_subject_id
    from public.observations
    where id = new.prior_observation_id;

    if resolved_prior_observation_snapshot_id is distinct from new.prior_snapshot_id then
      raise exception 'prior evidence observation must belong to the prior snapshot';
    end if;
    if resolved_prior_observation_subject_id is distinct from evidence_subject_id then
      raise exception 'prior evidence observation subject does not match the evidence role';
    end if;
  end if;

  if new.observed_change_id is not null then
    select
      subject_id,
      source_id,
      previous_snapshot_id,
      current_snapshot_id,
      previous_observation_id,
      current_observation_id
    into
      change_subject_id,
      change_source_id,
      change_previous_snapshot_id,
      change_current_snapshot_id,
      change_previous_observation_id,
      change_current_observation_id
    from public.observed_changes
    where id = new.observed_change_id;

    if change_source_id is distinct from new.source_id
       or change_subject_id is distinct from evidence_subject_id then
      raise exception 'observed change must belong to the evidence source and subject';
    end if;

    if new.role = 'previous' then
      if new.snapshot_id is distinct from change_previous_snapshot_id
         or new.observation_id is distinct from change_previous_observation_id then
        raise exception 'previous evidence must match the observed change previous state';
      end if;
    elsif new.role = 'previous_evaluation' then
      if new.snapshot_id is distinct from change_previous_snapshot_id then
        raise exception 'previous_evaluation evidence must match the observed change previous snapshot';
      end if;
      if change_previous_observation_id is not null then
        raise exception 'previous_evaluation evidence requires an observed change without a previous fact observation';
      end if;
    elsif new.role = 'current' then
      if new.snapshot_id is distinct from change_current_snapshot_id
         or new.observation_id is distinct from change_current_observation_id then
        raise exception 'current evidence must match the observed change current state';
      end if;
    elsif new.role = 'evaluation' and new.snapshot_id is distinct from change_current_snapshot_id then
      raise exception 'evaluation evidence must match the observed change current snapshot';
    end if;
  end if;

  return new;
end;
$$;

create trigger competitive_signal_evidence_validate
before insert on public.competitive_signal_evidence
for each row execute function public.validate_competitive_signal_evidence();

alter table public.competitive_signals enable row level security;
alter table public.competitive_signal_evidence enable row level security;

revoke all on public.competitive_signals, public.competitive_signal_evidence from public, anon, authenticated;
grant select on public.competitive_signals, public.competitive_signal_evidence to authenticated;

create policy "brand organization members can view competitive signals"
on public.competitive_signals for select to authenticated
using (public.is_brand_member(owned_brand_id));

create policy "brand organization members can view competitive signal evidence"
on public.competitive_signal_evidence for select to authenticated
using (
  exists (
    select 1
    from public.competitive_signals
    where competitive_signals.id = competitive_signal_evidence.signal_id
      and public.is_brand_member(competitive_signals.owned_brand_id)
  )
);

create function public.persist_competitive_signals(p_signals jsonb)
returns table (id uuid, signal_hash text, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate jsonb;
  evidence_reference jsonb;
  evidence_position bigint;
  persisted_signal_id uuid;
  candidate_signal_hash text;
  was_inserted boolean;
begin
  if p_signals is null or jsonb_typeof(p_signals) <> 'array' then
    raise exception 'p_signals must be a JSON array';
  end if;

  for candidate in
    select value
    from jsonb_array_elements(p_signals)
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'each competitive signal candidate must be a JSON object';
    end if;
    if jsonb_typeof(candidate -> 'evidence') <> 'array'
       or jsonb_array_length(candidate -> 'evidence') = 0 then
      raise exception 'competitive signal evidence must be a non-empty JSON array';
    end if;

    candidate_signal_hash := candidate ->> 'signalHash';
    persisted_signal_id := null;

    insert into public.competitive_signals (
      owned_brand_id,
      competitor_id,
      signal_type,
      comparison_key,
      statement,
      supporting_values,
      confidence,
      direction,
      generated_at,
      rule_version,
      signal_hash
    ) values (
      (candidate ->> 'ownedBrandId')::uuid,
      (candidate ->> 'competitorId')::uuid,
      candidate ->> 'signalType',
      candidate ->> 'comparisonKey',
      candidate ->> 'statement',
      candidate -> 'supportingValues',
      candidate ->> 'confidence',
      candidate ->> 'direction',
      (candidate ->> 'generatedAt')::timestamptz,
      candidate ->> 'ruleVersion',
      candidate_signal_hash
    )
    on conflict on constraint competitive_signals_owned_brand_id_signal_hash_key do nothing
    returning competitive_signals.id into persisted_signal_id;

    was_inserted := persisted_signal_id is not null;

    if not was_inserted then
      select competitive_signals.id
      into persisted_signal_id
      from public.competitive_signals
      where competitive_signals.owned_brand_id = (candidate ->> 'ownedBrandId')::uuid
        and competitive_signals.signal_hash = candidate_signal_hash;
    else
      for evidence_reference, evidence_position in
        select value, ordinality - 1
        from jsonb_array_elements(candidate -> 'evidence') with ordinality
      loop
        if jsonb_typeof(evidence_reference) <> 'object' then
          raise exception 'each competitive signal evidence reference must be a JSON object';
        end if;

        insert into public.competitive_signal_evidence (
          signal_id,
          position,
          role,
          source_id,
          snapshot_id,
          observation_id,
          prior_snapshot_id,
          prior_observation_id,
          observed_change_id,
          confidence
        ) values (
          persisted_signal_id,
          evidence_position::smallint,
          evidence_reference ->> 'role',
          (evidence_reference ->> 'sourceId')::uuid,
          (evidence_reference ->> 'snapshotId')::uuid,
          (evidence_reference ->> 'observationId')::uuid,
          (evidence_reference ->> 'priorSnapshotId')::uuid,
          (evidence_reference ->> 'priorObservationId')::uuid,
          (evidence_reference ->> 'observedChangeId')::uuid,
          (evidence_reference ->> 'confidence')::numeric(3,2)
        );
      end loop;
    end if;

    id := persisted_signal_id;
    signal_hash := candidate_signal_hash;
    inserted := was_inserted;
    return next;
  end loop;
end;
$$;

revoke all on function public.persist_competitive_signals(jsonb) from public, anon, authenticated;
grant execute on function public.persist_competitive_signals(jsonb) to service_role;
