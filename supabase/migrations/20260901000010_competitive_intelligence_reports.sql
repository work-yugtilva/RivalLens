create table public.competitive_intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  owned_brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_ids uuid[] not null constraint competitive_intelligence_reports_competitor_count check (
    cardinality(competitor_ids) between 1 and 5
  ),
  report_engine_version text not null constraint competitive_intelligence_reports_engine_version check (
    char_length(trim(report_engine_version)) > 0
  ),
  report_hash text not null constraint competitive_intelligence_reports_report_hash_sha256 check (
    report_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  generated_at timestamptz not null,
  payload jsonb not null constraint competitive_intelligence_reports_payload_valid check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array[
      'brandId', 'generatedAt', 'reportEngineVersion', 'reportHash', 'sourceStateHash',
      'competitors', 'sourceIntelligence', 'completeness', 'sections'
    ]
    and payload - 'brandId' - 'generatedAt' - 'reportEngineVersion' - 'reportHash'
      - 'sourceStateHash' - 'competitors' - 'sourceIntelligence' - 'completeness' - 'sections'
      = '{}'::jsonb
    and (payload ->> 'brandId')::uuid = owned_brand_id
    and (payload ->> 'generatedAt')::timestamptz = generated_at
    and payload ->> 'reportEngineVersion' = report_engine_version
    and payload ->> 'reportHash' = report_hash
    and payload ->> 'sourceStateHash' ~ '^sha256:[0-9a-f]{64}$'
    and jsonb_typeof(payload -> 'competitors') = 'array'
    and jsonb_typeof(payload -> 'sourceIntelligence') = 'object'
    and jsonb_typeof(payload -> 'completeness') = 'object'
    and jsonb_typeof(payload -> 'sections') = 'object'
    and (payload -> 'sections') ?& array[
      'yourAdvantages', 'competitorAdvantages', 'appearsToBeWorking', 'whatToTestNext'
    ]
    and (payload -> 'sections') - 'yourAdvantages' - 'competitorAdvantages'
      - 'appearsToBeWorking' - 'whatToTestNext' = '{}'::jsonb
    and jsonb_typeof(payload #> '{sections,yourAdvantages}') = 'array'
    and jsonb_array_length(payload #> '{sections,yourAdvantages}') <= 3
    and jsonb_typeof(payload #> '{sections,competitorAdvantages}') = 'array'
    and jsonb_array_length(payload #> '{sections,competitorAdvantages}') <= 3
    and jsonb_typeof(payload #> '{sections,appearsToBeWorking}') = 'array'
    and jsonb_array_length(payload #> '{sections,appearsToBeWorking}') <= 3
    and jsonb_typeof(payload #> '{sections,whatToTestNext}') = 'array'
    and jsonb_array_length(payload #> '{sections,whatToTestNext}') <= 3
  ),
  created_at timestamptz not null default now(),
  constraint competitive_intelligence_reports_owned_brand_id_report_hash_key
    unique (owned_brand_id, report_hash)
);

create index competitive_intelligence_reports_latest_scope_idx
on public.competitive_intelligence_reports (
  owned_brand_id, competitor_ids, generated_at desc, id desc
);

create function public.validate_competitive_intelligence_report()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  payload_competitor_ids uuid[];
  signal_ids uuid[];
  hypothesis_ids uuid[];
  experiment_ids uuid[];
  source_intelligence jsonb;
begin
  if jsonb_typeof(new.payload -> 'competitors') <> 'array' then
    raise exception 'report competitors must be a JSON array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(new.payload -> 'competitors') as competitor(value)
    where jsonb_typeof(competitor.value) <> 'object'
      or not competitor.value ?& array['id', 'name']
      or competitor.value - 'id' - 'name' <> '{}'::jsonb
      or jsonb_typeof(competitor.value -> 'id') <> 'string'
      or jsonb_typeof(competitor.value -> 'name') <> 'string'
      or char_length(trim(competitor.value ->> 'name')) = 0
  ) then
    raise exception 'each report competitor must contain exactly an id and name';
  end if;

  select coalesce(array_agg((competitor.value ->> 'id')::uuid order by competitor.ordinality), '{}')
  into payload_competitor_ids
  from jsonb_array_elements(new.payload -> 'competitors') with ordinality as competitor(value, ordinality);

  if cardinality(payload_competitor_ids) not between 1 and 5
     or payload_competitor_ids is distinct from (
       select coalesce(array_agg(value order by value), '{}')
       from (select distinct unnest(payload_competitor_ids) as value) values
     ) then
    raise exception 'report competitors must be unique and sorted';
  end if;
  if new.competitor_ids is distinct from payload_competitor_ids then
    raise exception 'report competitor scope does not match its payload';
  end if;
  if (
    select count(*)
    from public.competitors
    join jsonb_array_elements(new.payload -> 'competitors') as competitor(value)
      on competitors.id = (competitor.value ->> 'id')::uuid
     and competitors.domain = competitor.value ->> 'name'
    where competitors.brand_id = new.owned_brand_id
  ) <> cardinality(payload_competitor_ids) then
    raise exception 'report competitors must belong to the report brand and match their names';
  end if;

  source_intelligence := new.payload -> 'sourceIntelligence';
  if jsonb_typeof(source_intelligence) <> 'object'
     or not source_intelligence ?& array['signalIds', 'hypothesisIds', 'experimentIds']
     or source_intelligence - 'signalIds' - 'hypothesisIds' - 'experimentIds' <> '{}'::jsonb
     or jsonb_typeof(source_intelligence -> 'signalIds') <> 'array'
     or jsonb_typeof(source_intelligence -> 'hypothesisIds') <> 'array'
     or jsonb_typeof(source_intelligence -> 'experimentIds') <> 'array' then
    raise exception 'report source intelligence must contain signal, hypothesis, and experiment ID arrays';
  end if;

  select coalesce(array_agg(value::uuid order by ordinality), '{}') into signal_ids
  from jsonb_array_elements_text(source_intelligence -> 'signalIds') with ordinality as reference(value, ordinality);
  select coalesce(array_agg(value::uuid order by ordinality), '{}') into hypothesis_ids
  from jsonb_array_elements_text(source_intelligence -> 'hypothesisIds') with ordinality as reference(value, ordinality);
  select coalesce(array_agg(value::uuid order by ordinality), '{}') into experiment_ids
  from jsonb_array_elements_text(source_intelligence -> 'experimentIds') with ordinality as reference(value, ordinality);

  if signal_ids is distinct from (
       select coalesce(array_agg(value order by value), '{}')
       from (select distinct unnest(signal_ids) as value) values
     )
     or hypothesis_ids is distinct from (
       select coalesce(array_agg(value order by value), '{}')
       from (select distinct unnest(hypothesis_ids) as value) values
     )
     or experiment_ids is distinct from (
       select coalesce(array_agg(value order by value), '{}')
       from (select distinct unnest(experiment_ids) as value) values
     ) then
    raise exception 'report source intelligence IDs must be unique and sorted';
  end if;

  if (select count(*) from public.competitive_signals
      where id = any(signal_ids)
        and owned_brand_id = new.owned_brand_id
        and competitor_id = any(payload_competitor_ids)) <> cardinality(signal_ids)
     or (select count(*) from public.strategic_hypotheses
         where id = any(hypothesis_ids)
           and owned_brand_id = new.owned_brand_id
           and competitor_id = any(payload_competitor_ids)) <> cardinality(hypothesis_ids)
     or (select count(*) from public.recommended_experiments
         where id = any(experiment_ids)
           and owned_brand_id = new.owned_brand_id
           and competitor_id = any(payload_competitor_ids)) <> cardinality(experiment_ids) then
    raise exception 'report source intelligence must belong to the report scope';
  end if;

  if exists (
    select 1
    from public.strategic_hypothesis_signals
    where hypothesis_id = any(hypothesis_ids)
      and not (signal_id = any(signal_ids))
  ) then
    raise exception 'complete hypothesis lineage must be included in report source intelligence';
  end if;
  if exists (
    select 1
    from public.recommended_experiment_hypotheses
    where experiment_id = any(experiment_ids)
      and not (hypothesis_id = any(hypothesis_ids))
  ) then
    raise exception 'complete experiment lineage must be included in report source intelligence';
  end if;

  return new;
end;
$$;

create trigger competitive_intelligence_reports_validate
before insert on public.competitive_intelligence_reports
for each row execute function public.validate_competitive_intelligence_report();

create function public.prevent_competitive_intelligence_report_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% are append-only', tg_table_name;
end;
$$;

create trigger competitive_intelligence_reports_prevent_mutation
before update or delete on public.competitive_intelligence_reports
for each row execute function public.prevent_competitive_intelligence_report_mutation();

alter table public.competitive_intelligence_reports enable row level security;

revoke all on public.competitive_intelligence_reports from public, anon, authenticated;
grant select on public.competitive_intelligence_reports to authenticated;

create policy "brand members can view competitive intelligence reports"
on public.competitive_intelligence_reports for select to authenticated
using (public.is_brand_member(owned_brand_id));

create function public.persist_competitive_intelligence_report(p_report jsonb)
returns table (id uuid, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  persisted_report_id uuid;
  persisted_payload jsonb;
  candidate_competitor_ids uuid[];
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'p_report must be a JSON object';
  end if;
  if jsonb_typeof(p_report -> 'competitors') <> 'array' then
    raise exception 'report competitors must be a JSON array';
  end if;

  select coalesce(array_agg((competitor.value ->> 'id')::uuid order by competitor.ordinality), '{}')
  into candidate_competitor_ids
  from jsonb_array_elements(p_report -> 'competitors') with ordinality as competitor(value, ordinality);

  insert into public.competitive_intelligence_reports (
    owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at, payload
  ) values (
    (p_report ->> 'brandId')::uuid,
    candidate_competitor_ids,
    p_report ->> 'reportEngineVersion',
    p_report ->> 'reportHash',
    (p_report ->> 'generatedAt')::timestamptz,
    p_report
  )
  on conflict on constraint competitive_intelligence_reports_owned_brand_id_report_hash_key do nothing
  returning competitive_intelligence_reports.id, competitive_intelligence_reports.payload
  into persisted_report_id, persisted_payload;

  if persisted_report_id is null then
    select reports.id, reports.payload
    into persisted_report_id, persisted_payload
    from public.competitive_intelligence_reports reports
    where reports.owned_brand_id = (p_report ->> 'brandId')::uuid
      and reports.report_hash = p_report ->> 'reportHash';

    if persisted_payload - 'generatedAt' is distinct from p_report - 'generatedAt' then
      raise exception 'report hash collision: stored report state does not match candidate';
    end if;
  end if;

  id := persisted_report_id;
  payload := persisted_payload;
  return next;
end;
$$;

revoke all on function public.persist_competitive_intelligence_report(jsonb) from public, anon, authenticated;
grant execute on function public.persist_competitive_intelligence_report(jsonb) to service_role;
