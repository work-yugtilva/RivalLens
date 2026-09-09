# Direction A Overview — QA remediation report

Date: 2026-09-08. Scope: `/overview`, its nine development previews, and the evidence drawer. Reviewed against `AGENTS.md`, `frontend-design-review`, `accessibility-audit`, and `wcag-audit-patterns`. No Direction B/C references or other product screens were used.

**Recommendation: DO NOT ACCEPT for production acceptance yet.** The five High and six Medium findings have been remediated and pass the available unit/browser checks. Two verification gates remain: authenticated live-data/action testing, and a completed real screen-reader pass. This is a verification hold, not a request for another redesign.

## Initial findings and remediation

The initial review was read-only. It found no confirmed Blocker, five High, six Medium, and two Low findings. The following records the original evidence, recommended correction, and implemented result.

| Severity / ID | Affected screen or state | Initial finding and evidence | Correction and retest result |
| --- | --- | --- | --- |
| Blocker | — | None confirmed. | None. |
| High H1 | Production drawers after a source refresh | Resolver reconstructed current comparisons rather than the report's recorded observation/snapshot references. `generatedAt` did not enforce historical evidence. | Batch-read referenced IDs through the authenticated RLS-aware client; validate source ownership, source/snapshot/observation relationships, and shared data contracts. New observations cannot replace saved evidence. Missing records retain an actionable row and an unavailable-evidence explanation. Unit regressions pass; authenticated database retest remains pending. |
| High H2 | Desktop complete report | Clicking another row dismissed the open drawer (return → shipping, shipping → subscription, hypothesis → hypothesis). | Prevent desktop outside-dismiss for report-row targets. All seven rows switch one open drawer in place; contents and selected row update correctly. |
| High H3 | Drawer at all breakpoints | Escape/Close returned focus to `BODY`, losing the reader's position. | Retain the invoking button and restore focus after dismissal. Enter, Escape and Close pass for all seven rows at all four widths. Modal Tab/Shift+Tab containment passes. |
| High H4 | Selected row metadata | `#6B7280` on `#F5F5FA` measured 4.4486:1, below AA 4.5:1. | Selected metadata uses existing `#5C6270`, measuring 5.6238:1. Default faint token is unchanged. Computed-style and axe checks pass. |
| High H5 | Production fetch and whole-report generation | Skeleton was preview-only; forms had no pending/error feedback; action failures were not returned to the interface. | Production report fetching uses Suspense with the reviewed skeleton. Shared action state disables duplicate submission, displays “Generating…”, announces status and gives recoverable errors. Successful generation revalidates Overview; redirects remain framework redirects. Server failures and scope failures are unit-tested; delayed/failed network submission and successful preview retry are browser-tested. Live generation remains unverified. |
| Medium M1 | Every state; tablet/mobile heading | No main landmark or skip link; no accessible H1 below desktop. | Shared frame provides one main landmark, one accessible H1 at every width, and a keyboard-visible skip link. All 36 state/width axe scans pass. |
| Medium M2 | Desktop scroll; loading/error/no-report | Header scrolled to y=-300 after scrolling 300px and disappeared in null-report states. | Header is outside the report scroller and renders neutral metadata without a report. Browser checks confirm 80px height and y=0 after scrolling, including null states. |
| Medium M3 | Desktop/tablet/mobile rows | Negative margins plus `w-full` reduced the content measure; evidence labels moved inward and text wrapped early. Small screens had duplicate top spacing. | Bleed width includes matching horizontal padding; first-row padding is removed below desktop. Screenshot comparisons confirm the intended row alignment and wrapping, with no text-size reduction. |
| Medium M4 | All drawers; mobile targets | Portal inherited Arial; mobile Close was 28px; narrow domain/page labels were fragile. | Explicit Instrument Sans on the portal, 44px mobile Close/link targets, and wrapping evidence metadata. Font and target geometry pass browser assertions. |
| Medium M5 | Subscription hypotheses/experiments | Subscription drawers reused shipping fixtures; recommended tests omitted their hypothesis step. | Fixtures now resolve through the same pure provenance mapper with distinct return, shipping and subscription records. Subscription absence is explicit; both tests include their parent interpretation. Exact stored parents are loaded when omitted from the report section. Unit and seven-row browser checks pass. |
| Medium M6 | Partial/insufficient | Partial counted “1 of 3” instead of two tests and ignored a distinct unresolved return comparison. Insufficient was labelled Partial. | Partial shows “1 of 2 shown · 1 awaiting generation”, two distinct unresolved comparisons and three gaps. Matching comparison/signal unknowns are deduplicated. Insufficient retains its own label. Unit and visual checks pass. |
| Low L1 | Mobile navigation | No explicit Close control. | Added a labelled 44px Close navigation button; Close restores focus to the menu trigger. |
| Low L2 | Provenance list | Decorative span was a direct child of `ol`. | Rail moved to a pseudo-element; the list contains list items. Axe passes. |

A mobile server-rendered slot key warning found during remediation was also corrected. A site-wide `/favicon.ico` 404 remains a Low follow-up: it predates this work and does not affect the report task. The browser runtime-error assertion excludes only that URL; it does not suppress application exceptions or hydration errors.

## Visual comparisons and responsive results

The specification and all six approved HTML files were read and rendered. Actual browser screenshots, not source inspection alone, informed the review. The desktop HTML has a fixed 1440px canvas, so its geometry is the basis of the 1280px check rather than a claim that it is itself responsive.

| Reference | Implementation comparison | Result |
| --- | --- | --- |
| `overview-desktop.html` | Complete at 1440 and 1280 | 240px sidebar; 80px fixed header; 896px report at x=304; 152px gutter + 40px gap + 704px body. Evidence labels, value tracks, section rules, row density, type weights and experiment hierarchy align with Direction A. |
| `overview-evidence-drawer.html` | Desktop hypothesis drawer | 480px panel, no visible scrim, report does not reflow. Sans UI, serif interpretation, mono values, readable provenance chain. |
| `overview-tablet.html` | 834px report and shipping drawer | Two navigation rows and a 480px modal sheet with scrim. Full-width report, corrected type and row spacing. |
| `overview-mobile.html` | 390px report and subscription-test drawer | 52px app bar, stacked sections, two-column fact values and full-width drawer. Controls stay usable; evidence copy wraps. |
| `overview-partial.html` | Partial report | Quiet partial notice and normal report hierarchy retained. Additional unresolved row/count and whole-report generation notice reflect corrected data and accepted action semantics. |
| `overview-states.html` | Loading, no-report, insufficient, generation-required, unresolved, empty-section and error | State structure remains readable. Header/shell retained, no fabricated findings, no per-item generation or unsupported last-report link. |

Accepted differences remain: AA faint text, accessible secondary type, single-control rows, whole-report-only generation, noninteractive single-competitor chip, corrected tablet subtitles, and typographic emphasis for experiments. These are not fidelity defects. Preview evidence page labels describe their actual fixture source type (pricing/offers for shipping-threshold offers; shipping/returns for return windows; subscription for subscription evidence).

Screenshots are in [the capture directory](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a). Key comparisons: [desktop implementation](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/desktop.png), [desktop reference](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-desktop.png), [tablet drawer](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/drawer-834.png), [mobile report](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/390.png), [mobile test drawer](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/drawer-390.png). Final implementation captures temporarily hide only the Next development-tools portal and finish drawer animations for a stable image.

## State and evidence results

All nine routes returned 200 and were checked at 1440, 1280, 834 and 390px:

- `/overview/preview/complete`
- `/overview/preview/partial`
- `/overview/preview/insufficient`
- `/overview/preview/generation-required`
- `/overview/preview/unresolved`
- `/overview/preview/empty-section`
- `/overview/preview/no-report`
- `/overview/preview/loading`
- `/overview/preview/error`

Unknowns say “Not established”; they never display equality, zero or a fabricated value. Partial content remains available. Unresolved rows explain the missing comparison; empty sections explain the lack of supported findings. Generation-needed rows expose no item-level action. Error text explains recovery and preserves the shell. The preview retry refreshes the preview; it is not evidence that a real backend failure recovered.

All seven complete-report buttons were exercised: owned return advantage, competitor shipping advantage, competitor subscription advantage, both hypotheses and both experiments. Return evidence stays at 60/30 days without shipping values. Shipping stays at $75/$50. Subscription uses explicit owned absence and competitor presence, with Subscription page labels. Tests include report → interpretation → comparison → evidence. No raw UUIDs, hashes or comparison keys are prominent in drawer content. Selecting a new report version remounts selection to prevent carrying the prior report's drawer position into new results.

## Accessibility checks

Target: WCAG 2.1 AA, with applicable WCAG 2.2 AA target checks and axe best-practice rules. Detailed criterion notes are in [accessibility-audit.md](/Users/yug/Desktop/RivalLens/accessibility-audit.md).

- Axe-core 4.13.0 through `@axe-core/playwright`: no violations in the 36 state/viewport scans, plus drawer scans at all four widths and the loading-announcement regression.
- Keyboard: skip link, Enter activation, tab order, visible row focus, modal Tab/Shift+Tab containment, Escape, Close, invoking-row restoration, desktop switching and mobile navigation dismissal.
- Semantics: one H1 and main landmark, H2 section titles, labelled dialogs, native row buttons, no nested interactive controls, valid ordered list, status/alert messages. The loading announcement is outside the busy skeleton so `aria-busy` does not defer it.
- Contrast: default faint on white 4.8345:1; on report ground 4.7152:1; selected muted 5.6238:1; indigo against selected surface 7.2723:1. Status and confidence have text/shape semantics beyond color.
- Targets: mobile menu, refresh, Close, drawer footer link and state actions are at least 44px high; report rows provide large single targets. Desktop/tablet drawer Close retains the approved 28px size.
- Reflow: no page or drawer horizontal overflow at 320, 600, 833, 1000 and 1279px with increased text spacing, in addition to the four standard widths. Tested 1.5 line height, .12em letter spacing, .16em word spacing and 2em paragraph spacing. No breakpoint-specific layout failure found.
- Native Chrome Guest UI showed **Zoom: 200%**. The report reflowed to the mobile structure; the full-width evidence drawer, Close and footer remained visible. Native pointer scrolling then returned `noWindowsAvailable`, so this was a limited native zoom pass; automated scrolling/reflow provides the additional coverage.
- Reduced-motion preference reduces the drawer animation to 0.01ms. Initial review also checked deuteranopia simulation; uncertainty and status remain distinguishable by wording and shape.
- Real VoiceOver was attempted; the native tool timed out and no running VoiceOver process was confirmed. No speech-output or screen-reader-conformance claim is made. This gate remains open.

## Frontend implementation review

The database loader is server-only and uses the supplied authenticated Supabase client. Pure evidence normalization/presentation is separated from loading so previews and regressions use the same mapper. Referenced rows are batched and validated; there is no privileged client, migration, provider integration or public API change. The client receives presentation models without raw provenance identifiers. The generation result is an internal typed union; server exceptions are not exposed to users.

The shared Overview frame removes the duplicated preview/production shell and establishes the stable report scroller. Client action state is confined to its provider/forms and interactive report/drawer. No broad component rewrite, styling refactor, or other-screen implementation was justified. The onboarding Button stub remains unchanged.

## Commands and exact results

Runtime: Node **22.21.0**, selected with `/Users/yug/.local/share/fnm/node-versions/v22.21.0/installation/bin` at the front of PATH. Required commands ran from the repository root.

| Command | Final result |
| --- | --- |
| `pnpm lint` | PASS, exit 0; zero ESLint warnings. |
| `pnpm typecheck` | PASS, exit 0. |
| `pnpm test:unit` | PASS, exit 0; **25 files / 366 tests**. |
| `pnpm --filter @rivallens/web build` | PASS, exit 0; Next.js 15.5.25 compiled, checked types and generated 17 static pages. Overview first-load JS: 158 kB. |
| `git diff --check` | PASS, exit 0. |
| `pnpm exec playwright test` | PASS, exit 0; **12 tests** (1.8 minutes). |
| `pnpm exec vitest run --config vitest.config.ts tests/unit/overview-provenance.test.ts tests/unit/overview-action.test.ts tests/unit/overview-view-model.test.ts` | PASS, exit 0; **3 files / 37 tests**. |
| `pnpm exec playwright test -g 'generation exposes|loading announcement'` | PASS, exit 0; **2 tests**. |

Intermediate failures were resolved: a return fixture used the normalized payload shape instead of the raw duration/unit contract; test mocks initially targeted the wrong Next package resolution; an assertion expected the wrong existing muted token; the Next route announcer made an unscoped alert locator ambiguous; the site-wide favicon 404 tripped the runtime-error assertion; and one drawer size assertion needed decimal tolerance for a 479.99994px browser bounding box. The final tests retain coverage for the actual application behavior. No remaining test failure is being hidden as a pass.

## Remaining gates and intentionally unchanged items

1. **Authenticated production QA:** `/overview` still returns 500 in this environment because `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are unavailable. Recheck saved-report evidence after a real newer capture, missing evidence under real RLS, report-fetch loading/errors, generation success/failure and refresh with an authenticated organization. Mocked loader/action tests do not replace this.
2. **Real screen-reader QA:** complete a VoiceOver/Safari or VoiceOver/Chrome pass for reading order, drawer announcement, focus return and generation/loading/error announcements. The native automation timeout prevents sign-off here.
3. **Low follow-up:** site-wide favicon 404. No report interaction is affected; branding/favicon work is outside this correction pass.

The accepted design decisions, existing onboarding stub and unrelated components were intentionally left as specified. No other RivalLens screen was started. Production acceptance remains withheld until the two verification gates are closed.

## Files changed during QA

Product, test and report files:

- [accessibility-audit.md](/Users/yug/Desktop/RivalLens/accessibility-audit.md)
- [apps/web/src/app/(app)/overview/actions.ts](/Users/yug/Desktop/RivalLens/apps/web/src/app/(app)/overview/actions.ts)
- [apps/web/src/app/(app)/overview/page.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/app/(app)/overview/page.tsx)
- [apps/web/src/app/(app)/overview/preview/[state]/page.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/app/(app)/overview/preview/[state]/page.tsx)
- [apps/web/src/components/app-shell/app-mobile-bar.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/app-shell/app-mobile-bar.tsx)
- [apps/web/src/components/overview/completeness-notice.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/completeness-notice.tsx)
- [apps/web/src/components/overview/evidence-drawer.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/evidence-drawer.tsx)
- [apps/web/src/components/overview/generation-form.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/generation-form.tsx)
- [apps/web/src/components/overview/item-row.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/item-row.tsx)
- [apps/web/src/components/overview/overview-frame.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/overview-frame.tsx)
- [apps/web/src/components/overview/overview-report.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/overview-report.tsx)
- [apps/web/src/components/overview/report-header.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/report-header.tsx)
- [apps/web/src/components/overview/report-rows.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/report-rows.tsx)
- [apps/web/src/components/overview/report-section.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/report-section.tsx)
- [apps/web/src/components/overview/report-states.tsx](/Users/yug/Desktop/RivalLens/apps/web/src/components/overview/report-states.tsx)
- [apps/web/src/lib/overview/preview-fixtures.ts](/Users/yug/Desktop/RivalLens/apps/web/src/lib/overview/preview-fixtures.ts)
- [apps/web/src/lib/overview/provenance-evidence.ts](/Users/yug/Desktop/RivalLens/apps/web/src/lib/overview/provenance-evidence.ts)
- [apps/web/src/lib/overview/provenance-view.ts](/Users/yug/Desktop/RivalLens/apps/web/src/lib/overview/provenance-view.ts)
- [apps/web/src/lib/overview/provenance.ts](/Users/yug/Desktop/RivalLens/apps/web/src/lib/overview/provenance.ts)
- [apps/web/src/lib/overview/report-view.ts](/Users/yug/Desktop/RivalLens/apps/web/src/lib/overview/report-view.ts)
- [apps/web/src/lib/overview/types.ts](/Users/yug/Desktop/RivalLens/apps/web/src/lib/overview/types.ts)
- [docs/qa/overview-direction-a.md](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a.md)
- [package.json](/Users/yug/Desktop/RivalLens/package.json)
- [playwright.config.ts](/Users/yug/Desktop/RivalLens/playwright.config.ts)
- [pnpm-lock.yaml](/Users/yug/Desktop/RivalLens/pnpm-lock.yaml)
- [tests/frontend/overview.spec.ts](/Users/yug/Desktop/RivalLens/tests/frontend/overview.spec.ts)
- [tests/unit/overview-action.test.ts](/Users/yug/Desktop/RivalLens/tests/unit/overview-action.test.ts)
- [tests/unit/overview-provenance.test.ts](/Users/yug/Desktop/RivalLens/tests/unit/overview-provenance.test.ts)

Screenshot artifacts:

- [1280.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/1280.png)
- [390.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/390.png)
- [834.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/834.png)
- [desktop.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/desktop.png)
- [drawer-1440.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/drawer-1440.png)
- [drawer-390.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/drawer-390.png)
- [drawer-834.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/drawer-834.png)
- [empty-section.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/empty-section.png)
- [error.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/error.png)
- [generation-required.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/generation-required.png)
- [insufficient.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/insufficient.png)
- [loading.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/loading.png)
- [no-report.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/no-report.png)
- [partial.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/partial.png)
- [ref-1280.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-1280.png)
- [ref-390.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-390.png)
- [ref-834.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-834.png)
- [ref-desktop.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-desktop.png)
- [ref-drawer.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-drawer.png)
- [ref-partial.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-partial.png)
- [ref-states.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/ref-states.png)
- [unresolved.png](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a/unresolved.png)

`receipts/receipts.jsonl` was appended by tooling. `qa-complete-1440.png` is the pre-existing initial-review capture; neither was manually edited as part of the application remediation.
