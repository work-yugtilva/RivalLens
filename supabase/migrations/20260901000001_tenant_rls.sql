create function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
  );
$$;

create function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create function public.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create function public.is_brand_member(target_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brands
    where id = target_brand_id
      and public.is_organization_member(organization_id)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.is_organization_admin(uuid) from public;
revoke all on function public.is_organization_owner(uuid) from public;
revoke all on function public.is_brand_member(uuid) from public;
grant execute on function public.is_organization_member(uuid), public.is_organization_admin(uuid), public.is_organization_owner(uuid), public.is_brand_member(uuid) to authenticated;

create function public.bootstrap_organization(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations (name)
  values (organization_name)
  returning id into organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (organization_id, auth.uid(), 'owner');

  return organization_id;
end;
$$;

revoke all on function public.bootstrap_organization(text) from public;
grant execute on function public.bootstrap_organization(text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.brands enable row level security;
alter table public.competitors enable row level security;

revoke all on public.organizations, public.organization_members, public.brands, public.competitors from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.organizations, public.organization_members, public.brands, public.competitors to authenticated;

create policy "organization members can view organizations"
on public.organizations for select to authenticated
using (public.is_organization_member(id));

create policy "organization admins can update organizations"
on public.organizations for update to authenticated
using (public.is_organization_admin(id))
with check (public.is_organization_admin(id));

create policy "organization members can view memberships"
on public.organization_members for select to authenticated
using (public.is_organization_member(organization_id));

create policy "organization admins can add non-owner memberships"
on public.organization_members for insert to authenticated
with check (
  role in ('admin', 'member')
  and public.is_organization_admin(organization_id)
);

create policy "organization admins can change non-owner memberships"
on public.organization_members for update to authenticated
using (role in ('admin', 'member') and public.is_organization_admin(organization_id))
with check (role in ('admin', 'member') and public.is_organization_admin(organization_id));

create policy "organization admins can remove non-owner memberships"
on public.organization_members for delete to authenticated
using (role in ('admin', 'member') and public.is_organization_admin(organization_id));

create policy "organization members can view brands"
on public.brands for select to authenticated
using (public.is_organization_member(organization_id));

create policy "organization members can create brands"
on public.brands for insert to authenticated
with check (public.is_organization_member(organization_id));

create policy "organization members can update brands"
on public.brands for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy "organization members can delete brands"
on public.brands for delete to authenticated
using (public.is_organization_member(organization_id));

create policy "brand organization members can view competitors"
on public.competitors for select to authenticated
using (public.is_brand_member(brand_id));

create policy "brand organization members can create competitors"
on public.competitors for insert to authenticated
with check (public.is_brand_member(brand_id));

create policy "brand organization members can update competitors"
on public.competitors for update to authenticated
using (public.is_brand_member(brand_id))
with check (public.is_brand_member(brand_id));

create policy "brand organization members can delete competitors"
on public.competitors for delete to authenticated
using (public.is_brand_member(brand_id));
