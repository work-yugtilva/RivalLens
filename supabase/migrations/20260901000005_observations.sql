create table public.observations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots(id) on delete restrict,
  subject_id uuid not null,
  fact_type text not null check (char_length(trim(fact_type)) between 1 and 120),
  source_url text not null check (source_url ~ '^https?://'),
  payload jsonb not null,
  extraction_method text not null check (extraction_method in ('json_ld', 'meta', 'dom')),
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  extractor_version text not null check (char_length(trim(extractor_version)) between 1 and 120),
  candidate_hash text not null check (candidate_hash ~ '^sha256:[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, candidate_hash)
);

create index observations_snapshot_id_idx on public.observations (snapshot_id);
create index observations_subject_id_observed_at_idx on public.observations (subject_id, observed_at desc);

create function public.prevent_observation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'observations are append-only';
end;
$$;

create trigger observations_prevent_mutation
before update or delete on public.observations
for each row execute function public.prevent_observation_mutation();

create function public.is_snapshot_member(target_snapshot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.snapshots
    where id = target_snapshot_id
      and public.is_source_member(source_id)
  );
$$;

revoke all on function public.is_snapshot_member(uuid) from public;
grant execute on function public.is_snapshot_member(uuid) to authenticated;

alter table public.observations enable row level security;
revoke all on public.observations from anon;
grant select on public.observations to authenticated;

create policy "snapshot organization members can view observations"
on public.observations for select to authenticated
using (public.is_snapshot_member(snapshot_id));
