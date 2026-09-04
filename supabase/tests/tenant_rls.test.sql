begin;

select plan(136);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner-one@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'owner-two@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'admin-one@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'member-one@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'member-two@example.test', 'not-used', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_like(
  $$ select public.bootstrap_organization('Unauthenticated organization') $$,
  '%authentication required%',
  'an authenticated role without a user claim cannot bootstrap an organization'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select lives_ok($$ select public.bootstrap_organization('Organization one') $$, 'owner one can bootstrap an organization');
select set_config('test.organization_one_id', (select id::text from public.organizations where name = 'Organization one'), true);

select is((select count(*) from public.organizations), 1::bigint, 'owner can select its organization');
select lives_ok(
  $$ insert into public.brands (organization_id, name, domain) values (current_setting('test.organization_one_id')::uuid, 'Brand one', 'brand-one.test') $$,
  'owner can insert a brand'
);
select set_config('test.brand_one_id', (select id::text from public.brands where domain = 'brand-one.test'), true);
select lives_ok(
  $$ insert into public.competitors (brand_id, name, domain) values (current_setting('test.brand_one_id')::uuid, 'Rival one', 'rival-one.test') $$,
  'owner can insert a competitor'
);
select set_config('test.competitor_one_id', (select id::text from public.competitors where domain = 'rival-one.test'), true);

set local role postgres;
insert into public.sources (brand_id, connector_type, source_type, canonical_url)
values (current_setting('test.brand_one_id')::uuid, 'website', 'homepage', 'https://brand-one.test/')
returning id::text as source_id \gset
select set_config('test.brand_source_id', :'source_id', true);
insert into public.snapshots (
  source_id, captured_at, final_url, http_status, content_type, raw_content_hash, content_hash, raw_artifact_path
) values (
  current_setting('test.brand_source_id')::uuid,
  now(),
  'https://brand-one.test/',
  200,
  'text/html',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'org-one/brand-one/web/source-one/snapshot-one.html.gz'
);
insert into public.observations (
  snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at
) values (
  (select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1),
  current_setting('test.brand_one_id')::uuid,
  'positioning.homepage',
  'https://brand-one.test/',
  '{"headline":"Brand one"}',
  'dom',
  0.80,
  'website-deterministic-v1',
  'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  now()
);
insert into public.observed_changes (
  subject_id, source_id, fact_type, change_type, fact_identity,
  current_snapshot_id, current_observation_id,
  before_value, after_value, detected_at, detector_version, change_hash
) values (
  current_setting('test.brand_one_id')::uuid,
  current_setting('test.brand_source_id')::uuid,
  'positioning.homepage',
  'value_changed',
  'positioning.homepage:headline',
  (select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1),
  (select id from public.observations where snapshot_id = (select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1) limit 1),
  '{"headline":"Old headline"}',
  '{"headline":"Brand one"}',
  now(),
  'change-detector-v1',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111'
);
set local role authenticated;

select lives_ok(
  $$ insert into public.organization_members (organization_id, user_id, role) values (current_setting('test.organization_one_id')::uuid, '33333333-3333-3333-3333-333333333333', 'admin') $$,
  'owner can add an admin'
);
select lives_ok(
  $$ insert into public.organization_members (organization_id, user_id, role) values (current_setting('test.organization_one_id')::uuid, '44444444-4444-4444-4444-444444444444', 'member') $$,
  'owner can add a member'
);

select is((select count(*) from public.sources), 1::bigint, 'owner can select same-organization sources');
select is((select count(*) from public.snapshots), 1::bigint, 'owner can select same-organization snapshots');
select is((select count(*) from public.observations), 1::bigint, 'owner can select same-organization observations');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*) from public.brands), 1::bigint, 'member can select same-organization brands');
select is((select count(*) from public.sources), 1::bigint, 'member can select same-organization sources');
select is((select count(*) from public.snapshots), 1::bigint, 'member can select same-organization snapshots');
select is((select count(*) from public.observations), 1::bigint, 'member can select same-organization observations');
select ok((select count(*) from public.observed_changes) >= 1, 'member can select same-organization observed changes');
select throws_like(
  $$ insert into public.sources (brand_id, connector_type, source_type, canonical_url)
     values (current_setting('test.brand_one_id')::uuid, 'website', 'homepage', 'https://member-source.test/') $$,
  '%row-level security%',
  'member cannot insert sources directly'
);
select throws_like(
  $$ insert into public.snapshots (source_id, captured_at, final_url, http_status, content_type, raw_content_hash, content_hash, raw_artifact_path)
     values (current_setting('test.brand_source_id')::uuid, now(), 'https://brand-one.test/', 200, 'text/html',
       'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
       'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
       'org-one/brand-one/web/source-one/member-snapshot.html.gz') $$,
  '%row-level security%',
  'member cannot insert snapshots directly'
);
select throws_like(
  $$ insert into public.observations (snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at)
     values ((select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1), current_setting('test.brand_one_id')::uuid,
       'product.name', 'https://brand-one.test/', '{}', 'dom', 0.80, 'test',
       'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', now()) $$,
  '%row-level security%',
  'member cannot insert observations directly'
);
select throws_like(
  $$ insert into public.observed_changes (subject_id, source_id, fact_type, change_type, fact_identity, current_snapshot_id, detected_at, detector_version, change_hash)
     values (current_setting('test.brand_one_id')::uuid, current_setting('test.brand_source_id')::uuid,
       'positioning.homepage', 'value_changed', 'positioning.homepage:headline',
       (select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1),
       now(), 'change-detector-v1', 'sha256:2222222222222222222222222222222222222222222222222222222222222222') $$,
  '%row-level security%',
  'member cannot insert observed changes directly'
);
select lives_ok(
  $$ insert into public.competitors (brand_id, name, domain) values (current_setting('test.brand_one_id')::uuid, 'Member rival', 'member-rival.test') $$,
  'member can insert a same-organization competitor'
);
select lives_ok(
  $$ update public.competitors set name = 'Member updated rival' where id = current_setting('test.competitor_one_id')::uuid $$,
  'member can update a same-organization competitor'
);
select lives_ok(
  $$ delete from public.competitors where domain = 'member-rival.test' $$,
  'member can delete a same-organization competitor'
);
select throws_like(
  $$ insert into public.organization_members (organization_id, user_id, role) values (current_setting('test.organization_one_id')::uuid, '55555555-5555-5555-5555-555555555555', 'member') $$,
  '%row-level security%',
  'member cannot manage memberships'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select lives_ok(
  $$ insert into public.organization_members (organization_id, user_id, role) values (current_setting('test.organization_one_id')::uuid, '55555555-5555-5555-5555-555555555555', 'member') $$,
  'admin can add a non-owner member'
);
select lives_ok(
  $$ update public.organization_members set role = 'admin' where organization_id = current_setting('test.organization_one_id')::uuid and user_id = '55555555-5555-5555-5555-555555555555' $$,
  'admin can update a non-owner membership'
);
select is_empty(
  $$ update public.organization_members
     set role = 'member'
     where organization_id = current_setting('test.organization_one_id')::uuid
       and user_id = '11111111-1111-1111-1111-111111111111'
     returning 1 $$,
  'admin cannot change an owner membership'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select lives_ok($$ select public.bootstrap_organization('Organization two') $$, 'owner two can bootstrap another organization');
select set_config('test.organization_two_id', (select id::text from public.organizations where name = 'Organization two'), true);
select lives_ok(
  $$ insert into public.brands (organization_id, name, domain) values (current_setting('test.organization_two_id')::uuid, 'Brand two', 'brand-two.test') $$,
  'owner two can insert its own brand'
);
select set_config('test.brand_two_id', (select id::text from public.brands where domain = 'brand-two.test'), true);

select is((select count(*) from public.brands where id = current_setting('test.brand_one_id')::uuid), 0::bigint, 'cross-organization select is denied');
select is((select count(*) from public.sources where id = current_setting('test.brand_source_id')::uuid), 0::bigint, 'cross-organization source select is denied');
select is((select count(*) from public.snapshots), 0::bigint, 'cross-organization snapshot select is denied');
select is((select count(*) from public.observations), 0::bigint, 'cross-organization observation select is denied');
select is((select count(*) from public.observed_changes), 0::bigint, 'cross-organization observed change select is denied');
select throws_like(
  $$ insert into public.brands (organization_id, name, domain) values (current_setting('test.organization_one_id')::uuid, 'Denied brand', 'denied-brand.test') $$,
  '%row-level security%',
  'cross-organization insert is denied'
);
select lives_ok(
  $$ update public.brands set name = 'Denied update' where id = current_setting('test.brand_one_id')::uuid $$,
  'cross-organization update affects no rows'
);
select lives_ok(
  $$ delete from public.competitors where id = current_setting('test.competitor_one_id')::uuid $$,
  'cross-organization delete affects no rows'
);

select lives_ok(
  $$ insert into public.organization_members (organization_id, user_id, role) values (current_setting('test.organization_two_id')::uuid, '11111111-1111-1111-1111-111111111111', 'member') $$,
  'owner two can add owner one as a member of organization two'
);

set local role postgres;
insert into public.competitors (brand_id, name, domain)
values (current_setting('test.brand_two_id')::uuid, 'Rival two', 'rival-two.test')
returning id::text as competitor_id \gset
select set_config('test.competitor_two_id', :'competitor_id', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*) from public.competitors where id = current_setting('test.competitor_two_id')::uuid), 0::bigint, 'org one member cannot select competitor under brand two');
set local role postgres;
select throws_like(
  $$ insert into public.sources (brand_id, competitor_id, connector_type, source_type, canonical_url)
     values (current_setting('test.brand_one_id')::uuid, current_setting('test.competitor_two_id')::uuid, 'website', 'homepage', 'https://invalid-source.test/') $$,
  '%sources_competitor_matches_brand_fk%',
  'source competitor must belong to its brand'
);
select throws_like(
  $$ insert into public.sources (brand_id, connector_type, source_type, canonical_url)
     values (current_setting('test.brand_one_id')::uuid, 'website', 'homepage', 'https://brand-one.test/') $$,
  '%duplicate key%',
  'duplicate canonical homepage source is denied'
);
select lives_ok(
  $$ insert into public.sources (brand_id, connector_type, source_type, canonical_url)
     values (current_setting('test.brand_one_id')::uuid, 'website', 'product', 'https://brand-one.test/products/widget') $$,
  'a discovered product source can be persisted'
);
select throws_like(
  $$ insert into public.sources (brand_id, connector_type, source_type, canonical_url)
     values (current_setting('test.brand_one_id')::uuid, 'website', 'product', 'https://brand-one.test/products/widget') $$,
  '%duplicate key%',
  'duplicate discovered canonical sources are denied'
);
select throws_like(
  $$ insert into public.observations (snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at)
     values ((select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1), current_setting('test.brand_one_id')::uuid,
       'positioning.homepage', 'https://brand-one.test/', '{}', 'dom', 0.80, 'test',
       'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', now()) $$,
  '%duplicate key%',
  'reprocessing the same candidate for a snapshot is idempotent'
);
select lives_ok(
  $$ insert into public.snapshots (source_id, captured_at, final_url, http_status, content_type, raw_content_hash, content_hash, raw_artifact_path)
     values (current_setting('test.brand_source_id')::uuid, now(), 'https://brand-one.test/', 200, 'text/html',
       'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
       'org-one/brand-one/web/source-one/snapshot-two.html.gz') $$,
  'identical content can append a new snapshot'
);
select is((select count(*) from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid), 2::bigint, 'duplicate content snapshots preserve collection history');
select lives_ok(
  $$ insert into public.observations (snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at)
     values ((select id from public.snapshots where raw_artifact_path like '%snapshot-two.html.gz'), current_setting('test.brand_one_id')::uuid,
       'positioning.homepage', 'https://brand-one.test/', '{"headline":"Brand one"}', 'dom', 0.80, 'website-deterministic-v1',
       'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', now()) $$,
  'the same candidate can be retained for a newer snapshot'
);
select throws_like(
  $$ update public.snapshots set final_url = 'https://changed.test/' where source_id = current_setting('test.brand_source_id')::uuid $$,
  '%snapshots are append-only%',
  'snapshot updates are rejected by the immutability trigger'
);
select throws_like(
  $$ delete from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid $$,
  '%snapshots are append-only%',
  'snapshot deletes are rejected by the immutability trigger'
);
select throws_like(
  $$ update public.observations set confidence = 0.90 where fact_type = 'positioning.homepage' $$,
  '%observations are append-only%',
  'observation updates are rejected by the immutability trigger'
);
select throws_like(
  $$ delete from public.observations where fact_type = 'positioning.homepage' $$,
  '%observations are append-only%',
  'observation deletes are rejected by the immutability trigger'
);
select throws_like(
  $$ update public.observed_changes set change_type = 'removed' where change_hash = 'sha256:1111111111111111111111111111111111111111111111111111111111111111' $$,
  '%observed_changes are append-only%',
  'observed change updates are rejected by the immutability trigger'
);
select throws_like(
  $$ delete from public.observed_changes where change_hash = 'sha256:1111111111111111111111111111111111111111111111111111111111111111' $$,
  '%observed_changes are append-only%',
  'observed change deletes are rejected by the immutability trigger'
);
select throws_like(
  $$ insert into public.observed_changes (subject_id, source_id, fact_type, change_type, fact_identity, current_snapshot_id, current_observation_id, before_value, after_value, detected_at, detector_version, change_hash)
     values (current_setting('test.brand_one_id')::uuid, current_setting('test.brand_source_id')::uuid,
       'positioning.homepage', 'value_changed', 'positioning.homepage:headline',
       (select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1),
       (select id from public.observations where snapshot_id = (select id from public.snapshots where source_id = current_setting('test.brand_source_id')::uuid limit 1) limit 1),
       '{"headline":"Old headline"}', '{"headline":"Brand one"}', now(), 'change-detector-v1',
       'sha256:1111111111111111111111111111111111111111111111111111111111111111') $$,
  '%duplicate key%',
  'reprocessing the same change for a snapshot is idempotent'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_like(
  $$ update public.brands set organization_id = current_setting('test.organization_two_id')::uuid where id = current_setting('test.brand_one_id')::uuid $$,
  '%brand organization cannot be changed%',
  'brand reassignment is denied even when both organizations are visible'
);
select throws_like(
  $$ update public.competitors set brand_id = current_setting('test.brand_two_id')::uuid where id = current_setting('test.competitor_one_id')::uuid $$,
  '%competitor brand cannot be changed%',
  'competitor reassignment is denied even when both brands are visible'
);

select is((select name from public.brands where id = current_setting('test.brand_one_id')::uuid), 'Brand one', 'cross-organization update did not alter the brand');
select is((select count(*) from public.competitors where id = current_setting('test.competitor_one_id')::uuid), 1::bigint, 'cross-organization delete did not remove the competitor');

set local role postgres;
select set_config(
  'test.brand_snapshot_id',
  (select id::text from public.snapshots where raw_artifact_path like '%snapshot-one.html.gz'),
  true
);
select set_config(
  'test.brand_observation_id',
  (select id::text from public.observations where snapshot_id = current_setting('test.brand_snapshot_id')::uuid limit 1),
  true
);
insert into public.sources (brand_id, competitor_id, connector_type, source_type, canonical_url)
values (
  current_setting('test.brand_one_id')::uuid,
  current_setting('test.competitor_one_id')::uuid,
  'website',
  'homepage',
  'https://rival-one.test/'
)
returning id::text as competitor_source_id \gset
select set_config('test.competitor_source_id', :'competitor_source_id', true);
insert into public.snapshots (
  source_id, captured_at, final_url, http_status, content_type, raw_content_hash, content_hash, raw_artifact_path
) values (
  current_setting('test.competitor_source_id')::uuid,
  now(),
  'https://rival-one.test/',
  200,
  'text/html',
  'sha256:1212121212121212121212121212121212121212121212121212121212121212',
  'sha256:3434343434343434343434343434343434343434343434343434343434343434',
  'org-one/brand-one/web/rival-one/snapshot-one.html.gz'
)
returning id::text as competitor_snapshot_id \gset
select set_config('test.competitor_snapshot_id', :'competitor_snapshot_id', true);
insert into public.observations (
  snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at
) values (
  current_setting('test.competitor_snapshot_id')::uuid,
  current_setting('test.competitor_one_id')::uuid,
  'positioning.homepage',
  'https://rival-one.test/',
  '{"headline":"Rival one"}',
  'dom',
  0.90,
  'website-deterministic-v1',
  'sha256:5656565656565656565656565656565656565656565656565656565656565656',
  now()
)
returning id::text as competitor_observation_id \gset
select set_config('test.competitor_observation_id', :'competitor_observation_id', true);
insert into public.observations (
  snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at
) values (
  current_setting('test.competitor_snapshot_id')::uuid,
  current_setting('test.competitor_one_id')::uuid,
  'subscription.available',
  'https://rival-one.test/',
  '{"available":true}',
  'dom',
  0.90,
  'website-deterministic-v1',
  'sha256:6767676767676767676767676767676767676767676767676767676767676767',
  now()
)
returning id::text as competitor_subscription_observation_id \gset
select set_config('test.competitor_subscription_observation_id', :'competitor_subscription_observation_id', true);
insert into public.snapshots (
  source_id, captured_at, final_url, http_status, content_type, raw_content_hash, content_hash, raw_artifact_path
) values (
  current_setting('test.competitor_source_id')::uuid,
  now() - interval '1 day',
  'https://rival-one.test/',
  200,
  'text/html',
  'sha256:7878787878787878787878787878787878787878787878787878787878787878',
  'sha256:9090909090909090909090909090909090909090909090909090909090909090',
  'org-one/brand-one/web/rival-one/snapshot-previous.html.gz'
)
returning id::text as competitor_previous_snapshot_id \gset
select set_config('test.competitor_previous_snapshot_id', :'competitor_previous_snapshot_id', true);
insert into public.observations (
  snapshot_id, subject_id, fact_type, source_url, payload, extraction_method, confidence, extractor_version, candidate_hash, observed_at
) values (
  current_setting('test.competitor_previous_snapshot_id')::uuid,
  current_setting('test.competitor_one_id')::uuid,
  'positioning.homepage',
  'https://rival-one.test/',
  '{"headline":"Rival one before subscription"}',
  'dom',
  0.90,
  'website-deterministic-v1',
  'sha256:abababababababababababababababababababababababababababababababab',
  now() - interval '1 day'
)
returning id::text as competitor_previous_observation_id \gset
select set_config('test.competitor_previous_observation_id', :'competitor_previous_observation_id', true);
insert into public.observed_changes (
  subject_id, source_id, fact_type, change_type, fact_identity,
  previous_snapshot_id, current_snapshot_id, current_observation_id,
  before_value, after_value, detected_at, detector_version, change_hash
) values (
  current_setting('test.competitor_one_id')::uuid,
  current_setting('test.competitor_source_id')::uuid,
  'subscription.available',
  'subscription.added',
  'subscription:default',
  current_setting('test.competitor_previous_snapshot_id')::uuid,
  current_setting('test.competitor_snapshot_id')::uuid,
  current_setting('test.competitor_subscription_observation_id')::uuid,
  null,
  '{"available":true}',
  now(),
  'change-detector-v1',
  'sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
)
returning id::text as competitor_addition_change_id \gset
select set_config('test.competitor_addition_change_id', :'competitor_addition_change_id', true);
insert into public.observed_changes (
  subject_id, source_id, fact_type, change_type, fact_identity,
  previous_snapshot_id, current_snapshot_id, previous_observation_id, current_observation_id,
  before_value, after_value, detected_at, detector_version, change_hash
) values (
  current_setting('test.competitor_one_id')::uuid,
  current_setting('test.competitor_source_id')::uuid,
  'subscription.available',
  'subscription.changed',
  'subscription:default',
  current_setting('test.competitor_previous_snapshot_id')::uuid,
  current_setting('test.competitor_snapshot_id')::uuid,
  current_setting('test.competitor_previous_observation_id')::uuid,
  current_setting('test.competitor_subscription_observation_id')::uuid,
  '{"available":false}',
  '{"available":true}',
  now(),
  'change-detector-v1',
  'sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef'
)
returning id::text as competitor_change_with_previous_observation_id \gset
select set_config(
  'test.competitor_change_with_previous_observation_id',
  :'competitor_change_with_previous_observation_id',
  true
);

select set_config(
  'test.signal_payload',
  jsonb_build_array(
    jsonb_build_object(
      'signalType', 'positioning_differs',
      'ownedBrandId', current_setting('test.brand_one_id'),
      'competitorId', current_setting('test.competitor_one_id'),
      'comparisonKey', 'positioning.homepage',
      'statement', 'Rival one uses different homepage positioning.',
      'supportingValues', jsonb_build_object('owned', 'Brand one', 'competitor', 'Rival one'),
      'confidence', 'medium',
      'evidence', jsonb_build_array(
        jsonb_build_object(
          'role', 'owned',
          'sourceId', current_setting('test.brand_source_id'),
          'snapshotId', current_setting('test.brand_snapshot_id'),
          'observationId', current_setting('test.brand_observation_id'),
          'confidence', 0.80
        ),
        jsonb_build_object(
          'role', 'competitor',
          'sourceId', current_setting('test.competitor_source_id'),
          'snapshotId', current_setting('test.competitor_snapshot_id'),
          'observationId', current_setting('test.competitor_observation_id'),
          'confidence', 0.90
        )
      ),
      'generatedAt', '2026-09-03T12:00:00.000Z',
      'ruleVersion', 'competitive-signals-v1',
      'signalHash', 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      'direction', 'different'
    )
  )::text,
  true
);

set local role service_role;
select is(
  (select inserted from public.persist_competitive_signals(current_setting('test.signal_payload')::jsonb)),
  true,
  'service role can persist a new competitive signal'
);
select is(
  (select inserted from public.persist_competitive_signals(current_setting('test.signal_payload')::jsonb)),
  false,
  'replaying a competitive signal reports the existing immutable row'
);

set local role postgres;
select is(
  (select count(*) from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333'),
  1::bigint,
  'idempotent RPC replay stores exactly one signal row'
);
select is(
  (select count(*) from public.competitive_signal_evidence where signal_id = (
    select id from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333'
  )),
  2::bigint,
  'idempotent RPC replay stores exactly one ordered evidence set'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*) from public.competitive_signals), 1::bigint, 'member can select same-organization competitive signals');
select is((select count(*) from public.competitive_signal_evidence), 2::bigint, 'member can select same-organization competitive signal evidence');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.competitive_signals), 0::bigint, 'cross-organization competitive signals are invisible');
select is((select count(*) from public.competitive_signal_evidence), 0::bigint, 'cross-organization competitive signal evidence is invisible');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_like(
  $$ insert into public.competitive_signals (
       owned_brand_id, competitor_id, signal_type, comparison_key, statement,
       supporting_values, confidence, generated_at, rule_version, signal_hash
     ) values (
       current_setting('test.brand_one_id')::uuid, current_setting('test.competitor_one_id')::uuid,
       'positioning_differs', 'positioning.homepage', 'Denied signal', '{"owned":"A","competitor":"B"}',
       'medium', now(), 'competitive-signals-v1',
       'sha256:4444444444444444444444444444444444444444444444444444444444444444'
     ) $$,
  '%permission denied%',
  'authenticated users cannot insert competitive signals'
);
select throws_like(
  $$ update public.competitive_signals set statement = 'Denied update' $$,
  '%permission denied%',
  'authenticated users cannot update competitive signals'
);
select throws_like(
  $$ delete from public.competitive_signals $$,
  '%permission denied%',
  'authenticated users cannot delete competitive signals'
);
select throws_like(
  $$ select public.persist_competitive_signals('[]'::jsonb) $$,
  '%permission denied%',
  'authenticated users cannot call the competitive signal persistence RPC'
);

set local role postgres;
select throws_like(
  $$ update public.competitive_signals set statement = 'Changed' where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333' $$,
  '%competitive_signals are append-only%',
  'competitive signal updates are rejected for postgres'
);
select throws_like(
  $$ delete from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333' $$,
  '%competitive_signals are append-only%',
  'competitive signal deletes are rejected for postgres'
);
select throws_like(
  $$ update public.competitive_signal_evidence set confidence = 0.50 $$,
  '%competitive_signal_evidence are append-only%',
  'competitive signal evidence updates are rejected for postgres'
);
select throws_like(
  $$ delete from public.competitive_signal_evidence $$,
  '%competitive_signal_evidence are append-only%',
  'competitive signal evidence deletes are rejected for postgres'
);
select throws_like(
  $$ insert into public.competitive_signals (
       owned_brand_id, competitor_id, signal_type, comparison_key, statement,
       supporting_values, confidence, generated_at, rule_version, signal_hash
     ) values (
       current_setting('test.brand_one_id')::uuid, current_setting('test.competitor_two_id')::uuid,
       'positioning_differs', 'positioning.homepage', 'Wrong tenant competitor', '{"owned":"A","competitor":"B"}',
       'medium', now(), 'competitive-signals-v1',
       'sha256:5555555555555555555555555555555555555555555555555555555555555555'
     ) $$,
  '%competitive_signals_competitor_matches_brand_fk%',
  'competitive signal competitors must belong to the owned brand'
);
select throws_like(
  $$ select public.persist_competitive_signals(
       jsonb_build_array(
         jsonb_set(
           jsonb_set(
             jsonb_set(current_setting('test.signal_payload')::jsonb -> 0, '{competitorId}', 'null'::jsonb),
             '{signalHash}',
             '"sha256:8989898989898989898989898989898989898989898989898989898989898989"'
           ),
           '{evidence}',
           jsonb_build_array(current_setting('test.signal_payload')::jsonb #> '{0,evidence,0}')
         )
       )
     ) $$,
  '%null value in column "competitor_id"%',
  'the persistence RPC rejects a competitive signal without a competitor'
);
select throws_like(
  $$ insert into public.competitive_signal_evidence (
       signal_id, position, role, source_id, snapshot_id, observation_id, confidence
     ) values (
       (select id from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333'),
       2, 'competitor', current_setting('test.brand_source_id')::uuid,
       current_setting('test.brand_snapshot_id')::uuid, current_setting('test.brand_observation_id')::uuid, 0.80
     ) $$,
  '%competitor evidence source must belong to the signal competitor%',
  'competitive signal evidence rejects invalid lineage'
);
select throws_like(
  $$ insert into public.competitive_signal_evidence (
       signal_id, position, role, source_id, snapshot_id, observation_id, confidence
     ) values (
       (select id from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333'),
       2, 'current', current_setting('test.competitor_source_id')::uuid,
       current_setting('test.competitor_snapshot_id')::uuid,
       current_setting('test.competitor_observation_id')::uuid, 0.90
     ) $$,
  '%temporal evidence requires an observed change%',
  'temporal competitive signal evidence requires an observed change'
);
insert into public.competitive_signals (
  owned_brand_id, competitor_id, signal_type, comparison_key, statement,
  supporting_values, confidence, direction, generated_at, rule_version, signal_hash
) values (
  current_setting('test.brand_one_id')::uuid,
  current_setting('test.competitor_one_id')::uuid,
  'competitor_added_subscription',
  'subscription.available',
  'Rival one added a subscription.',
  '{"previous":false,"current":true}',
  'medium',
  'added',
  now(),
  'competitive-signals-v1',
  'sha256:8888888888888888888888888888888888888888888888888888888888888888'
);
insert into public.competitive_signal_evidence (
  signal_id, position, role, source_id, snapshot_id, observation_id, observed_change_id, confidence
) values (
  (select id from public.competitive_signals where signal_hash = 'sha256:8888888888888888888888888888888888888888888888888888888888888888'),
  0,
  'current',
  current_setting('test.competitor_source_id')::uuid,
  current_setting('test.competitor_snapshot_id')::uuid,
  current_setting('test.competitor_subscription_observation_id')::uuid,
  current_setting('test.competitor_addition_change_id')::uuid,
  0.90
);
select lives_ok(
  $$ insert into public.competitive_signal_evidence (
       signal_id, position, role, source_id, snapshot_id, observation_id, observed_change_id, confidence
     ) values (
       (select id from public.competitive_signals where signal_hash = 'sha256:8888888888888888888888888888888888888888888888888888888888888888'),
       1, 'previous_evaluation', current_setting('test.competitor_source_id')::uuid,
       current_setting('test.competitor_previous_snapshot_id')::uuid,
       current_setting('test.competitor_previous_observation_id')::uuid,
       current_setting('test.competitor_addition_change_id')::uuid, 0.90
     ) $$,
  'previous evaluation evidence can anchor an addition to its prior snapshot'
);
select throws_like(
  $$ insert into public.competitive_signal_evidence (
       signal_id, position, role, source_id, snapshot_id, observation_id, observed_change_id, confidence
     ) values (
       (select id from public.competitive_signals where signal_hash = 'sha256:8888888888888888888888888888888888888888888888888888888888888888'),
       2, 'previous_evaluation', current_setting('test.competitor_source_id')::uuid,
       current_setting('test.competitor_snapshot_id')::uuid,
       current_setting('test.competitor_subscription_observation_id')::uuid,
       current_setting('test.competitor_addition_change_id')::uuid, 0.90
     ) $$,
  '%previous_evaluation evidence must match the observed change previous snapshot%',
  'previous evaluation evidence rejects the observed change current snapshot'
);
select throws_like(
  $$ insert into public.competitive_signal_evidence (
       signal_id, position, role, source_id, snapshot_id, observation_id, observed_change_id, confidence
     ) values (
       (select id from public.competitive_signals where signal_hash = 'sha256:8888888888888888888888888888888888888888888888888888888888888888'),
       2, 'previous_evaluation', current_setting('test.competitor_source_id')::uuid,
       current_setting('test.competitor_previous_snapshot_id')::uuid,
       current_setting('test.competitor_previous_observation_id')::uuid,
       current_setting('test.competitor_change_with_previous_observation_id')::uuid, 0.90
     ) $$,
  '%previous_evaluation evidence requires an observed change without a previous fact observation%',
  'previous evaluation evidence rejects changes with a previous fact observation'
);

set local role service_role;
select throws_like(
  $$ select public.persist_competitive_signals(
       jsonb_build_array(
         jsonb_set(current_setting('test.signal_payload')::jsonb -> 0, '{signalHash}', '"sha256:6666666666666666666666666666666666666666666666666666666666666666"'),
         jsonb_set(
           jsonb_set(current_setting('test.signal_payload')::jsonb -> 0, '{signalHash}', '"sha256:7777777777777777777777777777777777777777777777777777777777777777"'),
           '{evidence,1,sourceId}',
           to_jsonb(current_setting('test.brand_source_id'))
         )
       )
     ) $$,
  '%competitor evidence source must belong to the signal competitor%',
  'an invalid signal batch fails atomically'
);

set local role postgres;
select is(
  (select count(*) from public.competitive_signals where signal_hash in (
    'sha256:6666666666666666666666666666666666666666666666666666666666666666',
    'sha256:7777777777777777777777777777777777777777777777777777777777777777'
  )),
  0::bigint,
  'an invalid batch rolls back signals inserted earlier in the RPC call'
);

insert into public.competitors (brand_id, name, domain)
values (current_setting('test.brand_one_id')::uuid, 'Rival one sibling', 'rival-one-sibling.test')
returning id::text as sibling_competitor_id \gset
select set_config('test.sibling_competitor_id', :'sibling_competitor_id', true);

insert into public.competitive_signals (
  owned_brand_id, competitor_id, signal_type, comparison_key, statement,
  supporting_values, confidence, generated_at, rule_version, signal_hash
) values
  (
    current_setting('test.brand_two_id')::uuid,
    current_setting('test.competitor_two_id')::uuid,
    'competitor_offers_subscription_owned_does_not',
    'subscription.available',
    'Rival two offers a subscription while its owned brand does not.',
    '{"owned":false,"competitor":true}',
    'medium',
    now(),
    'competitive-signals-v1',
    'sha256:1212121212121212121212121212121212121212121212121212121212121212'
  ),
  (
    current_setting('test.brand_one_id')::uuid,
    current_setting('test.sibling_competitor_id')::uuid,
    'competitor_offers_subscription_owned_does_not',
    'subscription.available',
    'Rival one sibling offers a subscription while its owned brand does not.',
    '{"owned":false,"competitor":true}',
    'medium',
    now(),
    'competitive-signals-v1',
    'sha256:1313131313131313131313131313131313131313131313131313131313131313'
  );

select set_config(
  'test.hypothesis_payload',
  jsonb_build_array(
    jsonb_build_object(
      'hypothesisType', 'competitor_may_emphasize_repeat_purchase_mechanics',
      'ownedBrandId', current_setting('test.brand_one_id'),
      'competitorId', current_setting('test.competitor_one_id'),
      'statement', 'Rival one may be emphasizing repeat-purchase mechanics.',
      'rationale', 'Rival one offers a subscription that the owned brand does not.',
      'supportingSignalIds', jsonb_build_array(
        (select id from public.competitive_signals where signal_hash = 'sha256:8888888888888888888888888888888888888888888888888888888888888888')
      ),
      'confidence', 'low',
      'uncertainty', jsonb_build_object(
        'category', 'retention_effect_not_established',
        'statement', 'Public evidence does not establish whether this improves retention.'
      ),
      'generatedAt', '2026-09-04T12:00:00.000Z',
      'hypothesisEngineVersion', 'strategic-hypotheses-v1',
      'generationProvenance', jsonb_build_object(
        'method', 'deterministic_template',
        'templateId', 'competitor_may_emphasize_repeat_purchase_mechanics',
        'sourceSignalRuleVersion', 'competitive-signals-v1'
      ),
      'hypothesisHash', 'sha256:9999999999999999999999999999999999999999999999999999999999999999'
    )
  )::text,
  true
);

set local role service_role;
select is(
  (select inserted from public.persist_strategic_hypotheses(current_setting('test.hypothesis_payload')::jsonb)),
  true,
  'service role can persist a strategic hypothesis'
);
select is(
  (
    select inserted
    from public.persist_strategic_hypotheses(
      jsonb_set(
        current_setting('test.hypothesis_payload')::jsonb,
        '{0,generatedAt}',
        '"2026-09-05T12:00:00.000Z"'
      )
    )
  ),
  false,
  'replaying a hypothesis identity ignores its generated timestamp'
);

set local role postgres;
select is(
  (select count(*) from public.strategic_hypotheses where hypothesis_hash = 'sha256:9999999999999999999999999999999999999999999999999999999999999999'),
  1::bigint,
  'idempotent hypothesis replay stores exactly one hypothesis row'
);
select is(
  (
    select count(*)
    from public.strategic_hypothesis_signals
    where hypothesis_id = (
      select id from public.strategic_hypotheses
      where hypothesis_hash = 'sha256:9999999999999999999999999999999999999999999999999999999999999999'
    )
  ),
  1::bigint,
  'idempotent hypothesis replay stores exactly one ordered signal set'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*) from public.strategic_hypotheses), 1::bigint, 'member can select same-organization strategic hypotheses');
select is((select count(*) from public.strategic_hypothesis_signals), 1::bigint, 'member can select same-organization strategic hypothesis signals');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.strategic_hypotheses), 0::bigint, 'cross-organization strategic hypotheses are invisible');
select is((select count(*) from public.strategic_hypothesis_signals), 0::bigint, 'cross-organization strategic hypothesis signals are invisible');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_like(
  $$ insert into public.strategic_hypotheses (
       owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence,
       uncertainty_category, uncertainty_statement, generated_at,
       hypothesis_engine_version, generation_provenance, hypothesis_hash
     ) values (
       current_setting('test.brand_one_id')::uuid, current_setting('test.competitor_one_id')::uuid,
       'competitor_may_emphasize_repeat_purchase_mechanics', 'Denied hypothesis', 'Denied rationale', 'low',
       'retention_effect_not_established', 'Impact is not established.', now(),
       'strategic-hypotheses-v1',
       '{"method":"deterministic_template","templateId":"repeat","sourceSignalRuleVersion":"competitive-signals-v1"}',
       'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     ) $$,
  '%permission denied%',
  'authenticated users cannot insert strategic hypotheses'
);
select throws_like(
  $$ update public.strategic_hypotheses set statement = 'Denied update' $$,
  '%permission denied%',
  'authenticated users cannot update strategic hypotheses'
);
select throws_like(
  $$ delete from public.strategic_hypotheses $$,
  '%permission denied%',
  'authenticated users cannot delete strategic hypotheses'
);
select throws_like(
  $$ insert into public.strategic_hypothesis_signals (hypothesis_id, position, signal_id)
     values (
       (select id from public.strategic_hypotheses limit 1),
       1,
       (select id from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333')
     ) $$,
  '%permission denied%',
  'authenticated users cannot insert strategic hypothesis signals'
);
select throws_like(
  $$ update public.strategic_hypothesis_signals set position = 1 $$,
  '%permission denied%',
  'authenticated users cannot update strategic hypothesis signals'
);
select throws_like(
  $$ delete from public.strategic_hypothesis_signals $$,
  '%permission denied%',
  'authenticated users cannot delete strategic hypothesis signals'
);
select throws_like(
  $$ select public.persist_strategic_hypotheses('[]'::jsonb) $$,
  '%permission denied%',
  'authenticated users cannot call the strategic hypothesis persistence RPC'
);

set local role postgres;
select throws_like(
  $$ update public.strategic_hypotheses set statement = 'Changed' where hypothesis_hash = 'sha256:9999999999999999999999999999999999999999999999999999999999999999' $$,
  '%strategic_hypotheses are append-only%',
  'strategic hypothesis updates are rejected for postgres'
);
select throws_like(
  $$ delete from public.strategic_hypotheses where hypothesis_hash = 'sha256:9999999999999999999999999999999999999999999999999999999999999999' $$,
  '%strategic_hypotheses are append-only%',
  'strategic hypothesis deletes are rejected for postgres'
);
select throws_like(
  $$ update public.strategic_hypothesis_signals set position = 1 $$,
  '%strategic_hypothesis_signals are append-only%',
  'strategic hypothesis signal updates are rejected for postgres'
);
select throws_like(
  $$ delete from public.strategic_hypothesis_signals $$,
  '%strategic_hypothesis_signals are append-only%',
  'strategic hypothesis signal deletes are rejected for postgres'
);
select throws_like(
  $$ insert into public.strategic_hypotheses (
       owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence,
       uncertainty_category, uncertainty_statement, generated_at,
       hypothesis_engine_version, generation_provenance, hypothesis_hash
     ) values (
       current_setting('test.brand_one_id')::uuid, current_setting('test.competitor_two_id')::uuid,
       'competitor_may_emphasize_repeat_purchase_mechanics', 'Wrong tenant competitor', 'Invalid tenant association', 'low',
       'retention_effect_not_established', 'Impact is not established.', now(),
       'strategic-hypotheses-v1',
       '{"method":"deterministic_template","templateId":"repeat","sourceSignalRuleVersion":"competitive-signals-v1"}',
       'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     ) $$,
  '%strategic_hypotheses_competitor_matches_brand_fk%',
  'strategic hypothesis competitors must belong to the owned brand'
);

set local role service_role;
select throws_like(
  $$ select public.persist_strategic_hypotheses(
       jsonb_build_array(jsonb_set(
         jsonb_set(
           current_setting('test.hypothesis_payload')::jsonb -> 0,
           '{hypothesisHash}',
           '"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"'
         ),
         '{supportingSignalIds}',
         jsonb_build_array(
           (select id from public.competitive_signals where signal_hash = 'sha256:1212121212121212121212121212121212121212121212121212121212121212')
         )
       ))
     ) $$,
  '%supporting signal must belong to the hypothesis brand%',
  'strategic hypotheses reject cross-tenant supporting signal injection'
);
select throws_like(
  $$ select public.persist_strategic_hypotheses(
       jsonb_build_array(jsonb_set(
         jsonb_set(
           current_setting('test.hypothesis_payload')::jsonb -> 0,
           '{hypothesisHash}',
           '"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
         ),
         '{supportingSignalIds}',
         jsonb_build_array(
           (select id from public.competitive_signals where signal_hash = 'sha256:1313131313131313131313131313131313131313131313131313131313131313')
         )
       ))
     ) $$,
  '%supporting signal must belong to the hypothesis competitor%',
  'strategic hypotheses reject cross-competitor supporting signal injection'
);
select throws_like(
  $$ select public.persist_strategic_hypotheses(
       jsonb_build_array(jsonb_set(
         jsonb_set(
           current_setting('test.hypothesis_payload')::jsonb -> 0,
           '{hypothesisHash}',
           '"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
         ),
         '{generationProvenance,unexpected}',
         'true'
       ))
     ) $$,
  '%strategic_hypotheses_generation_provenance_valid%',
  'strategic hypothesis persistence rejects non-strict generation provenance'
);
select throws_like(
  $$ select public.persist_strategic_hypotheses(
       jsonb_build_array(jsonb_set(
         jsonb_set(
           current_setting('test.hypothesis_payload')::jsonb -> 0,
           '{hypothesisHash}',
           '"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"'
         ),
         '{supportingSignalIds}',
         '[]'::jsonb
       ))
     ) $$,
  '%strategic hypothesis supporting signal IDs must be a non-empty JSON array%',
  'strategic hypothesis persistence rejects an empty supporting signal set'
);
select is(
  (
    select inserted
    from public.persist_strategic_hypotheses(
      jsonb_build_array(jsonb_set(
        jsonb_set(
          current_setting('test.hypothesis_payload')::jsonb -> 0,
          '{hypothesisHash}',
          '"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"'
        ),
        '{supportingSignalIds}',
        jsonb_build_array(
          (select id from public.competitive_signals where signal_hash = 'sha256:3333333333333333333333333333333333333333333333333333333333333333')
        )
      ))
    )
  ),
  true,
  'new supporting signal evidence can create a later immutable hypothesis'
);

set local role postgres;
select is(
  (select count(*) from public.strategic_hypotheses where hypothesis_engine_version = 'strategic-hypotheses-v1'),
  2::bigint,
  'new supporting evidence creates a distinct hypothesis under the same engine version'
);

set local role service_role;
select is(
  (
    select inserted
    from public.persist_strategic_hypotheses(
      jsonb_build_array(jsonb_set(
        jsonb_set(
          current_setting('test.hypothesis_payload')::jsonb -> 0,
          '{hypothesisHash}',
          '"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"'
        ),
        '{hypothesisEngineVersion}',
        '"strategic-hypotheses-v2"'
      ))
    )
  ),
  true,
  'a new hypothesis engine version can coexist with prior history'
);

set local role postgres;
select is(
  (
    select count(*)
    from public.strategic_hypotheses
    join public.strategic_hypothesis_signals
      on strategic_hypothesis_signals.hypothesis_id = strategic_hypotheses.id
    where strategic_hypotheses.hypothesis_type = 'competitor_may_emphasize_repeat_purchase_mechanics'
      and strategic_hypothesis_signals.signal_id = (
        select id from public.competitive_signals
        where signal_hash = 'sha256:8888888888888888888888888888888888888888888888888888888888888888'
      )
      and strategic_hypotheses.hypothesis_engine_version in ('strategic-hypotheses-v1', 'strategic-hypotheses-v2')
  ),
  2::bigint,
  'the same supporting signal set is retained across engine versions'
);

set local role service_role;
select throws_like(
  $$ select public.persist_strategic_hypotheses(
       jsonb_build_array(
         jsonb_set(
           current_setting('test.hypothesis_payload')::jsonb -> 0,
           '{hypothesisHash}',
           '"sha256:1111111111111111111111111111111111111111111111111111111111111111"'
         ),
         jsonb_set(
           jsonb_set(
             current_setting('test.hypothesis_payload')::jsonb -> 0,
             '{hypothesisHash}',
             '"sha256:2222222222222222222222222222222222222222222222222222222222222222"'
           ),
           '{supportingSignalIds}',
           jsonb_build_array(
             (select id from public.competitive_signals where signal_hash = 'sha256:1212121212121212121212121212121212121212121212121212121212121212')
           )
         )
       )
     ) $$,
  '%supporting signal must belong to the hypothesis brand%',
  'an invalid strategic hypothesis batch fails atomically'
);

set local role postgres;
select is(
  (select count(*) from public.strategic_hypotheses where hypothesis_hash in (
    'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    'sha256:2222222222222222222222222222222222222222222222222222222222222222'
  )),
  0::bigint,
  'an invalid batch rolls back strategic hypotheses inserted earlier in the RPC call'
);

set local role postgres;
insert into public.strategic_hypotheses (
  owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence,
  uncertainty_category, uncertainty_statement, generated_at,
  hypothesis_engine_version, generation_provenance, hypothesis_hash
) values (
  current_setting('test.brand_two_id')::uuid, current_setting('test.competitor_two_id')::uuid,
  'competitor_may_emphasize_repeat_purchase_mechanics', 'Brand two hypothesis', 'Test lineage', 'low',
  'retention_effect_not_established', 'Impact is not established.', now(),
  'strategic-hypotheses-v1',
  '{"method":"deterministic_template","templateId":"competitor_may_emphasize_repeat_purchase_mechanics","sourceSignalRuleVersion":"competitive-signals-v1"}',
  'sha256:1414141414141414141414141414141414141414141414141414141414141414'
) returning id::text as brand_two_hypothesis_id \gset
select set_config('test.brand_two_hypothesis_id', :'brand_two_hypothesis_id', true);

insert into public.strategic_hypotheses (
  owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence,
  uncertainty_category, uncertainty_statement, generated_at,
  hypothesis_engine_version, generation_provenance, hypothesis_hash
) values (
  current_setting('test.brand_one_id')::uuid, current_setting('test.sibling_competitor_id')::uuid,
  'competitor_may_emphasize_repeat_purchase_mechanics', 'Sibling hypothesis', 'Test lineage', 'low',
  'retention_effect_not_established', 'Impact is not established.', now(),
  'strategic-hypotheses-v1',
  '{"method":"deterministic_template","templateId":"competitor_may_emphasize_repeat_purchase_mechanics","sourceSignalRuleVersion":"competitive-signals-v1"}',
  'sha256:1515151515151515151515151515151515151515151515151515151515151515'
) returning id::text as sibling_hypothesis_id \gset
select set_config('test.sibling_hypothesis_id', :'sibling_hypothesis_id', true);

select set_config(
  'test.experiment_payload',
  jsonb_build_array(jsonb_build_object(
    'experimentType', 'subscription_availability',
    'ownedBrandId', current_setting('test.brand_one_id'),
    'competitorId', current_setting('test.competitor_one_id'),
    'sourceHypothesisIds', jsonb_build_array(
      (select id from public.strategic_hypotheses where hypothesis_hash = 'sha256:9999999999999999999999999999999999999999999999999999999999999999')
    ),
    'title', 'Test a visible subscribe-and-save option',
    'objective', 'Test a current hypothesis with one controlled variant.',
    'hypothesisUnderTest', 'Evaluate the controlled subscription option against the current experience.',
    'design', jsonb_build_object(
      'comparison', 'control_vs_treatment',
      'variablePolicy', 'single_variable',
      'heldConstant', 'all_non_target_experience_elements'
    ),
    'control', jsonb_build_object('kind', 'current_one_time_purchase_only'),
    'treatment', jsonb_build_object(
      'kind', 'visible_subscribe_and_save_option',
      'discountPercent', jsonb_build_object('status', 'requires_user_configuration'),
      'competitorReferenceAvailable', true
    ),
    'primaryMetric', jsonb_build_object('metric', 'subscription_take_rate', 'measurementReadiness', 'requires_first_party_data'),
    'guardrailMetrics', jsonb_build_array(
      jsonb_build_object('metric', 'conversion_rate', 'measurementReadiness', 'requires_first_party_data'),
      jsonb_build_object('metric', 'contribution_margin_per_order', 'measurementReadiness', 'requires_first_party_data')
    ),
    'durationPlanning', jsonb_build_object(
      'status', 'requires_first_party_data',
      'requiredInputs', jsonb_build_array('baseline_primary_metric', 'eligible_traffic', 'minimum_detectable_effect', 'significance_level', 'statistical_power')
    ),
    'implementationNotes', jsonb_build_array('Configure terms before launch.'),
    'confidence', jsonb_build_object('level', 'low', 'basis', 'support_for_testing_rationale'),
    'caveat', jsonb_build_object(
      'category', 'subscription_customer_fit_and_cancellation',
      'statement', 'Subscription mechanics should be evaluated for customer fit and cancellation behavior.'
    ),
    'generatedAt', '2026-09-04T12:00:00.000Z',
    'experimentEngineVersion', 'recommended-experiments-v1',
    'generationProvenance', jsonb_build_object(
      'method', 'deterministic_rule',
      'eligibilityRuleId', 'subscription-availability-v1',
      'templateId', 'subscription_availability',
      'sourceHypothesisEngineVersion', 'strategic-hypotheses-v1'
    ),
    'experimentHash', 'sha256:1616161616161616161616161616161616161616161616161616161616161616'
  ))::text,
  true
);

set local role service_role;
select is(
  (select inserted from public.persist_recommended_experiments(current_setting('test.experiment_payload')::jsonb)),
  true,
  'service role can persist a recommended experiment'
);
select is(
  (select inserted from public.persist_recommended_experiments(
    jsonb_set(current_setting('test.experiment_payload')::jsonb, '{0,generatedAt}', '"2026-09-05T12:00:00.000Z"')
  )),
  false,
  'replaying an experiment identity ignores its generated timestamp'
);

set local role postgres;
select is((select count(*) from public.recommended_experiments where experiment_hash = 'sha256:1616161616161616161616161616161616161616161616161616161616161616'), 1::bigint, 'idempotent replay stores one experiment row');
select is((select count(*) from public.recommended_experiment_hypotheses where experiment_id = (select id from public.recommended_experiments where experiment_hash = 'sha256:1616161616161616161616161616161616161616161616161616161616161616')), 1::bigint, 'idempotent replay stores one ordered hypothesis set');
select is((
  select count(*) from public.recommended_experiments re
  join public.recommended_experiment_hypotheses reh on reh.experiment_id = re.id
  join public.strategic_hypothesis_signals shs on shs.hypothesis_id = reh.hypothesis_id
  join public.competitive_signal_evidence cse on cse.signal_id = shs.signal_id
  join public.snapshots snapshots on snapshots.id = cse.snapshot_id
  left join public.observations observations on observations.id = cse.observation_id
  where re.experiment_hash = 'sha256:1616161616161616161616161616161616161616161616161616161616161616'
    and (cse.observation_id is null or observations.id is not null)
), 2::bigint, 'recommended experiment lineage traverses hypotheses, signals, and evidence');

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*) from public.recommended_experiments), 1::bigint, 'member can select same-organization recommended experiments');
select is((select count(*) from public.recommended_experiment_hypotheses), 1::bigint, 'member can select same-organization recommended experiment hypotheses');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.recommended_experiments), 0::bigint, 'cross-organization recommended experiments are invisible');
select is((select count(*) from public.recommended_experiment_hypotheses), 0::bigint, 'cross-organization recommended experiment hypotheses are invisible');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_like($$ insert into public.recommended_experiments (
  owned_brand_id, competitor_id, experiment_type, title, objective, hypothesis_under_test,
  design, control_configuration, treatment_configuration, primary_metric, guardrail_metrics,
  duration_planning, implementation_notes, confidence_level, confidence_basis, caveat_category,
  caveat_statement, generated_at, experiment_engine_version, generation_provenance, experiment_hash
) select owned_brand_id, competitor_id, experiment_type, title, objective, hypothesis_under_test,
  design, control_configuration, treatment_configuration, primary_metric, guardrail_metrics,
  duration_planning, implementation_notes, confidence_level, confidence_basis, caveat_category,
  caveat_statement, generated_at, experiment_engine_version, generation_provenance,
  'sha256:1717171717171717171717171717171717171717171717171717171717171717'
  from public.recommended_experiments limit 1 $$, '%permission denied%', 'authenticated users cannot insert recommended experiments');
select throws_like($$ update public.recommended_experiments set title = 'Denied' $$, '%permission denied%', 'authenticated users cannot update recommended experiments');
select throws_like($$ delete from public.recommended_experiments $$, '%permission denied%', 'authenticated users cannot delete recommended experiments');
select throws_like($$ insert into public.recommended_experiment_hypotheses (experiment_id, position, hypothesis_id)
  select id, 1, (select id from public.strategic_hypotheses limit 1) from public.recommended_experiments limit 1 $$, '%permission denied%', 'authenticated users cannot insert recommended experiment hypotheses');
select throws_like($$ select public.persist_recommended_experiments('[]'::jsonb) $$, '%permission denied%', 'authenticated users cannot call recommended experiment persistence RPC');

set local role postgres;
select throws_like($$ update public.recommended_experiments set title = 'Changed' $$, '%recommended_experiments are append-only%', 'recommended experiment updates are rejected for postgres');
select throws_like($$ delete from public.recommended_experiments $$, '%recommended_experiments are append-only%', 'recommended experiment deletes are rejected for postgres');
select throws_like($$ update public.recommended_experiment_hypotheses set position = 1 $$, '%recommended_experiment_hypotheses are append-only%', 'recommended experiment hypothesis updates are rejected for postgres');
select throws_like($$ delete from public.recommended_experiment_hypotheses $$, '%recommended_experiment_hypotheses are append-only%', 'recommended experiment hypothesis deletes are rejected for postgres');

set local role service_role;
select throws_like($$ select public.persist_recommended_experiments(jsonb_build_array(jsonb_set(
  jsonb_set(current_setting('test.experiment_payload')::jsonb -> 0, '{experimentHash}', '"sha256:1818181818181818181818181818181818181818181818181818181818181818"'),
  '{sourceHypothesisIds}', jsonb_build_array(current_setting('test.brand_two_hypothesis_id'))
))) $$, '%supporting hypothesis must belong to the experiment brand%', 'recommended experiments reject cross-tenant hypothesis injection');
select throws_like($$ select public.persist_recommended_experiments(jsonb_build_array(jsonb_set(
  jsonb_set(current_setting('test.experiment_payload')::jsonb -> 0, '{experimentHash}', '"sha256:1919191919191919191919191919191919191919191919191919191919191919"'),
  '{sourceHypothesisIds}', jsonb_build_array(current_setting('test.sibling_hypothesis_id'))
))) $$, '%supporting hypothesis must belong to the experiment competitor%', 'recommended experiments reject cross-competitor hypothesis injection');

select is((select inserted from public.persist_recommended_experiments(jsonb_build_array(jsonb_set(
  jsonb_set(current_setting('test.experiment_payload')::jsonb -> 0, '{experimentHash}', '"sha256:2020202020202020202020202020202020202020202020202020202020202020"'),
  '{sourceHypothesisIds}', jsonb_build_array((select id from public.strategic_hypotheses where hypothesis_hash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'))
)))), true, 'changed hypothesis lineage can create a later immutable experiment');
select is((select inserted from public.persist_recommended_experiments(jsonb_build_array(jsonb_set(
  jsonb_set(current_setting('test.experiment_payload')::jsonb -> 0, '{experimentHash}', '"sha256:2121212121212121212121212121212121212121212121212121212121212121"'),
  '{experimentEngineVersion}', '"recommended-experiments-v2"'
)))), true, 'a new experiment engine version can coexist with prior history');

select throws_like($$ select public.persist_recommended_experiments(jsonb_build_array(
  jsonb_set(current_setting('test.experiment_payload')::jsonb -> 0, '{experimentHash}', '"sha256:2222222222222222222222222222222222222222222222222222222222222222"'),
  jsonb_set(jsonb_set(current_setting('test.experiment_payload')::jsonb -> 0, '{experimentHash}', '"sha256:2323232323232323232323232323232323232323232323232323232323232323"'), '{sourceHypothesisIds}', jsonb_build_array(current_setting('test.brand_two_hypothesis_id')))
)) $$, '%supporting hypothesis must belong to the experiment brand%', 'an invalid recommended experiment batch fails atomically');

set local role postgres;
select is((select count(*) from public.recommended_experiments where experiment_hash in (
  'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  'sha256:2323232323232323232323232323232323232323232323232323232323232323'
)), 0::bigint, 'an invalid recommended experiment batch rolls back earlier inserts');

select * from finish();
rollback;
