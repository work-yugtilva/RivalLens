# Competitive report example

This is synthetic fixture data, composed by the real report engine. The [JSON candidate](competitive-report.json) contains the full structured output, including exact fixture intelligence IDs and evidence links. POST persistence adds the immutable report ID.

**Your advantages**

- rival.test offers a 30-day return window versus your 60-day return window.

**Competitor advantages**

- rival.test offers a $50 free-shipping threshold versus your $75 free-shipping threshold.
- rival.test offers a subscription option while your brand explicitly does not.

**What appears to be working**

- The competitor may be using a lower free-shipping threshold to reduce purchase friction. Public evidence does not establish whether this improves conversion.
- The competitor may be emphasizing repeat-purchase mechanics. Public evidence does not establish whether this improves retention or lifetime value.

These entries are typed `strategic_hypothesis`, never measured performance.

**What to test next**

- Test a lower free-shipping threshold. Control: the current $75 threshold. Treatment: a configurable lower threshold, with $50 retained only as the competitor reference. Primary metric: checkout conversion rate. Guardrails and metrics remain subject to first-party data readiness.
- Test a visible subscribe-and-save option. Control: the current one-time purchase experience. Treatment: a visible subscription option with a configurable discount. Primary metric: subscription take rate. Guardrails and metrics remain subject to first-party data readiness.

Completeness is `complete` for this supplied intelligence state: no upstream unresolved or generation-needed entries exist. This says nothing about proven business performance or readiness to execute the experiments.

## Backend contract

- `POST /api/brands/:brandId/reports` accepts `{ "competitorIds": ["<UUID>"] }`, with 1–5 entries and deduplication. It composes current accepted projections and persists only the report snapshot.
- `GET /api/brands/:brandId/reports/latest?competitorIds=...` reads the latest stored snapshot for exactly that competitor set.
- `GET /api/brands/:brandId/reports/:reportId` reads that immutable snapshot.
- GET does not refresh intelligence or persist anything. A stored report describes its generation state; it does not claim to be current indefinitely. POST again to capture a changed state. Identical state returns the original snapshot and timestamp.

Each section contains at most three items. Selection uses confidence, fixed family order, competitor domain/ID, then source ID. Completeness includes eligible/omitted counts, all upstream uncertainty and generation gaps, and unknown comparison values. An entirely empty report is `insufficient`, including a fully evaluated state with no supported finding; section metadata distinguishes that state from uncertainty and generation requirements.

Current comparison subjects expose domains, so `competitorName` uses the domain. Reports cover only accepted Phase 1 public-evidence families. `complete` means complete relative to the supplied comparison/projections, not exhaustive knowledge of the market. Policy experiments retain their operational review prerequisite. No first-party metrics, durations, sample sizes, expected uplift, or execution readiness are inferred.
