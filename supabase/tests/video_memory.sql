-- Stage 12I-2B video Memories: storage access, trusted writers, bounded steps. Run after storage_bootstrap.sql, hosted_default_privileges.sql
-- and all migrations; always rolls back.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to service_role, authenticated;
do $$ begin
  -- Clients cannot create video Memories, write analysis rows, call trusted writers, or upload/overwrite videos.
  set local role authenticated; perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  begin insert into public.memories(user_id,title,source_type) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Forged video','video'); raise exception 'client inserted a video Memory';
  exception when insufficient_privilege or check_violation then null; end;
  begin insert into public.memory_videos(memory_id,user_id,storage_path,size_bytes,duration_ms,has_audio,consent_at)
    values (gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('a',64) || '.mp4',1,1,false,now()); raise exception 'client wrote memory_videos';
  exception when insufficient_privilege then null; end;
  begin perform public.create_trusted_video_memory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','x',null,repeat('a',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('a',64) || '.mp4',1,1,null,null,false,true);
    raise exception 'client called trusted video writer'; exception when insufficient_privilege then null; end;
  begin perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'visual'); raise exception 'client began a step'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values ('memory-videos','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('c',64) || '.mp4'); raise exception 'client uploaded a video';
  exception when insufficient_privilege then null; end;
  reset role; set local role anon;
  begin perform public.record_video_visual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'{}'); raise exception 'anon called trusted writer'; exception when insufficient_privilege then null; end;
  reset role;
end $$;
set local role service_role;
do $$
declare v public.memories%rowtype; again public.memories%rowtype; w public.memories%rowtype; r public.memory_videos%rowtype;
  a_path text := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('1',64) || '.mp4'; b_path text := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/' || repeat('2',64) || '.mp4';
  good jsonb := '{"model":"muse-spark-1.3","fps":1,"analyzedAt":"2026-10-31T07:00:00Z","scenes":[{"startSeconds":0,"endSeconds":5,"background":"dark blue","objects":["red square"],"onScreenText":["STEP 1 MIX"],"motion":"static"}],
    "observations":["red square on dark blue"],"interpretations":[{"claim":"a step sequence","basedOn":"on-screen text"}],"gaps":["no people visible"],"occasions":[{"suggestion":"instructional template","basis":"visible"}]}';
  bad jsonb; n int;
begin
  select * into v from public.create_trusted_video_memory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Video · 15 s','my note',repeat('1',64),a_path,95899,15000,640,360,true,true);
  if v.source_type <> 'video' or v.raw_text <> 'my note' or v.analysis_status <> 'processing' or v.source_url is not null then raise exception 'video Memory not created correctly'; end if;
  insert into ids values ('a1', v.id);
  select * into again from public.create_trusted_video_memory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Video · 15 s',null,repeat('1',64),a_path,95899,15000,640,360,true,true);
  if again.id <> v.id or (select count(*) from public.memory_videos where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then raise exception 'duplicate upload created a second record'; end if;
  -- Input validation: consent, folder ownership, size and duration caps.
  foreach bad in array array['{"consent":false}','{"path":"other"}','{"size":20000001}','{"duration":20001}']::jsonb[] loop
    begin
      perform public.create_trusted_video_memory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','t',null,repeat('9',64),
        case when bad ? 'path' then b_path else 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('9',64) || '.mp4' end,
        coalesce((bad->>'size')::bigint, 10), coalesce((bad->>'duration')::int, 1000), null, null, false, coalesce((bad->>'consent')::boolean, true));
      raise exception 'invalid video memory accepted: %', bad;
    exception when sqlstate 'PT400' then null; end;
  end loop;
  select * into w from public.create_trusted_video_memory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Silent clip',null,repeat('3',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('3',64) || '.mp4',1000,4000,null,null,false,true);
  insert into ids values ('a2', w.id);
  perform public.create_trusted_video_memory('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B video',null,repeat('2',64),b_path,1000,4000,null,null,true,true);
  insert into storage.objects(bucket_id,name) values ('memory-videos',a_path),('memory-videos',b_path);

  -- Steps: order, one running step per user, failure keeps the video, bounded retries.
  begin perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'speech'); raise exception 'speech before visual'; exception when sqlstate 'PT400' then null; end;
  begin perform public.begin_video_analysis_step('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',v.id,'visual'); raise exception 'B began A analysis'; exception when sqlstate 'P0002' then null; end;
  select * into r from public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'visual');
  if r.status <> 'processing' or r.visual_attempts <> 1 then raise exception 'visual step not started'; end if;
  begin perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',w.id,'visual'); raise exception 'second concurrent job for one user'; exception when sqlstate 'PT409' then null; end;
  perform public.begin_video_analysis_step('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',(select memory_id from public.memory_videos where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'visual');
  -- Malformed or forged provider output is rejected and nothing is written.
  foreach bad in array array[good || '{"extra":1}', good || '{"model":"gpt-4o"}', good || '{"observations":[]}', good || '{"fps":30}', good || '{"analyzedAt":"not a date"}',
    good || '{"scenes":[{"startSeconds":0,"endSeconds":5,"background":"x","objects":[],"onScreenText":[],"motion":"x","speech":"forged"}]}',
    good || '{"occasions":[{"suggestion":"x","basis":"spoken"}]}', good || '{"observations":[""]}']::jsonb[] loop
    begin perform public.record_video_visual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,bad); raise exception 'invalid visual accepted: %', left(bad::text, 80);
    exception when sqlstate 'PT400' then null; end;
  end loop;
  if (select visual from public.memory_videos where memory_id = v.id) is not null then raise exception 'rejected visual was written'; end if;
  begin perform public.record_video_visual('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',v.id,good); raise exception 'B recorded on A'; exception when sqlstate 'P0002' then null; end;
  select * into r from public.fail_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'visual','provider-unavailable');
  if r.status <> 'failed' or (select analysis_status from public.memories where id = v.id) <> 'failed' or not exists (select 1 from storage.objects where name = a_path) then
    raise exception 'failure did not keep the saved video'; end if;
  perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'visual');
  select * into r from public.record_video_visual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,good);
  if r.status <> 'pending' or r.visual_attempts <> 2 or r.visual_model <> 'muse-spark-1.3' then raise exception 'visual not recorded'; end if;
  begin perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'visual'); raise exception 'visual repeated after success'; exception when sqlstate 'PT400' then null; end;
  perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'speech');
  begin perform public.record_video_speech('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,null,'summary',array['x']); raise exception 'audio video saved without transcript'; exception when sqlstate 'PT400' then null; end;
  begin perform public.record_video_speech('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'{"model":"muse-spark-1.3","text":"forged","durationMs":1,"turns":[]}','s',array['x']);
    raise exception 'transcript from the wrong model accepted'; exception when sqlstate 'PT400' then null; end;
  select * into r from public.record_video_speech('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,
    '{"model":"muse-voice-transcribe-1.0","text":"buy oat milk","durationMs":10000,"turns":[{"startMs":60,"endMs":2540,"text":"buy oat milk"}]}','A short graphic video.',array['oat milk','red square']);
  if r.status <> 'ready' or r.speech_model <> 'muse-voice-transcribe-1.0' or (select analysis_status from public.memories where id = v.id) <> 'complete' then raise exception 'speech not recorded'; end if;
  begin perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v.id,'speech'); raise exception 'ready video re-analysed'; exception when sqlstate 'PT409' then null; end;
  -- Retry cap: two failed visual attempts end the visual step for good. (B's running step does not block A.)
  perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',w.id,'visual'); perform public.fail_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',w.id,'visual','provider-timeout');
  perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',w.id,'visual'); perform public.fail_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',w.id,'visual','provider-timeout');
  begin perform public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',w.id,'visual'); raise exception 'third visual attempt allowed'; exception when sqlstate 'PT400' then null; end;
end $$;
reset role;
-- An abandoned step (server died mid-request) can be reclaimed after 3 minutes, within the attempt cap.
update public.memory_videos set status = 'processing', processing_step = 'visual', processing_started_at = now() - interval '4 minutes', visual = null, visual_attempts = 1
  where memory_id = (select id from ids where name = 'a2');
set local role service_role;
do $$ declare r public.memory_videos%rowtype; begin
  select * into r from public.begin_video_analysis_step('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from ids where name = 'a2'),'visual');
  if r.visual_attempts <> 2 then raise exception 'stale step not reclaimed'; end if;
end $$;
reset role;
do $$ declare v_path text; begin
  -- No user token can see, upload or delete any memory-videos object (the bucket has no client policies); owners see only their own
  -- analysis rows, and the storage path is revealed only to its owner, which is how the server proves ownership before using its key.
  set local role authenticated; perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
  if exists (select 1 from public.memory_videos where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'B read A analysis'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'memory-videos') then raise exception 'B can see video objects'; end if;
  delete from storage.objects where bucket_id = 'memory-videos';
  perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  if exists (select 1 from storage.objects where bucket_id = 'memory-videos') then raise exception 'owner token can see objects directly'; end if;
  delete from storage.objects where bucket_id = 'memory-videos';
  begin insert into storage.objects(bucket_id,name) values ('memory-videos','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || repeat('d',64) || '.mp4'); raise exception 'owner token uploaded directly';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.memory_videos) <> 2 then raise exception 'A does not see exactly own analysis rows'; end if;
  select storage_path into v_path from public.memory_videos where memory_id = (select id from ids where name = 'a1');
  if v_path is null then raise exception 'owner cannot read own storage path'; end if;
  begin update public.memory_videos set summary = 'forged' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; raise exception 'owner forged analysis'; exception when insufficient_privilege then null; end;
  reset role;
  if (select count(*) from storage.objects where bucket_id = 'memory-videos') <> 2 then raise exception 'a user token deleted a video object'; end if;
  -- Server deletion after that owner-scoped path read: Storage object first (server key), then the Memory; the analysis row cascades.
  set local role service_role; delete from storage.objects where bucket_id = 'memory-videos' and name = v_path; reset role;
  set local role authenticated; perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  delete from public.memories where id = (select id from ids where name = 'a1'); reset role;
  if exists (select 1 from storage.objects where name = v_path) then raise exception 'video object not removed'; end if;
  if exists (select 1 from public.memory_videos where memory_id = (select id from ids where name = 'a1')) then raise exception 'analysis row orphaned'; end if;
  if not exists (select 1 from storage.objects where name like 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/%') then raise exception 'B video affected'; end if;
end $$;
rollback;
