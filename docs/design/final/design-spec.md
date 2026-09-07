# RivalLens — Overview implementation spec

**The HTML files in this folder are the visual source of truth.** Reproduce them faithfully rather than reinterpret or redesign them. Where this document and the HTML disagree, the HTML wins. Nothing here should be extended with specifications that are not visible or clearly implied by those files.

Approved direction: **Direction A — Report-first**. Explorations B and C live in `../explorations/` and are not implementation references.

## Reference files

| File | What it fixes |
|---|---|
| `overview-desktop.html` | Desktop Overview, complete report, drawer closed. 1440 × 1300. |
| `overview-evidence-drawer.html` | Same screen with the drawer open on a hypothesis item (the longest provenance chain). |
| `overview-partial.html` | Partial report — empty section, unresolved comparison, awaiting-generation row. 1440 × 1520. |
| `overview-states.html` | No report yet · loading · insufficient · generation required · empty section · unresolved · error, as fragments at real scale. |
| `overview-tablet.html` | 834 wide, top-bar navigation, drawer as a right sheet over a scrim. |
| `overview-mobile.html` | 390 wide, stacked sections. |

The desktop file is a static render: the drawer markup lives in `overview-evidence-drawer.html`. Frame heights exceed a real viewport so the whole report is visible in one capture — in the app the report column scrolls under a fixed sidebar and header.

## Product surface

`Overview → Competitive Intelligence Report → Evidence Drawer`

Sidebar navigation, in order: **Overview · Rivals · Compare · Opportunities · Evidence · Settings**. Overview is selected and is the only screen implemented deeply in this slice; the other five are links only.

## Page anatomy

```
┌────────────┬───────────────────────────────────────────────┐
│ sidebar    │ header  80px                                  │
│ 240px      ├───────────────────────────────────────────────┤
│ fixed      │ report column 896px, offset 64px from sidebar │
│            │   ┌ 152px gutter ┬ 40px gap ┬ 704px body ┐    │
│            │   … four sections, hairline-separated         │
└────────────┴───────────────────────────────────────────────┘
                              evidence drawer 480px, overlays
                              the content region from the right
```

- **Sidebar** — 240px, `#F7F8FA`, 1px right border. Wordmark + brand switcher block (bottom-bordered), nav list, and a bottom-bordered footer showing the last source refresh. The selected item has a 2px indigo bar bleeding off its left edge plus an `#F1F1FB` fill and 500 weight; idle items are `#454B59` and fill `#EFF0F3` on hover. No pills.
- **Header** — 80px, white, 1px bottom border, no shadow. Two lines on the left: the report title at 15/600, then a meta line `Complete · 1 competitor · generated 2 hours ago` at 13px. On the right: the comparison-set control (34px, 1px border, 6px radius) and a ghost `Regenerate`.
- **Report column** — fixed 896px, offset 64px from the sidebar; it does not stretch to fill wide screens. Each section is a `152px 704px` grid with a 40px gap: the gutter holds the section title and its one-line subtitle, the body holds the items.
- **Drawer** — 480px, absolutely positioned over the content region; the report does not reflow beneath it.

## Four report sections

| Section | Gutter subtitle |
|---|---|
| Your advantages | Observed differences favouring you |
| Competitor advantages | Observed differences favouring them |
| What appears to be working | Interpretations. Not proven performance. |
| What to test next | Tests worth considering. Not committed actions. |

The subtitle is what carries the epistemic frame; there is no per-item badge. Sections are separated by a 1px `#E9EAEE` rule with 36px padding above and below. Items inside a section are separated by a 1px `#F1F2F5` rule. The backend caps each section at three items.

When a section omits items, a 13px `#767C8A` count line sits above the first item — e.g. `2 supported · 1 comparison unresolved`, `1 of 2 shown · 1 awaiting generation`.

## Item anatomy

Every item is a flex row: a 3px-wide gutter mark, 14px gap, then the body.

**Fact** — solid 3px mark, 22px tall, 2px radius. Indigo `#4338CA` when the difference favours the owned brand, graphite `#5B6070` when it favours the competitor. Body: title 14/600 · three confidence ticks · the evidence affordance pushed right · the statement at 15/1.55 `#23262E` · the value grid.

**Hypothesis** — 1px hairline mark (`border-left: 1px solid #C7CAD2` inside the 3px slot, so all bodies align on the same x), 24px tall. Body: a 13px `#5C6270` eyebrow · the statement in Newsreader at 20/1.35 · the uncertainty sentence at 13px `#5C6270` · a 13px `#767C8A` line naming the supporting signal count. **No numbers anywhere in a hypothesis.**

**Experiment** — same 1px hairline mark. Body: title 15/600 (the only step up in the report) · objective at 15/1.55 · the metric grid · the caveat at 13px `#5C6270`, inset 12px behind a 1px `#E9EAEE` left rule.

**Unresolved / gap rows** — dashed mark, `repeating-linear-gradient(#E4E6EB 0 3px, transparent 3px 6px)`. **Dashed means unresolved and nothing else.** Do not use it for interpretation.

### Value grid (facts)

`grid-template-columns: 168px 168px auto`, 13px above the row. Each cell is an 11px uppercase micro-label (`letter-spacing: 0.07em`, `#767C8A`) over the value in IBM Plex Mono 13/500 `#16181D`.

```
YOU              RIVAL.TEST       DIFFERENCE
$75              $50              ▼ $25 lower
```

The difference cell carries a 9px monochrome caret in `#5B6070`, the delta in mono 13/500, then a one-word qualifier at 12px `#767C8A`. Presence differences (`Not offered` / `Offered`) use the same grid with an empty third cell. Values align vertically down the whole report — that alignment is the scanning mechanism, so keep the track widths fixed.

### Metric grid (experiments)

`grid-template-columns: 232px 116px auto`, same label treatment, values at 13px sans:

```
PRIMARY METRIC             GUARDRAILS   READINESS
Checkout conversion rate   3 metrics    Needs first-party data
```

Readiness value is `#5C6270`; the other two are `#16181D`. This grid, plus the 15px title, is the whole of the stronger hierarchy for "What to test next" — **no `Plan this test` or any other new action.**

## Typography

Instrument Sans (UI and body) · Newsreader (hypothesis statements only) · IBM Plex Mono (values, deltas, timestamps, domains). Fallbacks: `system-ui`, `Georgia`, `ui-monospace, Menlo`.

| Size | Use |
|---|---|
| 20 / 1.35 serif | hypothesis statement |
| 15 / 600 | experiment title, header report title |
| 15 / 1.55 | fact statement, experiment objective |
| 14 / 600 | section title (tracking `-0.012em`), fact title |
| 13 | section subtitle, uncertainty, caveat, meta, evidence affordance, header meta, grid values |
| 12 | mono brand/timestamp values and the one-word delta qualifier only |
| 11 | uppercase micro-labels only (`letter-spacing: 0.07em`) |

**Readability rules that must not regress:** sentence-level secondary text is never below 13px; 11px is reserved for short uppercase micro-labels; 12px only for single mono values and one-word qualifiers. Do not restore `#9CA3AF` at 12px anywhere.

## Colour and surface

| Token | Value | Contrast on white | Use |
|---|---|---|---|
| ink | `#16181D` | 16.1:1 | titles, values |
| body | `#23262E` | 13.2:1 | statements, objectives |
| muted | `#5C6270` | 6.2:1 | secondary sentences, uncertainty, caveats, meta |
| faint | `#767C8A` | 4.6:1 | uppercase micro-labels, qualifiers, counts |
| nav idle | `#454B59` | 8.4:1 | sidebar items |
| indigo | `#4338CA` | — | selection, links, affordance hover, owned-advantage mark |
| graphite | `#5B6070` | — | competitor mark, confidence ticks, delta caret |

Surfaces: content `#FFFFFF`, page ground `#FCFCFD`, sidebar `#F7F8FA`, row hover `#FAFAFB`, selected row `#F5F5FA`, nav selected `#F1F1FB`. Rules: `#E9EAEE` (section), `#F1F2F5` (item), `#E4E6EB` (controls, dashed marks), `#C7CAD2` (hairline marks, dashed underlines, separator dots).

`#C7CAD2` and lighter are **non-text** values only. Radii: 6px for rows, controls and containers; 2px for marks. No shadows in the report body — the drawer's `-12px 0 32px rgba(16,24,40,.05)` is the only one on the screen. No gradients, no glass, no tint fills behind report content.

**Not permitted:** KPI cards, charts, bento grids, nested cards in the report body, red/green scorekeeping, badge clutter, generic analytics-dashboard treatment. A competitor advantage is graphite, never red.

## Confidence

Three 3×10px bars, 2px apart, 1px radius, filled `#5B6070`. Every fact in the reference set is `high`, so only the all-three-filled case is fixed by the design — pick the unfilled tone when implementing `medium` and `low`, keeping it a neutral tint of the same family. Never on hypotheses or experiments. The numeric per-evidence confidence appears only inside the drawer, as `Confidence 95%`.

## Evidence affordance

Always visible — never hover-only. 13px `#767C8A`, `margin-left: auto`, a 4px gap before an 11px chevron. Label matches the item type: `Evidence` · `Why this?` · `Why this test?`.

The whole row is the target: hover fills `#FAFAFB` and turns the affordance indigo with an underline; focus draws `inset 0 0 0 2px #4338CA`; the selected row keeps `#F5F5FA` with `inset 2px 0 0 #4338CA` while the drawer is open. Rows are `tabindex="0"` and reachable in document order.

## Evidence drawer

480px, white, 1px left border, no scrim on desktop. Header: an 11px uppercase kind label (`Observed fact` / `Interpretation` / `Recommended test`), the item title at 16/600, and a 28px close control. Body: the heading **Why RivalLens is telling you this**, then a vertical chain — a 1px `#E4E6EB` rail with 9px ringed nodes, the first ringed indigo and the rest `#C7CAD2`.

Steps, in plain language:

| Label | Content |
|---|---|
| WHAT THE REPORT SAYS | the finding as it appears in the report |
| WHAT IT MIGHT MEAN | the hypothesis statement (serif 17px) and its uncertainty sentence — **omitted entirely for a plain fact** |
| WHAT WE COMPARED | the signal in a sentence, then a You / rival.test value pair in a bordered `#FCFCFD` block |
| WHAT WE SAW | the evidence rows |

Each evidence row: a 5px role dot (indigo owned, graphite competitor), the domain in mono 13px, the page type in plain English on the right (`Shipping & returns page`, `Subscription page`, `Product page`), the observed fact at 14/1.45, then capture time and `Confidence 95%` at 12px. An explicitly-absent observation renders italic `#5C6270` — `No subscription option present — recorded as explicitly absent`.

Footer: `Report generated 4 Sept 2026 · sources captured the same morning` and an `Open in Evidence ›` link.

**Never surface** raw comparison keys (`offer.free_shipping_threshold`), signal or hypothesis type identifiers, engine version strings, or any UUID. Use the human label — `Free-shipping threshold`.

The chains the drawer must be able to render:

```
Report finding → Competitive signal → Owned evidence + Competitor evidence
Strategic hypothesis → Supporting signals → Evidence
Recommended experiment → Hypothesis → Signals → Evidence
```

Interaction: clicking any report item opens the drawer bound to that item; clicking another item swaps the content in place; the close control and `Esc` dismiss it.

## Report states

See `overview-states.html` and `overview-partial.html`.

- **Complete** — header shows an indigo tick and `Complete`.
- **Partial** — header swaps to an amber ring, `Partial`, and a `N gaps` count in `#7A6236`. A notice sits above the report: 1px `#EBE3D3` border, 2px `#C8A96A` left edge, `#FDFBF6` ground, saying what is missing and that the findings shown are unaffected. Sections carry their own count lines. **Partial must never read as broken** — the report renders normally underneath.
- **Insufficient** — all four section labels are retained, each with a one-line reason; a primary action to capture more sources sits below.
- **Unresolved** — the row keeps its title and a plain explanation; both value cells render `Not established` in `#5C6270` with a 1px dashed `#C7CAD2` underline. **Never** a value, a dash, a zero, an equals sign, or two matching values — an unknown must never read as confirmed parity.
- **Generation required** — a notice with a `Regenerate report` action, and per-item rows with a dashed mark and a quiet bordered `Generate` control.
- **Empty section** — the section stays in place with a dashed mark, `No supported finding yet.`, and a sentence explaining that this is a gap in evidence, not a finding that the brand is behind.
- **No report yet** — a single left-aligned block: outline icon, 17/600 heading, an explanatory paragraph, then `Generate first report` (indigo, 34px) beside a bordered secondary action.
- **Loading** — a layout-shaped skeleton: real section labels in `#C7CAD2` beside `#EFF0F3` bars at the real line widths. No spinner.
- **API error** — inline within the content region, sidebar and header intact: `The report could not be loaded`, a reassurance that evidence and previous reports are safe, a bordered `Try again`, and a link to the last complete report.

## Responsive behaviour

**Desktop is primary.** Sidebar 240px fixed; report column fixed at 896px and left-aligned, not stretched. Below roughly 1280 the column may narrow but the `152 / 704` gutter proportion holds.

**Tablet — `overview-tablet.html`, 834.** The sidebar becomes a two-row top bar: a 56px identity row, then a 44px tab strip with a 2px indigo underline on Overview. The report becomes full-width single-column; section titles and subtitles sit on one baseline instead of in a gutter. The value grid narrows to `150px 150px auto`. The drawer becomes a 480px right sheet over a `rgba(22,24,29,.14)` scrim.

**Mobile — `overview-mobile.html`, 390.** A 52px app bar with a menu control, the screen name, the comparison pair beneath it, and a refresh control — the desktop nav is **not** reproduced horizontally. Sections stack with 16px padding; each has a title, a count, and a subtitle. The value grid becomes two equal columns with the difference spanning both. Every item keeps its evidence affordance. Type sizes are not reduced to fit — 15px statements and 13px secondary text hold. Touch targets are ≥44px. No horizontal overflow anywhere. The drawer becomes a full-screen sheet with the chain stacked.

## Data honesty

All copy in these files comes from `docs/examples/competitive-report.json` and the canonical-copy tables in `packages/schemas/src/contracts.ts`. Hypothesis and experiment text is deterministic template output — render it verbatim, never paraphrase. The owned brand is shown as `yourbrand.test` purely as a stand-in.

The design displays **no** revenue, traffic, ROAS, conversion rate, competitor spend or growth metric, and must not begin to.
