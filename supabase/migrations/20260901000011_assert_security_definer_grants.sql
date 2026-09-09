-- Re-assert EXECUTE privileges on every SECURITY DEFINER function so a hosted
-- database matches the intended posture regardless of how its schema was first
-- applied. No table or function DDL here: only revoke/grant, safe to re-run.
--
--   * RLS predicate helpers -> authenticated only (RLS policies depend on this grant)
--   * onboarding RPCs       -> authenticated only (bodies also require auth.uid())
--   * persist_* writer RPCs -> service_role only  (bypass RLS; never end-user callable)
--
-- anon and public must not execute any of these.

-- RLS predicate helpers -----------------------------------------------------------
revoke all on function
  public.is_organization_member(uuid),
  public.is_organization_admin(uuid),
  public.is_organization_owner(uuid),
  public.is_brand_member(uuid),
  public.is_source_member(uuid),
  public.is_snapshot_member(uuid)
from public, anon;

grant execute on function
  public.is_organization_member(uuid),
  public.is_organization_admin(uuid),
  public.is_organization_owner(uuid),
  public.is_brand_member(uuid),
  public.is_source_member(uuid),
  public.is_snapshot_member(uuid)
to authenticated;

-- Onboarding RPCs ---------------------------------------------------------------
revoke all on function
  public.bootstrap_organization(text),
  public.create_onboarding_brand(uuid, text, text, text, text[])
from public, anon;

grant execute on function
  public.bootstrap_organization(text),
  public.create_onboarding_brand(uuid, text, text, text, text[])
to authenticated;

-- Service-role-only writer RPCs -----------------------------------------------------
revoke all on function
  public.persist_competitive_signals(jsonb),
  public.persist_strategic_hypotheses(jsonb),
  public.persist_recommended_experiments(jsonb),
  public.persist_competitive_intelligence_report(jsonb)
from public, anon, authenticated;

grant execute on function
  public.persist_competitive_signals(jsonb),
  public.persist_strategic_hypotheses(jsonb),
  public.persist_recommended_experiments(jsonb),
  public.persist_competitive_intelligence_report(jsonb)
to service_role;
