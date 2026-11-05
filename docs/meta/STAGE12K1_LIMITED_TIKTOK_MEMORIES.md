# Stage 12K-1 — Making limited TikTok Memories useful

Branch `feat/original-product-parity`, starting from `e9f581b`. Local only; nothing was pushed or deployed. No migrations were run, no Meta model calls were made, and no paid vendor calls were made.

**Starting point.** The owner tested on a physical iPhone. TikTok → Apple Shortcut → Capture works, and the Shortcut receives only the URL. Enrichment returns little beyond the creator, because TikTok's oEmbed leaves out the title, caption and cover. Stage 12K covers this. The Shortcut was left as it is.

## A. What improved for a TikTok with no metadata

| Before | After |
|---|---|
| The Memory showed "Saved TikTok video · @creator" and nothing else to search or recognise it by. | After the save, one optional question appears: **What caught your eye?** The answer is stored as the user's own note. It is searchable, cited to Home as `user_note`, and shown on the Memories card. |
| The Capture screen led with a tall intro, a 120 px box and tips; Save sat at 576 px on a 390 × 844 screen. | On a share handoff the intro sentence and tips step aside and the box shrinks to fit the link. **Save sits at 266 px.** |
| "Open on TikTok" was the only way to see the video again. | **Preview video** loads TikTok's official player only when tapped. "Open on TikTok" stays the first action. |

Nothing claims that a caption, cover or transcript was extracted. The limited-details message, the "Not known yet → A caption or description" line and the generic title "Saved TikTok video" are all unchanged.

## B. After-save optional note

- **Where it shows:** `src/components/capture/capture-form.tsx`, the `WhatCaughtYourEye` component. It appears only after the save is acknowledged and details have settled as limited (or the details request failed), and only if the Memory has no note yet.
  - It never shows for a complete YouTube or web save.
  - It is not focused automatically, so the keyboard doesn't pop up.
  - **Skip** removes it immediately; ignoring it costs nothing.
- **How it saves:** through the existing owner-only `PATCH /api/memories/:id` with `{ rawText }`, which `parseUpdateMemory` already allows.
  - No new route, contract or migration.
  - Title, source URL, metadata and provenance are untouched (unit test and live check).
- **Voice:** a plain `<textarea>` at 16 px (so iOS does not zoom), with the hint "You can use the keyboard's microphone to speak". REIBRY records no audio; a test asserts there is no `getUserMedia` or `MediaRecorder`.
- **Same answer as a typed note:** it is the same field "Why are you saving this?" writes at capture time. The Memory detail page shows it under "Your note", where it can be edited.

## C. Search and Home evidence (live, test User A, the real affected TikTok `a5ec8a60…`)

- **Shared:** @elsie.lizzy0 via `vt.tiktok.com/ZSg3F9G3P`. Enrichment stays `partial` / `provider-returned-no-title`, with caption `null`.
- **Re-shared through the Shortcut handoff:** the result was "Already saved", the same Memory and no duplicate. Memories stayed at 29 before and after.
- **Note added:** "Test note (Stage 12K-1 QA): weekend market idea to revisit". It was acknowledged in 0.89 s and persisted after reload. Title "TikTok video" and source URL are unchanged.
- **Search:**
  - "weekend market idea" → #1 is the real TikTok (0.97 s).
  - "market idea revisit" → #1 is the real TikTok.
  - Each result's `sourceDetails.userNote` holds the note and `caption` is `null`. Home builds `link_details.user_note` from exactly that; a unit test covers `toModelEvidence`. No Meta call was made.
- **Skip on the second real TikTok** (`c91ccd20…`, @temizy_001): the question was shown, disappeared on Skip, and the note is still `null`.
- **User B:** read 404, PATCH 404, search 0 results. User A's note is unchanged after B's attempt.
- **Plans and Ready Packs:** 3 Plans before and after; the Ready Packs payload is identical (3,487 bytes before and after).

**Note for the owner:** the QA note stays on the real Memory, because the update contract does not allow an empty note. Change or replace it under **Edit title or note** on that Memory.

## D. Official TikTok player: works in Chrome; Safari not physically tested

Source: <https://developers.tiktok.com/docs/en/embed-player>. The iframe is `https://www.tiktok.com/player/v1/{post_id}`, with `description` (default 0), `music_info`, `autoplay` (default 0) and `rel` options.

- **URL:** built only by `tiktokPlayerUrl()` in `src/lib/memory/presentation.ts`.
  - It uses the verified numeric `metadata.postId` (15–21 digits) and requires a TikTok link Memory.
  - Parameters: `?autoplay=0&description=1&music_info=1&rel=0`.
  - No HTML from TikTok is used, and nothing is scraped or downloaded.
- **Loaded only on request:** the iframe exists only after **Preview video** is tapped, and it can be hidden again.
  - Attributes: `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"` and `referrerPolicy="strict-origin-when-cross-origin"`, so the Memory ID is not sent.
  - Note under the player: "Played by TikTok's own player. REIBRY doesn't read, save or search what it shows."
- **Framing:** the player page returns 200 with no `X-Frame-Options` and no `frame-ancestors`, so it can be embedded. It is a 39 KB app, not the WAF "Please wait" page.
- **Desktop Chrome, headless, at 390 and 1440 px:**
  - The player loads (`player/v1/7696611605374602518` → 200), at 325 × 578.
  - It showed the creator's display name, the handle, the video frame with its burned-in on-screen text, and the TikTok logo. Nothing autoplayed.
  - On first use, TikTok shows its own cookie consent banner over the lower half.
- **Not confirmed:**
  - Whether the description line appears once the cookie banner is dismissed. Headless Chrome drew TikTok's cross-origin frame unreliably after interaction.
  - No `onPlayerReady` postMessage was observed; only TikTok's analytics SDK `[tea-sdk]ready`.
- **iPhone user agent:** with an iPhone Safari user agent in Chrome (a simulation, **not Safari and not a physical iPhone**), the result was the same.
- **Physical iPhone check (1 minute):** open the real TikTok Memory → **Preview video** → note whether the video plays inline and whether a description line appears under the cookie banner. If it fails, **Open on TikTok** stays the first button, unchanged.

## E. Mobile screenshots (`test-results/stage12k1/`, ignored by git)

| Check | 390 px | 1440 px |
|---|---|---|
| Capture handoff | Box at 99 px, Save at 266 px, intro and tips hidden (`capture-handoff-390.png`) | 430 px app, centred (left 505), no sidebar |
| Plain Capture (not a handoff) | Unchanged: intro, 120 px box, tips (`capture-plain-390.png`) | — |
| After save + question | `capture-saved-ask-390.png`, `capture-note-added-390.png` | — |
| Memory details + player | `memory-detail-390.png`, `player-390-chrome.png` | `memory-detail-preview-1440.png`, `player-1440.png`: 430 px, centred |
| Memories list | Card reads "@elsie.lizzy0 · Test note (Stage 12K-1 QA)…" | 430 px, centred |

At both widths there is no horizontal overflow, and the five tabs are Home, Memories, Capture, Plans and Account. These are desktop Chrome emulations, not a physical iPhone.

## F. Specialist vendors: Supadata

**Sources:** docs.supadata.ai (`get-metadata`, `llms.txt`), supadata.ai/pricing, /privacy and /terms, read 2026-10-31. **Recommendation: conditional GO for a separately approved, free-tier trial only. NO-GO for production.**

| Question | Finding |
|---|---|
| **TikTok coverage** | `GET /v1/metadata?url=` accepts TikTok `www`, `vm.` and `m.` URLs. `vt.tiktok.com` (the owner's links) is **not listed**. Transcripts are also offered for TikTok. |
| **Fields** | A unified schema with nullable `title` and `description`, an author, stats, `media.thumbnailUrl` and `tags`. The documentation does **not** say TikTok's caption maps to `description`. |
| **How data is obtained** | Not documented. The terms say data comes "from public sources supplied by third-party providers", which is most likely scraping. |
| **Rights and compliance** | Terms §5 put compliance with "the terms of service of any platform to which the data relates" on the customer. Creators keep their IP rights. The service is best-effort, "as is". |
| **Privacy and retention** | Dumpling Software UG, Berlin, under GDPR, acting as processor. Job results are deleted after 1 h (24 h for batch). Public results may be cached for about 10 minutes. Request logs (including IP) are kept for the length of the relationship. Some sub-processors are in the US. |
| **Cost** | Free plan: 100 credits a month, no card. A metadata call costs 1 credit. A native transcript costs 1 credit; an AI-generated one costs 2 credits per minute. Pro is $17 a month for 3,000 credits. |
| **Reliability** | Rate limits are 1 request/s on the free plan and 10/s on paid plans. Fields are "subject to change based on platform API availability". |

**Trial plan, if the owner approves it separately:**
1. The owner creates the free account and keeps the key in `.env.local`.
2. Test 5–10 **public** TikToks the owner chooses (not other people's saved Memories), resolving `vt.` links to canonical URLs first.
3. Record whether `description` really holds the caption, plus speed and failure rate.
4. Ship only behind a per-Memory, opt-in "Look up details with Supadata" action, with `supadata` provenance. That would need the RPC allowlist migration proposed in Stage 12K.

## G. Tests and build

- `npm run lint`: 0 errors (the same 4 old warnings).
- `npm run typecheck`: OK.
- `npm test`: **304/304**. That includes the new `tests/after-save-context.test.ts` (4 tests) and the production smoke test, run after a fresh build.
- `npm run build`: OK. The dev server was stopped for the build and restarted afterwards; the private `/capture` returns 200.
- `git diff --check`: OK.

## H. Commit

One local commit: `feat(capture): optional after-save note, compact share handoff, on-request TikTok player`.

## I. What still cannot be obtained automatically

- TikTok's caption or description, cover image, title, hashtags, transcript and what happens in the video.
  - Official oEmbed now omits them, and the public page is behind a bot check, which REIBRY does not bypass.
  - The Shortcut receives only the URL.
- What TikTok's player displays is visible to the user only. REIBRY does not and cannot read it from the cross-origin frame, and it is never stored or searched.
- An automatic route would need an outside vendor such as Supadata, with the owner's separate approval, the trial above and the proposed migration.
