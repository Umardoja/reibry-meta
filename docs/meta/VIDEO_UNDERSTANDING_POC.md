# Stage 12I-2A: Meta video understanding proof of concept

**Result: PASS for visual understanding, PASS for speech using Muse Voice Transcribe, FAIL for speech using Muse Spark itself.**

Muse Spark 1.3 described the actual pictures in a short video correctly. It kept what it saw separate from what it inferred, and it invented nothing. Spoken content has to come from Muse Voice Transcribe.

Scope of this stage:

- local prototype only, at baseline `50ee8c6`;
- no app code, schema, hosted data, deployment or Git remote was touched;
- all media and results are in the gitignored `test-results/stage12i2a/`.

## 1. What the official docs say (checked 2026-10-31)

Sources:

- [Video understanding](https://dev.meta.ai/docs/video-understanding)
- [File handling](https://dev.meta.ai/docs/file-handling)
- [Responses schemas](https://dev.meta.ai/docs/api-reference/responses/schemas)
- [Speech to text](https://dev.meta.ai/docs/speech-to-text)
- [Voice schemas](https://dev.meta.ai/docs/api-reference/voice/schemas)
- [Models](https://dev.meta.ai/docs/models)
- [Pricing](https://dev.meta.ai/docs/pricing-rate-limits)
- [Token counting](https://dev.meta.ai/docs/token-counting)

| Topic | Documented |
| --- | --- |
| Video input (Responses) | `input_video` with `video_url` (a string: public URL or base64 data URL) or `file_id`, plus an optional `fps` sampling rate. Also `input_file` with `file_id`/`file_data`/`file_url`. The Files API is recommended for uploads. |
| Formats | Video: `video/mp4` only. Audio: `audio/mpeg`, `audio/wav`. |
| Size | Inline data: 50 MB. Files API: 1 GiB per file, 100 GiB per team. |
| Duration and video tokens | **Not documented.** The token counter scores an inline video at about 2 tokens, so it **cannot** be used to estimate video cost (see section 5). |
| Audio in video | "A video part … also carries its embedded audio", but "Audio understanding in Muse Spark 1.3 is … not fully supported". Muse Spark 1.2 or Voice Transcribe is recommended instead. |
| Files retention | Uploaded files **never expire by default**. `expires_after` can be set (anchor `created_at`, 3,600–2,592,000 s). Deletion is `DELETE /v1/files/{id}`. |
| Response retention | `store` defaults to **true**; this prototype sent `store: false`. |
| Training use | Standard mode: content is not used to train Meta models. Contributor mode (cheaper) allows training use and must not be used for user media. |
| Privacy or retention for inline media | **Not documented** beyond the above. |
| Muse Voice Transcribe | `POST /v1/asr/transcribe`, multipart `request` (JSON: `model: muse-voice-transcribe-1.0`, `audioEncoding: WAV`, `mode`, `languageBias`, `keywords`) plus `audio`. Only RIFF/WAVE mono 16-bit PCM at 16 kHz or 24 kHz. Up to 10 minutes and 32 MB. Turn-level (not word-level) timestamps. Zero data retention is priced the same as Standard. **It does not accept mp4**, so the audio must be extracted first. |
| Pricing | Muse Spark 1.2/1.3: $1.25 per million input tokens, $4.25 per million output tokens (reasoning tokens count as output). Voice Transcribe: $0.18 per audio hour, billed per whole second. |

**Never assumed:** that TikTok, Instagram or YouTube links are playable media URLs. They are web pages, not mp4 files, and downloading them is out of scope. Video understanding needs media the user actually owns and provides.

## 2. Test clip

`synthetic-clip.mp4`:

- 15 s, 640×360, 24 fps, H.264 + AAC mono, 95,899 bytes;
- original, generated locally with `ffmpeg` (colour, box and text filters);
- narrated with the built-in Windows voice "Microsoft David Desktop";
- no downloaded, third-party or personal media.

**Ground truth** (`ground-truth.json`, never sent to the model):

| Time | Background | Objects | On-screen text |
| --- | --- | --- | --- |
| 0–5 s | navy | one large red square, centred | "STEP 1  MIX" (yellow) |
| 5–10 s | pink | wide white rectangle with three small brown squares on top | "STEP 2  BAKE 20 MIN" (black) |
| 10–15 s | black | green square moving left to right | "DONE" (white) |

**Narration (not shown on screen):** "This is a synthetic test clip for REIBRY. Remember to buy oat milk before Saturday. The code word for this test is lantern."

The spoken facts are deliberately absent from the pictures, and the visual facts are never spoken. That way any answer shows which channel it came from.

## 3. Calls made (budget: 2 Muse Spark + 1 Voice Transcribe, $0.10)

| # | Call | Latency | Tokens in/out (reasoning) | Spend |
| --- | --- | --- | --- | --- |
| – | Token-count preflights ×4 (no generation) | 0.3–3.9 s | – | not billed as generation |
| 1 | `muse-spark-1.3`, inline video, `fps: 1`, `store: false`, strict JSON schema, effort `low`, no retry | 7.0 s | 2,524 / 1,387 (812) | $0.00905 |
| 2 | `muse-spark-1.2` (the documented model for audio), same request | 8.7 s | 1,391 / 1,582 (944) | $0.00846 |
| 3 | `muse-voice-transcribe-1.0`, 9.99 s WAV, `ENDPOINTING`, `languageBias: ["English"]`, no keywords | 3.9 s | – | $0.00045 |
| | **Total** | | | **$0.01796** |

- The video was sent inline, so **no provider file was created and none needed deleting**.
- No retries.
- No Auth or provider errors.

## 4. What the models actually perceived

**Visuals (Muse Spark 1.3).** Every scene was correct:

- dark blue background, red square, "STEP 1 MIX";
- pink background, white horizontal rectangle with "three small brown squares aligned above", "STEP 2 BAKE 20 MIN";
- black background, "small green square moves horizontally from left to center to right", "DONE";
- scene boundaries at about 5 s and 10 s. It reported the last scene ending at 14 s; the truth is 15 s.

It kept observation and interpretation apart:

- "Video presents as a simplified three-part step sequence", based on the on-screen text;
- "Visuals are abstract graphics, not depictions of real objects or people".

Its gaps were honest: "no real food, ingredients, kitchen, or baking equipment is visible" and "no brands, logos, or creators are visible". **Ground-truth check: 18/18.** It did not invent a cake, oven or ingredients from "BAKE 20 MIN".

Muse Spark 1.2 gave an equally accurate visual description, including "starts near left edge, moves to center, then to right edge".

**Speech:**

- **Muse Spark 1.3** reported `heard_speech: false`: "no audible speech … can be confirmed from frames alone". This matches the documented limitation.
- **Muse Spark 1.2** also reported `heard_speech: false`, **yet** wrote: "The code word 'lantern' mentioned in the accompanying test description is not visibly present." "Lantern" exists **only** in the audio (it is not in the prompt, file metadata or harness). So some audio-derived content reached the model, but the model mislabelled it and contradicted its own speech field. **A Muse Spark speech claim cannot be trusted as a transcript.**
- **Muse Voice Transcribe:** "this is a synthetic test clip for **ribri** Remember to buy oat milk before Saturday. The code word **word** for this test is lantern". Turns were at 0.06–2.54 s, 3.18–5.82 s and 6.54–8.86 s.
  - Word error rate is 2/23 (8.7%): the product name was misheard, and one word was inserted.
  - Every content word was correct ("oat milk", "Saturday", "lantern").
  - Passing `keywords: ["REIBRY"]` would probably fix the product name; this was not tested.

## 5. Cost bounding

- The token counter returned 170 tokens for text plus video, against 168 for text alone, so it does not tokenize video.
- One 640×360 frame sent as an image counted as about 301 tokens.
- **Pre-call bound:**
  - 15 frames × 301 tokens × 3 (safety margin) = 13,545
  - audio allowance (15 s × 50 tokens/s) = 750
  - prompt text = 281
  - total: **14,576 input tokens**, plus 3,000 output tokens, is **$0.031 per call**.
- **Actual input was 2,524 tokens:** about 150 tokens per sampled frame at `fps: 1` on 1.3.
- **Rough projection for 60 s at `fps: 1`:** about 9,000 input tokens plus about 1,500 output tokens, which is roughly $0.02 per minute of video, plus $0.003 per minute for transcription.
- This is an observation, not a documented rate.
- The bound relies on Meta honouring the documented `fps` field.

## 6. Prototype Memory enrichment (`enrichment-result.json`, local only)

Composed **only from saved provider outputs**, with no extra model call. Every claim carries its source: `muse-spark-1.3 video analysis` or `muse-voice-transcribe-1.0`.

- **Summary:** "Short graphic video in 3 scenes: "STEP 1 MIX" (solid red square centered on dark blue); then "STEP 2 BAKE 20 MIN" (large white horizontal rectangle, three small brown squares … on light pink); then "DONE" (small bright green square on black). The narration says: "…Remember to buy oat milk before Saturday. The code word word for this test is lantern""
- **Visible details:** 7 observations, plus scenes with times, objects, on-screen text and motion.
- **Interpretations:** kept separate and labelled "interpretation, not observation".
- **Spoken details:** the transcript with turn timestamps and a note about the known errors.
- **Searchable concepts:** "step 1 mix", "step 2 bake 20 min", "done", "red square on blue", "white rectangle with brown squares", "green square moving on black", "oat milk", "saturday", "lantern".
- **Suggested categories:** "simple step-by-step graphic or instructional template" (visible), "abstract test or placeholder animation" (inferred).
- **Gaps:** no people, food, brands or creators visible. Spoken details come only from transcription. "BAKE 20 MIN" is on-screen text, not an observed baking process.

**Search:** REIBRY's existing lexical search finds this Memory for "oat milk", "lantern", "bake 20 min", "green square" and "pink" once the analysis is stored. With link metadata alone it finds none of them.

The shape maps onto the original REIBRY `sourceEvidence` (`modality`, `transcript`, `onScreenText`, `frames`) and `visualEvidence` contracts, which until now were only ever thumbnail-based.

## 7. Feasibility

| Question | Answer |
| --- | --- |
| Did Muse actually see the video? | Yes. Exact colours, shapes, on-screen text, timing and motion were all correct (18/18), and none of it was in the prompt. |
| Observation vs inference? | Yes, both models kept them separate and listed the gaps honestly. |
| Speech? | Voice Transcribe: yes (about 9% word error rate, every content word correct). Muse Spark: no, it is not reliable. |
| Speed | 7–9 s for visuals and 4 s for transcription on a 15 s clip. That is too slow for the save request, but fine for background enrichment. |
| Search usefulness | High: it adds content that metadata never has. |
| Structured enough to persist? | Yes, as a strict JSON schema with per-claim sources. |

## 8. Required before an in-app video upload feature

1. **Media source and consent:**
   - only media the user owns, picked or shared from their own device;
   - never download TikTok, Instagram or YouTube media;
   - require an explicit "analyse this video" consent.
2. **Private storage:**
   - a private Supabase Storage bucket with owner-only policies (a new, reviewed migration);
   - size and duration caps (mp4 only, for example ≤ 50 MB / ≤ 3 min to stay inline);
   - deleting a Memory must delete its media and results.
3. **Media processing runtime:**
   - extracting the audio to 16 kHz mono WAV (and transcoding non-mp4 uploads) needs `ffmpeg` or an equivalent;
   - that is not available in the current serverless runtime and must be provided or hosted.
4. **Durable background job:**
   - 10+ s of provider time per clip rules out doing this in the request;
   - needs a durable queue or worker with retries, idempotency and a per-user rate and cost cap.
5. **Provider hygiene:**
   - `store: false`;
   - Standard mode only (never Contributor) for user media;
   - inline data where possible; otherwise Files API uploads with `expires_after` and an explicit `DELETE` after analysis;
   - confirm with Meta the retention of inline media and of `store: false` requests, which is not documented.
6. **Persistence:**
   - extend the trusted enrichment boundary with an allowlisted, validated "analyzed-video" evidence block (a reviewed migration);
   - keep the visual and spoken sources and gaps per claim.
7. **Grounding rules:**
   - a new evidence kind (for example `analyzed-video`) in retrieval and model evidence, so REIBRY may say "the video shows…" only for analysed claims;
   - metadata-only links keep their current limits.
8. **Speech from the transcriber only:** spoken content comes from Muse Voice Transcribe, never from Muse Spark's speech fields.

## 9. Not verified

- Behaviour on real-world footage, faces, fast motion, long clips or non-English speech.
- Limits on video size and duration in tokens.
- Whether the backend's sampled frames match `fps: 1` exactly.
- Muse Spark 1.3 accuracy without `fps`.
- The Files API upload and delete path (not needed for a 96 KB clip).
