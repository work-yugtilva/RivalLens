# @rivallens/eval — frozen-fixture real-model evaluation harness (Phase 4A + 4B)

A reproducible, **provider-neutral** harness for benchmarking candidate LLMs against the exact
same frozen `IntelligenceContext` fixtures and the exact same deterministic validation rules,
through the **actual production-intended path**:

```
frozen fixture -> Phase 3D provider adapter -> Phase 3C orchestration -> Phase 2 validator -> evaluation metrics
```

## This does NOT

- select a production runtime model (no winner is chosen in code);
- persist anything (no DB, no Supabase migrations, no customer UI);
- run as part of `pnpm test:unit` or in CI;
- make a paid provider request without an explicit `--live` flag.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm test:eval` | Runs `tests/eval/**` (mock-only, no network). Not in CI. |
| `pnpm eval:intelligence --dry-run` | Prints the pre-run plan (models, fixtures, call counts, max cost). Constructs no provider, writes nothing. |
| `pnpm eval:intelligence` | MOCK benchmark over all 15 fixtures. Writes artifacts under `packages/eval/.runs/<benchmarkRunId>/` (gitignored). |
| `pnpm eval:intelligence --live --models <alias>[,<alias>]` | LIVE benchmark. Requires the selected providers' API keys in the environment. |
| `pnpm eval:author-fixtures [--check]` | Regenerates the 15 committed fixture JSON artifacts. `--check` fails on drift. Not run at benchmark time; not in CI. |

### Flags

`--fixtures A,B` (scenario letters or fixtureIds; default all) · `--models <alias>,...` (trusted
config **aliases only** — never `provider:modelId`, an arbitrary model id, or a base URL) ·
`--runs <n>` · `--reasoning-effort low|medium|high` (uniform override; rejected before any
provider is built if a selected model does not support it — omitted ⇒ provider default) ·
`--out <dir>` · `--live` · `--dry-run` · `--mock-scenario <name>` · `--emit-rubric-template` ·
`--seed <s>` · `--strict-cost` · `--fail-on-ineligible`.

### Candidate model families (`config/models.json`, verified 2026-09-09)

| alias | provider | modelId | structured output | reasoning effort | pricing |
| --- | --- | --- | --- | --- | --- |
| `openai-terra` | openai | `gpt-5.6-terra` | strict JSON schema (server-enforced) | low/medium/high | published |
| `anthropic-sonnet` | anthropic | `claude-sonnet-4-6` | JSON object (prompt-guided; no server-enforced schema) | low/medium/high | published |
| `gemini-flash` | gemini | `gemini-3.8-flash` | JSON object (prompt-guided) | low/medium/high | published (introductory) |
| `deepseek-flagship` | deepseek | `deepseek-v4-pro` | JSON object | low/high | published |
| `kimi-flagship` | kimi (moonshot) | `kimi-k3` | JSON object | none (always-on) | published |
| `glm-flagship` | glm (z.ai) | `glm-5.3` | JSON object | low/medium/high | **unpublished ⇒ cost "unknown"** |
| `qwen-flagship` | qwen (dashscope) | `qwen3.8-max-0902` | JSON object | none (benchmarked thinking-off) | published |

DeepSeek / Kimi / GLM / Qwen run through one shared `OpenAiCompatibleIntelligenceProvider`
(`@rivallens/ai/providers/openai-compatible`) with a source-owned endpoint registry; the other
three keep their first-party adapters. Every adapter still returns `rawOutput: unknown` — the
deterministic validator remains the sole acceptance path regardless of a provider's structured
output mode.

`structuredOutputMode` meanings: `strict_json_schema` = server-enforced strict JSON Schema;
`json_schema` = server-enforced, non-strict; `json_object` = JSON requested, structure described
in the prompt, **no** server-enforced schema. Only `openai-terra` has a server-side schema
guarantee in this benchmark. `anthropic-sonnet` is prompt-guided JSON: Sonnet 4.6 native
structured output rejected the RivalLens synthesis schema before generation (HTTP 400 "compiled
grammar is too large") at 19.6 KB inlined, 7.9 KB `$defs`-deduplicated, and 5.9 KB
grammar-simplified, so the adapter sends a compact format instruction instead and malformed,
fenced, or schema-invalid text fails closed in canonical validation.

Sources (first-party docs, retrieved 2026-09-09): developers.openai.com (gpt-5.6-terra),
platform.claude.com (claude-sonnet-4-6, effort), ai.google.dev (gemini-3.8-flash, thinking
levels), api-docs.deepseek.com (v4-pro, thinking mode, json mode), platform.moonshot.ai
(kimi-k3), docs.z.ai (glm-5.3 chat-completion), help.aliyun.com / DashScope (qwen3.8-max,
compatible-mode).

## Layout

- `config/models.json` — trusted model allowlist (alias-keyed) with per-model capability
  metadata (`structuredOutputMode`, `supportedReasoningEfforts`, `temperatureSupported`) and an
  optional per-model `timeoutMs` (client request timeout; omitted ⇒ 30 s default, max 120 s).
  `anthropic-sonnet` sets 120 s: prompt-guided synthesis at `maxOutputTokens` 32768 timed out at
  30 s on both attempts in the first fixture-B smoke. A timeout is still a transport failure, so
  one orchestration can take up to 2 × `timeoutMs`.
  Re-verify the model IDs / pricing against first-party docs before a `--live` run.
- `config/gates.json` — hard eligibility gates (zero-tolerance) + reported (non-gating) thresholds.
- `pricing/model-pricing.json` — versioned pricing. Unknown price -> `null` cost, never a guess.
- `fixtures/*.json` — 15 immutable synthetic frozen contexts (A–O), hash-verified on load.
- `src/` — fixture loader, deterministic metrics, trust-boundary security checks, hard gates,
  latency + pricing aggregation, the runner (reuses `orchestrateIntelligence`), report writers, CLI.

## First live smoke sequence (re-verify model IDs / pricing first)

1. `pnpm eval:intelligence --dry-run --models openai-terra,anthropic-sonnet,gemini-flash,deepseek-flagship,kimi-flagship,glm-flagship,qwen-flagship`
   — confirm the plan, the provider-call upper bound, and the estimated max cost (`glm-flagship`
   shows as "unknown" — no published price).
2. One provider at a time, fixture B, one run:
   `pnpm eval:intelligence --live --fixtures B --runs 1 --models openai-terra` (then
   `anthropic-sonnet`, then `gemini-flash`). Inspect `runs.jsonl` telemetry + `SUMMARY.md`.
3. Then the three first-party families together: `--models openai-terra,anthropic-sonnet,gemini-flash`.
4. Then each open-weight family alone: `deepseek-flagship`, `kimi-flagship`, `glm-flagship`, `qwen-flagship`.
5. Weak-provider screen: `--fixtures A,B,J,K,N,O --runs 1 --models <all 7>`.
6. Only then the full `15 × 3`.

## Strategic quality

Grounding / attribution / epistemic / injection metrics are computed deterministically (no LLM
judge). Strategic-quality is scored separately (1–5 rubric, `src/rubric/`) by a human reviewer,
or — later — an optional LLM judge that is an interface only (never selected, never called by
default, never allowed to modify deterministic metrics or hard gates). A model that fails any
hard gate is `INELIGIBLE` regardless of its quality score.
