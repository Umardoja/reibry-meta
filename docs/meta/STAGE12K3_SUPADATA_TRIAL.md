# Stage 12K-3 — Controlled Supadata TikTok Provider Trial

Date: 2026-11-02 (Africa/Lagos)
Scope: standalone research only. No REIBRY application code, schema, mobile
application, Supabase row, user, hosted configuration, or production capture
path was changed. The original REIBRY repository was read only.

## A. Decision: CONDITIONAL GO for legal/provenance review only

The technical signal is meaningful: Supadata accepted all five selected public
TikTok post URLs and returned descriptions, creator fields, tags, dates, and
HTTPS TikTok-CDN thumbnail URLs where REIBRY's current TikTok oEmbed path
returns only an embed identity. In particular, the two previously affected
owner-share posts now have nonempty descriptions.

This is **not** approval to integrate Supadata. The provider does not document
whether TikTok `description` is the creator-written caption, how it acquires
TikTok data, thumbnail validity, or the source provenance of individual
fields. The owner was not available during this run to compare returned text
with the public posts in TikTok, and raw descriptions were deliberately not
retained. Technical success therefore does not establish caption authenticity,
rights, platform compliance, or production reliability.

## B. Provider documentation verified

- [Metadata](https://docs.supadata.ai/get-metadata): `GET /v1/metadata` takes
  an `x-api-key` plus `url`; TikTok is supported. The documented formats include
  canonical `www.tiktok.com/@username/video/<id>`, `vm.tiktok.com/<code>`, and
  `m.tiktok.com/v/<id>.html`. `vt.tiktok.com` is not listed, so this trial used
  canonical URLs already safely resolved by REIBRY.
- The published unified response schema has nullable `title` and `description`,
  author username/display name, `media.thumbnailUrl`, `tags`, `createdAt`, and
  platform-specific additional data. It does **not** state that TikTok
  `description` is a creator caption.
- [Transcript](https://docs.supadata.ai/get-transcript): `mode=native` asks for
  an existing transcript only; `auto` may generate one and was not used. The
  endpoint can return immediate output or an async job. This trial did not poll
  a job or permit generated fallback.
- [Pricing](https://supadata.ai/pricing): the current Free plan publishes 100
  credits/month, no card, and one request/second. It prices a URL and a
  transcript at one credit each; generated transcripts cost more. Actual
  account state, rather than the public page alone, controlled the budget.
- [Terms](https://supadata.ai/legal/terms): Supadata says returned data comes
  from publicly accessible sources supplied by independent third-party data
  providers; original creators retain IP rights; customers are responsible for
  applicable law and related platform terms; service is best-effort.
- [Privacy policy](https://supadata.ai/legal/privacy) and
  [DPA](https://supadata.ai/legal/dpa): public results may be cached for
  performance; API request logs include endpoint/status/timing/IP/user agent
  for the customer relationship. Customer Content includes URLs and returned
  metadata/transcripts; the DPA says it is processed transiently and not used
  for model training, but permits sub-processors and notes international
  transfers. These are material privacy and retention considerations.

## C. Credentials, budget, and safeguards

- The ignored local environment contained a configured `SUPADATA` value. Its
  value, account identity, organization ID, and any API response body were not
  printed, committed, or stored in this report.
- Account check before the trial: Free 100-credit plan, 100 credits remaining.
- Account check after the trial: 93 credits remaining. Actual use was exactly
  seven credits: five metadata requests and two native-only transcript
  requests. Financial cost: **$0.00** on the free plan.
- No retries, SDK installation, credit purchase, card, auto-recharge,
  `/extract`, media upload/download, browser cookies, polling, or HTML/script
  execution occurred.
- Temporary Node scripts use built-in `fetch`, are under ignored `private/`,
  and retain only field-presence/length diagnostics. They are not product code.

## D. Metadata trial results

The five calls were sequential (at least 1.1 seconds apart) and used only
canonical public TikTok post URLs. Post identities are intentionally sanitized.
Returned text was not retained; `description length` is a diagnostic, not a
quote or an assertion that the text is an authentic creator caption.

| Sanitized post | HTTP | Latency | Title | Description | Creator fields | Thumbnail | Tags | Published date | Notes |
| --- | ---: | ---: | --- | --- | --- | --- | ---: | --- | --- |
| Owner share A | 200 | 2,607 ms | absent | present, 150 chars | username + display name | HTTPS TikTok CDN URL supplied | 5 | valid date supplied | Previously returned no useful oEmbed detail in REIBRY. |
| Owner share B | 200 | 1,997 ms | absent | present, 49 chars | username + display name | HTTPS TikTok CDN URL supplied | 4 | valid date supplied | Previously returned no useful oEmbed detail in REIBRY. |
| Public cake example | 200 | 3,150 ms | absent | present, 114 chars | username + display name | HTTPS TikTok CDN URL supplied | 4 | valid date supplied | Returned text contained two independently expected cake-related terms. |
| Public Python example | 200 | 1,967 ms | absent | present, 220 chars | username + display name | HTTPS TikTok CDN URL supplied | 15 | valid date supplied | Returned text contained `python`, `if`, and `else`. |
| Official TikTok embed example | 200 | 3,411 ms | absent | present, 82 chars | username + display name; provider marked verified | HTTPS TikTok CDN URL supplied | 3 | valid date supplied | This is TikTok's documented public embed example. |

Metadata result: **5/5 accepted**, **5/5 nonempty descriptions**, **5/5
creator fields**, **5/5 thumbnail URLs**, **5/5 dates**, and **0/5 titles**.
Average metadata latency was **2,626 ms**. No metadata call failed.

### Data-quality limits

- **Actual captions:** 0/5 verified. The provider returned a field named
  `description`, but its documentation and terms do not establish that it is
  TikTok's creator caption. The two owner-share descriptions must be compared
  side-by-side in the TikTok app by the owner before such a provenance claim.
- **Creator correctness:** 5/5 returned creator fields; exact per-post
  correctness is not claimed because raw values were intentionally discarded.
- **Thumbnails:** 5/5 supplied HTTPS URLs on TikTok CDN hosts. They were not
  fetched, followed, stored, or visually compared, so availability and
  authenticity remain unverified. Supadata does not document their TTL. TikTok
  itself documents that some official cover URLs have limited TTLs; this cannot
  be assumed for vendor-returned URLs.
- **Search usefulness:** the two topical public samples showed the expected
  cake/Python terms in provider-returned text. That is encouraging for lexical
  search, but it is not a correctness proof and is insufficient to classify
  unverified descriptions as first-party captions.

## E. Native-only transcript probes

Only the two already-tested owner-share posts were queried. Each request set
`mode=native` and `text=false`; no `auto`, `generate`, job polling, or media
download occurred.

| Sanitized post | HTTP | Latency | Native transcript | Language | Length | Timestamps | Result |
| --- | ---: | ---: | --- | --- | ---: | --- | --- |
| Owner share A | 200 | 3,521 ms | available | `kk` | 7 characters | present | Technically returned, but too short to establish useful content quality. |
| Owner share B | 206 | 1,938 ms | unavailable | — | 0 | — | Provider returned `transcript-unavailable`; no fallback was attempted. |

Native transcript result: **1/2 technically available**, **0/2 demonstrated
useful**. The response does not prove lawful source acquisition or transcript
accuracy. No raw transcript text was retained.

## F. Short-link compatibility

No extra metadata request was made. Supadata documents `vm.tiktok.com` but not
`vt.tiktok.com`; REIBRY's existing constrained resolver had already converted
the owner shares to canonical public post URLs before the trial. `vt.`
compatibility is therefore **unverified**. No attempt was made to guess video
IDs or bypass TikTok protections.

## G. What is technically better than REIBRY today

For these five public posts, Supadata produced structured description, author,
date, tag, and thumbnail-reference fields that the current official TikTok
oEmbed route does not expose. The two real affected shares both received a
nonempty description. This is enough evidence to justify a narrowly scoped
design/legal review of an opt-in provider boundary.

It does not make the data authoritative. REIBRY's current source-preserving
behavior remains the correct production behavior until field provenance,
platform authorization, user disclosure, retention, failure semantics,
thumbnail handling, and per-user consent are reviewed.

## H. Risks and remaining verification

1. **Data origin and platform compliance:** Supadata does not disclose the
   TikTok acquisition method. Its Terms assign compliance with TikTok's terms
   to REIBRY/the customer. This is a release blocker, not merely a technical
   caveat.
2. **Field provenance:** `description`, tags, title, and thumbnail are not
   attested as TikTok-native fields. Do not label them “official caption,”
   “creator-provided,” or “verified cover” without independently supported
   evidence.
3. **Privacy/caching:** public URLs and returned public content are Customer
   Content; the provider may cache public results and retains request metadata.
   A future product integration needs explicit opt-in disclosure and a data
   processing review.
4. **Reliability:** this is a five-post sample on one day. Free-tier rate and
   quota limits, vendor availability, field completeness, region changes, and
   TikTok countermeasures remain unverified.
5. **Thumbnail durability:** no TTL or visual authenticity verification was
   established. A future design should avoid treating vendor thumbnail URLs as
   permanent durable assets without an approved storage/rights policy.

## I. Exact next stage, only if separately approved

**Stage 12K-4 — Supadata legal/provenance and opt-in boundary design** should
be limited to: legal/terms review; owner side-by-side verification of the two
affected posts; a privacy/retention disclosure design; provenance labels; and
an implementation proposal that remains disabled by default. It must not add a
provider dependency, make live calls, or store vendor data until a separate
implementation authorization is granted.
