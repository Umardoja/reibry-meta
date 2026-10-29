# Visual parity results

## Comparison basis

Stage 10 compared the actual original route and component source, design tokens, inline SVG icon set, and production CSS—not the earlier design-reference prototype. The restored Meta implementation uses the original 430px mobile-first application frame, compact header, fixed safe-area-aware five-destination navigation, typography hierarchy, mint surfaces, card radii, spacing and conversational composer layout.

| Viewport | Result | Limits |
|---|---|---|
| 390 × 844 | UNVERIFIED | Protected screens require an approved disposable session; the available Windows controller exposed no viewport resize |
| 430 × 932 | UNVERIFIED | Same limitation |
| 1440 × 1000 | PARTIAL | Production HTTP render passed, but the controller timed out while navigating its existing Chrome tab to the new isolated port |

Source-level parity is verified for shell geometry, route headings, navigation order, semantic colors, focus treatment, minimum control sizes, reduced motion and mobile safe-area padding. The production smoke test verified the restored Home markup, main navigation and stylesheet. Pixel-perfect parity is **not claimed**. Authenticated content, route dialogs, bottom sheets and real persisted refresh states remain unverified without a disposable backend.

## Deliberate differences

- The original bundled Geist font is not copied because reuse/publication permission was not established; the same CSS stack falls back to system sans-serif.
- Original bitmap/PWA assets were not copied in this stage. The safe inline brain mark and icons are source-level SVG presentation.
- Hardened Meta auth, Capture, Memory, Ask and Action boundaries replace older data wiring.
- Missing Today/Life/Plans/Ready Pack services show explicit deferred states rather than fixtures or false success.
- Stage 8/9 citations, proposal review and Action Cards remain visibly separate Meta additions.
