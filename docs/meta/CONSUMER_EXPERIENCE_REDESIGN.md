# Stage 12J-3: Share fix and flagship consumer redesign ("Personal Memory Atlas")

- **Branch:** `feat/original-product-parity`. **Base:** `08bb4dd`.
- **Inspected:** the real app through the private Tailscale origin (`https://pc.tail4fe7d4.ts.net`), Serve tailnet-only and Funnel off, as synthetic test user A (and B for isolation), in headless Chrome at 375, 390, 430, 768 and 1440 px.
- **Not done:** no Meta calls, no migrations, no new users, no deployment, and nothing published.

## A. What the UI looked like before (diagnosis)

**Screenshots:** `test-results/stage12j3/before/*.png` (80 = 16 screens × 5 widths) and the contact sheets `test-results/stage12j3/sheet-before-*.png`.

1. **Real bugs shown to users.** Every Memory page said "This Memory could not be loaded." under a Memory that *had* loaded. Plans said "Unable to load Plans." above loaded plans. A Plan page said "Plan not found or unavailable." above the plan.
   - **Cause:** fetches treated a cleanup cancellation (React development mode runs effects twice, or the user navigates away) as a failure.
   - **Note:** the private iPhone instance runs in development mode, so the owner would have seen these.
2. **Desktop was a 430 px phone strip** in an empty 1440 px window, and the search form was squeezed into two columns.
3. **The Memories list was text-only and technical.** It had no covers and showed "processing", "failed", "analysed · complete", US-style dates, "Lexical search only…", and scores with match reasons in results.
4. **The Memory page was an edit form.** A title input was the main element, then a raw `utm_` URL and "Processing status: processing…".
5. **Capture was an engineering form:** a Link/Note radio, separate fields, and the experimental "Save a short video" upload card.
6. **Engineering language throughout:**
   - "hardened Supabase SSR boundary", "Live Supabase authentication has not yet been verified";
   - "Muse Spark only receives bounded matching Memories", "persistent internal planning artifacts";
   - "Metadata-only saved link", "Stage 11 profile backend", "Life chronology", "link · processing".
7. **Small type and targets:** 575 visible text elements under 12 px and 207 undersized tap targets across the 80 screenshots. No horizontal overflow.
8. **Generic brand:** the system font ("Geist" was named but never loaded), a mint-on-mint palette, flat white boxes and hairline borders everywhere.

## B. The physical-iPhone share bug: findings

**Owner's Quick Look diagnosis on the real iPhone (the confirmed root cause):**

- Directly after **Get URLs from Input**, Quick Look showed the TikTok URL correctly.
- Directly after the **Text** action, it showed only the REIBRY Capture address ending in `#url=`, with **no TikTok link**.
- So the Shortcut's **Text** action has a missing or wrongly connected **Magic Variable**: the URL never reached REIBRY. **The REIBRY web app was not dropping the link.**

**What this stage did and did not change:**

- **The capture link parser is unchanged.** Changes were briefly made earlier in this stage and were reverted to the committed version as soon as the owner's evidence arrived.
- **Additive REIBRY changes:**
  - **No silent blank page:** if a share opens Capture with no usable link (exactly the `#url=` case), Capture now says "Your Shortcut opened REIBRY, but no link came with it" (or "Something was shared, but no link came with it"). It offers **Paste link** and a **What arrived** disclosure showing what was received, on the owner's own device only.
  - **Already-open tab:** if Safari reuses an open REIBRY tab, only the `#fragment` changes and the page does not reload. Capture now listens for `hashchange`, so a share into an open tab is still picked up.
  - **History state:** the shared link is removed from the address bar with `history.replaceState(history.state, …)`, which keeps Next.js's own history state.
- **Verified in the browser** (desktop Chrome at 390 px, **not** the physical iPhone):
  - empty `#url=` → the notice;
  - encoded TikTok `#url=` → prefilled;
  - a fragment-only change in an open tab → prefilled;
  - plain-text TikTok share text → the link is saved and the surrounding words become the note;
  - signed-out query and fragment handoffs survive sign-in;
  - nothing is saved without the tap.

## C. Shortcut corrections needed (on the iPhone)

**Fix the existing Shortcut:**

1. Open **Shortcuts**, long-press **Save to REIBRY**, then **Edit**.
2. In the **Text** action, delete everything after `#url=`.
3. Put the cursor right after `#url=`. In the bar above the keyboard, tap **URL Encoded Text** (the output of the URL Encode action). It must appear as a **coloured variable pill** inside the text, not as typed words. If it isn't offered, tap **Select Variable**, then tap the URL Encode action's output.
4. Check the chain: **Get Item from List** takes **URLs**, **URL Encode** takes **Item from List**, and **Open URLs** takes **Text**.
5. Optional, for clearer messages: make the text `https://pc.tail4fe7d4.ts.net/capture#src=shortcut&url=` followed by the **URL Encoded Text** pill.
6. Test: temporarily add **Quick Look** after **Text**, then share from TikTok. It must show `…/capture#url=https%3A%2F%2Fwww.tiktok.com%2F…`. Then remove Quick Look.

**Alternative, shorter Shortcut** (REIBRY already finds a link inside shared text):

- **Receive** URLs, Text and Safari web pages → **URL Encode** (*Shortcut Input*) → **Text**: `https://pc.tail4fe7d4.ts.net/capture#src=shortcut&text=` followed by the **URL Encoded Text** pill → **Open URLs**.

**What a Shortcut must never contain:** passwords, tokens or user IDs. It only builds a link, and you sign in once in Safari.

## D. Capture

- **One obvious action:** a single large field, "Paste a link or write a note…".
- **It recognises what you entered as you type:** "TikTok link", "YouTube link", or "Saved as a note, exactly as written". When a share includes words around the link, those words become your note, and you can switch to saving it as a note instead.
- **Paste** button (clipboard; iPhone shows its own Paste prompt). Title and note sit behind **Add a title or note**. The main button reads **Save to REIBRY**.
- **Immediate confirmation card:** "Saved" or "Already saved", with the Memory's cover or tile, title and platform. It then shows **Getting details…**, followed by **Details ready** or **Limited details** with a plain reason, plus **Retry getting details**, **View Memory** and **Save another**.
- **"Saving from other apps" guide:** Copy link → Paste, or the iPhone Shortcut. It also says REIBRY never watches a video unless asked.
- **Kept as before:**
  - save-first then details;
  - one request per tap (an in-flight guard);
  - nothing saved from a share without a tap;
  - no-referrer;
  - the address bar cleared after prefill;
  - the signed-out handoff.
- Provider diagnostics and raw statuses never appear.

## E. Design direction and tokens: "Personal Memory Atlas"

| Element | Choice |
| --- | --- |
| **Palette** (`src/app/tokens.css`) | Warm paper background `#F7F4EE` on white surfaces; REIBRY deep teal `#0B4F45`/`#0F6B5C` as the brand; one restrained warm accent `#C8643F` (text form `#A84E2C`, tint `#F8E7DD`) for eyebrows and notes |
| **Contrast** | Checked against WCAG: body 15.2:1, muted 6.9:1, outline 4.6:1, white on teal 9.5:1, warm text 5.5:1 |
| **Type** | Headlines in an editorial system serif (New York on iPhone, Georgia elsewhere); interface in the system sans. **No web fonts or new dependencies.** Scale 12/13/15/17/20/24/30/38. |
| **Radii** | 10/14/20/28 and pill |
| **Shadows** | Warm, soft, three levels |
| **Spacing** | 4–64 |
| **Motion** | 180 ms ease-out; respects reduced motion |
| **Layout** | Phone: sticky translucent header and a bottom bar with a raised Capture button (Home · Memories · Capture · Plans · Life). ≥ 700 px: wider column. ≥ 960 px: a **sidebar** with the brand, "Save something" and every destination; content up to 1,120 px. |
| **Images** | Covers in fixed-ratio frames (1:1 on cards, 16:10 on the Memory page, 64 px thumbnails), so there is no layout shift. Platform covers load with `referrerPolicy="no-referrer"` and fall back on error. |
| **Platform tiles** (when a platform shares no cover) | Designed gradients for TikTok, YouTube, Instagram, web and your videos, with a **generic glyph, not a platform logo**, so a tile is clearly a placeholder and never a fake video frame. A **note** tile is lined paper showing the note's own first words. |

The new styles are in `src/app/atlas.css`, loaded after `globals.css` from `src/app/layout.tsx`.

## F. Screens reviewed (all rendered in the real app)

**Seen at all five widths, before and after:**

- Home
- Capture
- Memories
- Memory pages: YouTube with a cover, TikTok without details, a text note, and an analysed video
- Today
- Life and Life → Manage
- Plans and a Plan page with its Ready Pack
- Action Cards
- Ask REIBRY
- Account
- Sign-in (signed out)

**Seen only in functional checks:** a search with results, the Capture confirmation and duplicate states, the empty-share notice, and the new-plan form preselected from a Memory.

**What changed:**

- **Shell:** new shell and navigation; Today, Ask, Action Cards and Account in the header menu (all in the desktop sidebar).
- **Home:** a centred reading column; cited Memory cards open the Memory itself; plain-language labels.
- **Life and Today:** tokens and copy ("Life", "Nothing dated is coming up yet.").
- **Plans:** side-by-side actions; "Saved link" instead of "link · processing"; Ready Pack items admit a link's limits in plain words.
- **Action Cards:** "Yours to do · Not executed".
- **Account:** rewritten in plain words (sign-out here doesn't sign out other devices; reminders not available yet).
- **Sign-in:** a branded mark and serif wordmark.

## G. Memories and the Memory page

**Shared presentation helper:** `src/lib/memory/presentation.ts`, one source of truth for every Memory surface.

- **Title:** the real title, or an honest "Saved TikTok video" while only a placeholder exists. A title counts as generic only when its *text* is a placeholder; a stale marker alone isn't enough. This fixed "Saved developer.mozilla.org" for "JavaScript | MDN".
- **Summary:** only from the platform's caption ("From YouTube"), a real video analysis ("From REIBRY's look at your video") or a note's own text ("Your note"). **Never from a URL.**
- **Dates:** "Saved today", "Saved yesterday", "Saved 3 days ago", "Saved 2 Sep".
- **Covers:** https only.
- **Details state:** a friendly reason when a platform shared little.
- **"What REIBRY knows":** grouped by source ("Shared by TikTok", "From you", "Seen in your video", "Heard in your video", "REIBRY's interpretation (not a fact)"), plus **Not known yet** (for example "What happens in the video itself — REIBRY hasn't watched it").

**Memories collection:**

- a serif heading with a live count;
- a sticky search bar;
- type filters showing only kinds you have (All, TikTok, YouTube, Instagram, Web, Notes, Your videos);
- an image-led grid (2 / 3 / 4 columns);
- skeleton loading;
- a designed empty state;
- **Show more** paging (48 at a time, previously stopped at 20).

Search results are the same cards, with no scores or reasons. The `#memory-<id>` anchors used by Home citations are kept.

**Memory page:**

- **Main content:** a large cover or tile; kind, creator and saved date; a serif title; the true summary with its source; your note in its own card (with a real "Your note" label); hashtags only when the platform supplied them.
- **Limited details:** a plain reason and **Try getting details again**.
- **Actions:** **Open on TikTok / YouTube / …** and **Use in a plan** (opens a new plan with this Memory ticked; nothing is saved until you confirm).
- **In your plans:** shown from real plan links.
- **Collapsible:** **What REIBRY knows** (including the saved link), **What REIBRY found in your video** (analysed videos only), and **Edit title or note**.

Nothing is deleted or merged by the UI, and Plan and Ready Pack references are unchanged.

## H. Screenshots

All are in `test-results/stage12j3/` (local and gitignored, not part of the commit; the folder is kept):

| Set | Files |
| --- | --- |
| Before | `before/<screen>-<width>.png` and `sheet-before-a|b|c|desktop.png` |
| After | `after/<screen>-<width>.png` and `sheet-after-a|b|c|desktop.png` |
| Iterations | `iter1/`, `iter2/`, `iter3/` and their sheets |
| Acceptance | `accept-390-empty-share.png`, `accept-390-saved.png` |

**Measured on all 80 screen-and-width combinations:**

| Measure | Before | After |
| --- | --- | --- |
| Horizontal overflow | 0 | 0 |
| Visible text under 12 px | 575 | 139 |
| Undersized tap targets | 207 | 94 |
| Broken images | 0 | 0 |

What's left is mostly the development-only Next.js indicator (absent in production) and the Ready Pack checkboxes. Those have full-height label tap areas, but each control is visually 19 px.

## I. Hidden from the consumer UI

- database IDs
- raw JSON
- model names ("Muse Spark", "Muse Voice Transcribe")
- API routes
- internal error and reason codes
- schema fields
- `source_type` and status enums ("processing", "complete", "failed")
- evidence limits ("metadata-only", "stored evidence")
- provenance objects
- retrieval scores and match reasons
- raw saved URLs (now only inside "What REIBRY knows")
- repeated timestamps
- "Meta Edition" and "Stage N" wording

All of this stays in the backend and its tests.

## J. Video upload gating

- **Off by default:** the manual **Save a short video** card is removed from Capture.
- **Turning it on:** `REIBRY_EXPERIMENTAL_VIDEO_UPLOAD=true` (server-only, not set) brings back the upload card, the video upload API and the on-demand analysis API. Without it, both endpoints return **404**, verified live.
- **Untouched:** existing video Memories, their stored analysis, Storage objects, tables and migrations. An analysed video's results still show on its Memory page; without the flag, it just has no Analyze or Retry controls.

## K. Workflows preserved

- save-first capture with separate details;
- verified TikTok de-duplication;
- the share prefill and signed-out handoff;
- one save per tap;
- Memory list, search, detail and edit;
- Home conversation, citations and Life drafts;
- Plans, Ready Packs (explicit confirmation, nothing selected automatically) and Action Cards (never executed);
- cross-user isolation;
- the private Tailscale access.

**Bugs fixed in passing:**

- the false error messages on Memory, Plan, Plans and Ready Pack loads;
- a stale smoke-test expectation from Stage 12J-1. Signed-out `/capture` deliberately returns the sign-in handoff (200, no form). Stage 12J-1's regression ran tests before the build, so that test checked an older build. This stage builds first.

## L. Accessibility (mobile and desktop)

- **Contrast:** text contrast at least 4.6:1.
- **Text size:** readable sizes, 15 px body and 12 px minimum for labels and badges.
- **Touch targets:** 44 px minimum on new controls.
- **Labels:** visible focus rings and labelled controls (search, paste, clear, filters with `aria-pressed`, the navigation landmark).
- **Announcements:** `aria-live` on capture detection, the saved card and the share notice; skeletons are `aria-hidden` with a status message for screen readers.
- **Real labels:** "Your note" is real text, no longer CSS-generated.
- **Motion:** reduced-motion respected.
- **Layout:** no horizontal overflow at any tested width, and fixed image ratios (no layout shift).
- **Desktop and keyboard:** a desktop sidebar with keyboard-reachable links, and the skip link kept.

## M. Browser acceptance (private origin, 390 px, real app): 21/21

**Main run (17/17):**

- empty `#url=` notice;
- encoded TikTok `#url=` prefill, recognised as TikTok;
- link removed from the address bar;
- no save without a tap;
- an open-tab fragment change is picked up;
- plain-text share → link plus note;
- **a double click sends exactly 1 save** (confirmation shown after about 1.8 s);
- re-sharing the verified identical TikTok post → "Already saved";
- 25 image-led cards, with an honest TikTok tile where there's no cover;
- no engineering vocabulary on Memories;
- search "mosh" → the course card;
- card → Memory page with cover, creator, note and "Open on YouTube";
- no false load error;
- **Use in a plan** opens a new plan with the Memory ticked, with no plan request sent;
- no false Plans error;
- video upload and analysis endpoints 404 with the card hidden;
- User B gets 404 and doesn't find User A's Memory.

**Signed-out handoff (4/4):** for both fragment and query, sign-in is shown with the link out of the address bar, and after sign-in the link is in the Capture box with nothing saved.

## N. Tests and build

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors (the 4 earlier warnings in old capture tests) |
| `npm run typecheck` | pass |
| `npm run build` | pass, run **before** tests |
| `npm test` | **294/294**, including 8 new presentation tests and the smoke test against the new build |
| `git diff --check` | pass |
| Browser bundles | no `.env.local` key values or server-only markers in 25 files |
| Original REIBRY | unchanged at `76d3494` |

## O. Still to validate on the physical iPhone

- Apply the Shortcut correction (section C), then share from TikTok: the link must appear in Capture.
- Tap **Save to REIBRY**, and check the confirmation, then Memories, then the Memory page.
- Optionally share into an already-open REIBRY tab.

**None of this was tested on a physical device in this stage.**

## P. Toward true one-tap background capture

**First, three separate things:**

1. **Saving a shared link** and whatever metadata the platform publishes. This is what REIBRY does.
2. **Getting the underlying social video.** Sharing a TikTok URL gives neither permission nor technical access to download the video. REIBRY doesn't do this.
3. **Analysing media** that is uploaded or legitimately accessible (the experimental, gated path).

**Options, shortest secure route first:**

| Option | Experience | What it needs |
| --- | --- | --- |
| **Shortcut + capture token** | The Shortcut POSTs the link to a capture-only endpoint with **Get Contents of URL** and shows "Saved" without opening Safari | A **new per-device, revocable, capture-only token** (never a password or the Supabase session), rate limits, owner-visible revocation, and a security review. It is a new authentication scheme, so **not built without explicit approval.** |
| **Native iOS Share Extension** | The true one-tap share target, the same as the original Android experience | A native app, an Apple developer account, a shared keychain or session, and App Store or TestFlight distribution |
| **PWA share target** | The original REIBRY approach (`share_target` → `/capture`) | Already works on Android and desktop Chromium; **iOS Safari does not support it.** Adding it to this edition is small but Android-only. |
| **Current flow** | Shortcut → Capture prefilled → **Save** tap | Secure today, needs no new credentials |

## Q. Remaining limitations

- The share fix depends on the owner editing the Shortcut (C). Nothing was tested on a physical device here.
- TikTok often shares no caption or cover through its public preview, so many TikTok Memories show the honest tile and "Saved TikTok video". That's correct, but less rich than YouTube.
- Search is word-based over saved details. There are no semantic or visual results.
- The development-only Next.js "N" indicator appears in screenshots of the private dev instance (not in production); `next.config.ts` was left limited to the approved `allowedDevOrigins`.
- Ready Pack checkboxes are visually small, though their labels are full-size tap areas.
- Synthetic test Memories (titles like "[Synthetic 12I] …") appear as they are; they're real stored test data, not hidden.

## R. Commit

The local commit SHA is reported in the hand-off message. It was not pushed or deployed.
