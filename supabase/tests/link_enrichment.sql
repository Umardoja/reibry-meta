-- Stage 12I-1 trusted link enrichment boundary. Run after hosted_default_privileges.sql and all migrations; always rolls back.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.memories(id,user_id,title,source_type,source_url,raw_text,metadata) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','YouTube video','link','https://youtu.be/rfscVS0vtbw',null,
  '{"capture":"link","platform":"youtube","enrichment":"pending","provenance":{"title":"reibry-placeholder"}}'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','My cake idea','link','https://example.com/cake','User note stays',
  '{"capture":"link","platform":"web","enrichment":"pending","provenance":{"title":"user","note":"user"}}'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A note','text',null,'Plain note','{}'),
 ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','en.wikipedia.org','link','https://en.wikipedia.org/wiki/Birthday_cake',null,'{"capture":"link"}');
do $$ begin
  -- Clients can never call the trusted writer or update provider metadata directly.
  set local role authenticated; perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  begin perform public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{"enrichment":"complete"}','Forged'); raise exception 'authenticated called trusted enrichment'; exception when insufficient_privilege then null; end;
  begin update public.memories set metadata = '{"enrichment":"complete"}' where id = '11111111-1111-4111-8111-111111111111'; raise exception 'authenticated updated metadata'; exception when insufficient_privilege then null; end;
  reset role; set local role anon;
  begin perform public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{}',null); raise exception 'anon called trusted enrichment'; exception when insufficient_privilege then null; end;
  reset role;
end $$;
set local role service_role;
do $$
declare v public.memories%rowtype; v_before timestamptz;
begin
  select * into v from public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
    '{"enrichment":"complete","metadataProvider":"youtube-oembed","author":"freeCodeCamp.org","thumbnailUrl":"https://i.ytimg.com/vi/rfscVS0vtbw/hqdefault.jpg",
      "postId":"rfscVS0vtbw","enrichedAt":"2026-10-30T20:00:00Z","provenance":{"title":"youtube-oembed","author":"youtube-oembed","thumbnailUrl":"youtube-oembed"}}', 'Learn Python - Full Course');
  if v.title <> 'Learn Python - Full Course' or v.metadata->>'author' <> 'freeCodeCamp.org' or v.metadata->'provenance'->>'title' <> 'youtube-oembed'
     or v.metadata->>'capture' <> 'link' or v.metadata->>'platform' <> 'youtube' or v.raw_text is not null then raise exception 'placeholder enrichment not persisted correctly'; end if;
  -- Idempotent retry: same values, same identity.
  select * into v from public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
    '{"enrichment":"complete","author":"freeCodeCamp.org","provenance":{"author":"youtube-oembed"}}', 'A different provider title');
  if v.title <> 'Learn Python - Full Course' or v.id <> '11111111-1111-4111-8111-111111111111' then raise exception 'retry replaced a provider title or identity'; end if;
  -- User-authored title and note are never overwritten.
  select * into v from public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',
    '{"enrichment":"partial","caption":"Pink buttercream","provenance":{"title":"page-metadata","caption":"page-metadata"}}', 'Page title');
  if v.title <> 'My cake idea' or v.raw_text <> 'User note stays' or v.metadata->'provenance'->>'title' <> 'user' or v.metadata->'provenance'->>'note' <> 'user'
     or v.metadata->>'caption' <> 'Pink buttercream' then raise exception 'user title/note overwritten or caption lost'; end if;
  -- Legacy row (no provenance, hostname title) is recognised as a placeholder.
  select * into v from public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444',
    '{"enrichment":"complete","provenance":{"title":"page-metadata"}}', 'Birthday cake - Wikipedia');
  if v.title <> 'Birthday cake - Wikipedia' then raise exception 'legacy placeholder not upgraded'; end if;
  -- Ownership and type are rechecked inside the definer function.
  begin perform public.apply_trusted_link_enrichment('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','{"enrichment":"complete"}',null); raise exception 'B enriched A Memory'; exception when sqlstate 'P0002' then null; end;
  begin perform public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','{"enrichment":"complete"}',null); raise exception 'text Memory enriched'; exception when sqlstate 'P0002' then null; end;
  begin perform public.apply_trusted_link_enrichment('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','{}',null); raise exception 'unknown user accepted'; exception when sqlstate 'PT400' then null; end;
  -- Malicious or malformed values are rejected with a non-retryable PT400 and change nothing.
  select updated_at into v_before from public.memories where id = '11111111-1111-4111-8111-111111111111';
  declare bad jsonb; begin
    foreach bad in array array['{"title":"x"}','{"rawText":"x"}','{"capture":"note"}','{"thumbnailUrl":"javascript:alert(1)"}','{"thumbnailUrl":"http://insecure.example/x.jpg"}',
      '{"authorUrl":"https://user@evil.example/"}','{"enrichment":"verified-by-ai"}','{"metadataProvider":"gpt-vision"}','{"provenance":{"title":"user"}}',
      '{"provenance":{"transcript":"youtube-oembed"}}','{"caption":"' || repeat('x', 1001) || '"}','{"hashtags":["ok","<script>"]}','{"durationSeconds":1.5}',
      '{"publishedAt":"not a date"}','{"postId":"../../etc"}']::jsonb[] loop
      begin perform public.apply_trusted_link_enrichment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111', bad, null);
        raise exception 'accepted malicious details %', bad; exception when sqlstate 'PT400' then null; end;
    end loop;
  end;
  if (select updated_at from public.memories where id = '11111111-1111-4111-8111-111111111111') <> v_before then raise exception 'rejected details changed the row'; end if;
end $$;
reset role;
rollback;
