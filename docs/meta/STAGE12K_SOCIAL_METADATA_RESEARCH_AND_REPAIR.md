# Stage 12K: social video metadata, research and repair

Branch `feat/original-product-parity`, starting from commit `01378d2`. Date: 2026-10-31.

The original REIBRY (`76d3494`) was read only. No Meta inference calls, no paid API calls, no new users, no migrations, no push and no deploy.

## A. Result: **PARTIAL**

**What was achieved:**
- The real failure was traced to a verified barrier on TikTok's side; it isn't a REIBRY bug (section B).
- REIBRY now keeps the words a phone's share sheet sends with a link:
  - they are labelled honestly, never as the owner's note or an official caption;
  - they are cleaned of app boilerplate, persisted, shown on the Memory and made searchable;
  - Home's AI evidence receives them, labelled as shared with the link rather than an official caption.
- The misleading TikTok wording has been fixed.

**Why this is not PASS:**
- No *real* affected TikTok link gained genuine new context.
- TikTok's legitimate public sources returned no caption, title or cover for the owner's posts.
- Whether the iPhone share sheet sends any caption text is still unproven. That needs the one physical-iPhone check in section P.
- The new path was verified end to end, but only with a synthetic share text.

## B. The real iPhone TikTok failure, traced

The owner's two real shares are test User A's Memories:
- `a5ec8a60…`: `vt.tiktok.com/ZSg3F9G3P` → `@elsie.lizzy0/video/7696611605374602518`
- `c91ccd20…`: `vt.tiktok.com/ZSg3NVQ55` → `@temizy_001/video/7702502616080829717`

| Step | Evidence | Result |
|---|---|---|
| iPhone share → Shortcut → Capture | The Memory exists with the correct `vt.tiktok.com` link | ✅ The link arrived. The current Shortcut runs *Get URLs from Input*, so any non-URL text is discarded before REIBRY sees it ("never sent" to REIBRY). |
| Authenticated save | Saved in about 1 s; `enrichment: pending` → enriched within 1 s | ✅ |
| Short-link resolution | `canonicalUrl` and `postId` are stored | ✅ The redirect was resolved safely. |
| TikTok oEmbed (official) | Direct probe today: HTTP 200, `application/json`, 542 B. Keys: `version, type, width, height, html, provider_url, provider_name, embed_product_id, embed_type`. **There is no `title`, `author_name`, `author_url` or `thumbnail_url`, and the iframe `html` has no caption.** The same holds for TikTok's own documentation example (`@scout2015/video/6718335390845095173`). | ❌ **Truly unavailable from this source.** Nothing was returned and then ignored. |
| Public post page | HTTP 200, `text/html`, 1,462 B: a "Please wait..." WAF challenge (`_wafchallenge`). No meta tags, no JSON-LD, no embedded data. | ❌ Bot protection. **Not bypassed, by design.** |
| Embed player `/embed/v2/<id>` | 312 KB, a JavaScript app shell. No caption, creator text, Open Graph or JSON-LD in the HTML. | ❌ Not available server-side. |
| Validation / persistence | The stored row matches what the provider returned: author from the URL, provenance `{title: reibry-placeholder, author: url}`, reason `provider-returned-no-title` | ✅ Nothing was rejected or lost. |
| UI | The Memory showed the creator and "TikTok confirmed the video but didn't share its caption or cover." | ⚠️ The wording was misleading. Fixed (section F). |
| Retry today, through the real app | `/api/capture/a5ec8a60…/details` → 200 in 4.5 s, `partial / provider-returned-no-title` | Same result. The barrier is current. |

Sanitized diagnostic matrix for the real post:

| Field | Status |
|---|---|
| Title | Unavailable (oEmbed omits it) |
| Caption | Unavailable (oEmbed omits it; the page is behind the WAF); never reached REIBRY from the Shortcut |
| Creator | ✅ From the canonical URL (provenance `url`) |
| Cover | Unavailable (oEmbed omits it) |
| Hashtags | Unavailable (they would come from the caption) |
| Description | Unavailable |

## C. How the original REIBRY extracted TikTok details

Files read: `src/lib/sources/tiktok.ts`, `adapters.ts`, `share/payload.ts`, `capture/source-preservation.ts`, and `app/manifest.ts`.

- **TikTok:**
  - It resolved short links (pinned DNS, manual redirects).
  - It made one call to `https://www.tiktok.com/oembed`, reading `title`, `author_name`, `author_url` and `thumbnail_url`.
  - At the time, TikTok oEmbed's `title` **was the creator-written caption**, so the captions the owner remembers were **(1) actual creator captions, delivered as website metadata through TikTok's official oEmbed**.
  - TikTok has since stopped returning those fields (section B).
- **Share text:** the Android PWA `share_target` (`title`, `text`, `url`) kept any text shared with the link as `rawText` and as the evidence `caption`. This was **(2) text the sharing app sent with the link**, wherever an app provided it.
- **Summaries and tags:**
  - AI analysis (Gemini or NVIDIA), or a deterministic "source preservation" summary and keyword tags made from that text. These are **(5) AI-generated or (6) derived**, not captions.
- **No scraping:** there was no page scraping, no unofficial API and no browser automation. Nothing obsolete or unsafe needed avoiding; the source simply dried up.

## D. Open-source and hosted tools compared

The research covered docs, source, licences and dependencies. Nothing was installed, executed or downloaded, and no accounts were created.

| Tool/service | License | Supported data | Legitimate access requirements | External dependencies | Runtime complexity | Known limitations | REIBRY suitability | Recommended action |
|---|---|---|---|---|---|---|---|---|
| [metascraper](https://github.com/microlinkhq/metascraper) core + rules | MIT | OG/Twitter/JSON-LD/microdata title, description, image, author, date; vendor rules (tiktok, youtube, instagram…) | None (parses HTML you supply) | cheerio, jsdom, **native re2**, about 25 helper packages; the youtube rule makes its own HTTP probes | Medium (bundle weight, native build) | The TikTok rule needs `__UNIVERSAL_DATA_FOR_REHYDRATION__`, which is behind the WAF. From the challenge shell or the oEmbed iframe it gets nothing beyond the URL handle and an ID-derived date. | Low as a dependency, high as a reference | **Not installed.** Our parser already covers OG, Twitter, `<title>`, canonical and JSON-LD. |
| [mcp-video-analyzer](https://github.com/guimatheus92/mcp-video-analyzer) | MIT | Loom, direct and local video: transcript, frames, OCR; platforms via yt-dlp | None for public content | yt-dlp, ffmpeg-static, puppeteer-core, sharp, tesseract.js | High | Downloads media; headless Chrome fallback | Inspiration only | Its adapter, transcript-fallback and SSRF ideas could inform the user-uploaded video path |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense (the binaries contain GPLv3+ code) | Full metadata JSON, subtitles, media | **Its TikTok extractor solves the WAF proof-of-work and impersonates a browser's TLS**; cookies for some content | Python 3.11+, curl_cffi, ffmpeg, deno | High (sidecar process) | Breaks often; conflicts with TikTok's terms (§3.4) and YouTube's ban on automated access | Not suitable | Do not adopt |
| [anytranscript](https://github.com/iankiku/anytranscript) | MIT | YouTube captions; Whisper transcripts for TikTok and Instagram | Optional OpenAI/Groq key; Instagram cookies | yt-dlp (auto-downloaded), ffmpeg, whisper.cpp | High | Downloads audio; a wrapper around yt-dlp. Offers nothing without acquiring the media. | Not suitable | Do not adopt |
| [TikTok-Api](https://github.com/davidteather/TikTok-Api) | MIT | TikTok video, user and hashtag data | **`ms_token` from TikTok login cookies**, proxies | Python, Playwright browsers | High | Unofficial; bot detection; heavy maintenance | Not suitable | Research only |
| TikTok oEmbed | Platform terms | iframe `html`, `embed_product_id` only | None | None | Low | No title, author or thumbnail; the docs say it "will be deprecated soon" | Keep | Keep for existence and post ID |
| TikTok Embed Player | Platform terms | A client-side player; postMessage reports state and errors | None | Browser iframe | Low | Never passes the caption or title to the host page | Display only | Possible later; not a stored caption |
| TikTok Display API | Platform terms | Title, description (≤150 characters), cover (6 h TTL) | The user's TikTok OAuth (`video.list`) | TikTok developer app | Medium | **Only the authorising user's own videos** | Niche | Future "import my own TikToks" only |
| TikTok Research API | Platform terms | Research data | Academic or non-profit, non-commercial only | n/a | n/a | REIBRY isn't eligible | None | Skip |
| YouTube oEmbed | Platform terms | Title, author, thumbnail | None | None | Low | No description, date or duration | High | Keep (verified working today) |
| YouTube Data API v3 `videos.list` | Platform terms | Title, **description**, thumbnails, channel, tags, date, duration | API key, 1 quota unit per call (10k per day) | Google Cloud project | Low | `captions.download` is owner-only | High | Future option once a key is approved |
| Instagram oEmbed (Meta) | Platform terms | Since 2025-11-03, `html` only (thumbnail and author removed) | Meta app, **App Review** and a token | Meta developer app | Medium | No thumbnail or author | Low | Defer |
| Generic OG/JSON-LD (our own parser) | Own code | Title, description, image, site, date, author | None | None | Low | Fails on JavaScript-only or WAF-protected sites | High | Keep |
| [Supadata](https://supadata.ai/) | Proprietary SaaS | Transcripts and metadata for YouTube, TikTok, Instagram, X and Facebook | API key; 100 free credits a month; Pro $17/mo | Third-party API, async jobs (202 then poll, 1 h expiry) | Medium | Source of TikTok and Instagram data undisclosed (probably scraping); public results may be cached | Low–medium | Needs owner approval; opt-in per user with disclosure, if ever |
| [Microlink](https://microlink.io/) | Proprietary (built on metascraper) | Metascraper fields, screenshots, prerendering | Free tier (25 a day per the pricing page; unverified); Pro $49/mo | Third-party API | Low | Retention not stated; TikTok WAF handling unverified | Low | Skip |
| [Apify](https://apify.com/) TikTok actors | Proprietary | Captions, author, hashtags, counts | Account; about $1.70 per 1k results | Actor runs, proxies | Medium | Unofficial scraping; personal-data warning | Not suitable | Do not adopt |

Under the MIT licence the code may be reused. That doesn't make a tool's way of getting the data permitted under the platform's terms. Every route that does reach TikTok captions goes around TikTok's bot protection or uses a login session, directly or through a vendor.

## E. Limits of the official platform options

| Category | TikTok | YouTube | Instagram |
|---|---|---|---|
| Available public metadata | Post ID and creator handle (from the redirect URL) and that the post exists (oEmbed 200). **No caption, title or cover.** | Title, channel and thumbnail (oEmbed). A description is available through the Data API with a key. | Nothing without Meta App Review; oEmbed now returns HTML only |
| Creator-authorised metadata | Display API: only the logged-in user's own videos | OAuth for the owner's own captions | Graph API for the user's own media |
| User-shared text | Whatever the share sheet sends with the URL (unproven on iOS, see section P) | Same | Same |
| Actual transcript | Not available legitimately | Owner-only `captions.download` | Not available |
| Actual visual analysis | Only for a video the user uploads (existing gated feature) | Same | Same |

An embedded player shows the video to the viewer. It does not grant permission to download, transcribe or analyse it.

## F. The solution and why

1. **Share text kept with honest provenance.** The fragment `#url=…&text=…` was already parsed but no longer feeds the note.
   - **Pure cleaner:** `cleanSharedText` (in `src/lib/capture/share.ts`, additive; the existing URL parsers are unchanged):
     - strips URLs and generic app wording ("Check out X's video!", bare `#TikTok`, "Shared via TikTok", "Download TikTok", and similar), plus control characters;
     - returns nothing when only links, handles or boilerplate remain;
     - caps the result at 1,000 characters.
   - **Capture form:** the shared link goes in the box. The words appear separately as **"Shared with the link: …"** with a **Don't keep** button.
     - They are sent only with the link they arrived with.
     - They are never placed in the user's note.
   - **Save (request 1):**
     - the contract accepts `sharedText` (links only, ≤5,000 characters);
     - the server cleans it again;
     - it stores `metadata.sharedText` with `provenance.sharedText = "share-sheet"` through the existing owner insert, so no migration was needed;
     - it is never stored as `caption`.
   - **Display:** the Memory card, Memory page and "What REIBRY knows" show it under **"Shared with the link"**. "A caption or description" stays listed as not known.
   - **Search and Home:**
     - owner-scoped search indexes it;
     - Home evidence passes it as `link_details.shared_with_link`;
     - the system prompt tells the model it comes from the share sheet and is not an official caption.
2. **Wording fix:** "TikTok confirmed it did not share…" became **"Saved. REIBRY couldn't retrieve this video's description or cover."** The fallback "No caption or description was available." became "REIBRY couldn't retrieve a description."
3. **Not done, on purpose:**
   - no new extractor, scraper, headless browser, yt-dlp, metascraper or vendor;
   - no oEmbed `html` caption parsing, because TikTok's response contains none (no evidence it would help);
   - no Embed Player yet, because it adds a third-party iframe and tracking to the Memory page and still stores nothing searchable.

## G. Dependencies added

None.

## H. Fields recovered

**For the real affected TikToks:** none beyond the creator. TikTok legitimately exposes nothing more, as verified in section B.

**New path, verified live with a synthetic Shortcut-style share** (`@reibry.synthetic12k`, a non-existent post ID, clearly labelled):
- the cleaned shared text `Pink ombre birthday cake decoration with gold leaf #birthdaycake #cakedecorating`;
- removed as boilerplate: "Check out reibry.synthetic12k's video!", `#TikTok` and the URL.

## I. Provenance of each field

| Field | Source label |
|---|---|
| Creator | `url` (from the canonical TikTok URL) |
| Title | `reibry-placeholder` (shown as "Saved TikTok video") |
| Shared words | `share-sheet` (UI: "Shared with the link") |
| Note | `user` (unchanged; empty in the test) |

Caption, cover and hashtags were not set, because none were provided.

## J. Still unavailable

For the owner's real TikToks:
- the official caption, title, cover and hashtags;
- the publication date;
- anything about what happens in the video.

A transcript or visual analysis of a third-party video is not legitimately available.

## K. Persistence after reload

- **Survives reload:** a fresh `GET /api/memories/<id>` after the save returned `sharedText` and its `share-sheet` provenance. They also survived enrichment, because the trusted database function merges metadata and provenance and doesn't replace them.
- **Re-sharing the same post** (with tracking parameters) returned `duplicate: true` with the same Memory ID.
- **Limitation:** a re-share of an *existing* Memory can't add shared words afterwards, because owners may update only the title and note. Adding it would need `sharedText` in the `apply_trusted_link_enrichment` allowlist: **a proposed migration, not applied**. The same limit applies when two TikTok share links merge into the older Memory: the removed Memory's shared words aren't carried over.

## L. Search and Home evidence

**Live, owner-scoped `/api/memories/search`:**

| Query | Result | Time |
|---|---|---|
| "birthday cake decoration" | Found (#2 after an older synthetic cake note) | 619 ms |
| "gold leaf cake" | Found (#2) | 448 ms |
| "cakedecorating" | Found (#1, only result) | 551 ms |

**User B:**
- reading the Memory → 404;
- enriching it → 404;
- searching → 0 matches.

**Home:** checked with tests only, no live Meta call, as required.
- `toModelEvidence` carries `shared_with_link` separately from `provider_caption` (null) and `user_note`.
- "Where's the pasta recipe from TikTok?" and "spinach parmesan" retrieve a Memory from its shared ingredients.

## M. Browser and mobile-shell checks

Real Chrome against `https://pc.tail4fe7d4.ts.net` as User A. Screenshots are in `test-results/stage12k/`.

| Width | Result |
|---|---|
| 390 px | Capture (with shared text), saved card, Memory page, the real TikTok Memory and Memories: app 390 px wide, five tabs (Home · Memories · Capture · Plans · Account), no sidebar, no horizontal overflow, 0 broken images |
| 1440 px | Memory page and Memories: **the centred 430 px mobile app** (left edge 505 px), bottom nav 430 px, no sidebar, no overflow |

YouTube regression: a retry on an existing YouTube Memory returned `complete` with its title, channel and cover in 1.15 s.

This was desktop Chrome with phone emulation, **not a physical iPhone test**.

## N. Timings (live)

| Step | Time |
|---|---|
| Save acknowledgement, tap → "Saved" card (includes `/api/capture`) | 1.11 s |
| Details settled after the tap (bounded request 2, synthetic post) | 3.76 s |
| Real owner TikTok, retrying details (short link + oEmbed) | 4.46 s (budget 6 s) |
| YouTube retry | 1.15 s |
| Search | 0.45–0.62 s |

Saving never waits for any third party.

## O. Tests and build

- `npm run lint`: 0 errors (the 4 warnings were already there).
- `npm run typecheck`: OK.
- `npm run build`: OK.
- `npm test`: **300/300**. There are 6 new tests in `tests/shared-text.test.ts`, and 2 copy assertions were updated.
- `git diff --check`: OK.
- Secret scan of the diff: clean.

## P. Physical iPhone check still needed (2 minutes)

1. In the **Save to REIBRY** Shortcut, add **Quick Look** directly after **Shortcut Input**, before *Get URLs from Input*.
2. In TikTok, share one public video → Share → **Save to REIBRY**.
3. Note whether Quick Look shows **any words besides the link** (caption, "Check out…", hashtags). Don't share account details or private messages. Remove Quick Look afterwards.
4. **Only if words appear:** change the **Text** action to:

   `https://pc.tail4fe7d4.ts.net/capture#url=[URL Encoded URLs]&text=[URL Encoded Shortcut Input]&src=shortcut`

   This needs a second **URL Encode** action applied to *Shortcut Input*, with its result inserted as the magic variable after `text=`. Capture will then show "Shared with the link: …" and keep the words.
5. If only the link appears, nothing changes: REIBRY will honestly keep just the link and creator.

## Q. Hosted-vendor options that need approval

- **YouTube Data API key:** official, about 1 quota unit per video. It would add YouTube descriptions.
- **Supadata:** transcripts and metadata. Third-party scraping is probable, and privacy and retention would need review.
- **Microlink:** a hosted metascraper; adds nothing for TikTok's WAF.
- **Apify TikTok actors:** unofficial scraping. Not recommended.

None was signed up for or called.

## R. Commit

A local commit on `feat/original-product-parity` (the SHA is in the commit log). Not pushed.
