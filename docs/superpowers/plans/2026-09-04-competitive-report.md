# Competitive Intelligence Report Implementation Plan

**Goal:** Compose a short, deterministic, evidence-backed report from accepted current intelligence and persist immutable snapshots through explicit POST.

**Architecture:** A pure intelligence composer consumes one comparison and its coherent current signal, hypothesis, and experiment projections. A thin RLS-aware service loads those inputs using existing resolvers. Only the report POST calls a restricted snapshot persistence function.

**Tech stack:** TypeScript, shared Zod contracts, Next.js handlers, Supabase SQL/RLS, Drizzle, Vitest, pgTAP.

## Decisions

- Exactly four sections, at most three items each; no filler. Numeric and explicit mechanic presence signals supply factual advantages. Positioning, temporal signals, and generic promotions do not.
- `appearsToBeWorking` contains items typed `strategic_hypothesis`, with the existing canonical statement and uncertainty. It never represents measured performance.
- Experiment items carry the accepted persisted experiment, including structured control/treatment, metrics and readiness, caveats, and operational prerequisites. Presentation can summarize these fields without inventing copy.
- Order confidence high/medium/low, fixed family order, competitor domain/ID, then source ID. No cross-unit magnitude comparison or opportunity score.
- Persisted current signals alone can supply factual items. Current unpersisted signal candidates produce typed generation-needed metadata. Retain supplied unresolved and generation-needed metadata at hypothesis and experiment layers. Comparison unknowns are also recorded, including when no prior signal exists.
- Completeness is insufficient when all sections are empty, partial when supported items coexist with any gaps, otherwise complete. Section metadata records eligible count, omitted count, and supported/no-finding/unresolved/generation-required state. Truncation is explicit but not an intelligence gap.
- Provenance is structured: signal ID plus comparison key and evidence; hypothesis ID plus supporting signal IDs; experiment ID plus source hypothesis IDs. Every referenced parent must exist in the current input set with the same tenant/competitor scope.
- Store immutable report snapshots, not derived GET output: users can revisit exactly the original presentation. SQL is authoritative, with Drizzle parity, client SELECT under organization membership RLS, client writes denied, and service-only validated insert RPC. Existing intelligence remains untouched.
- Canonical source-state hash includes comparison state, current signal candidates and persisted IDs, hypothesis/experiment projections, unresolved/generation gaps, and competitor selection. It excludes generation timestamps, preserves evidence timestamps, and normalizes unordered collections. Report hash includes source-state hash and explicit report engine version `competitive-report-v1`.
- POST `/api/brands/:brandId/reports` accepts 1–5 competitor UUIDs. GET `/reports/latest?competitorIds=...` selects the exact deduplicated competitor set; GET `/reports/:reportId` returns the stored snapshot. All use authenticated organization/RLS access and tenant-safe errors. POST does not generate upstream intelligence.

## Execution and ownership

- [x] Shared report schemas in `packages/schemas/src/reports.ts`, composer in `packages/intelligence/src/reports.ts`, package exports, and `tests/unit/competitive-reports.test.ts` (lead). Start with failing composition assertions; implement eligibility, provenance validation, deterministic identity and completeness; verify focused tests.
- [x] Authoritative migration `supabase/migrations/20260901000010_competitive_intelligence_reports.sql`, parity in `packages/db/src/schema.ts`, and dedicated pgTAP report tests (persistence agent). Verify idempotency, immutable history, scoped foreign lineage, tenant read allow/deny, mutation denial.
- [x] New report service, POST and two GET routes, and `tests/unit/web-competitive-reports.test.ts` (API agent). Verify real handlers and service around mocked database boundary, read-only GET, no upstream writes, current-state loading, request bounds, authentication and ownership.
- [x] Review integrated contracts and security; fix only report-related failures. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm db:reset`, `pnpm test:db`, `pnpm --filter @rivallens/web build`, and `git diff --check` using installed Node 22.21.0.
- [x] Document a reproducible example and report exact checks and limitations. Preserve unrelated receipts change. No UI, LLM, integrations, scoring, execution, or analysis.
