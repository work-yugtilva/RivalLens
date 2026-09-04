# RivalLens development rules

- Use pnpm workspace commands: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm db:reset`, `pnpm test:db`, and `pnpm build`.
- Keep `apps/web` thin. `packages/domain` and `packages/intelligence` must not import connector or provider SDK code.
- Validate external and AI data with shared Zod contracts before it reaches domain logic or persistence.
- Preserve the evidence chain: source → snapshot → observation → signal → recommendation → report. Snapshots and observations are append-only when introduced.
- Authentication is not authorization: tenant access is organization membership plus RLS.
- Service-role credentials and admin clients are server-only; never expose them in browser bundles, logs, prompts, or examples.
- User-authorized request paths must use the RLS-aware Supabase client. Do not introduce direct `DATABASE_URL`/Drizzle access there; reserve privileged database access for a separately scoped internal worker or operational task.
- Network connectors must use the shared public-URL safety checks and revalidate every redirect before connecting.
- Database changes require one authoritative SQL migration in `supabase/migrations`, matching Drizzle definitions, RLS/grant review, and organization allow/deny tests.
- Do not add crawling, connector providers, AI providers, jobs, storage, or pgvector without a scoped issue and shared contract.
- Keep diffs focused; run relevant tests and avoid unrelated refactors.
