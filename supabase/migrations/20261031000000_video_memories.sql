-- Stage 12I-2B: user-supplied short video Memories with server-verified analysis.
-- * Videos live in a PRIVATE bucket with NO storage.objects policies, so no user token can list, read, upload, overwrite or delete any
--   object through the Storage API. (Hosted: storage.objects is owned by supabase_storage_admin and the migration role is not a member,
--   so a migration cannot create storage policies; verified read-only before this migration was applied.) Owner scoping is enforced by the
--   server: it reads the storage path through the owner's own session (memory_videos RLS returns it only to the owner), checks it is in the
--   verified user's folder, and only then uses the server key for the Storage upload, download or delete.
-- * Video Memories and every AI/transcription result are written ONLY by service_role-only SECURITY DEFINER functions called by the
--   server after getUser(). Owners can SELECT their analysis rows but cannot insert or update them, so they cannot forge
--   "seen by Muse Spark" or "transcribed" labels. Owners also cannot insert source_type = 'video' Memories directly.
-- * Bounded processing: at most 2 attempts per step, one active step per user, stale (>3 min) steps may be reclaimed.
-- Errors use non-retryable SQLSTATEs (PT400, PT409, P0002), never 40001.
begin;

alter table public.memories drop constraint memories_source_type_check;
alter table public.memories add constraint memories_source_type_check check (source_type in ('text', 'link', 'video'));
alter table public.memories drop constraint memory_source_present;
alter table public.memories add constraint memory_source_present check (
  (source_type = 'text' and raw_text is not null and char_length(trim(raw_text)) > 0)
  or (source_type = 'link' and source_url is not null)
  or (source_type = 'video' and source_url is null));

drop policy memory_owner_insert on public.memories;
create policy memory_owner_insert on public.memories for insert to authenticated
  with check ((select auth.uid()) = user_id and source_type in ('text', 'link'));

create table public.memory_videos (
  memory_id uuid primary key,
  user_id uuid not null,
  storage_bucket text not null default 'memory-videos' check (storage_bucket = 'memory-videos'),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.mp4$' and split_part(storage_path, '/', 1) = user_id::text),
  mime_type text not null default 'video/mp4' check (mime_type = 'video/mp4'),
  size_bytes bigint not null check (size_bytes between 1 and 20000000),
  duration_ms integer not null check (duration_ms between 1 and 20000),
  width integer check (width between 1 and 8192),
  height integer check (height between 1 and 8192),
  has_audio boolean not null,
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  processing_step text check (processing_step in ('visual', 'speech')),
  processing_started_at timestamptz,
  visual_attempts smallint not null default 0 check (visual_attempts between 0 and 2),
  speech_attempts smallint not null default 0 check (speech_attempts between 0 and 2),
  failure_code text check (failure_code in ('provider-timeout', 'provider-unavailable', 'provider-rejected', 'invalid-provider-output', 'media-unavailable', 'audio-extraction-failed', 'not-configured')),
  visual jsonb check (visual is null or jsonb_typeof(visual) = 'object'),
  visual_model text check (visual_model is null or visual_model = 'muse-spark-1.3'),
  transcript jsonb check (transcript is null or jsonb_typeof(transcript) = 'object'),
  speech_model text check (speech_model is null or speech_model = 'muse-voice-transcribe-1.0'),
  summary text check (summary is null or char_length(summary) between 1 and 1200),
  concepts text[] not null default '{}' check (cardinality(concepts) <= 24),
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memory_id, user_id),
  foreign key (memory_id, user_id) references public.memories (id, user_id) on delete cascade,
  constraint memory_video_processing_state check ((status = 'processing') = (processing_step is not null and processing_started_at is not null)),
  constraint memory_video_ready_state check (status <> 'ready' or (visual is not null and summary is not null and analyzed_at is not null))
);
create index memory_videos_owner_status_idx on public.memory_videos (user_id, status);

alter table public.memory_videos enable row level security;
alter table public.memory_videos force row level security;
revoke all on table public.memory_videos from public, anon, authenticated;
grant select on table public.memory_videos to authenticated;
create policy memory_video_owner_select on public.memory_videos for select to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-videos', 'memory-videos', false, 20000000, array['video/mp4']);

-- Validation helpers (immutable, not client-callable).
create function public.video_strings_ok(p jsonb, p_max_items integer, p_max_len integer) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= p_max_items
    and not exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and p_max_len)
$$;
create function public.video_keys_ok(p jsonb, p_keys text[]) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and (select count(*) from jsonb_object_keys(p)) = cardinality(p_keys)
    and not exists (select 1 from jsonb_object_keys(p) k where not (k = any(p_keys)))
$$;
create function public.video_text_ok(p jsonb, p_min integer, p_max integer) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'string' and char_length(p #>> '{}') between p_min and p_max
$$;
create function public.video_number_ok(p jsonb, p_min numeric, p_max numeric) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'number' and (p #>> '{}')::numeric between p_min and p_max
$$;

create function public.create_trusted_video_memory(p_user_id uuid, p_title text, p_note text, p_dedupe_key text, p_storage_path text,
  p_size_bytes bigint, p_duration_ms integer, p_width integer, p_height integer, p_has_audio boolean, p_consented boolean)
returns setof public.memories
language plpgsql security definer set search_path = '' as $$
declare v_memory public.memories%rowtype;
begin
  if p_user_id is null or p_consented is distinct from true or p_has_audio is null or p_title is null or char_length(trim(p_title)) not between 1 and 200
    or (p_note is not null and char_length(p_note) > 2000) or p_dedupe_key is null or p_dedupe_key !~ '^[0-9a-f]{64}$'
    or p_storage_path is null or p_storage_path !~ ('^' || p_user_id::text || '/[0-9a-f]{64}\.mp4$')
    or p_size_bytes is null or p_size_bytes not between 1 and 20000000 or p_duration_ms is null or p_duration_ms not between 1 and 20000
    or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'invalid video memory' using errcode = 'PT400';
  end if;
  insert into public.memories (user_id, title, source_type, source_url, raw_text, analysis_status, metadata, dedupe_key)
  values (p_user_id, trim(p_title), 'video', null, nullif(trim(coalesce(p_note, '')), ''), 'processing', jsonb_build_object('capture', 'video'), p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning * into v_memory;
  if not found then
    -- Same file saved again by the same user: return the existing Memory, never a second copy.
    select m.* into v_memory from public.memories m where m.user_id = p_user_id and m.dedupe_key = p_dedupe_key;
    if v_memory.source_type <> 'video' then raise exception 'dedupe conflict' using errcode = 'PT409'; end if;
    return next v_memory; return;
  end if;
  insert into public.memory_videos (memory_id, user_id, storage_path, size_bytes, duration_ms, width, height, has_audio, consent_at)
  values (v_memory.id, p_user_id, p_storage_path, p_size_bytes, p_duration_ms, p_width, p_height, p_has_audio, now());
  return next v_memory;
end $$;

create function public.begin_video_analysis_step(p_user_id uuid, p_memory_id uuid, p_step text)
returns setof public.memory_videos
language plpgsql security definer set search_path = '' as $$
declare v_row public.memory_videos%rowtype;
begin
  if p_user_id is null or p_memory_id is null or p_step is null or p_step not in ('visual', 'speech') then
    raise exception 'invalid analysis step' using errcode = 'PT400'; end if;
  -- One active step per user: serialize this user's step starts.
  perform pg_advisory_xact_lock(hashtextextended('reibry-video:' || p_user_id::text, 0));
  select * into v_row from public.memory_videos where memory_id = p_memory_id and user_id = p_user_id for update;
  if not found then raise exception 'video not found' using errcode = 'P0002'; end if;
  if v_row.status = 'ready' then raise exception 'already analysed' using errcode = 'PT409'; end if;
  if exists (select 1 from public.memory_videos where user_id = p_user_id and status = 'processing' and processing_started_at > now() - interval '3 minutes') then
    raise exception 'analysis already running' using errcode = 'PT409'; end if;
  if p_step = 'visual' and (v_row.visual is not null or v_row.visual_attempts >= 2) then
    raise exception 'visual step not available' using errcode = 'PT400'; end if;
  if p_step = 'speech' and (v_row.visual is null or v_row.speech_attempts >= 2) then
    raise exception 'speech step not available' using errcode = 'PT400'; end if;
  update public.memory_videos set status = 'processing', processing_step = p_step, processing_started_at = now(), failure_code = null, updated_at = now(),
    visual_attempts = visual_attempts + (p_step = 'visual')::int, speech_attempts = speech_attempts + (p_step = 'speech')::int
  where memory_id = p_memory_id returning * into v_row;
  return next v_row;
end $$;

create function public.record_video_visual(p_user_id uuid, p_memory_id uuid, p_visual jsonb)
returns setof public.memory_videos
language plpgsql security definer set search_path = '' as $$
declare v_row public.memory_videos%rowtype; v_item jsonb;
begin
  select * into v_row from public.memory_videos where memory_id = p_memory_id and user_id = p_user_id for update;
  if not found then raise exception 'video not found' using errcode = 'P0002'; end if;
  if v_row.status <> 'processing' or v_row.processing_step <> 'visual' then raise exception 'visual step not running' using errcode = 'PT409'; end if;
  if p_visual is null or not public.video_keys_ok(p_visual, array['model', 'fps', 'analyzedAt', 'scenes', 'observations', 'interpretations', 'gaps', 'occasions'])
    or p_visual ->> 'model' is distinct from 'muse-spark-1.3' or not public.video_number_ok(p_visual -> 'fps', 0.25, 4)
    or not public.video_text_ok(p_visual -> 'analyzedAt', 20, 40)
    or jsonb_typeof(p_visual -> 'scenes') <> 'array' or jsonb_array_length(p_visual -> 'scenes') not between 1 and 12
    or not public.video_strings_ok(p_visual -> 'observations', 20, 240) or jsonb_array_length(p_visual -> 'observations') < 1
    or not public.video_strings_ok(p_visual -> 'gaps', 10, 240)
    or jsonb_typeof(p_visual -> 'interpretations') <> 'array' or jsonb_array_length(p_visual -> 'interpretations') > 6
    or jsonb_typeof(p_visual -> 'occasions') <> 'array' or jsonb_array_length(p_visual -> 'occasions') > 6 then
    raise exception 'invalid visual analysis' using errcode = 'PT400'; end if;
  perform (p_visual ->> 'analyzedAt')::timestamptz;
  for v_item in select value from jsonb_array_elements(p_visual -> 'scenes') loop
    if not public.video_keys_ok(v_item, array['startSeconds', 'endSeconds', 'background', 'objects', 'onScreenText', 'motion'])
      or not public.video_number_ok(v_item -> 'startSeconds', 0, 60) or not public.video_number_ok(v_item -> 'endSeconds', 0, 60)
      or not public.video_text_ok(v_item -> 'background', 1, 120) or not public.video_strings_ok(v_item -> 'objects', 8, 160)
      or not public.video_strings_ok(v_item -> 'onScreenText', 6, 120) or not public.video_text_ok(v_item -> 'motion', 1, 200) then
      raise exception 'invalid scene' using errcode = 'PT400'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_visual -> 'interpretations') loop
    if not public.video_keys_ok(v_item, array['claim', 'basedOn']) or not public.video_text_ok(v_item -> 'claim', 1, 240) or not public.video_text_ok(v_item -> 'basedOn', 1, 240) then
      raise exception 'invalid interpretation' using errcode = 'PT400'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_visual -> 'occasions') loop
    if not public.video_keys_ok(v_item, array['suggestion', 'basis']) or not public.video_text_ok(v_item -> 'suggestion', 1, 120) or v_item ->> 'basis' not in ('visible', 'inferred') then
      raise exception 'invalid occasion' using errcode = 'PT400'; end if;
  end loop;
  update public.memory_videos set visual = p_visual, visual_model = 'muse-spark-1.3', status = 'pending', processing_step = null, processing_started_at = null, updated_at = now()
  where memory_id = p_memory_id returning * into v_row;
  return next v_row;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception 'invalid visual analysis' using errcode = 'PT400';
end $$;

create function public.record_video_speech(p_user_id uuid, p_memory_id uuid, p_transcript jsonb, p_summary text, p_concepts text[])
returns setof public.memory_videos
language plpgsql security definer set search_path = '' as $$
declare v_row public.memory_videos%rowtype; v_item jsonb;
begin
  select * into v_row from public.memory_videos where memory_id = p_memory_id and user_id = p_user_id for update;
  if not found then raise exception 'video not found' using errcode = 'P0002'; end if;
  if v_row.status <> 'processing' or v_row.processing_step <> 'speech' or v_row.visual is null then raise exception 'speech step not running' using errcode = 'PT409'; end if;
  if p_summary is null or char_length(p_summary) not between 1 and 1200 or p_concepts is null or cardinality(p_concepts) > 24
    or exists (select 1 from unnest(p_concepts) c where c is null or char_length(c) not between 1 and 80) then
    raise exception 'invalid summary' using errcode = 'PT400'; end if;
  -- A video without an audio track has no transcript; one with audio must carry the transcriber's output (possibly empty if silent).
  if (v_row.has_audio and p_transcript is null) or (not v_row.has_audio and p_transcript is not null) then
    raise exception 'transcript does not match audio track' using errcode = 'PT400'; end if;
  if p_transcript is not null then
    if not public.video_keys_ok(p_transcript, array['model', 'text', 'durationMs', 'turns']) or p_transcript ->> 'model' is distinct from 'muse-voice-transcribe-1.0'
      or not public.video_text_ok(p_transcript -> 'text', 0, 4000) or not public.video_number_ok(p_transcript -> 'durationMs', 0, 60000)
      or jsonb_typeof(p_transcript -> 'turns') <> 'array' or jsonb_array_length(p_transcript -> 'turns') > 50 then
      raise exception 'invalid transcript' using errcode = 'PT400'; end if;
    for v_item in select value from jsonb_array_elements(p_transcript -> 'turns') loop
      if not public.video_keys_ok(v_item, array['startMs', 'endMs', 'text']) or not public.video_number_ok(v_item -> 'startMs', 0, 60000)
        or not public.video_number_ok(v_item -> 'endMs', 0, 60000) or not public.video_text_ok(v_item -> 'text', 1, 1000) then
        raise exception 'invalid transcript turn' using errcode = 'PT400'; end if;
    end loop;
  end if;
  update public.memory_videos set transcript = p_transcript, speech_model = case when p_transcript is null then null else 'muse-voice-transcribe-1.0' end,
    summary = p_summary, concepts = p_concepts, status = 'ready', processing_step = null, processing_started_at = null, analyzed_at = now(), updated_at = now()
  where memory_id = p_memory_id returning * into v_row;
  update public.memories set analysis_status = 'complete' where id = p_memory_id and user_id = p_user_id;
  return next v_row;
end $$;

create function public.fail_video_analysis_step(p_user_id uuid, p_memory_id uuid, p_step text, p_code text)
returns setof public.memory_videos
language plpgsql security definer set search_path = '' as $$
declare v_row public.memory_videos%rowtype;
begin
  if p_code is null or p_code not in ('provider-timeout', 'provider-unavailable', 'provider-rejected', 'invalid-provider-output', 'media-unavailable', 'audio-extraction-failed', 'not-configured') then
    raise exception 'invalid failure code' using errcode = 'PT400'; end if;
  select * into v_row from public.memory_videos where memory_id = p_memory_id and user_id = p_user_id for update;
  if not found then raise exception 'video not found' using errcode = 'P0002'; end if;
  if v_row.status <> 'processing' or v_row.processing_step is distinct from p_step then raise exception 'step not running' using errcode = 'PT409'; end if;
  -- The saved video and any completed visual step are kept; only this step is marked failed.
  update public.memory_videos set status = 'failed', failure_code = p_code, processing_step = null, processing_started_at = null, updated_at = now()
  where memory_id = p_memory_id returning * into v_row;
  update public.memories set analysis_status = 'failed' where id = p_memory_id and user_id = p_user_id;
  return next v_row;
end $$;

revoke all on function public.video_strings_ok(jsonb, integer, integer), public.video_keys_ok(jsonb, text[]), public.video_text_ok(jsonb, integer, integer),
  public.video_number_ok(jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public.create_trusted_video_memory(uuid, text, text, text, text, bigint, integer, integer, integer, boolean, boolean),
  public.begin_video_analysis_step(uuid, uuid, text), public.record_video_visual(uuid, uuid, jsonb),
  public.record_video_speech(uuid, uuid, jsonb, text, text[]), public.fail_video_analysis_step(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_trusted_video_memory(uuid, text, text, text, text, bigint, integer, integer, integer, boolean, boolean),
  public.begin_video_analysis_step(uuid, uuid, text), public.record_video_visual(uuid, uuid, jsonb),
  public.record_video_speech(uuid, uuid, jsonb, text, text[]), public.fail_video_analysis_step(uuid, uuid, text, text) to service_role;

do $$
declare v_fn regprocedure;
begin
  foreach v_fn in array array['public.create_trusted_video_memory(uuid, text, text, text, text, bigint, integer, integer, integer, boolean, boolean)'::regprocedure,
    'public.begin_video_analysis_step(uuid, uuid, text)'::regprocedure, 'public.record_video_visual(uuid, uuid, jsonb)'::regprocedure,
    'public.record_video_speech(uuid, uuid, jsonb, text, text[])'::regprocedure, 'public.fail_video_analysis_step(uuid, uuid, text, text)'::regprocedure] loop
    if not (select prosecdef from pg_proc where oid = v_fn) then raise exception '% must be SECURITY DEFINER', v_fn; end if;
    if not exists (select 1 from pg_proc where oid = v_fn and proconfig::text like '%search_path=%') then raise exception '% lost search_path', v_fn; end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then raise exception '% is client-callable', v_fn; end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then raise exception 'service_role cannot execute %', v_fn; end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'anon can execute a public function'; end if;
  if has_table_privilege('authenticated', 'public.memory_videos', 'INSERT') or has_table_privilege('authenticated', 'public.memory_videos', 'UPDATE')
    or has_table_privilege('authenticated', 'public.memory_videos', 'DELETE') or has_table_privilege('anon', 'public.memory_videos', 'SELECT') then
    raise exception 'memory_videos is client-writable or anon-readable'; end if;
  if has_column_privilege('authenticated', 'public.memories', 'metadata', 'UPDATE') then raise exception 'authenticated gained metadata UPDATE'; end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.memory_videos'::regclass) then raise exception 'memory_videos RLS not forced'; end if;
  if (select public from storage.buckets where id = 'memory-videos') then raise exception 'memory-videos bucket is public'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual like '%memory-videos%' or with_check like '%memory-videos%')) then
    raise exception 'a client storage policy covers memory-videos'; end if;
  if (select file_size_limit from storage.buckets where id = 'memory-videos') <> 20000000 or (select allowed_mime_types from storage.buckets where id = 'memory-videos') <> array['video/mp4'] then
    raise exception 'memory-videos bucket limits changed'; end if;
end $$;

commit;
