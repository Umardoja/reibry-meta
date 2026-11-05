# Stage 12K-2 — Forensics on the original REIBRY's rich capture

| | |
|---|---|
| **Target** | `reibry-meta`, branch `feat/original-product-parity`, at `05c2478` |
| **Original (read-only)** | `C:\Users\HomePC\Documents\reibry`, branch `feat/integration`, at `76d3494` (2026-09-27). It was not checked out, reset or modified. |
| **What was not done** | No Meta AI calls, no paid or vendor calls, no new keys or users, no migrations, and no access to production data. |
| **Requests made** | About 40 bounded public metadata requests. That includes 20 to TikTok oEmbed, because the 10-request comparison ran twice. The rest went to TikTok short-link redirects, YouTube oEmbed, MDN, Wikipedia and one Wikimedia cover check, plus the app's own enrichment during re-shares. No video was downloaded. |

## A. Result: PARTIAL

**Established:**
- The original source of the rich Memories in the recording (the pipeline below), backed by code, dated documents and same-post reproduction.
- That the drop in TikTok detail is **not a code regression**. The original's own extraction code, run today on the same posts, gets *nothing* from TikTok; the current code at least keeps the creator handle from the URL.
- That TikTok's oEmbed reply changed between 2026-09-22 and 2026-10-31.

**Not established:**
- The exact stored rows behind the three recorded cards. They live in the original's production database, which I was not authorised to read.
- No legitimate way restores TikTok captions or covers today, so a PASS cannot honestly be claimed.

## B. What the recording proves

**The file:** `Downloads\WhatsApp Video 2026-11-02 at 8.21.12 AM.mp4`, 21.9 s, 416 × 816. I sampled one frame every 2 seconds into a scratchpad (not committed).

**What the frames show:**
- The **original REIBRY** interface: teal Home "From saved to done" and "Mum's birthday · Oct 3".
- The user types "Mum's birthday is Saturday". Home answers "I found 10 saved items…" and lists:

| Card | Saved | Title | Summary | Category and tags | Cover |
|---|---|---|---|---|---|
| TikTok | Sep 27 | **Butterfly Cake Decoration Tutorial** | "A TikTok video by Dupe's bakery demonstrating how to decorate a butterfly cake." | Food & Cooking · #cake #cooking #food | Photo of a butterfly cake |
| TikTok | Sep 26 | **Cakes in Owerri by Lixloria Events** (spelled *Lixloria*) | "A TikTok video by a cake vendor in Owerri targeting students and cake lovers." | Food & Cooking · #cake #cooking #food | Photo of a person with a cake |
| YouTube | Sep 25 | **The ULTIMATE Red Velvet Cake** | "A YouTube short by Bake With Zoha demonstrating how to make an easy, soft, and moist red velvet cake." | Food & Cooking · #cake #baking #cooking | Photo of a person with a cake |

**The rest of the flow:** cake-idea selection ("Use Butterfly Cake Decoration Tutorial"), "Save Ready Pack", and the final Ready Pack "Mum's birthday — Saturday, October 3" containing the Butterfly card.

**What it proves:** these Memories existed with titles, summaries, categories, tags and covers, and were used for retrieval, selection and Ready Packs.

**What it does not prove:**
- The capture step itself; none is shown.
- Which system wrote each field.
- That the covers are still valid. TikTok cover URLs are signed and expire, and the original had a refresh path (`orchestrator.ts:377`).

## C. Do the three examples occur in source, seeds or fixtures?

Searched the worktree (excluding `node_modules` and `.next`) and `git log --all -S` across all branches.

| String | Result |
|---|---|
| "Butterfly Cake Decoration Tutorial" | Only as a **test input** in `tests/home-agent.test.ts:73` (selection resolution). It is not seeded. |
| "Cakes in Owerri by Lixloria Events" | Only in **tests** (`tests/ask-ranking.test.ts:50,70`), with summary "A TikTok video by a cake vendor in Owerri." First added in `76d3494`. |
| "Lixoria" (the brief's spelling) | Absent. The recording and the tests both say "Lixloria". |
| "The ULTIMATE Red Velvet Cake" | Only in a **test** (`tests/semantic-provenance.test.ts:21`) as a full YouTube-style title with `#redvelvet #cake #baking`. |
| "Dupe's bakery", "demonstrating how to" | Absent everywhere, including history ("Dupe" only matches `dedupe`). |
| Demo seed `scripts/seed-demo.mjs` | Seeds a single **text** Memory, "Red Velvet Cake Tutorial", with no URL, no TikTok and no cover. It is **not** the source of any recorded card. |
| `docs/cleanup-demo-data.sql` | A review-only delete script; contains no records. |

**Conclusion:** the recorded cards were **not** created by seed or demo scripts or hardcoded fixtures. The tests were later written to *mirror* real stored Memories (same distinctive spelling and summary wording). That points to user captures stored in the original's database between 2026-09-25 and 2026-09-27. Confirming the exact rows needs read access to that database, which I did not have.

## D. Original thumbnail path

1. `src/lib/sources/tiktok.ts` `enrichTikTok()`: `GET https://www.tiktok.com/oembed?url=<canonical>` through node:https with pinned DNS, `accept: application/json`, no User-Agent, a 2.5 s limit and a 128 KB cap. It reads `thumbnail_url` and keeps it only if it is public https.
2. YouTube: `src/lib/sources/enrichment.ts` `enrichCapture()` reads `thumbnail_url` from `youtube.com/oembed`. Other web pages use `og:image`.
3. The cover is stored as `evidence.thumbnail`. `orchestrator.ts:231-236` also fetches it and sends it to **Gemini `analyzeThumbnail`** (vision), which produces visual concepts such as "butterfly cake" with `source: "thumbnail"`. `orchestrator.ts:374-394` refreshes expired signed URLs.

## E. Original caption and description path

The full flow:

```
Android share (PWA share_target {title,text,url}) / composer
 → normalizeSharedPayload → adapters.platform(): evidence.caption = shared text, evidence.title = shared title
 → canonicalizeTikTokCapture → resolveTikTokUrl (vm./vt. manual redirects, 3 hops, 2.5 s)
 → enrichTikTok: oEmbed title (the creator's caption, as TikTok returned it then), author_name (display name), author_url, thumbnail_url
 → orchestrator: fetchThumbnail → Gemini analyzeThumbnail (vision on the cover)
 → analyzeOrPreserve → Gemini analyze({ evidence }) → AI title, summary, category, tags
      fallback on failure: sourcePreservation() → deterministic title/summary, deriveCategory, deriveTags
 → memories row (title, summary, category, tags, analysis_metadata.evidenceSources) → card → Home → Ready Pack
```

| Field on the card | Source | Who produced it |
|---|---|---|
| Title "Butterfly Cake Decoration Tutorial" | Gemini `analyze` output. The oEmbed title was the creator's raw caption. | **AI**, from real evidence |
| "by Dupe's bakery" | oEmbed `author_name`, the display name (not the `@handle`) | **Platform** |
| Summary sentence | Gemini `analyze`. The deterministic fallback would read "A cake recipe…, saved from the original source." | **AI** |
| "Food & Cooking" | Gemini `allowedCategories`, or `deriveCategory` | AI or deterministic |
| #cake #cooking #food / #cake #baking #cooking | Exactly what `deriveTags()` produces ("cake", then "baking" if "bake" appears, then the aliases "cooking", "food"). It is used when Gemini returns no tags. | Deterministic from real text (most likely) |
| Cover | oEmbed `thumbnail_url` | **Platform** |

Gemini env names (values not read): `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_REQUEST_TIMEOUT_MS`. `.env.example` also names `NVIDIA_API_KEY` and `AI_PROVIDER`. There is no scraper dependency.

**Error handling:** a metadata failure still saved the Memory. The original's own document says "Successful analysis with URL-only evidence is finalized as partial" (`docs/ANDROID_CAPTURE_RELIABILITY.md:52`).

## F. Did AI generate the old descriptions?

**Yes:** the titles and summaries match the Gemini `memory-analysis` output.
- The model's inputs were **real evidence**: the oEmbed caption, the creator's display name, the cover image (through vision) and any shared text.
- It was not a guess from a bare link. The prompt says "Use only supplied evidence and never invent facts."
- Without those inputs, the original itself produced only partial records.

## G. The exact old-versus-new difference

**Same posts, same day (2026-11-02):** I ran the original functions `resolveTikTokUrl` and `enrichCapture`, imported read-only, alongside the current `enrichLink`.

| Link | Original code today | Current code today |
|---|---|---|
| `vt.tiktok.com/ZSg3F9G3P` (@elsie.lizzy0) | Resolved to `/@elsie.lizzy0/video/7696611605374602518`. **Title, author and cover all null** (no evidence). | `partial`, `provider-returned-no-title`. Author `@elsie.lizzy0` from the URL. |
| TikTok's own documentation sample (@scout2015/6718335390845095173) | **Nothing** | `partial`, author from the URL |
| YouTube "Python for Beginners…" | Title, author "Programming with Mosh", cover (youtube-oembed) | Identical: `complete` with title, author and cover |
| en.wikipedia.org/wiki/Birthday_cake | Title and `og:image` cover | Identical: `complete` with title, cover and author |
| developer.mozilla.org JavaScript | Times out (2.5 s) | Times out |

**Raw TikTok oEmbed reply:** 10 requests covering the original style (node:https, no User-Agent), the current style (fetch, `User-Agent: node`), curl and browser User-Agents, and an empty Accept header. Every one returned **200, 542 bytes**, with only `version, type, width, height, html, provider_url, provider_name, embed_product_id, embed_type`. No `title`, `author_name` or `thumbnail_url`.

**What changed upstream:**
- The original's `docs/ANDROID_CAPTURE_RELIABILITY.md:70` (commit `7c90f4d`, 2026-09-22) records: "Public TikTok documented sample: live oEmbed returned title and author." The same sample returns neither today.
- TikTok's oEmbed page, last updated **2026-10-23**, now shows an example reply without title, author or thumbnail and says "Embed Videos will be deprecated soon… We recommend using Embed Player."
- The recorded Memories were saved on Sep 25–27, inside the window when oEmbed still returned those fields.

| Feature | Original implementation | Current implementation | Observed difference | Root cause | Possible safe repair |
|---|---|---|---|---|---|
| TikTok caption | oEmbed `title` | oEmbed `title` | Both get nothing today | TikTok stopped returning `title` (between 2026-09-22 and 2026-10-31) | None that is permitted |
| TikTok cover | oEmbed `thumbnail_url` | Same | Both get nothing | Same | None. The Embed Player shows it but must not be stored as a thumbnail. |
| TikTok creator | oEmbed `author_name` (display name) | oEmbed, then `@handle` from the URL | Current is better | Same | Already done |
| Short-link resolution | 3 manual hops | Manual, SSRF-safe | Both resolve the same canonical URL | — | — |
| Request headers | No User-Agent, JSON Accept | `User-Agent: node`, JSON Accept | No effect (identical replies) | — | — |
| YouTube title, channel, cover | oEmbed | oEmbed | Identical | — | — |
| Web page title, cover | `og:` tags (2.5 s) | `og:` and JSON-LD (bounded) | Identical for Wikipedia; both time out on MDN | — | — |
| Android shared text → caption evidence | `share_target` text | Stage 12K `sharedText` | The iPhone Shortcut sends only the URL (owner-verified) | Different platform | Already supported when text arrives |
| AI title, summary, category, cover vision | Gemini at capture | **None** at capture in the Meta Edition | Recorded summaries are AI output | Intentional: Meta calls need authorisation | Opt-in, evidence-only Meta summary (needs authorisation, see N) |
| Tags | Gemini, or `deriveTags` | Hashtags from the title only | Fewer tags | Not ported | Not done: search already indexes those title words |
| Trusted write allowlist | — | Title, caption, author, cover, hashtags, … | Nothing real is dropped | — | — |
| Search indexing | Title, summary, tags, concepts | Title, note, caption, author, hashtags, shared text | Nothing stored is unindexed | — | — |

## H. What was repaired and what was not

- **No code changed.** No permitted extraction path was dropped, request headers make no difference, and nothing stored is lost in persistence, indexing or display.
- **Stale record refreshed through the existing UI path:** "Birthday cake - Wikipedia" had been saved in an earlier stage as `unsupported`. A single "retry details" request gave `complete`, with the cover from `thumb.wikimedia.org`, the author "Contributors to Wikimedia projects" and `page-metadata` provenance.
- **Not restored:**
  - TikTok caption and cover: not available from TikTok without scraping or bypassing its bot check.
  - AI summaries: these need Meta calls, and from a bare TikTok link they would be unsupported guesses.
- **Not copied:** no demo or recorded captions were copied onto real Memories.

## I. Captions and covers verified (live, User A)

- **YouTube:** title, channel and cover, all with `youtube-oembed` provenance. The cover loads at 390 and 1440 px.
- **Wikipedia:** title, author and cover, with `page-metadata` provenance. The real cover loads at both widths (`memory-wikipedia-390.png`).
- **TikTok, short and full links of the same post:** `partial`. The creator comes from the URL; title, caption and cover are null. The tile shows a placeholder glyph, not a stock photo.

## J. Persistence, search and Home

- **Re-shares** of the TikTok short link, its full `?is_from_webapp=1` link and the TikTok documentation sample all returned the existing Memory (`duplicate: true`). YouTube likewise.
- **Counts:** Memories 30 → 30, Plans 3 → 3, Ready Packs unchanged (3,487 bytes before and after).
- **Search:**
  - "birthday cake wikipedia" → #1 Wikipedia (creator shown).
  - "python beginners mosh" → #1 the YouTube video (channel shown).
  - "weekend market idea" → #1 the real TikTok, through the user's note.
- **Home citation:** covered by the existing unit tests with mocked provider replies (`tests/meta.test.ts`, `tests/shared-text.test.ts`, `tests/after-save-context.test.ts`). No Meta call was made.
- **User B:** reading the Wikipedia Memory → 404, enriching it → 404, search → 0 results.

## K. Mobile layout

At 390 px, all checks are `overflowX: false`, with no sidebar and the five tabs Home, Memories, Capture, Plans and Account. At 1440 px the app is 430 px wide and centred (left edge 505). These are headless desktop Chrome checks, not a physical iPhone. Screenshots are in `test-results/stage12k2/`, which git ignores.

## L. Tests and measurements

- **`npm test`:** 304/304, after a fresh `npm run build`.
  - The production smoke test fails while the dev server holds `.next`. It was re-run with the dev server stopped, then the server was restarted.
- **No code change,** so lint and typecheck are unchanged from `05c2478`.
- **Save (request 1), then details (request 2), timed separately:**

| Link | Save | Details |
|---|---|---|
| TikTok short link | 1.41 s | 2.77 s |
| TikTok full link | 0.92 s | 1.92 s |
| TikTok documentation sample | 0.71 s | 1.34 s |
| YouTube | 0.76 s | 1.52 s |
| Wikipedia retry | — | 2.37 s |

- **Raw extraction:**
  - Original TikTok, short link: 1.16 s (nothing returned).
  - Current TikTok, short link: 0.74 s.
  - Current YouTube: 0.15 s.
  - Current Wikipedia: 0.31 s.
- **Private URL:** the private address had two short connect timeouts from Node and curl during the session. Each time it answered 200 again on retry from PowerShell. Tailscale was not touched.

## M. Commit

This report only, committed locally.

## N. What needs authorisation or outside access

1. **Read-only access to the original's production database** (owner-scoped `memories` rows for the three cards) would confirm `analysis_metadata.provider`, `evidenceSources` and the stored cover URLs. It was not accessed.
2. **AI summary, category and tags from real evidence** (the original's Gemini step, through Meta). Proposal:
   - Opt in per Memory, and only when there is real evidence: a YouTube or web title, caption or cover, or the user's note.
   - One text call per Memory, plus at most one vision call on a real cover.
   - The cost per call depends on the Meta plan and was not measured.
   - Needs separate authorisation. It would not help TikToks that have only a URL.
3. **TikTok captions and covers:** blocked at the source. The options are a vendor (the Stage 12K-1 Supadata trial, which needs approval) or creator-authorised Display API access, which covers only the owner's own videos.
