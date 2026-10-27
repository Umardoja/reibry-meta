# REIBRY Meta Edition

**From Saved to Done**

A personal AI memory and action platform, developed incrementally for the Meta Global AI Developer Hackathon 2026.

## Current milestone

Stage 2 adds a minimal Next.js App Router application with React, TypeScript, ESLint, and a responsive starter page. It is a foundation screen, not a working AI product.

The page uses a small selection of the original REIBRY green/mint color values. Its layout and CSS are newly authored for this milestone. No source assets, full design system, application services, or private data were imported.

## Run locally

Use Node.js 22.18 or newer and npm. Validation uses Node.js 24.20.0 and npm 11.19.0.

~~~sh
npm ci
npm run dev -- --hostname 127.0.0.1
~~~

Open http://127.0.0.1:3000. No environment variables or backend services are required for this stage.

~~~sh
npm run lint
npm run typecheck
npm run build
npm test
npm start -- --hostname 127.0.0.1
~~~

The typecheck command generates Next.js route types before running TypeScript. Next.js generates next-env.d.ts locally; it stays ignored, along with node_modules, .next, and incremental TypeScript output. Plain CSS and system fonts avoid extra styling dependencies and external font requests.

## Provenance and scope

This edition builds on the existing September REIBRY application. The dependency versions, strict TypeScript configuration approach, ESLint presets, and selected brand colors are derived from source commit 76d3494465bab43a5051498e90b9a486a65312b9. Original REIBRY contributors retain attribution and applicable rights. See PREEXISTING_WORK.md and docs/meta/MIGRATION_LOG.md.

Authentication, Supabase integration, Memories, Capture, retrieval, conversational Home, Plans, Ready Packs, Meta API calls, and action execution are not implemented here. No production service is connected.

Stage 3 may selectively port shared styling and reusable UI primitives after a separate scope and permission review. It must not introduce application features or backend integrations.

## Local-only release status

Stage 1 and Stage 2 remain local. The earlier remote LFS storage incident remains unresolved; no push is authorized. The local, untracked recovery report is not a release artifact. Do not publish inherited code or assets without appropriate permission.

## Validation

Stage 2 passed lint, typecheck, a production Turbopack build, and the production HTTP smoke test on Windows. The smoke test starts an isolated localhost server after a build, verifies root-page text/landmarks, stylesheet delivery, and a missing-route 404, then stops it. Run npm run build before npm test.

The page uses semantic HTML, an English document language, high-contrast text, fluid typography, and wrapping layout. No interactive controls or animation are present. Browser screenshot and assistive-technology testing have not been performed.

Installation reported a deprecation warning for the source-pinned ESLint 9.39.5 and an unapproved transitive unrs-resolver install script. No extra scripts were approved; all listed validation commands passed with the installed packages. No dependency security audit was run.
