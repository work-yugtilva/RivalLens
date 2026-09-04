create function public.create_onboarding_brand(
  target_organization_id uuid,
  organization_name text,
  brand_name text,
  brand_domain text,
  competitor_domains text[] default array[]::text[]
)
returns table (organization_id uuid, brand_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
  resolved_brand_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if target_organization_id is null then
    insert into public.organizations (name)
    values (organization_name)
    returning id into resolved_organization_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (resolved_organization_id, auth.uid(), 'owner');
  else
    if not public.is_organization_member(target_organization_id) then
      raise exception 'organization membership required';
    end if;

    resolved_organization_id := target_organization_id;
  end if;

  insert into public.brands (organization_id, name, domain)
  values (resolved_organization_id, brand_name, brand_domain)
  on conflict (organization_id, domain) do nothing
  returning id into resolved_brand_id;

  if resolved_brand_id is null then
    select id
    into resolved_brand_id
    from public.brands
    where organization_id = resolved_organization_id
      and domain = brand_domain;
  end if;

  insert into public.competitors (brand_id, name, domain)
  select resolved_brand_id, domain, domain
  from unnest(coalesce(competitor_domains, array[]::text[])) as domain
  where domain <> ''
  on conflict (brand_id, domain) do nothing;

  return query select resolved_organization_id, resolved_brand_id;
end;
$$;

revoke all on function public.create_onboarding_brand(uuid, text, text, text, text[]) from public;
grant execute on function public.create_onboarding_brand(uuid, text, text, text, text[]) to authenticated;
