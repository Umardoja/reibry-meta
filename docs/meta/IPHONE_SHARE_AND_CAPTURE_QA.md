# Stage 12J-1: iPhone share-to-REIBRY and Capture QA

This is local only: no deployment, tunnel, migration or Meta call. It was tested in the real local app with the existing synthetic users A and B.

## 1. How the handoff works

iOS Safari does not support the Web Share Target that original REIBRY declares in its PWA manifest (`/share-target`), so the iPhone route is an **Apple Shortcut**:

**Share in TikTok (or any app) → REIBRY Shortcut → opens `…/capture#url=<link>` → Capture is prefilled → user taps Save → saved → details are fetched separately**

- **Prefill only.** Opening the link never saves anything. The user always taps **Save Memory**.
- **Two handoff forms are accepted:**
  - `/capture?url=<encoded link>`, with optional `&title=` and `&text=`;
  - `/capture#url=<encoded link>`, recommended for the Shortcut. The part after `#` is never sent to the server, so the shared link does not appear in server request logs or Referer headers.
- **What is accepted:**
  - HTTPS links only. A link inside shared text is found ("Check out this video https://vm.tiktok.com/…").
  - At most 2,048 characters for the link, 5,000 for text and 200 for the title.
  - Credentials in the URL, `http:`, `javascript:`, `data:`, `ftp:`, `localhost` and dotless hosts are rejected.
  - Any other parameter (for example a user ID, email or `next`) is ignored. **No user identity travels in the link.**
- **After prefill,** the page removes the link from the address bar and history. The page also tells the browser to send **no referrer** at all.
- **Signed out:** the link is kept in that browser tab only (session storage, 1-hour limit). The user is sent to `/auth?next=/capture`, and the prefill returns after sign-in.
  - Sign-in's `next` is a fixed allowlist of app routes, so there are no open redirects.
  - The proxy now lets a signed-out `/capture` visit reach the page, so a `#url=` fragment, which the server cannot see, survives sign-in. That page renders only "Sign in to capture…", with no form and no data.
- **Saving** is one request and the details are a second. A double tap sends one save.

## 2. Create the Shortcut on the iPhone

You can do this now. It needs the REIBRY HTTPS address from section 6 before it can actually open REIBRY.

1. Open **Shortcuts**, tap **+**, and name it **Save to REIBRY**.
2. Tap the **ⓘ** (Details) button and turn on **Show in Share Sheet**. Under **Receive**, keep **URLs**, **Safari web pages** and **Text**. Optionally, set **If there's no input** to **Ask For Clipboard**.
3. Add **Get URLs from Input**, with input **Shortcut Input**. TikTok often shares text with a link inside.
4. Add **Get Item from List** → **First Item**.
5. Add **URL Encode** → **Encode** the item from step 4.
6. Add **Text**, and type `https://<your-private-REIBRY-address>/capture#url=`, then insert the **URL Encoded Text** variable right after `=`.
7. Add **Open URLs** with the **Text** from step 6.
8. Done. In TikTok: **Share → More (…) → Save to REIBRY**. Safari opens Capture with the link filled in; check it and tap **Save Memory**.

**What the Shortcut must not contain:** account details, passwords, tokens, cookies or user IDs. It only builds a link.

**Sign-in:** you sign in to REIBRY in Safari once. The session cookie stays in Safari.

## 3. Local Capture results (real app, 390 px headless Chrome, 20/20)

| Check | Result |
| --- | --- |
| `?url=` share pre-fills the link and the title | PASS |
| `#url=` share pre-fills the link | PASS |
| The link is removed from the address bar after prefill (both forms) | PASS |
| Opening a share URL saves nothing | PASS (0 save requests before the tap) |
| Invalid shared link (`javascript:`) | not prefilled |
| Unsafe link sent straight to the save endpoint (`http://192.168.1.1/admin`) | 400 |
| Signed out, query handoff | sign-in → `/capture` prefilled, nothing saved |
| Signed out, fragment handoff | sign-in → `/capture` prefilled, nothing saved |
| Double click on Save | exactly **1** save request, **1** Memory |
| Save timing | save request **593 ms**; "Saved" shown after 688 ms; TikTok details request separate, 3.7 s |
| Slow or unresolvable TikTok details | the link stays saved ("Limited details", `share-link-unresolved`) |
| No cross-site request carried the Capture address as Referer | PASS |
| The capture appears in Memories and in search | PASS |
| User B reads, refreshes or searches User A's capture | 404 / 404 / not found |

## 4. TikTok short and full links

**What TikTok does today**, observed through REIBRY's own bounded, SSRF-safe resolver with synthetic share codes:

- `vm.tiktok.com/<code>/`, `vt.tiktok.com/<code>/` and `www.tiktok.com/t/<code>/` all answer **302 → `www.tiktok.com/` (with tracking parameters) → 200**.
- That reveals no post, so the result is `share-link-unresolved` in 2.3–3.3 s. **No post ID is guessed.**
- Full links `www.` and `m.tiktok.com/@user/video/<id>`, with any tracking parameters (`is_from_webapp`, `sender_device`, `_r`, `_t`, `web_id`), have the identity `tiktok:<id>`. Tracking parameters are never identity.

**Rules (new in this stage):**

- **Same verified post ID → one Memory. A different ID → never merged.** "Verified" means:
  - from a full link, the post ID is in the URL itself;
  - from a share link, it comes only from the resolver following TikTok's own redirect to `/@user/video/<id>`, within TikTok hosts, at most 3 hops, over HTTPS to public addresses.
- **Saving a full link** checks the user's own earlier Memories for that post ID. This is a database read; the save still never contacts TikTok.
- **Enriching a share link** that resolves to a post the user already has merges the two:
  - the **older** Memory is kept;
  - the other's note and user title fill only what the kept one lacks;
  - the newer copy is removed;
  - the page says "This is the same TikTok post you saved before…";
  - the response reports `merged: true` without the removed ID.
- **If resolution fails** (404, blocked, an unsafe redirect, a timeout or an unknown code), nothing merges and the saved link is kept.
- **Users are never merged** across each other: every lookup is owner-scoped.
- **No video media** is fetched or downloaded, and access restrictions are never bypassed.

**Evidence:**

- **Mocked tests:**
  - full link then share link;
  - share link then full link (the save makes no network call);
  - two share codes for one post;
  - a different post ID;
  - 404, 403, unsafe redirect and timeout;
  - older-kept ordering;
  - cross-user.
- **Live:** re-sharing the existing scout2015 post with new tracking parameters returned the same Memory ("Already saved", 1 Memory). A synthetic unresolvable share code stayed its own Memory.
- **Not tested live:** a genuine short-to-full merge. No real TikTok share code was available, and creating one requires the TikTok app.

## 5. Can the owner's iPhone reach the local app?

| Path | Works? | Why |
| --- | --- | --- |
| iPhone → `http://<PC LAN IP>:3000` | **No, by design** | REIBRY accepts a non-HTTPS origin only on loopback (`canonicalOrigin`), so any other HTTP address is refused as "not configured". Making it work would mean weakening origin protection, which is not allowed. Next also blocks dev assets for other hostnames unless `allowedDevOrigins` lists them. |
| Private HTTPS inside your own network (for example Tailscale with `tailscale serve`, reachable only by your devices) | Yes | Needs software installed on the PC **and** the iPhone, plus two local settings: `AUTH_SITE_URL` set to that `https://…` address, and `allowedDevOrigins` set to its hostname. HTTPS turns on secure cookies. No Supabase Auth setting changes are needed for password sign-in. |
| Local certificate authority (for example mkcert) and trusting its profile on the iPhone | Possible | Installs software and a device certificate profile; more setup than the private-network option. |
| Public tunnel (ngrok, cloudflared) | **Not recommended** | Exposes the development app and its disposable data to the internet. |
| Vercel preview | Out of scope | That is a deployment. |

**Note:** `next dev` listens on all network interfaces by default (`0.0.0.0`), so while it runs it may be reachable on the local network, depending on the Windows firewall. Running `next dev -H 127.0.0.1` keeps it local when phone testing isn't needed.

**Physical iPhone testing was not done.** Every working option needs an installation or local setting change that requires owner approval (section 6).

## 6. Owner approval needed for the physical iPhone test

Recommended, the smallest safe option:

1. Approve installing **Tailscale** on the PC and the iPhone, signed in to the same private network (tailnet).
2. Approve running `tailscale serve` for port 3000. That gives an HTTPS `*.ts.net` address reachable only by your devices. **Not** Funnel, which is public.
3. Approve local configuration for test sessions only: `AUTH_SITE_URL=https://<pc>.<tailnet>.ts.net` in `.env.local`, and that hostname in `allowedDevOrigins` in `next.config.ts`.
4. Then put that address into step 6 of the Shortcut and test from TikTok on the iPhone.

## 7. Remaining limitations

- A real short-to-full TikTok merge has been verified with mocks only.
- If enrichment never ran for a share link (the tab closed before details), it cannot be matched to the full link until a **Retry getting details** resolves it.
- When two Memories are merged, the removed copy's original share link is not kept as a separate field. The kept Memory keeps its own link, and the canonical URL and post ID are recorded.
- iOS only offers the Shortcut route. Android or desktop PWA share-target parity (original REIBRY's manifest) was not part of this stage.
