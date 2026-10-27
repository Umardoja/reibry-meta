# REIBRY Meta Edition

**From Saved to Done**

A personal AI memory and action platform, developed incrementally for the Meta Global AI Developer Hackathon 2026.

## Current milestone

Stage 3 adds REIBRY's shared visual foundation to the independent Stage 2 Next.js app: brand and semantic tokens, typography conventions, spacing, surfaces, cards, button variants, labeled inputs, skeleton styling, a presentation-only shell and an accessible dialog.

The root page is a development foundation. Its About button opens a real explanatory dialog. The text field is an explicitly labeled, unsaved UI preview; the loading sample is not a network request. Navigation points only to the root and an existing page section.

## Run locally

Use Node.js 22.18 or newer and npm. Validation uses Node.js 24.20.0 and npm 11.19.0 on Windows.

~~~sh
npm ci
npm run dev -- --hostname 127.0.0.1
~~~

Open http://127.0.0.1:3000. No environment variables or backend services are required.

~~~sh
npm run lint
npm run typecheck
npm run build
npm test
npm start -- --hostname 127.0.0.1
~~~

Build before running the production HTTP smoke test. It starts an isolated localhost server, checks rendered content, UI markup, stylesheet delivery and missing-route behavior, then stops the server. Next.js generates ignored next-env.d.ts locally. Dependencies, .next and TypeScript build output remain ignored.

## Design provenance

The original September REIBRY source is 76d3494465bab43a5051498e90b9a486a65312b9. The Stage 3 inventory and dependency map are in docs/meta/DESIGN_SYSTEM.md; PREEXISTING_WORK.md and docs/meta/MIGRATION_LOG.md preserve the wider history.

Selected tokens and styles come from the original globals.css. The inline brain mark comes from components/design/icons.tsx. The shell, navigation and UI primitives adapt the original presentation conventions. The modal replaces the source portal with native dialog behavior plus explicit keyboard wrapping. These are inherited UI and adaptation work, not new Meta AI functionality.

Original REIBRY contributors retain attribution and applicable rights. No publication license is inferred. No private or binary assets were copied. Geist/Inter/system-ui remains the typography stack, but the local Geist binary was omitted because its accompanying license was not verified; system fallback is a known fidelity limitation.

## Scope and release status

No authentication, Supabase, API routes, Memories, Capture, retrieval, Plans, Ready Packs, native sessions, PWA registration or AI integration is present. No new package was added in Stage 3. Only the preview and dialog are client components; the application shell remains presentation-only.

All milestones remain local. The earlier remote LFS incident is unresolved. No push or remote LFS operation is authorized; the untracked recovery report is not a release artifact.

Stage 4 should cover authentication and session architecture only, with separate authorization, newly provisioned disposable configuration and isolated tests. Do not connect production or introduce later-stage features.

## Validation notes

The migration log records exact Stage 3 command and browser results. Browser QA uses the production build at 390px, 430px and 1440px, with keyboard navigation and dialog checks. Screen-reader testing, physical-device safe areas and exact licensed-font rendering remain outside this verification.

The source-pinned ESLint 9.39.5 deprecation warning and unapproved transitive unrs-resolver install script from Stage 2 remain unchanged. No dependency upgrades or script approvals were made in Stage 3.
