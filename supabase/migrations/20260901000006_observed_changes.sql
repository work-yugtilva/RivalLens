create table public.observed_changes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  source_id uuid not null references public.sources(id) on delete restrict,
  fact_type text not null check (char_length(trim(fact_type)) between 1 and 120),
  change_type text not null check (char_length(trim(change_type)) between 1 and 120),
  fact_identity text not null check (char_length(trim(fact_identity)) between 1 and 500),
  previous_snapshot_id uuid references public.snapshots(id) on delete restrict,
  current_snapshot_id uuid not null references public.snapshots(id) on delete restrict,
  previous_observation_id uuid references public.observations(id) on delete restrict,
  current_observation_id uuid references public.observations(id) on delete restrict,
  before_value jsonb,
  after_value jsonb,
  detected_at timestamptz not null,
  detector_version text not null check (char_length(trim(detector_version)) between 1 and 120),
  change_hash text not null check (change_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (current_snapshot_id, change_hash)
);

create index observed_changes_subject_id_detected_at_idx on public.observed_changes (subject_id, detected_at desc);
create index observed_changes_source_id_detected_at_idx on public.observed_changes (source_id, detected_at desc);
create index observed_changes_current_snapshot_id_idx on public.observed_changes (current_snapshot_id);

create function public.prevent_observed_change_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'observed_changes are append-only';
end;
$$;

create trigger observed_changes_prevent_mutation
before update or delete on public.observed_changes
for each row execute function public.prevent_observed_change_mutation();

alter table public.observed_changes enable row level security;
revoke all on public.observed_changes from anon;
grant select on public.observed_changes to authenticated;

create policy "snapshot organization members can view observed changes"
on public.observed_changes for select to authenticated
using (public.is_snapshot_member(current_snapshot_id));
