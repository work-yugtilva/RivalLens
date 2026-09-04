alter table public.competitors
  add constraint competitors_id_brand_id_key unique (id, brand_id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  competitor_id uuid,
  connector_type text not null check (char_length(trim(connector_type)) between 1 and 80),
  source_type text not null check (char_length(trim(source_type)) between 1 and 80),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  external_id text,
  status text not null default 'active' check (status in ('active', 'failed')),
  last_collected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_competitor_matches_brand_fk
    foreign key (competitor_id, brand_id)
    references public.competitors(id, brand_id)
    on delete restrict,
  unique nulls not distinct (brand_id, competitor_id, connector_type, canonical_url)
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  captured_at timestamptz not null,
  final_url text not null check (final_url ~ '^https?://'),
  http_status smallint not null check (http_status between 100 and 599),
  content_type text not null check (content_type in ('text/html', 'application/xhtml+xml')),
  raw_content_hash text not null check (raw_content_hash ~ '^sha256:[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  raw_artifact_path text not null check (char_length(raw_artifact_path) > 0),
  normalized_artifact_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index sources_brand_id_idx on public.sources (brand_id);
create index sources_competitor_id_idx on public.sources (competitor_id) where competitor_id is not null;
create index snapshots_source_id_captured_at_idx on public.snapshots (source_id, captured_at desc);

create trigger sources_set_updated_at
before update on public.sources
for each row execute function public.set_updated_at();

create function public.prevent_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'snapshots are append-only';
end;
$$;

create trigger snapshots_prevent_mutation
before update or delete on public.snapshots
for each row execute function public.prevent_snapshot_mutation();

create function public.is_source_member(target_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sources
    where id = target_source_id
      and public.is_brand_member(brand_id)
  );
$$;

revoke all on function public.is_source_member(uuid) from public;
grant execute on function public.is_source_member(uuid) to authenticated;

alter table public.sources enable row level security;
alter table public.snapshots enable row level security;

revoke all on public.sources, public.snapshots from anon;
grant select on public.sources, public.snapshots to authenticated;

create policy "brand organization members can view sources"
on public.sources for select to authenticated
using (public.is_brand_member(brand_id));

create policy "source organization members can view snapshots"
on public.snapshots for select to authenticated
using (public.is_source_member(source_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880, array['application/gzip'])
on conflict (id) do nothing;
