# Capture Parity and Repair (Stage 12I)

Date: 2026-10-30 (Africa/Lagos). Branch `feat/original-product-parity`,
parent `f159957`.

Scope: local repair of share-to-Memory capture. No deployment, push, schema
change or new users. The original REIBRY repository was inspected read-only.
Its env files, documents, media and history were not opened or copied.

## 1. What original REIBRY capture actually did (commit `76d3494`, from source)

| Capability | Original status | Evidence |
| --- | --- | --- |
| Link capture | **Working.** Insert-then-AI in one synchronous request. Order: normalize → dedupe → resolve TikTok short link → fetch metadata → insert → thumbnail vision → AI analysis → update → embed. | No queue or cron. `/api/memory/analyze` is a stub that throws. |
| Android share | **Working, native.** `ShareReceiverActivity` handles `SEND text/plain` and queues WorkManager. | Retries 3× with backoff, then POSTs to the hard-coded production URL with a Bearer token. |
| PWA `share_target` | **Working.** GET `/share-target` → sessionStorage → auto-submit once on `/capture`. | Not supported by iOS Safari. |
| URL dedupe | **Partial.** Strips `utm_*`, `fbclid` and `gclid`; canonicalizes TikTok; resolves TikTok short links (3 hops, 2.5 s). | `youtu.be` and `si=` were not handled. |
| Metadata | **Partial.** TikTok and YouTube oEmbed. Other pages: regex Open Graph scrape with redirects refused. | No JSON-LD, dates, duration or hashtags. Instagram was only a label. |
| Thumbnails | The external URL was stored. It was downloaded only for Gemini vision. | No storage bucket. |
| Video frames | **Not implemented** (interface only). | — |
| Transcription | **Not implemented** (interface only). | — |
| AI summary, tags, category | **Working, but external.** NVIDIA or Gemini, with an optional mock fallback. | Needs keys that this edition does not use. |
| Search | **Working.** Lexical `ilike` plus a pgvector hybrid re-ranker. | — |
| iOS | **None.** | — |

### Meta Edition before this stage, compared with the original

**Missing:**

- Android receiver and PWA `share_target`
- AI summaries and tags
- embeddings
- generic page metadata
- TikTok short-link resolution

**Present:** SSRF-safe YouTube and TikTok oEmbed, and owner-scoped dedupe.

**New gaps found in this stage:** see §2.

## 2. Reproduced problems (live, before any change)

Real dev server, real session for synthetic User A, warm route.

| Test link | API time | Result before the fix |
| --- | ---: | --- |
| YouTube `watch?v=rfscVS0vtbw` | 1,097 ms | Title, creator and cover saved |
| `youtu.be/rfscVS0vtbw?si=…` | 597 ms | **New duplicate Memory.** The tracking `si` was kept in the dedupe key. |
| TikTok `@scout2015/video/6718335390845095173` | 788 ms | **"complete" but empty.** Title saved as `www.tiktok.com`. |
| Same TikTok with `?is_from_webapp=1&sender_device=pc` | 764 ms | **New duplicate Memory.** |
| `en.wikipedia.org/wiki/Birthday_cake` | 417 ms | No metadata. Title `en.wikipedia.org`. |
| `instagram.com/p/fA9uwTtkSN/` | 382 ms | Treated as a generic page; no metadata. |

**Isolated timings:**

| Step | Time |
| --- | ---: |
| `/api/auth/me` (getUser round trip) | 251 ms |
| DNS lookup | 1–122 ms |
| YouTube oEmbed | 138–366 ms |
| TikTok oEmbed | 335–669 ms |

**Root causes (confirmed in code and on the wire):**

1. **Enrichment was awaited before the insert.** The save always waited for the
   provider (3 s timeout plus DNS). With a slow provider, a capture could take
   about 3.5 s and still save nothing better.
2. **TikTok's oEmbed response changed.** It now returns only a player iframe,
   with no `title`, `author_name` or `thumbnail_url`. The code reported
   "complete" with empty data.
3. **No tracking-parameter stripping.** Every re-share created a duplicate
   Memory.
4. **Instagram and generic pages were never enriched**, so titles were
   hostnames and search had nothing to match.
5. **The capture form defaulted to "Note"**, and nothing displayed the source
   details.

**The owner's "took too long" was not reproduced** on a warm server, where the
maximum was 1.1 s. The likely contributors are:

- **Dev-mode cold compilation.** The first request after a code change took
   2,080 ms here, and a fully cold dev server takes longer.
- **The provider-awaited save** described above.

Neither could be confirmed as the owner's exact case.

## 3. Changes

### Save-first lifecycle, within the existing schema

**Constraint.** Hosted grants let an owner `UPDATE` only `title` and
`raw_text`. `metadata` and `analysis_status` are insert-only. A
"save, then write details later" flow therefore cannot persist provider
metadata after the insert.

**Phase 1, save (one request):**

- URL validation and canonicalization.
- Enrichment races a hard **1.8 s budget**, with per-host limits: YouTube
  1.2 s, TikTok 1.2 s, share-link resolution 1.0 s, web pages 1.5 s.
- The insert **always** runs afterwards, with whatever details arrived.
- `metadata.enrichment` records the outcome: `complete`, `partial`,
  `unavailable` or `timed-out`, plus a `enrichmentReason`.
- A slow or blocked provider can never lose the link.

**Phase 2, retry:** `POST /api/capture/{id}/details` is owner-only,
same-origin, bounded at 5 s, and gives each provider a 4.5 s timeout.

- It persists an improved **title** when the saved title is REIBRY's
  placeholder.
- Other refreshed fields are shown but **cannot be stored** until the
  migration in §8.

**Repeated share:** returns the existing Memory. It fills a missing user note
and upgrades a placeholder title. It never overwrites the user's own note or
title.

**Background jobs:** none. Enrichment does not continue after the request, and
nothing claims that it does.

### Canonical identity and dedupe

| Source | Identity | Notes |
| --- | --- | --- |
| YouTube `watch`, `youtu.be`, `shorts`, `embed`, `live`, `m.` | `youtube:<id>` | Shorts are flagged as `format: short` |
| TikTok `/@user/video\|photo/<id>` | `tiktok:<id>` | `vm.`/`vt.tiktok.com` and `/t/` share links are resolved (≤ 3 vetted hops) before saving, so they deduplicate against the canonical post |
| Instagram `/p\|reel\|reels\|tv/<code>` | `instagram:<code>` | — |
| Generic web | Cleaned URL | Strips `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_*`, `igsh`, `igshid` and `ref_src`; keeps meaningful parameters |

Rows saved before this stage keep their old keys. A re-share of one of those
may create one new Memory; this affects development data only.

### Bounded, SSRF-safe sources

**Protections on every request:**

- HTTPS only; no credentials or custom ports;
- public-address DNS check **on every redirect hop**;
- manual redirects, at most 3;
- content-type checks;
- size caps: 64 KB for JSON, 256 KB of HTML;
- `credentials: omit`, no referrer;
- the existing private, loopback, link-local, metadata-endpoint and
  `.local`/`.internal` blocks.

DNS is checked before each `fetch`; Node cannot pin the resolved IP. This is
the same residual risk as before.

**Per-source behavior:**

- **YouTube:** public oEmbed supplies title, channel and cover.
- **TikTok:** public oEmbed is used as an existence check. A 404 is reported
  as "private or deleted". The creator handle comes from the canonical URL and
  is marked `provenance: url`. The title is an honest placeholder,
  "TikTok video by @creator". **TikTok pages are not scraped.**
- **Instagram:** **not fetched.** Its sanctioned oEmbed requires a Meta app
  access token, and the public page is login-walled. The link is saved with
  reason `instagram-requires-meta-app-token`.
- **Generic web:** Open Graph, Twitter card, `<title>`, canonical link and
  JSON-LD (`VideoObject`, `Article`, `Recipe` and similar). This yields title,
  description, author, image, site name, publish date, ISO-8601 duration and
  hashtags.
- **Login-wall titles** such as "Instagram" or "Log in" are discarded.

**Untrusted text** is entity-decoded, stripped of markup and control
characters, and length-bounded. HTML is never stored or rendered, and
thumbnails are plain `https` URLs shown with `referrerPolicy="no-referrer"`.

**Field provenance** is recorded in `metadata.provenance`. Each field is tagged
`user`, `url`, `youtube-oembed`, `tiktok-oembed`, `page-metadata` or
`reibry-placeholder`. Nothing is AI-inferred, transcribed or visually
analysed.

### Searchability

These now flow into the existing lexical ranking:

- caption
- hashtags
- creator
- site name
- the user's note
- readable URL path words

URL path words count only for terms not already matched elsewhere. Long opaque
IDs are dropped. No embeddings were added.

Muse receives link evidence as `link_details`: platform, provider creator,
provider caption and user note, each labelled. The prompt asks Muse to say what
it is going by when it cites a link Memory.

**Disclosure handling.** A reply that names a saved link without that
disclosure now gets a fixed disclosure sentence appended, instead of being
discarded. Claims about unseen video or page content are still rejected.

### UI (original styling kept)

- **Form:** Link first; "Why are you saving this?" note.
- **Result states:** "Saving…", "Saved · Details ready", "Saved · Some details
  ready", "Saved with limited details", "Already saved".
- **Retry:** "Retry getting details" → "Getting details…" → an honest outcome.
- **`SourceDetails` card** (capture result and Memory detail): cover only when
  the provider supplied one, platform, creator, caption or "No caption or
  description was available", the user's note, saved date, "nothing was
  watched or transcribed", a plain-language limitation, and **Open original**.
- **Memory list** shows platform and creator.
- **Double-submit guard.**

## 4. Measured results after the fix (live, same server and session)

| Link | Save time | Outcome | Fields saved (provenance) |
| --- | ---: | --- | --- |
| YouTube watch | 1,154–1,842 ms | complete | title, author, thumbnailUrl, postId (youtube-oembed) |
| `youtu.be?si=` | 868–932 ms | **duplicate → same Memory** | — |
| TikTok canonical (+ note) | 1,297–1,881 ms | partial / provider-returned-no-title | author `@scout2015` (url), postId; **no caption, cover or real title (not supplied)** |
| TikTok with tracking | 979–1,621 ms | **duplicate → same Memory** | — |
| Wikipedia article | 1,426–1,625 ms | complete; deduplicated onto the pre-fix row, whose placeholder title was upgraded to "Birthday cake - Wikipedia" | metadata unchanged (insert-only) |
| MDN JavaScript | 1,939–2,290 ms | **page took over 1.5 s → saved first** (`provider-timeout`) | Retry: 2,828 ms, `complete`, title **persisted** as "JavaScript \| MDN"; caption found but not storable |
| Instagram post | 486–743 ms | unavailable / instagram-requires-meta-app-token | postId only |

- **Save time:** under 1.9 s except when a page hit its full 1.5 s limit
  (worst 2.29 s). The save never waits beyond the budget.
- **Live checks:** 21/22 on the first full run. The 22nd, the slow-page retry,
  exposed a defect: the retry was still using the 1.5 s save-time timeout. It
  was fixed and then passed live (above).
- **Verified live:**
  - refresh persistence;
  - note preserved;
  - search for "python course", "freecodecamp", "birthday cake", "scout2015"
    and "javascript";
  - a filler-only query returns nothing;
  - Plan → Ready Pack: the YouTube Memory was offered as a "Tutorials" learning
    candidate and added only after the user selected it;
  - User B gets 404 on read, edit and details retry, and never sees it in
    search.

**Browser (headless Chrome, real session), 16/16:**

- a signed-out share keeps the link only in that tab and is **not saved**;
- after sign-in the link is prefilled;
- `?url=` (iPhone Shortcut path) prefill;
- "Saving…" appears immediately;
- **a double tap sends exactly one capture**;
- "Already saved" card with cover, "YouTube · freeCodeCamp.org" and Open
  original;
- Instagram limitation shown with retry and no fake cover;
- Memory detail shows the cover and creator;
- no overflow at 390 or 1440 px.

**Live Muse (3 of 4 allowed, $0.04425 conservative, ceiling $0.05): all 3
failed, and that is recorded as a failure.**

- **Turn 1 fell back with `grounding_violation`.** The model cited the YouTube
  link without the required disclosure. This stage's prompt edit had dropped
  the explicit "say what you're going by" line.
  - **Fix:** that line is restored, and a missing disclosure is now repaired
    instead of discarded.
  - **Verified by mock tests only;** not live-retested, because the budget is
    spent.
- **Turns 2 and 3 returned 503 "could not load your saved information"**, after
  10.9 s and 43 ms.
  - **Not reproducible.** A zero-cost replay through the real Home handler with
    real Supabase repositories and a mock Muse succeeded for all three turns.
  - Auth and deterministic Home were healthy (4/4) immediately afterwards.
  - **Most likely** a transient upstream Supabase Auth or network failure,
    which Home maps to that generic message. **Unconfirmed.**

## 5. Video understanding: what is achievable

| Input | What can honestly be learned |
| --- | --- |
| URL alone | Platform, post or video ID, creator handle (TikTok), format (Short or reel) |
| Provider metadata | YouTube title, channel and cover; TikTok existence only; Instagram nothing without a Meta app token; web pages' Open Graph and JSON-LD |
| Thumbnail image | Cover-image-only visual description, which must be labelled "from the cover image". Not implemented (no Muse vision call made). |
| Accessible frames or audio of third-party videos | **Not legitimately available.** YouTube caption download is limited to the channel owner (OAuth); TikTok's Display API and Instagram's Graph API return only the authenticated user's own media. No downloading or scraping was done. |
| User-supplied media file | Feasible as **Stage 12I-2**, below. |

### Stage 12I-2 prerequisites (not started)

1. **Storage and consent.** A private Supabase Storage bucket with an
   owner-only RLS policy, and size and type limits (for example 100 MB,
   `video/mp4|quicktime`, `audio/*`). The user explicitly uploads their own
   file.
2. **Processing.** A worker able to run `ffmpeg`, for example a container job.
   Serverless functions are not enough. It samples about 6–12 representative
   frames (scene-change or fixed interval) and extracts the audio.
3. **Speech-to-text.** A provider must be chosen and approved; Muse Spark speech
   support is unverified.
4. **Vision.** Confirm whether Muse Spark accepts image input through the
   Responses API. Otherwise approve another vision provider.
5. **Schema.** A migration for `media_analysis`: transcript, frame
   descriptions, topics, steps, a confidence score and each field's
   provenance. Results must say "from your uploaded video".
6. **Durable jobs.** A queue with retries and status. Today there is none.

## 6. iPhone sharing (iOS Safari has no PWA `share_target`)

**Recommended now: an Apple Shortcut that opens the authenticated capture
page.** It needs no secrets, tokens or new authentication.

1. Shortcuts → **+** → "Receive **URLs** and **Text** from **Share Sheet**".
2. Add **Get URLs from Input**, then **Get Item from List** (First Item), then
   **URL Encode**.
3. Add **Text**: `https://<your-reibry-domain>/capture?url=` followed by the
   encoded URL variable.
4. Add **Open URLs**, and name the shortcut "Save to REIBRY".
5. In TikTok, Instagram or YouTube: **Share → More → Save to REIBRY**. Safari
   opens Capture with the link prefilled, the user taps **Save Memory** and
   returns to the app.

**How it works:**

- If signed out, the link is kept for that Safari tab, sign-in follows, and the
  form is prefilled afterwards.
- The page never auto-saves, so a shared link cannot be silently saved by
  someone else's page.
- `?text=` also works: the first `https://` link in the text is used.

**Testing before HTTPS deployment:**

- **Desktop browser:** works today at
  `http://localhost:3000/capture?url=<encoded>`, as the browser QA above
  verified.
- **iPhone: not testable yet.** The phone can't reach `localhost`, and
  `AUTH_SITE_URL` must be HTTPS except on loopback.
- **Options:** an owner-approved HTTPS deployment, or an HTTPS tunnel with
  `AUTH_SITE_URL` and the Supabase redirect allowlist set to the tunnel origin.
  A tunnel exposes the development app publicly, so it is the owner's
  decision.

**Future option:** a native iOS Share Extension with Keychain-stored session
and background upload. That is a separate app project.

## 7. Tests

- New `tests/capture-share.test.ts` with 16 cases covering:
  - slow provider, provider timeout;
  - normalization, short-link redirects (including off-host, private-DNS and
    redirect loops);
  - duplicates, missing fields, blocked and deleted posts;
  - untrusted metadata, SSRF;
  - cross-user isolation;
  - searchability;
  - details retry and note handling;
  - UI submission state.
- Updated tests for intentionally changed behavior: generic page fetch,
  YouTube identity, disclosure repair.
- Totals: lint PASS, typecheck PASS, **238/238 tests**, build PASS,
  `git diff --check` PASS.
- Secret keys appear only in ignored compiler caches (`.next/cache`,
  `.next/dev/cache`).

## 8. Remaining hosted requirements and limitations

- **Migration for durable Phase 2 enrichment.** Add a `SECURITY DEFINER`
  function, for example `apply_owned_link_enrichment(p_memory_id uuid,
  p_details jsonb)`. It must:
  - check `auth.uid()` ownership and that the Memory is a link;
  - accept only allowlisted keys, types and sizes;
  - merge into `metadata`;
  - have `search_path` pinned;
  - grant EXECUTE to `authenticated` only;
  - raise `PT409` or `PT400`, **never `40001`**.

  Without it, retries store only the title.
- **Background enrichment.** A durable queue (database job table plus cron or
  worker) is needed to enrich after the user leaves. There is none today.
- **Instagram details** need an approved Meta app and an oEmbed access token.
- **TikTok captions and covers** need the TikTok Display API with the user's
  own OAuth, and then only for the user's own videos.
- **Development data.** Pre-fix duplicate rows remain from §2 (two YouTube, one
  TikTok, one Wikipedia, one Instagram) plus 12I captures, a Plan and a Ready
  Pack. All belong to synthetic User A, are tracked in
  `.auth/stage12f2/manifest.json` (`records.stage12i`), and are removed by the
  existing cleanup.

## 9. Manual acceptance (owner)

1. Run `npm run dev`, then open `http://localhost:3000/capture` and sign in.
2. Paste a YouTube link, add a note and save. Expect "Saved · Details ready"
   with cover and channel in about 1–2 s.
3. Paste the same video as a `youtu.be/…?si=…` share. Expect "Already saved".
4. Paste a TikTok link. Expect "Saved · Some details ready", the creator
   handle, and a note that TikTok didn't share the caption or cover.
5. Paste an Instagram post. Expect "Saved with limited details" and the
   Meta-app explanation. Try **Retry getting details**.
6. Open `http://localhost:3000/capture?url=<encoded link>` to simulate the
   iPhone Shortcut.
7. In Memories, search for words from the title or your note. In Home, ask
   "What Python tutorial did I save?". This is not yet live-verified after the
   disclosure fix.

## 10. Stage 12I-1: save and enrich are separate, and enrichment is persisted

### Lifecycle

**Request 1 — save (`POST /api/capture`):**

- authenticated validation, canonical identity, owner-scoped dedupe and insert;
- **no network enrichment** (asserted by a test);
- links are saved with `metadata.enrichment = "pending"`, a placeholder title (with the TikTok `@creator` from the URL when present) and field provenance.

**Request 2 — enrich (`POST /api/capture/{id}/details`):**

- the browser sends it automatically after the save is acknowledged; the same request powers **Retry getting details**;
- bounded to 6 s overall, with 5 s per provider;
- the server verifies the session with `getUser()` and reads the Memory through the owner-bound client;
- it then persists through the new trusted boundary.

**If the tab closes:** the Memory stays saved with `pending`, and a later Retry completes it. Nothing claims background continuation.

**TikTok share links:** `vm.`/`vt.tiktok.com` and `/t/` links can't be resolved without network. Under save-first they are keyed by their own share identity, and enrichment records the canonical URL and post ID. The same share link deduplicates, but a share link and the canonical post URL can become two Memories. The dedupe key is insert-only.

### Migration `20261030060000_trusted_link_enrichment.sql`

It adds `public.apply_trusted_link_enrichment(p_user_id, p_memory_id, p_details, p_title)`.

**Function properties:**

- `SECURITY DEFINER` with `search_path = ''`;
- **EXECUTE granted to `service_role` only**, revoked from `PUBLIC`, `anon` and `authenticated`;
- called by the server with the verified user ID through the server-only client, so clients cannot forge "verified" platform metadata.

**What it enforces:**

- **ownership:** a Memory owned by that user and of type `link`, else `P0002`;
- **allowlisted keys only:** `enrichment`, `enrichmentReason`, `metadataProvider`, `author`, `authorUrl`, `caption`, `thumbnailUrl`, `publishedAt`, `durationSeconds`, `siteName`, `canonicalUrl`, `postId`, `hashtags`, `provenance`, `enrichedAt`;
- **validated values:** HTTPS URLs without credentials, lengths, enums, integer duration, valid timestamps, a hashtag pattern, and a provenance allowlist that never accepts `user`;
- invalid input raises `PT400`, never `40001`.

**What it never changes:**

- `raw_text` (the user's note) is never touched;
- the title is replaced only while it is REIBRY's placeholder, including pre-12I hostname titles;
- existing provenance is merged, not overwritten;
- the call is idempotent.

Owners' direct `UPDATE` grant is unchanged: `title` and `raw_text` only.

**Local verification** (throwaway PostgreSQL with Supabase default grants): all 7 SQL suites passed.

- The 6 existing security suites. `plans_rls` and `ready_packs_rls` were updated to expect the Stage 12F-3 `PT409`; they still expected `40001`.
- The new `link_enrichment.sql`, which covers:
  - authenticated and anonymous denial;
  - placeholder replacement;
  - idempotency;
  - the user's title and note preserved;
  - legacy rows;
  - cross-user and text-Memory denial;
  - 15 malicious payloads rejected with no write.

**Hosted:**

- CLI identity was confirmed only after the owner re-logged with the account that owns the project; an earlier session had the wrong account.
- The dry-run listed exactly this migration; one push applied it.
- Read-only checks: history has 10 versions; the function is executable only by `service_role` (no `PUBLIC` ACL), `SECURITY DEFINER`, `search_path=""`; `authenticated` can `UPDATE` only `raw_text` and `title`; `anon` can execute 0 functions; 11 tables still have forced RLS.

### Live end-to-end (real dev server, synthetic User A)

Test video: `https://www.youtube.com/watch?v=kqtD5dpn9C8` (tracking parameter added and stripped). It is a public beginner course: "Python for Beginners - Learn Coding with Python in 1 Hour", Programming with Mosh.

| Step | Result |
| --- | --- |
| Save | 201 in **933 ms**, `pending`, placeholder "YouTube video" |
| Enrich | 200 in 3,443 ms (first, uncompiled hit of the route); title, creator and cover persisted with `youtube-oembed` provenance; note kept |
| Enrich again | 1,130 ms, idempotent |
| Reload in a fresh session | Title, creator and `enrichment=complete` persisted |
| `youtu.be/kqtD5dpn9C8?si=…` re-share | Same Memory, with its persisted details |
| Search "mosh" / "python beginners" / "learn coding" | Rank 1 in each |
| User B | 404 on read, 404 on enrich, absent from search |

**Browser (390 px):**

- a pending link sends exactly one automatic details request after the save;
- the UI shows "Getting details…" and then "Already saved · Limited details" with the honest reason;
- an already-enriched link sends no details request and shows the cover and creator.

### Remaining limitations

- No durable background queue.
- TikTok captions and covers need the Display API; Instagram needs a Meta app token.
- Share-link versus canonical-URL duplicates are possible (see above).
- Pre-12I duplicate rows of the freeCodeCamp test video remain in User A's development data. They are tracked for cleanup, and they visibly affected one conversation answer.

## 11. Stage 12I-1B: finding the captured Memory in conversation

- Capture is unchanged. The fix is in how Home works out which captured Memory the user means: "just saved", "the second one", "the Mosh one", "last month" and "that video" now resolve deterministically before Muse is called (`src/lib/home/references.ts`).
- The Stage 12I-1 miss was a retrieval cutoff, not missing save dates. See `LOCAL_CONVERSATION_QA.md`, Stage 12I-1B.
- Copies of the same captured item (the pre-12I freeCodeCamp copies, including a `youtu.be` share-link copy without `postId`) are grouped for the model. This also covers share-link versus canonical-URL copies of the same post when the post ID or URL agrees.
- No stored Memory is merged or deleted, and no migration was needed.
- A newly captured link that still has a placeholder title is offered for "the one I just saved" even when no words match.
- **Live:** 3/3 Muse turns cited the just-saved Mosh course correctly, for $0.01834.
- **Browser:** 10/10.
- **Tests:** 255/255 (14 new reference-resolution tests).

## 12. Stage 12J-1 update

The Stage 12I-1 limitation "a share link and the canonical post URL can become two Memories" is resolved. Links with the same **verified** TikTok post ID are now one Memory: matched at save time when the post ID is already known, or merged at enrichment when a share link resolves, keeping the older Memory. Different post IDs never merge. See `docs/meta/IPHONE_SHARE_AND_CAPTURE_QA.md`.
