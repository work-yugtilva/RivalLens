create function public.prevent_brand_organization_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'brand organization cannot be changed';
  end if;
  return new;
end;
$$;

create function public.prevent_competitor_brand_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.brand_id <> old.brand_id then
    raise exception 'competitor brand cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger brands_prevent_tenant_reassignment on public.brands;
create trigger brands_prevent_tenant_reassignment
before update on public.brands
for each row execute function public.prevent_brand_organization_reassignment();

drop trigger competitors_prevent_tenant_reassignment on public.competitors;
create trigger competitors_prevent_tenant_reassignment
before update on public.competitors
for each row execute function public.prevent_competitor_brand_reassignment();
