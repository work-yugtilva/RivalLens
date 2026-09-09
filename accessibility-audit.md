# RivalLens Overview accessibility audit

Audited 2026-09-08 against WCAG 2.1 AA, with applicable 2.2 AA target checks. Scope: Direction A `/overview`, nine preview states, evidence drawer and responsive navigation. This audit used the requested accessibility-audit and WCAG audit patterns skills. See the [complete QA report](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a.md) for original findings, fixes, screenshots and the exact changed-file manifest.

**Accessibility sign-off remains pending a real screen-reader pass.** The identified keyboard, landmark, contrast, target and state-message defects have been corrected. Passing automated checks is not a claim of full WCAG conformance.

## Findings by principle

| Principle / criterion | Initial issue | Remediation and verification |
| --- | --- | --- |
| Perceivable — 1.4.3 Contrast (Minimum) | Selected metadata was 4.4486:1. | Existing darker muted token gives 5.6238:1. Default `#6B7280` stays at 4.8345:1 on white and 4.7152:1 on report ground. Computed colors and axe scans verified. |
| Perceivable — 1.3.1 Info and Relationships | Main/H1 missing on some layouts; non-list decoration directly under `ol`. | One main and H1 at all widths; section H2s; drawer H2/H3; rail is a pseudo-element. Native buttons remain single controls. |
| Operable — 2.4.1 Bypass Blocks | No skip navigation. | Keyboard-visible Skip to report targets focusable main. Tested Tab → Enter. |
| Operable — 2.4.3 Focus Order; 2.1.1 Keyboard | Drawer dismissal lost invoking-row focus; desktop switching dismissed the panel. | Enter opens, Close receives focus, Escape/Close restore the invoking button. Modal Tab and Shift+Tab wrap between drawer controls; desktop report rows switch content without closing the panel. Tested seven rows at four widths. |
| Operable — 2.4.7 Focus Visible | Existing row focus indication needed preservation. | Indigo inset focus remains. Skip link and Close controls have visible focus styling. No focus-style redesign. |
| Operable — 2.5.8 Target Size (Minimum), 2.5.5 enhanced target guidance | Mobile Close was 28px and mobile nav lacked an explicit Close. | Mobile Close/navigation/refresh/state controls and drawer footer link provide at least 44px height. Desktop/tablet Close remains 28px, exceeding the 24px minimum. |
| Robust — 4.1.2 Name, Role, Value | Drawer naming and button composition required verification. | Named Radix dialog, native buttons, no nested controls, expanded state and labelled icon controls checked. |
| Robust — 4.1.3 Status Messages; Understandable — 3.3.1 Error Identification | Generation had no pending or recoverable error feedback. | Status and alert regions; visible Generating label and disabled submission while pending. Server errors are safely worded. Loading announcement sits outside `aria-busy`. Browser network failure/retry and action unit tests pass. |
| Perceivable — 1.4.10 Reflow; 1.4.12 Text Spacing | Narrow-width wrapping and spacing needed correction. | Tested required widths and 320/600/833/1000/1279px with increased spacing; no horizontal page/drawer overflow. Native Chrome 200% zoom rendered readable report and drawer. |

No confirmed accessibility Blocker was found. Original High accessibility/interaction items H2–H5 and Medium M1/M4 were remediated; both Low navigation/list fixes were completed. The detailed severity list, including non-accessibility issues, is in the QA report.

## Methodology and results

- Automated: Playwright 1.63.0 with axe-core 4.13.0; tags `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`, `best-practice`. All nine states scanned at 1440, 1280, 834 and 390px; additional drawer/loading scans. Zero reported violations. Assertions are retained in [overview.spec.ts](/Users/yug/Desktop/RivalLens/tests/frontend/overview.spec.ts).
- Keyboard: skip link; native-button activation; Close focus; Escape and Close return; modal focus containment; desktop switching; mobile navigation close/return. All seven report rows tested at four widths.
- Visual: approved HTML references rendered in-browser; fonts, type sizes, status distinctions, selected/focus contrast and target dimensions checked. Screenshots retained in [the QA captures](/Users/yug/Desktop/RivalLens/docs/qa/overview-direction-a).
- Reflow: four standard widths plus 320/600/833/1000/1279px. Increased line height to 1.5, letter spacing to .12em, word spacing to .16em and paragraph spacing to 2em. Page and drawer scroll widths did not exceed their visible widths.
- Native zoom: Chrome Guest UI confirmed 200%. Report reflow and drawer presentation were inspected. Native pointer scrolling later failed with `noWindowsAvailable`; this limits that manual zoom pass.
- Motion/color: reduced motion reduces drawer animation to 0.01ms. Initial deuteranopia check retained textual and shape distinctions. No essential information depends only on color. No time limits, media, audio, flashing or complex gestures exist in this screen.
- Screen reader: native VoiceOver launch/inspection was attempted but timed out; no running VoiceOver process was confirmed. Accessibility-tree checks are recorded separately and do not establish speech output or announcement quality.

## Remaining verification roadmap

1. Complete a real VoiceOver/Safari or VoiceOver/Chrome pass. Verify page heading/landmarks, row announcement verbosity, dialog title, provenance reading order, focus return and loading/generation/error announcements.
2. Run authenticated `/overview` with configured Supabase environment and confirm live request announcements, retry and report refresh. The local route currently returns 500 for unavailable Supabase URL/anon-key configuration.
3. Treat the site-wide missing favicon as a separate Low product-polish follow-up. It has no accessibility effect and is the only resource URL excluded from the browser suite's console-error assertion.

This report intentionally makes no certification, legal-compliance, or complete screen-reader-conformance claim. The original design decisions and onboarding Button stub remain unchanged.
