-- NUMU OS · seed data for local development and tests.
-- Fictional people and clients only. Never put real client data here.
--
-- Logging in locally: invite one of the team emails below from Supabase Studio
-- (Authentication > Users > Invite) and open the link from the local inbox
-- (Mailpit). The login is linked to the team member by email automatically.
--
-- Deliverables for the current month are made by the real generator, then
-- moved along so the board looks like a month in progress.

-- ---------------------------------------------------------------------------
-- Team
-- ---------------------------------------------------------------------------
insert into public.team_members (id, full_name, email, job_title, access_level, employment, weekly_capacity_points) values
  ('10000000-0000-4000-8000-000000000001', 'Farouk',       'farouk@example.com', 'Partner',                 'partner',      'full_time', 10),
  ('10000000-0000-4000-8000-000000000002', 'Ali',          'ali@example.com',    'Partner',                 'partner',      'full_time',  5),
  ('10000000-0000-4000-8000-000000000003', 'Noor Haddad',  'noor@example.com',   'Account lead',            'account_lead', 'full_time', 15),
  ('10000000-0000-4000-8000-000000000004', 'Yousef Karim', 'yousef@example.com', 'Videographer',            'creator',      'full_time', 20),
  ('10000000-0000-4000-8000-000000000005', 'Mariam Saleh', 'mariam@example.com', 'Video editor',            'creator',      'full_time', 20),
  ('10000000-0000-4000-8000-000000000006', 'Hamad Rashid', 'hamad@example.com',  'Designer',                'creator',      'part_time', 10),
  ('10000000-0000-4000-8000-000000000007', 'Lina Aziz',    'lina@example.com',   'Motion designer',         'creator',      'freelance',  8);

-- ---------------------------------------------------------------------------
-- Clients and contacts
-- ---------------------------------------------------------------------------
insert into public.clients (id, name_en, name_ar, industry, account_lead_id, brand_kit_url, drive_folder_url) values
  ('20000000-0000-4000-8000-000000000001', 'Dune Coffee Roasters', 'محمصة الكثبان للقهوة',     'Food and beverage',
   '10000000-0000-4000-8000-000000000003', 'https://drive.google.com/drive/folders/example-dune-brand', 'https://drive.google.com/drive/folders/example-dune'),
  ('20000000-0000-4000-8000-000000000002', 'Marina Dental Clinic', 'عيادة مارينا لطب الأسنان', 'Healthcare',
   '10000000-0000-4000-8000-000000000003', null, 'https://drive.google.com/drive/folders/example-marina'),
  ('20000000-0000-4000-8000-000000000003', 'Falcon Motors',        'فالكون موتورز',             'Automotive',
   '10000000-0000-4000-8000-000000000001', 'https://drive.google.com/drive/folders/example-falcon-brand', 'https://drive.google.com/drive/folders/example-falcon');

insert into public.contacts (client_id, full_name, job_title, phone, email, is_approver, preferred_language) values
  ('20000000-0000-4000-8000-000000000001', 'Sara Al-Mansoori', 'Marketing manager', '+97455500001', 'sara@dune.example',   true,  'en'),
  ('20000000-0000-4000-8000-000000000001', 'Omar Fakhro',      'Owner',             '+97455500002', 'omar@dune.example',   false, 'ar'),
  ('20000000-0000-4000-8000-000000000002', 'Dr. Hessa Nasser', 'Clinic director',   '+97455500003', 'hessa@marina.example', true, 'ar'),
  ('20000000-0000-4000-8000-000000000003', 'Khalid Jaber',     'Head of marketing', '+97455500004', 'khalid@falcon.example', true, 'en');

-- ---------------------------------------------------------------------------
-- Retainers and monthly scope (fees in fils: QAR x 100)
-- ---------------------------------------------------------------------------
insert into public.retainers (id, client_id, status, start_date, monthly_fee_minor, currency) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'active', '2026-06-01', 1800000, 'QAR'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'active', '2026-09-01', 1500000, 'QAR'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'active', '2026-03-01', 3200000, 'QAR');

insert into public.scope_lines (retainer_id, deliverable_type, quantity_per_month, platform, default_owner_id) values
  -- Dune Coffee: 6 Reels, 8 statics, 4 story sets
  ('30000000-0000-4000-8000-000000000001', 'reel',        6, 'instagram', '10000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000001', 'static_post', 8, 'instagram', '10000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000001', 'story_set',   4, 'instagram', '10000000-0000-4000-8000-000000000006'),
  -- Marina Dental: 4 Reels, 6 carousels, 1 shoot day
  ('30000000-0000-4000-8000-000000000002', 'reel',        4, 'instagram', '10000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000002', 'carousel',    6, 'instagram', '10000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000002', 'shoot_day',   1, null,        '10000000-0000-4000-8000-000000000004'),
  -- Falcon Motors: 8 IG Reels, 4 TikToks, 2 ad sets, 1 long video
  ('30000000-0000-4000-8000-000000000003', 'reel',        8, 'instagram', '10000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000003', 'reel',        4, 'tiktok',    '10000000-0000-4000-8000-000000000007'),
  ('30000000-0000-4000-8000-000000000003', 'ad_set',      2, 'instagram', '10000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000003', 'long_video',  1, 'youtube',   '10000000-0000-4000-8000-000000000004');

-- ---------------------------------------------------------------------------
-- A one-off project (dates relative to today so the seed always looks current)
-- ---------------------------------------------------------------------------
insert into public.projects (id, client_id, name_en, name_ar, status, fixed_fee_minor, start_date, deadline) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
   'National Day campaign', 'حملة اليوم الوطني', 'active', 3000000,
   private.qatar_today() - 10, private.qatar_today() + 25);

insert into public.deliverables (project_id, deliverable_type, title, platform, owner_id, due_date) values
  ('40000000-0000-4000-8000-000000000001', 'influencer_post', 'Influencer post 1/2 · Instagram', 'instagram', '10000000-0000-4000-8000-000000000003', private.qatar_today() + 12),
  ('40000000-0000-4000-8000-000000000001', 'influencer_post', 'Influencer post 2/2 · TikTok',    'tiktok',    '10000000-0000-4000-8000-000000000003', private.qatar_today() + 14),
  ('40000000-0000-4000-8000-000000000001', 'long_video',      'Campaign film · YouTube',         'youtube',   '10000000-0000-4000-8000-000000000004', private.qatar_today() + 20),
  ('40000000-0000-4000-8000-000000000001', 'reel',            'Teaser reel · Instagram',         'instagram', '10000000-0000-4000-8000-000000000005', private.qatar_today() + 8);

-- ---------------------------------------------------------------------------
-- This month's and next month's deliverables, made by the generator (on the
-- 25th the scheduled job creates next month, so after that both exist).
-- ---------------------------------------------------------------------------
select public.generate_month_deliverables(date_trunc('month', private.qatar_today()::timestamp)::date);
select public.generate_month_deliverables(date_trunc('month', (private.qatar_today() + interval '1 month')::timestamp)::date);

-- Move them along so the board looks like a month in progress: past work is
-- live, this week's is in production or review, later work is planned.
update public.deliverables d
   set post_date = case when d.due_date < private.qatar_today() + 7 then d.due_date + 2 end
 where d.retainer_id is not null;

update public.deliverables d
   set status = case
         when d.post_date < private.qatar_today() then
           case when d.seq % 7 = 0 then 'scheduled' else 'posted' end -- the odd one is late
         when d.due_date < private.qatar_today() then
           (array['approved', 'scheduled'])[1 + d.seq % 2]
         when d.due_date < private.qatar_today() + 3 then
           (array['editing', 'internal_review', 'client_review'])[1 + d.seq % 3]
         when d.due_date < private.qatar_today() + 7 then
           (array['scripting', 'shooting', 'editing'])[1 + d.seq % 3]
         else 'planned'
       end::public.deliverable_status
 where d.retainer_id is not null;

update public.deliverables
   set post_url = 'https://www.instagram.com/p/example-' || left(id::text, 8)
 where status = 'posted';

-- One Reel that has bounced back from the client twice (shows the revisions flag).
do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.deliverables
  where client_id = '20000000-0000-4000-8000-000000000001' and deliverable_type = 'reel'
  order by abs(due_date - private.qatar_today()), id
  limit 1;

  update public.deliverables set status = 'client_review' where id = v_id;
  update public.deliverables set status = 'editing'       where id = v_id;
  update public.deliverables set status = 'client_review' where id = v_id;
  update public.deliverables set status = 'editing'       where id = v_id;
end;
$$;

-- One carousel that has been waiting on the client for three days (48h flag).
do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.deliverables
  where client_id = '20000000-0000-4000-8000-000000000002' and deliverable_type = 'carousel'
  order by abs(due_date - private.qatar_today()), id
  limit 1;

  update public.deliverables set status = 'client_review' where id = v_id;
  -- Pretend it was created a week ago and sent to the client three days ago.
  update public.status_events
     set changed_at = case when to_status = 'client_review' then now() - interval '3 days'
                           else now() - interval '7 days' end
   where deliverable_id = v_id;
end;
$$;

-- A couple of comments
insert into public.comments (deliverable_id, author_team_member_id, body)
select d.id, '10000000-0000-4000-8000-000000000003', 'Client wants the logo bigger in the first 2 seconds.'
from public.deliverables d
where d.revision_count >= 2
limit 1;

insert into public.comments (deliverable_id, author_team_member_id, body)
select d.id, '10000000-0000-4000-8000-000000000005', 'First cut uploaded to Drive, music still temporary.'
from public.deliverables d
where d.status = 'internal_review'
order by d.due_date
limit 1;
