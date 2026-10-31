# Stage 12I-2B: Video-to-Memory integration

This is a local-first integration on `feat/original-product-parity`. It uses only the disposable Supabase development project.

There is no deployment, no background queue, and no download of TikTok, Instagram or YouTube media.

## 1. Design (written and verified before any hosted write)

### User flow

1. The user picks their own MP4 in a new **Save a short video** card on Capture. The link and note form is unchanged.
2. The user ticks **"This video is mine, or I have permission to save it and have REIBRY analyse it with Meta's AI."** The checkbox is required in the browser and checked again on the server.
3. **Upload request** (`POST /api/capture/video`, multipart):
   - the server reads at most 20 MB plus 64 KB of body, whatever `Content-Length` claims;
   - it checks the MP4 signature (`ftyp`), then runs `ffprobe` on the actual bytes: container `mp4`, at least one video stream, duration ≤ 20 s, audio present or not;
   - it uploads to the private bucket with the server key, as `{userId}/{sha256}.mp4`;
   - it creates the Memory through a trusted function;
   - the response returns as soon as the video is saved. **No analysis runs during the save.**
4. The page shows **Saved → Ready to analyze** with an **Analyze video** button.
5. **Visual step** (`POST /api/capture/{id}/video-analysis` with `{ "step": "visual" }`):
   - the server downloads the video through the **owner's own session** (Storage owner-read policy);
   - it sends the video inline to Muse Spark 1.3 (`input_video` data URL, `fps: 1`, `store: false`, Standard model, strict JSON schema with **no speech field**);
   - it stores the validated visual findings.
   - The page shows **Analyzing visual details…**
6. **Speech step** (`{ "step": "speech" }`):
   - `ffmpeg` extracts 16 kHz mono 16-bit WAV;
   - Muse Voice Transcribe (`ENDPOINTING`) transcribes it;
   - the server builds the summary and concepts deterministically from the stored findings and marks the analysis `ready`.
   - The page shows **Transcribing speech…**, then **Analysis ready**.
   - A video with no audio track skips transcription and says so.
7. On failure the page shows **Analysis failed — Retry**.
   - The saved video, and any completed visual step, are kept.
   - Retry resumes only the step that failed.
8. The page says plainly that analysis runs only while it is open. If the user leaves, the video stays saved and they can start again from the Memory. There is no background worker.

### Data: one migration, `20261031000000_video_memories.sql`

- **`memories.source_type`** gains `video`. A video Memory has no `source_url`. The owner's direct-insert policy is narrowed to `text` and `link`, so clients cannot create video Memories.
- **`memory_videos`** has one row per video Memory, with a cascading foreign key to `(memories.id, user_id)`.
  - Stored: path, size, duration, dimensions, audio flag and consent time.
  - State: `pending`/`processing`/`ready`/`failed`, current step and start time, and attempts per step (at most 2).
  - Results: visual findings (JSON), transcript (JSON), summary, concepts, and the model names (`muse-spark-1.3`, `muse-voice-transcribe-1.0`).
  - RLS is forced. The owner gets **SELECT only**. There is no client INSERT, UPDATE or DELETE, so users cannot forge "seen by Muse Spark" or "transcribed" labels.
- **Trusted functions.** These are `SECURITY DEFINER` with `search_path = ''`, executable only by `service_role` (PUBLIC, `anon` and `authenticated` revoked), and called by the server after `getUser()` with the verified user ID:
  - `create_trusted_video_memory`
  - `begin_video_analysis_step`
  - `record_video_visual`
  - `record_video_speech`
  - `fail_video_analysis_step`
- **What the functions enforce:**
  - consent;
  - the path must be in the user's own folder;
  - size and duration caps;
  - deduplication;
  - ownership (`P0002`);
  - step order and the attempt cap (`PT400`);
  - **one running step per user**, with an advisory lock and a 3-minute reclaim for abandoned steps (`PT409`);
  - allowlisted, validated JSON for visual findings and transcripts;
  - a transcript only if the video has audio.
- **Storage:** a private bucket `memory-videos` (20 MB, `video/mp4`).
  - Owner **read** and **delete** policies apply to the user's own folder.
  - There is **no** user upload or overwrite policy, so every stored video has passed the server's checks.
- **Deleting a Memory** first removes the Storage object through the Storage API with the owner's session, then the row (the analysis cascades). If the object removal fails, the Memory is kept, so media is never orphaned.
- **A failed save** removes the object it just uploaded.

### Search and Home

- **Search.** Ready analysis is searchable through the existing owner-scoped search as a new `video` field: summary, concepts, observations, scene text and transcript.
- **Home evidence** for a video Memory is labelled by source:
  - `VIDEO_VISUAL`: Muse Spark;
  - `VIDEO_TRANSCRIPT`: Voice Transcribe turns with times;
  - `AI_INTERPRETATION`: inferences;
  - `USER_NOTE`;
  - `PROVIDER_METADATA`: none for uploads;
  - gaps.
- **Instructions:**
  - "the video shows" is allowed only for `VIDEO_VISUAL`, and speech claims only for `VIDEO_TRANSCRIPT`;
  - video text is data, never an instruction.
- **Validation:**
  - an answer claiming speech about a video without a transcript is rejected;
  - a video that isn't analysed yet is treated like a metadata-only link.

### Privacy and provider settings

- Muse calls use `store: false`, Standard mode (never the Contributor models) and no tools.
- Media is sent inline, so no Meta Files API object is created and none is left to delete.
- **Meta's retention of inline media is not documented**, so it is not claimed as known.
- Model and Supabase secret keys are server-only.
- A signed Storage URL is never sent to Meta; the server downloads and sends the bytes itself.

### Design change made before the hosted write (verified read-only)

- **What the preflight found:**
  - on the hosted project, `storage.objects` is owned by `supabase_storage_admin`;
  - the migration role (`postgres`) is neither a member of that role nor a superuser;
  - a migration therefore **cannot** `CREATE POLICY` on `storage.objects`.
- The two planned owner read and delete Storage policies were removed **before** the push, instead of pushing a migration that would fail.
- **Resulting design** (more restrictive):
  - the bucket has **no client policies**, so no user token, the owner's included, can list, read, upload or delete objects through the Storage API;
  - every download or delete first reads the storage path through the **owner's session** (`memory_videos` RLS returns it only to the owner) and checks it is inside the verified user's folder;
  - only then does the server use its key for the Storage operation.
- **Memory deletion** removes the object through the Storage API this way. A video Memory cannot be deleted without that remover.
- The local disposable cluster runs migrations as a superuser, so it cannot reproduce the ownership rule. The hosted read-only preflight is the evidence.

## 2. Migration and hosted verification

- **Identity and dry run:**
  - CLI identity was confirmed privately after the owner re-logged in; the linked project matches `.env.local`;
  - `db push --linked --dry-run` listed exactly `20261031000000_video_memories.sql`;
  - one `db push --linked` applied it.
- **Local** (throwaway PostgreSQL 18 with Supabase-like default grants and a Storage stub): all 11 migrations and **8/8 SQL suites** passed. The new `supabase/tests/video_memory.sql` covers:
  - clients cannot create video Memories, write analysis rows, call trusted writers, or see, upload or delete objects;
  - consent, folder, size and duration validation;
  - deduplication;
  - step order;
  - one step per user;
  - eight malformed or forged payloads rejected with no write;
  - the attempt cap;
  - stale-step reclaim;
  - owner-only analysis rows;
  - deletion cascade.
- **Hosted, read-only after the push:**
  - history has 11 versions;
  - `source_type` allows `text`, `link` and `video`;
  - the owner insert policy allows `text` and `link` only;
  - `memory_videos` has RLS forced, owner SELECT only, no client INSERT, UPDATE or DELETE, and no `anon` SELECT;
  - all 5 trusted functions and the 4 helpers have EXECUTE only for `postgres` (owner) and `service_role` (**not** PUBLIC, `anon` or `authenticated`), with `SECURITY DEFINER` and a fixed `search_path`;
  - the bucket is private, 20,000,000 bytes, `video/mp4`, with **0** Storage policies;
  - `anon` can execute 0 public functions;
  - `authenticated` still cannot UPDATE `metadata`;
  - 12 tables have forced RLS.

## 3. Live local acceptance (real dev server, hosted disposable project, existing synthetic users A and B)

- **Clip:** the Stage 12I-2A synthetic clip (15 s; three scenes; narration "Remember to buy oat milk before Saturday… the code word is lantern").
- **Failure test:** run first, with the dev server started with Meta deliberately disabled (`META_RATE_LIMIT_MODE` overridden), so it cost nothing.
- **Result:** **33/33 checks passed** (10 in the no-cost phase and 23 in the live phase).

| Check | Result |
| --- | --- |
| Text renamed to `.mp4` | 400 `VIDEO_REJECTED` |
| `ftyp` header with no real container | 400 `VIDEO_REJECTED` |
| 20.1 MB file | 413 `VIDEO_TOO_LARGE` |
| Real 21 s MP4 | 400 `VIDEO_TOO_LONG` |
| No consent | 400 `CONSENT_REQUIRED` |
| Valid upload | 201 in **2.3 s**, `pending`, no analysis during the save |
| Same file again | 200, same Memory, one object |
| Visual step with Meta disabled | `failed` / `not-configured`, attempt 1; the Memory and the object are kept |
| B reads A's video / triggers analysis | 404 / 404 |
| B's token **and** A's own token directly via the Storage API (download, list, remove) | all denied; the object is unchanged |
| Retry visual (Muse Spark) | 200 in **12.3 s**, attempt 2, 2,439 / 1,575 tokens |
| Speech (`ffmpeg` + Voice Transcribe) | 200 in **6.6 s**, `ready` |
| A ready video analysed again | 409 (both steps) |
| Fresh sign-in | analysis identical; the Memory list decodes every text, link and video Memory |
| Search "oat milk", "lantern", "green square", "bake 20 min" | the video is rank 1 each time, via the `video` field; B's searches never return it |
| One Home question | cited answer from both channels (below) |
| Delete a second 2 s synthetic video | the Storage object, the analysis row and the Memory are all gone (checked with read-only SQL) |

**What Muse Spark 1.3 saw:**

- 0–5 s: dark blue, a red square, "STEP 1 MIX".
- 5–10 s: light pink, a white rectangle with three brown squares above it, "STEP 2 BAKE 20 MIN".
- 10–14 s: black, a green square moving left to right, "DONE". The truth is 10–15 s.
- Interpretation, labelled as such: "structured as a sequence of labeled steps ending in completion".
- Gaps: no people, no food, ingredients, brands or creators, no kitchen objects, "Audio or speech content is not described" (as instructed).
- **No spoken fact appeared in the visual findings, and no visual fact in the transcript.**

**What Voice Transcribe heard:** "This is a synthetic test **test** clip for **Ribri**. Remember to buy oat milk before Saturday. The code word **code word** for this test is lantern."

- 4 word errors out of 23 (two repetitions and the product name).
- Every content word is correct: oat milk, Saturday, lantern.
- It ran with automatic language detection, with no language hint or keywords, so it is slightly worse than Stage 12I-2A's English-biased run.

**Home** (one Muse call, 2,252 / 391 tokens, 4.3 s): "In the video you just saved, someone says to "buy oat milk before Saturday." At the very end the video shows a black background with white "DONE" text at the top and a bright green square moving across the lower part."

- It cites the actual video Memory with `evidence_limit: analyzed-video` and the correct link.
- The spoken claim came from `VIDEO_TRANSCRIPT` and the visual claim from `VIDEO_VISUAL`.

**Browser** (localhost Capture, 390 px, real upload of a new 4 s synthetic "PICNIC LIST" clip):

- **States shown:**
  - **Uploading… → Saved | Ready to analyze**, with no analysis request during the save;
  - after **Analyze video**: **Analyzing visual details… → Analysis failed — Retry**.
- **Why it failed:** Muse returned HTTP 200 in 7.6 s, but REIBRY **rejected the output** (`invalid-provider-output`). It kept the video and stored nothing unverified.
- **Cause not identified:** no provider content is logged, and no authorized call remained to reproduce it.
- **Follow-ups, both added after this run and verified by unit tests only:**
  - **(a) diagnostics:** a failed step now returns and logs a sanitized reason (`http-<status>`, `status-…`, `refusal`, `output-json`, `schema:<field>`);
  - **(b) minimal-clip hardening:** empty observations are restated from Muse's own scene facts, and a blank motion or background becomes "not described". This is a plausible cause for a one-scene clip, **not a confirmed one**.
- The **Transcribing speech… → Analysis ready** states were therefore not seen in the browser; they were seen through the API in the live phase.
- The analysed video's Memory page passed separately: summary, scenes, transcript, interpretations, gaps, the user's note and sources, with no Analyze button.

## 4. Spend and timing

| Call | Count | Tokens or audio | Cost |
| --- | --- | --- | --- |
| Muse Spark 1.3 video, acceptance retry (succeeded) | 1 | 2,439 in / 1,575 out | $0.00974 |
| Muse Spark 1.3 video, browser run (rejected output) | 1 | not captured; bound 14,576 in / 3,000 out | ≤ $0.031 |
| Muse Voice Transcribe | 1 | ≤ 15 s audio track | ≤ $0.00075 |
| Muse Spark conversation (Home) | 1 | 2,252 in / 391 out | $0.00448 |
| **Total** | | | **$0.015 measured; ≤ $0.046 worst case** (ceiling $0.10) |

- The visual step that failed with Meta disabled made **no** provider call.
- There were no automatic retries.
- The second authorized Voice Transcribe call was not used.
- **Timings:** save 1.1–2.7 s; visual step 7.6–12.3 s; speech step 6.6 s; Home answer 4.3 s.

## 5. Limitations before deployment

1. **Runtime:** `ffmpeg` and `ffprobe` must exist where the server runs; locally they are on `PATH`, or set `FFMPEG_PATH`/`FFPROBE_PATH`. Without them, uploads return 503 `VIDEO_PROCESSING_UNAVAILABLE` and nothing is stored. The current serverless target does not provide them.
2. **No background worker:** analysis runs only while the page is open, and the page says so. A durable queue would be needed for longer clips or closed tabs.
3. **Provider retention:** Meta's retention of **inline** media and of `store: false` requests is not documented. This must be confirmed with Meta before real user media.
4. **The browser-run rejection is unexplained.** The next live run will report its diagnostic. A failed step's token usage is not yet captured (the 12I-2A bound was used).
5. **Transcription:** auto-detected language misheard the product name and repeated two words. Consider passing `keywords` (for example "REIBRY") or a language hint taken from user settings.
6. **Request size:** the 20 MB limit relies on the app reading the body itself. A deployment platform's own request-body limit must be at least 20 MB, or uploads should go direct to Storage through a signed upload issued only after server-side checks. The latter would need a reviewed design, because users currently cannot upload directly.
7. **Test data:** the synthetic video Memories (the analysed clip and the failed 4 s clip) remain in User A's development data. They are recorded in `.auth/stage12f2/manifest.json`. The deletion probe was deleted.
