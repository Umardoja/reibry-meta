# Preexisting REIBRY work

## Source provenance

- Foundation: the existing September REIBRY application.
- Source workspace: C:\Users\HomePC\Documents\reibry
- Source branch at inspection: feat/integration
- Source commit: 76d3494465bab43a5051498e90b9a486a65312b9
- Inspection date: 2026-10-27 (Africa/Lagos).
- Source working tree: clean at inspection.

REIBRY's original contributors retain authorship and applicable rights in their work. No source license file was identified in the initial inspection; this document grants no new license or publication permission. Before each code or asset migration, verify team permission and preserve applicable copyright, license notices, and contributor attribution using source-file and commit references. Do not import historical commits, alter dates, or describe inherited functionality as newly invented.

## Inherited foundation and planned migration

The source already contains Next.js, React, TypeScript, Supabase/PostgreSQL persistence, Capacitor integration, shared UI, authentication, Memory, text/link Capture, lexical/semantic retrieval, conversational Home, Plans/Ready Packs, and AI provider abstractions. These are preexisting capabilities, not Meta Hackathon inventions. This inventory is not a fresh end-to-end validation of the source.

Existing hardening observed includes safe authentication redirect validation, database ownership constraints and row-level security, server-side admin checks, and constrained source fetching. Preserve and test these when their respective stages are ported. Source references include src/lib/auth/next-destination.ts, src/lib/auth/admin.ts, supabase/migrations/20260919000000_initial_foundation.sql, and docs/ANDROID_CAPTURE_RELIABILITY.md.

Stages 2-9 are planned selective ports. Stages 10-12 are planned new Meta integration, grounded action planning, and confirmed execution; none is implemented here. Stages 13-14 will validate and document actual results. Official API support, access, endpoints, and model availability must be verified before implementation.

## Stage 1 boundary

Only new repository documentation, ignore rules, and empty environment-variable declarations are included. No application code, LFS content, private documents, dependencies, generated output, databases, production configuration, sessions, or secrets are copied. The original Git history is not imported.

A previous access check triggered an unintended LFS transfer to the destination remote without publishing Git refs. Remote cleanup is unconfirmed. This recovery creates a local commit only; publishing remains blocked on owner resolution and separate push authorization.
