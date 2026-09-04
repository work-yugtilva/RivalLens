create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 160),
  domain text not null check (domain = lower(domain) and domain !~ '[/:]'),
  category text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, domain)
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 160),
  domain text not null check (domain = lower(domain) and domain !~ '[/:]'),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, domain)
);

create index brands_organization_id_idx on public.brands (organization_id);
create index competitors_brand_id_idx on public.competitors (brand_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger brands_set_updated_at
before update on public.brands
for each row execute function public.set_updated_at();

create trigger competitors_set_updated_at
before update on public.competitors
for each row execute function public.set_updated_at();

create function public.prevent_tenant_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'brands' and new.organization_id <> old.organization_id then
    raise exception 'brand organization cannot be changed';
  end if;
  if tg_table_name = 'competitors' and new.brand_id <> old.brand_id then
    raise exception 'competitor brand cannot be changed';
  end if;
  return new;
end;
$$;

create trigger brands_prevent_tenant_reassignment
before update on public.brands
for each row execute function public.prevent_tenant_reassignment();

create trigger competitors_prevent_tenant_reassignment
before update on public.competitors
for each row execute function public.prevent_tenant_reassignment();
