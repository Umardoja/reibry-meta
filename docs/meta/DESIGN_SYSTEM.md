# Stage 3 design inventory and dependency map

Source: original REIBRY, commit 76d3494465bab43a5051498e90b9a486a65312b9.
Original REIBRY contributors retain authorship and applicable rights. This local port does not grant a publication license. No repository license file was identified; owner permission review remains required before publication.

| Source | Reusable material | Dependency decision |
| --- | --- | --- |
| src/app/globals.css | Brand/surface/text/semantic tokens, 4-48px spacing, radii/shadows, typography, card/button/input/header/nav/modal/skeleton appearance | Extract selected rules into tokens.css and focused global CSS. No Tailwind or feature-specific rules. |
| src/components/ui/primitives.tsx | PageContainer / StatePanel presentation conventions | Adapt typed Container, Card, Button, TextField, Skeleton wrappers, no data dependencies. |
| src/components/ui/modal.tsx | Rounded modal sheet and close callback pattern | Adapt to native dialog for modal focus containment, Escape, focus restoration and background inertness, plus explicit Tab/Shift+Tab wrapping. Browser-only code isolated in a client component. |
| src/components/design/icons.tsx | Inline brain SVG and currentColor/stroke conventions | Port only brain mark, with source attribution; no icon dependency. |
| src/components/layout/app-shell.tsx | Compact brand header and mobile shell | Remove authentication, admin fetch, account menu and route detection. |
| src/components/layout/navigation.tsx | Navigation surface, active state and touch layout | Link only to existing root and same-page UI guide; no future feature destinations. |
| src/app/layout.tsx | Language, theme color, skip link convention | Retain metadata and add safe-area viewport; omit all providers, PWA and native session code. |
| src/components/design/memory*.tsx | Feature-specific cards and titles | Excluded: Memory types, enrichment and feature behavior. |
| public/fonts/geist-latin.woff2 | Original local font | Not copied: no adjacent license verified. Retain Geist/Inter/system-ui stack with system fallback, a known fidelity limitation. |
| public/icons/icon.svg and raster assets | Existing icon/imagery | Inspected SVG; no external assets imported. Use source inline brain brand mark instead. |
| src/components/app-shell/ | Requested candidate path | Does not exist; actual shell is under components/layout/. |

Dependency graph: root layout -> presentation AppShell -> BrandMark; root page -> UI primitives + client FoundationPreview -> Modal + Button/TextField. All component imports are React, Next.js Link or local UI. No API, auth, storage, model provider or Node-only module enters application components.

New adapters, local UI-preview interaction and accessibility fixes are engineering work for this port, not new Meta AI functionality. The preview field is explicitly unsaved and only demonstrates a form control. The dialog explains the current foundation; it does not execute a future product feature.

## Verification and limits

The Stage 3 migration log records command results, corrections, contrast ratios and browser findings. Browser checks were run against the production build through the in-app browser, not mocked DOM output.

Repeat browser checks at 390x844, 430x932 and 1440x1000: inspect overflow and card stacking; Tab to the skip link; activate it; open About; cycle Tab and Shift+Tab across the modal boundaries; press Escape and confirm trigger focus returns. At 390x360, verify internal content scrolling and reachable close controls. Type into the preview field and reload to confirm it is not persisted. Follow both real navigation links.

Reduced-motion rules disable animation/transition; safe-area environment insets protect the shell and dialog. Actual OS reduced-motion emulation, physical notch/keyboard behavior, screen readers and other browser engines were not tested. Font fidelity is limited to the original stack's system fallback until licensed font provenance is verified.
