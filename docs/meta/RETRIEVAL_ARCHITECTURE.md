# Stage 7 retrieval architecture

Stage 7 migrates and narrows REIBRY's retrieval foundation into deterministic, owner-scoped lexical search. It searches only evidence already stored by the Stage 5/6 boundaries. It does not use embeddings, pgvector, semantic inference, model-generated explanations, transcripts, webpage bodies, or provider calls.

## Provenance and dependency map

The read-only source reference is original REIBRY commit `76d3494465bab43a5051498e90b9a486a65312b9`. Reviewed patterns include `src/lib/retrieval/{understanding,service,concepts}.ts`, `src/lib/data/search-terms.ts`, `src/lib/intelligence/evidence.ts`, `src/app/api/memory/search/route.ts`, and the retrieval/search regression tests.

Reused concepts are bounded token normalization, weighted literal fields, evidence-required inclusion, stable tie-breaking, and owner-filtered persistence. Excluded source behavior includes vector similarity, semantic concept expansion, visual relationship inference, category inference, AI summaries/tags/entities, and the source rule that hid processing Memories. Stage 7 keeps processing records searchable because captured evidence is valid before AI runs.

~~~text
protected Memories UI
  -> GET /api/memories/search?q=...&limit=...
     -> verified Stage 4 server session
     -> owner-bound Stage 5 MemoryRepository.searchCandidates(250)
     -> pure lexical normalization + weighted ranking
     -> minimal RetrievalResponse DTO
~~~

The static `/api/memories/search` route is more specific than `/api/memories/[id]`. A production smoke assertion requires unauthenticated search to return `401 AUTH_REQUIRED`; if the dynamic UUID route captured `search`, it would instead fail Memory-ID validation.

## Search and ranking

Queries are Unicode-normalized, lowercased, punctuation-separated, whitespace-collapsed, limited to 200 input characters and 12 unique non-stopword terms. Results default to 10 and are bounded to 1–20. The owner repository returns at most the newest 250 records, ordered deterministically. This bounded scan avoids a new database search framework in this milestone; an older result outside that window is an explicit limitation.

Permitted fields and relative signals are:

- saved title: exact title, phrase and keyword coverage (strongest);
- saved note text: phrase and keyword coverage;
- whitelisted stored metadata strings: `author`, `platform`, and `metadataProvider`;
- hostname derived from the stored source URL.

A record must have literal evidence in at least one permitted field. No unrelated record is added to fill a quota. Scores are deterministic integers from 1–100, not probabilities or semantic similarity. Ties use newest creation time and then Memory ID. Note excerpts are copied from stored note text and bounded to 280 characters around the match.

## Evidence contract

`RetrievalResponse` contains the normalized query, `matches` or `no-match`, and validated `RetrievalItem` values. Each item has Memory ID, exact `/memories#memory-{id}` anchor, saved display title, source type/URL, optional stored note excerpt, processing status, matched fields, deterministic reason and score.

The DTO deliberately has no summary, transcript, webpage body, inferred tag, intent, action, or model-written explanation. Link results without note text have a null excerpt. The UI labels those as metadata-only evidence and states that webpage or video content was not retrieved.

## Ownership and privacy

The server verifies the Supabase user from HttpOnly session cookies and constructs a repository permanently bound to that user. Search accepts only `q` and `limit`; no user identity can be supplied. Production uses the non-elevated authenticated Supabase client, explicit `user_id` filtering, RLS, private no-store headers, an eight-second server deadline, and safe error messages. Queries and private Memory content are not logged.

The deterministic test adapter is under `tests/support` and cannot be enabled in production. Application ownership and query construction are tested locally. Hosted authentication, RLS, persistence, the 250-record scan and real concurrent database behavior remain **NOT VERIFIED** because no disposable Supabase project is configured.

## Stage 8 boundary

Stage 8 should call this owner-scoped service on the server and create a bounded evidence packet from `RetrievalItem` values. Muse Spark must receive only stored fields from that packet, explicit metadata-only limitations, and stable Memory IDs for citations. Any model output must cite a returned ID; citations must be validated as a subset of the supplied evidence before display. An empty retrieval set must produce an honest no-evidence response without a model call or fabricated context.
