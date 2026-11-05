# REIBRY Meta Edition: Demo Script

Target length is about 4 minutes. The demo uses one pre-confirmed demo account
on the production domain, and only synthetic, non-personal content. **Ask
REIBRY makes one real, billable Meta Muse Spark call** (measured at about
$0.0015 in Stage 12D). Run it once.

## Before recording

- [ ] Sign in to the demo account on the production domain, never on a preview
      URL.
- [ ] Remove leftover data from rehearsals, or start with a fresh demo
      account.
- [ ] Check that Ask works with one rehearsal question, then wait more than
      60 s. The limit is 5 requests per user per minute.
- [ ] Use a 390 px phone frame or a real phone. The UI is mobile-first.
- [ ] Have the fallback lines (bottom of this page) ready in case Meta is
      unavailable.

## Flow

| # | Screen | Action | What to say |
| --- | --- | --- | --- |
| 1 | `/` Home | Show the composer and suggestion chips | "REIBRY turns what you save into what you get done: *from saved to done*." |
| 2 | `/capture` | Save a note: *"Lagos trip: try the suya spot on Victoria Island, book a hotel near Lekki."* Then save a public YouTube or TikTok link | "Capture keeps the original source. Links are recorded as metadata only; we never claim to have watched a video." |
| 3 | `/memories` | Search `lagos` | "Retrieval is lexical and owner-bound. Every result is literal stored evidence." |
| 4 | `/life` | Type *"Trip to Lagos tomorrow"* and add it to Life (the phrasing verified live in Stage 12F-2) | "Life understands what's coming up, with deterministic date parsing." |
| 5 | `/today` | Show the trip and the resurfaced Lagos note with "Why this came back" | "Today resurfaces saved items when they matter, and explains why." |
| 6 | `/ask` | Ask: *"What should I sort out for my Lagos trip?"* (**the one Meta call**) | "Ask REIBRY uses **Meta Muse Spark** through the Responses API with a strict JSON schema. Every citation must be one of my own Memories, or the answer is rejected." |
| 7 | `/ask`, suggestions | Review a suggested step and **confirm** it | "The model only proposes. Nothing happens until I confirm, and a confirmed step becomes an Action Card exactly once, even on retry." |
| 8 | `/actions` | Show the Action Card with its linked Memories | "Each card links back to the evidence it came from." |
| 9 | `/plans` → new Plan | Create *"Lagos trip"* and attach the Lagos Memories and the Life trip | "Plans gather Memories and Life context. Saves are idempotent and versioned." |
| 10 | `/plans/[id]` | Open the Ready Pack candidates, choose items per section, confirm, then tick a checklist section | "A Ready Pack is built only from Memories already attached to this Plan, and only after I choose them." |
| 11 | (optional) | Edit the Plan in two tabs, then save the stale one | "Concurrent edits get an honest *changed elsewhere* message within half a second, not a spinner." |

## Security talking points (about 20 s)

- **Ownership in the database.** Every table enforces row-level security
  (forced) and checks ownership with `auth.uid()`. Verified live with two real
  users in both directions.
- **Proposal creation is server-only.** The proposal RPC is callable only by the
  server after it validates the Muse output. Signed-in and anonymous clients
  get `42501`.
- **Server-only credentials.** Sessions use HttpOnly cookies, keys never reach
  the browser, and every write requires the same origin.

## Fallback if Meta is unavailable or rate-limited

Ask shows a clear error (`AI_UNAVAILABLE`, `AI_RATE_LIMITED`, or
`AI_TIMEOUT`) and never invents an answer.

Say: *"REIBRY fails closed rather than inventing an answer."* Then continue at
step 9 (Plans and Ready Packs), which do not depend on the model.

## Do not claim

- Semantic or vector search, voice capture, notifications, or password reset.
- External actions, such as booking or messaging, being executed.
- Physical-device accessibility testing.
- That the Stage 12F-2 synthetic test proposals are real Muse output.
