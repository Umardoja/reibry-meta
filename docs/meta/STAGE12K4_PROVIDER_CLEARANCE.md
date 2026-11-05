# Stage 12K-4 — Supadata provenance, rights, and integration gate

Date: 2026-11-02 (Africa/Lagos)
Scope: documented decision review only. This stage made zero Supadata, Meta,
Supabase, or other provider requests; changed no application, schema, iPhone
Shortcut, Tailscale, deployment, or original REIBRY file.

## Decision: CONDITIONAL GO for evidence gathering only — NOT cleared for implementation

Stage 12K-3 supplied a meaningful technical signal, but no public source found
in this review establishes that Supadata has TikTok authorization for this use,
that its returned TikTok `description` is a creator-authored caption, or that
REIBRY may persist/index/derive AI summaries from the returned third-party
fields. Do not enable or implement the integration until the vendor answers the
questions in section G in writing and qualified legal review confirms the
intended use.

This is a risk and product review, not legal advice or a definitive legal
opinion.

## A. Current technical evidence (confirmed)

The sanitized [Stage 12K-3 trial](./STAGE12K3_SUPADATA_TRIAL.md) tested five
public canonical TikTok posts with five metadata requests and two
`mode=native` transcript requests:

- 5/5 metadata requests returned HTTP 200 TikTok records with a nonempty
  `description`, creator fields, tags, a date, and an HTTPS CDN thumbnail URL.
- 0/5 had a `title`. Average metadata latency was 2,626 ms.
- The two previously affected owner-share posts changed from REIBRY's empty
  official-oEmbed result to a nonempty vendor `description`.
- Native transcripts were not a useful basis for the product: one was a
  seven-character timestamped result and the other was unavailable. No
  generated transcript, polling, download, or `/extract` call occurred.
- The Free plan had 100 credits before the trial and 93 after it; seven credits
  were consumed at $0.00. This says nothing about field provenance or durable
  production pricing.

The trial is evidence that the endpoint can return useful-looking fields. It
does **not** establish an authentic caption, correct creator identity, thumbnail
ownership, field accuracy, lawful source acquisition, retention rights, or
production reliability.

## B. Primary-source findings

### Supadata: confirmed statements

| Topic | Confirmed statement | What it does not establish |
| --- | --- | --- |
| Access licence | The [Terms §3, “License & Access”](https://supadata.ai/legal/terms) grant the customer a limited, non-exclusive, non-transferable, revocable licence to call Supadata's API. | It is not a grant from TikTok or a licence to redistribute creator content. |
| Source and ownership | [Terms §4, “Data Origin & Ownership”](https://supadata.ai/legal/terms) says API data (unless customer-supplied files) originates from publicly accessible sources supplied by independent third-party providers; original creators retain IP rights and no ownership transfers. | It does not identify the provider, collection method, TikTok authorization, or per-field provenance. |
| Customer responsibility | [Terms §5](https://supadata.ai/legal/terms) places compliance with law, data protection, and each related platform's terms on the customer. | A vendor DPA does not shift TikTok contractual risk to Supadata or authorize the customer’s use. |
| Service reliability | [Terms §8](https://supadata.ai/legal/terms) describes best-effort service that may change or be discontinued. | It does not promise field stability, deletion propagation, availability, or accuracy. |
| Metadata | [Metadata documentation](https://docs.supadata.ai/get-metadata) documents a unified schema with nullable title/description, author, tags, `createdAt`, `media.thumbnailUrl`, platform and ID. | It does not define TikTok `description` as an original creator caption or say a thumbnail is durable/licensed for caching. |
| Privacy and logs | The [Privacy Policy §6](https://supadata.ai/legal/privacy) says public results may be cached for performance and request logs include endpoint, status, timing, IP and user agent for the relationship. | It does not give REIBRY a platform-content licence or establish a fixed cache TTL for every metadata field. |
| Controller/processor terms | The [DPA §§2–4](https://supadata.ai/legal/dpa) treats the customer as controller and Supadata as processor for Customer Content (including URLs and returned content), says content is processed on instructions, and says it is not used to train/fine-tune/improve AI models. | It does not prove that third-party platform extraction is authorized. |
| Retention | [DPA §9](https://supadata.ai/legal/dpa) describes transient processing, temporary media deletion, retained request metadata, and performance caching of public content. | It does not state a customer-controllable takedown or revocation mechanism for each TikTok field. |

Supadata makes no reviewed statement of an official TikTok partnership, creator
authorization, licensed TikTok data supplier, or written platform permission
for this metadata use. Absence of such documentation is an **open blocker**, not
evidence that no arrangement exists.

### TikTok: confirmed statements

- [TikTok Terms §3.4](https://t.tiktok.com/legal/page/us/terms-of-service/en)
  prohibits scraping, crawling, exporting, or otherwise extracting platform
  data/content through automated systems unless TikTok gives written approval;
  it also restricts commercial use of TikTok/other-user content unless TikTok or
  the user permits it. A user sharing a public URL with REIBRY is not, on its
  own, documented written approval for a third-party provider’s extraction.
- [TikTok Developer Terms, II.1](https://t.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en)
  allow automated collection only through TikTok Developer Services and only as
  documentation permits. The same terms require accurate user privacy
  disclosure (III.2(c)), forbid bypassing access restrictions (III.3(m)),
  require preserving attribution/source notices (III.3(n)), and require deleting
  TikTok Information obtained through Developer Services when those services
  terminate (VI). Those terms govern TikTok-authorized paths; they do not make
  a non-TikTok vendor path authorized.
- The [Display API overview](https://developers.tiktok.com/docs/en/display-api-overview)
  is scoped to a TikTok user’s public videos with `user.info.basic` and
  `video.list` permissions. Its [getting-started guide](https://developers.tiktok.com/docs/en/display-api-get-started)
  requires developer/app approval, an authorizing TikTok account, and scopes;
  it describes user-selected **own** videos. It is not an official general
  metadata solution for arbitrary third-party public posts.
- The [Embed Player](https://developers.tiktok.com/docs/en/embed-player) and
  [Embed Videos](https://developers.tiktok.com/docs/en/embed-videos) documents
  support displaying a public post in TikTok’s player; the embed guidance says a
  removed post becomes unavailable outside TikTok too. Embedding does not grant
  a right to copy, persist, index, or derive summaries from separate text/image
  metadata.

## C. Provenance, rights, and privacy gate

### Confirmed facts

1. Supadata returned technically useful fields in a small controlled sample.
2. Supadata's contract says creators retain IP; customer compliance remains the
   customer’s responsibility.
3. TikTok has a documented official, user-authorized metadata route for a
   user’s own videos and an embed route for displaying public posts.
4. REIBRY already saves the original link before enrichment, preserves the
   user’s title/note, keeps an honest limited-details state, deduplicates known
   TikTok post IDs, and labels source metadata.

### Ambiguities and technical assumptions

1. It is unknown whether Supadata uses a licensed provider, TikTok-authorized
   interface, permitted browser access, or another method. Do not infer this
   from the fact that the response succeeded.
2. It is unknown whether `description` is an exact creator caption, vendor
   normalization, a platform description, generated text, or a cached copy.
3. It is unknown whether creator fields, tags, publication date, and thumbnail
   are first-party, current, complete, or associated with the exact post.
4. A vendor thumbnail URL may be signed, temporary, replaced, removed, or
   unavailable after privacy/moderation/deletion. TikTok’s own Display API warns
   that cover URLs expire; that is an indicator of thumbnail fragility, not a
   TTL promise for Supadata’s URLs.
5. It is unknown whether Supadata detects private/deleted posts, propagates
   deletion, supports a per-URL purge, or can provide a data-origin audit trail.

### Required legal and vendor review questions

- Does the intended personal-library storage/search/AI-assistance use fit the
  vendor’s rights and TikTok’s platform terms in each target jurisdiction?
- Is the user’s own URL submission a sufficient lawful basis for sending that
  URL and returned creator data to Supadata? Is an explicit opt-in sufficient?
- May REIBRY persist and index the returned text and creator data, or only
  display them transiently? May it retain a thumbnail reference? May it generate
  a private summary based on it?
- What deletion/revocation flow is required when a post becomes private,
  deleted, moderated, or its creator requests removal?

Only qualified counsel and written vendor answers can resolve those questions.

## D. Field-by-field technical suitability (design only)

REIBRY currently stores link facts in `Memory.metadata`, uses trusted enrichment
to update it, preserves user title/note, labels provenance, and searches stored
metadata. The following is a proposed mapping—not a schema or code change.

| Vendor field | Possible REIBRY destination | Use only if clearance is obtained | Current status / mandatory label |
| --- | --- | --- | --- |
| `platform` | Validate against parsed canonical URL as `tiktok` | Exact equality required | Validation only; never user-provided authority. |
| post `id` | Compare with existing `metadata.postId` | Numeric ID must equal canonical parsed/resolved ID | Reject mismatch; keep existing identity/dedupe rule. |
| `title` | Never replace a user title automatically; optional separate vendor field | Only with field provenance confirmed | 0/5 trial titles; currently unknown provenance. |
| `description` | Separate `vendorDescription`, not existing `caption` | Only after written answer permits storage/indexing/AI use | Label “Details supplied by Supadata; origin not verified” until/if evidence supports a stronger label. Never call it an official caption. |
| author username/display name | Separate `vendorAuthor`; do not overwrite URL-derived handle | Exact post/creator match and storage rights required | “Vendor-supplied creator detail”; 5/5 present, correctness unverified. |
| `tags` | Separate `vendorTags` with strict count/length/character limits | Storage/indexing right and provenance answer required | Vendor-supplied only; do not imply creator-set hashtags. |
| `createdAt` | Separate `vendorPublishedAt` | Strict ISO parse and date-range validation | Vendor-supplied timestamp; not publication-date proof. |
| `media.thumbnailUrl` | Ephemeral preview reference, not copied media | Explicit hotlink/cache/retention permission; HTTPS and allowlisted host | Do not cache/download. Label as vendor-supplied cover reference; unavailable image must degrade safely. |
| source URL | Existing `sourceUrl`/canonical TikTok link | Existing safe normalization only | Keep the user’s original submitted URL as already designed. |

The current `FieldSource` and `MetadataProvider` contracts allow only
user/URL/oEmbed/page sources. A future approved implementation must introduce
an explicit `supadata-unverified` provenance value rather than silently reusing
`tiktok-oembed`, `page-metadata`, or `caption`. It must not store a transcript
or claim visual/video understanding from any metadata field.

### Dedupe and re-enrichment

REIBRY’s existing constrained TikTok resolver obtains a canonical URL and a
numeric post ID from safe `vt.`/`vm.` redirects. The future boundary should use
that existing post ID to ensure a provider response belongs to the saved Memory
and to preserve owner-scoped duplicate handling. It must not alter URL parsing,
guess an ID, or create a new Memory. If the provider ID differs, discard the
response and record only a safe generic failure.

Re-enrichment must be manual, explicit, rate-limited, and disabled while the
clearance gate is open. It must never poll private/deleted posts, silently
refresh media, or overwrite the user’s title, note, shared-with-link words, or
existing verified provenance. A private/deleted result should leave the link
saved and show an honest unavailable state; it must not declare the original
Memory invalid.

## E. Minimal future opt-in boundary (not authorized to implement)

This is intentionally compatible with the centered 430px mobile shell, five
tab navigation, iPhone Shortcut handoff, and save-first Capture path. It adds
no normal video-upload workflow and does not replace the honest fallback.

1. **Save first.** The existing iPhone Share → Shortcut → Capture flow saves
   the link immediately with today’s authentic-source/limited-details behavior.
   Supadata is never on the critical path.
2. **User choice.** If permitted sources still lack details, an owner sees a
   disabled-by-default “Find more details” affordance only after an approved
   policy/disclosure exists. The disclosure says the public post URL will be
   sent to Supadata, lists fields that may return, says source provenance may be
   uncertain, links to retention information, and does not promise a caption,
   cover, transcript, or video understanding.
3. **Explicit confirmation.** A verified owner must confirm each lookup. No
   background, capture-time, search-time, or model-triggered call is allowed.
4. **Server boundary.** A server-only key, trusted session identity,
   owner-owned Memory read, bounded canonical URL, post-ID match, fixed endpoint,
   schema validation, 10–15 second timeout, no automatic retries, no raw-body
   logs, no client key, and no arbitrary provider URL/model are mandatory.
5. **Budget.** Start with a conservative per-user and global monthly allowance,
   a 1 request/second queue on Free, request count/cost telemetry without source
   text, and a hard stop before any paid or auto-recharge threshold. A failed
   request must not charge the user or become a hidden retry loop.
6. **Persist only cleared fields.** If rights are limited to display, retain no
   provider text. If written permission supports per-Memory persistence, retain
   only the allowed bounded fields with a distinct provider/provenance label;
   search indexes only those approved fields. Do not pass them to Muse or make
   AI summaries until that use is separately cleared.
7. **Thumbnail safety.** Prefer no thumbnail persistence. If expressly
   authorized, store only a validated HTTPS reference with no server-side
   follow-up, no copying/caching, image loading privacy controls, and a graceful
   broken-image state. Never infer video contents from the cover.
8. **Deletion and revocation.** Deleting the Memory deletes local vendor fields.
   The integration must have an owner-controlled disable switch and document a
   vendor cache-removal channel. Posts later private/deleted are not checked in
   background; a user-initiated refresh may mark vendor data stale/unavailable.
9. **Rollback.** Disable the server endpoint and UI affordance; stop future
   requests; hide or purge vendor-origin fields according to confirmed rights;
   preserve the original user-saved URL/title/note and current capture behavior.

## F. Financial and operational limits

The currently published Free plan is 100 credits/month at one request/second,
with one URL and one transcript each priced at one credit. Treat all pricing as
subject to change and validate account state before any future use.

Illustrative metadata-only usage, excluding failures/retries and any transcript
use:

| Confirmed lookups/month | Published credit use | Free-tier fit today |
| ---: | ---: | --- |
| 10 | 10 | Within 100 credits |
| 50 | 50 | Within 100 credits |
| 100 | 100 | At limit; no reserve for other work |
| 101+ | 101+ | Not permitted without separate paid-budget approval |

For a personal-memory product, cost and rate enforcement must be server-side.
No automatic billing, automatic retry, batch use, transcript generation,
background re-enrichment, or provider-fallback behavior should be designed in.

## G. Ready-to-send vendor inquiry (do not send automatically)

**Subject:** Clarification requested: TikTok metadata provenance, rights, and storage in a private memory app

Hello Supadata Support,

We are evaluating your metadata endpoint for an optional, user-confirmed lookup
of a public TikTok post URL in a private personal-memory application. We will
not proceed without clarity on provenance, rights, retention, and permitted
use. Could you please answer the following in writing?

1. What is the source of TikTok metadata returned by `/v1/metadata`? Is it an
   officially authorized TikTok interface, a licensed data provider, or another
   source?
2. Does Supadata have written platform permission for any automated TikTok data
   extraction involved in this endpoint? If so, what use cases does it cover?
3. For TikTok, is `description` the original creator-written caption exactly,
   normalized source text, generated text, or data from another source? What is
   the provenance of title, tags, author, publication date, and thumbnail?
4. May our users store returned text, creator details, dates, tags, and
   thumbnail references in their private Memory libraries? May they be indexed
   for that same user’s private search or used as input for an AI-assisted
   summary? Are any of these uses prohibited or subject to attribution?
5. Are thumbnail URLs short-lived? May we hotlink, cache, copy, or retain them?
   Are there attribution, source-link, or deletion requirements?
6. How are private, deleted, moderated, or revoked TikTok posts handled? Is
   there a URL-level purge/takedown process, webhook, or documented freshness
   period for cached metadata?
7. For a single request, what URLs, response data, logs, caches, and
   sub-processors are involved; where are they retained; and how can they be
   removed?
8. What contractual protections or warranties apply to third-party data
   sourcing, platform permissions, IP, and customer indemnity for this use?

We can share a more detailed use case after reviewing your response. We will
not send private Memories, files, cookies, or account credentials—only a
public post URL after explicit user confirmation.

Thank you,

REIBRY Meta Edition team

## H. Authorization requirements and risk assessment

| Risk | Current level | Gate to reduce it |
| --- | --- | --- |
| TikTok data-source authorization | High | Written Supadata explanation of source/licence/permissions plus qualified legal review against TikTok terms. |
| Caption/field provenance | High | Written per-field provenance and owner side-by-side validation on affected posts. |
| Storage/search/AI rights | High | Written vendor answer and legal approval for private persistence, indexing, and AI-derived output. |
| Private/deleted/revoked content | High | Vendor deletion/freshness process and product deletion policy. |
| Privacy/sub-processors/cache | Medium–high | DPA/sub-processor review, opt-in disclosure, data minimization, and documented removal path. |
| Costs/rate limits | Medium | Server-side quota, no auto-recharge, account usage telemetry, and separate paid-budget authorization. |
| Technical field quality | Medium | Larger approved sample with owner ground truth; no stronger labels before validation. |
| Thumbnail reliability | Medium | Written TTL/hotlink/caching terms; otherwise do not persist or fetch. |

### Required approvals before implementation planning

1. Written Supadata response to section G that supports the intended source,
   retention, private search, AI-use, attribution, and deletion model.
2. Qualified legal/contractual review of TikTok Terms §3.4 and the intended
   third-party vendor workflow in REIBRY’s jurisdictions.
3. Owner comparison of the two affected TikTok posts with the returned fields,
   recorded as provenance evidence without copying unnecessary content.
4. Explicit product/privacy approval for per-Memory external disclosure,
   distinct source labels, opt-in consent, cache/removal controls, and a no-data
   rollback plan.
5. Separate engineering authorization for a disabled-by-default implementation
   plan. This review grants none.

Until every applicable gate is met, Supadata remains an unintegrated research
provider and REIBRY retains its save-first, source-preserving, limited-details
fallback.
