-- Phase 6: immutable competitive-report-v2-llm snapshots over Phase 5 accepted rows.
-- The v1 RPC and deterministic lineage validator remain unchanged.

alter table public.competitive_intelligence_reports
  drop constraint competitive_intelligence_reports_payload_valid;

alter table public.competitive_intelligence_reports
  add constraint competitive_intelligence_reports_payload_valid check (
    jsonb_typeof(payload) = 'object'
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
    and (
      (
        report_engine_version = 'competitive-report-v1'
        and payload ?& array[
          'brandId', 'generatedAt', 'reportEngineVersion', 'reportHash', 'sourceStateHash',
          'competitors', 'sourceIntelligence', 'completeness', 'sections'
        ]
        and payload - 'brandId' - 'generatedAt' - 'reportEngineVersion' - 'reportHash'
          - 'sourceStateHash' - 'competitors' - 'sourceIntelligence' - 'completeness' - 'sections'
          = '{}'::jsonb
        and generation_run_id is null
      )
      or
      (
        report_engine_version = 'competitive-report-v2-llm'
        and payload ?& array[
          'brandId', 'generatedAt', 'reportEngineVersion', 'reportHash', 'sourceStateHash',
          'competitors', 'sourceIntelligence', 'generation', 'executiveBriefing',
          'completeness', 'sections'
        ]
        and payload - 'brandId' - 'generatedAt' - 'reportEngineVersion' - 'reportHash'
          - 'sourceStateHash' - 'competitors' - 'sourceIntelligence' - 'generation'
          - 'executiveBriefing' - 'completeness' - 'sections' = '{}'::jsonb
        and generation_run_id is not null
        and (payload -> 'generation') ? 'result'
        and (payload -> 'generation') - 'result' = '{}'::jsonb
        and payload #>> '{generation,result}' in ('llm', 'llm_partial')
        and jsonb_typeof(payload -> 'executiveBriefing') = 'object'
      )
    )
  );

drop trigger competitive_intelligence_reports_validate on public.competitive_intelligence_reports;
create trigger competitive_intelligence_reports_validate
before insert on public.competitive_intelligence_reports
for each row
when (new.report_engine_version = 'competitive-report-v1')
execute function public.validate_competitive_intelligence_report();

create unique index competitive_intelligence_reports_generation_run_id_key
on public.competitive_intelligence_reports (generation_run_id)
where generation_run_id is not null;

create function public.validate_competitive_intelligence_report_v2_llm()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run_record public.intelligence_generation_runs%rowtype;
  payload_competitor_ids uuid[];
  signal_ids uuid[];
  hypothesis_ids uuid[];
  experiment_ids uuid[];
  source_briefing_id uuid;
  source_intelligence jsonb;
begin
  select * into run_record
  from public.intelligence_generation_runs
  where id = new.generation_run_id;

  if run_record.id is null
     or run_record.outcome not in ('llm_success', 'llm_partial')
     or run_record.owned_brand_id is distinct from new.owned_brand_id
     or run_record.competitor_ids is distinct from new.competitor_ids
     or run_record.intelligence_context_hash is distinct from new.payload ->> 'sourceStateHash' then
    raise exception 'v2 report generation run must be accepted and match its exact source scope';
  end if;
  if (new.payload #>> '{generation,result}') is distinct from
       (case run_record.outcome when 'llm_partial' then 'llm_partial' else 'llm' end) then
    raise exception 'v2 report generation result must match the persisted run outcome';
  end if;

  if exists (
    select 1 from jsonb_array_elements(new.payload -> 'competitors') competitor(value)
    where jsonb_typeof(competitor.value) <> 'object'
      or not competitor.value ?& array['id', 'name']
      or competitor.value - 'id' - 'name' <> '{}'::jsonb
      or char_length(trim(competitor.value ->> 'name')) = 0
  ) then
    raise exception 'each v2 report competitor must contain exactly an id and name';
  end if;
  select coalesce(array_agg((value ->> 'id')::uuid order by ordinality), '{}')
  into payload_competitor_ids
  from jsonb_array_elements(new.payload -> 'competitors') with ordinality competitor(value, ordinality);
  if payload_competitor_ids is distinct from new.competitor_ids
     or payload_competitor_ids is distinct from (
       select coalesce(array_agg(value order by value), '{}')
       from (select distinct unnest(payload_competitor_ids) value) values
     ) then
    raise exception 'v2 report competitor scope must be unique, sorted, and exact';
  end if;
  if (
    select count(*)
    from public.competitors
    join jsonb_array_elements(new.payload -> 'competitors') competitor(value)
      on competitors.id = (competitor.value ->> 'id')::uuid
     and competitors.domain = competitor.value ->> 'name'
    where competitors.brand_id = new.owned_brand_id
  ) <> cardinality(payload_competitor_ids) then
    raise exception 'v2 report competitors must belong to the report brand and match their names';
  end if;

  source_intelligence := new.payload -> 'sourceIntelligence';
  if not source_intelligence ?& array[
       'signalIds', 'hypothesisIds', 'experimentIds', 'executiveBriefingId'
     ]
     or source_intelligence - 'signalIds' - 'hypothesisIds' - 'experimentIds'
       - 'executiveBriefingId' <> '{}'::jsonb then
    raise exception 'v2 report source intelligence has an invalid shape';
  end if;
  select coalesce(array_agg(value::uuid order by ordinality), '{}') into signal_ids
  from jsonb_array_elements_text(source_intelligence -> 'signalIds') with ordinality item(value, ordinality);
  select coalesce(array_agg(value::uuid order by ordinality), '{}') into hypothesis_ids
  from jsonb_array_elements_text(source_intelligence -> 'hypothesisIds') with ordinality item(value, ordinality);
  select coalesce(array_agg(value::uuid order by ordinality), '{}') into experiment_ids
  from jsonb_array_elements_text(source_intelligence -> 'experimentIds') with ordinality item(value, ordinality);
  source_briefing_id := (source_intelligence ->> 'executiveBriefingId')::uuid;

  if signal_ids is distinct from (select coalesce(array_agg(value order by value), '{}') from (select distinct unnest(signal_ids) value) values)
     or hypothesis_ids is distinct from (select coalesce(array_agg(value order by value), '{}') from (select distinct unnest(hypothesis_ids) value) values)
     or experiment_ids is distinct from (select coalesce(array_agg(value order by value), '{}') from (select distinct unnest(experiment_ids) value) values) then
    raise exception 'v2 report source intelligence IDs must be unique and sorted';
  end if;

  if signal_ids is distinct from (
       select coalesce(array_agg((context_signal.value ->> 'id')::uuid order by (context_signal.value ->> 'id')::uuid), '{}')
       from jsonb_array_elements(run_record.intelligence_context -> 'signals') context_signal(value)
     )
     or (select count(*) from public.competitive_signals
      where id = any(signal_ids)
        and owned_brand_id = new.owned_brand_id
        and competitor_id = any(new.competitor_ids)) <> cardinality(signal_ids) then
    raise exception 'v2 report signals must be in scope and present in the frozen generation context';
  end if;
  if hypothesis_ids is distinct from (
       select coalesce(array_agg(id order by id), '{}')
       from public.llm_strategic_hypotheses
       where generation_run_id = new.generation_run_id
     )
     or experiment_ids is distinct from (
       select coalesce(array_agg(id order by id), '{}')
       from public.llm_recommended_experiments
       where generation_run_id = new.generation_run_id
     )
     or source_briefing_id is distinct from (
       select id from public.llm_executive_briefings
       where generation_run_id = new.generation_run_id
     )
     or (select count(*) from public.llm_strategic_hypotheses
      where id = any(hypothesis_ids)
        and generation_run_id = new.generation_run_id
        and owned_brand_id = new.owned_brand_id
        and competitor_id = any(new.competitor_ids)) <> cardinality(hypothesis_ids)
     or (select count(*) from public.llm_recommended_experiments
         where id = any(experiment_ids)
           and generation_run_id = new.generation_run_id
           and owned_brand_id = new.owned_brand_id
           and competitor_id = any(new.competitor_ids)) <> cardinality(experiment_ids)
     or not exists (
       select 1 from public.llm_executive_briefings
       where id = source_briefing_id
         and generation_run_id = new.generation_run_id
         and owned_brand_id = new.owned_brand_id
     ) then
    raise exception 'v2 report intelligence must come from the attached accepted generation run';
  end if;
  if exists (
    select 1 from public.llm_strategic_hypothesis_signals
    where hypothesis_id = any(hypothesis_ids) and not (signal_id = any(signal_ids))
  ) or exists (
    select 1 from public.llm_recommended_experiments
    where id = any(experiment_ids) and not (hypothesis_id = any(hypothesis_ids))
  ) or exists (
    select 1 from public.llm_executive_briefing_hypotheses
    where briefing_id = source_briefing_id
      and not (hypothesis_id = any(hypothesis_ids))
  ) then
    raise exception 'v2 report source intelligence must include complete accepted lineage';
  end if;

  return new;
end;
$$;

create trigger competitive_intelligence_reports_validate_v2_llm
before insert on public.competitive_intelligence_reports
for each row
when (new.report_engine_version = 'competitive-report-v2-llm')
execute function public.validate_competitive_intelligence_report_v2_llm();

create function public.persist_competitive_intelligence_report_v2_llm(
  p_generation_run_id uuid,
  p_report jsonb
)
returns table (id uuid, generation_run_id uuid, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  persisted_id uuid;
  persisted_run_id uuid;
  persisted_payload jsonb;
  candidate_competitor_ids uuid[];
begin
  if p_generation_run_id is null or p_report is null or jsonb_typeof(p_report) <> 'object'
     or p_report ->> 'reportEngineVersion' <> 'competitive-report-v2-llm' then
    raise exception 'a generation run and competitive-report-v2-llm payload are required';
  end if;
  select coalesce(array_agg((value ->> 'id')::uuid order by ordinality), '{}')
  into candidate_competitor_ids
  from jsonb_array_elements(p_report -> 'competitors') with ordinality competitor(value, ordinality);

  select reports.id, reports.generation_run_id, reports.payload
  into persisted_id, persisted_run_id, persisted_payload
  from public.competitive_intelligence_reports reports
  where reports.generation_run_id = p_generation_run_id;

  if persisted_id is not null then
    if persisted_payload - 'generatedAt' is distinct from p_report - 'generatedAt' then
      raise exception 'v2 generation run already has a different immutable report';
    end if;
    id := persisted_id;
    generation_run_id := persisted_run_id;
    payload := persisted_payload;
    return next;
    return;
  end if;

  insert into public.competitive_intelligence_reports (
    owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at,
    payload, generation_run_id
  ) values (
    (p_report ->> 'brandId')::uuid,
    candidate_competitor_ids,
    'competitive-report-v2-llm',
    p_report ->> 'reportHash',
    (p_report ->> 'generatedAt')::timestamptz,
    p_report,
    p_generation_run_id
  )
  on conflict do nothing
  returning competitive_intelligence_reports.id,
    competitive_intelligence_reports.generation_run_id,
    competitive_intelligence_reports.payload
  into persisted_id, persisted_run_id, persisted_payload;

  if persisted_id is null then
    select reports.id, reports.generation_run_id, reports.payload
    into persisted_id, persisted_run_id, persisted_payload
    from public.competitive_intelligence_reports reports
    where reports.generation_run_id = p_generation_run_id
       or (
         reports.owned_brand_id = (p_report ->> 'brandId')::uuid
         and reports.report_hash = p_report ->> 'reportHash'
       )
    order by (reports.generation_run_id = p_generation_run_id) desc
    limit 1;
    if persisted_run_id is distinct from p_generation_run_id
       or persisted_payload - 'generatedAt' is distinct from p_report - 'generatedAt' then
      raise exception 'v2 report hash collision: stored report state does not match candidate';
    end if;
  end if;

  id := persisted_id;
  generation_run_id := persisted_run_id;
  payload := persisted_payload;
  return next;
end;
$$;

revoke all on function public.persist_competitive_intelligence_report_v2_llm(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.persist_competitive_intelligence_report_v2_llm(uuid, jsonb)
to service_role;
