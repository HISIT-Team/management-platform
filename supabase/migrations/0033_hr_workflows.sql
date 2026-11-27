-- Persisted HR workflows: histories are the source for offboarding lookup.
create table if not exists public.hr_onboardings (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 first_name text not null,last_name text not null,personal_email text not null,job_role text not null,start_date date not null,company text not null,location text not null,
 details jsonb not null default '{}'::jsonb,badge_photo_path text
);
create table if not exists public.hr_offboardings (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 onboarding_id uuid references public.hr_onboardings(id),first_name text not null,last_name text not null,email text not null,end_date date not null,company text not null,details jsonb not null default '{}'::jsonb
);
alter table public.hr_onboardings enable row level security; alter table public.hr_offboardings enable row level security;
drop policy if exists hr_onboardings_rw on public.hr_onboardings; create policy hr_onboardings_rw on public.hr_onboardings for all to authenticated using (public.has_permission('hr.onboarding') or public.has_permission('hr.registries')) with check (public.has_permission('hr.onboarding'));
drop policy if exists hr_offboardings_rw on public.hr_offboardings; create policy hr_offboardings_rw on public.hr_offboardings for all to authenticated using (public.has_permission('hr.offboarding') or public.has_permission('hr.registries')) with check (public.has_permission('hr.offboarding'));
insert into storage.buckets(id,name,public) values('hr-badges','hr-badges',false) on conflict do nothing;
create policy "hr badge uploads" on storage.objects for insert to authenticated with check(bucket_id='hr-badges' and public.has_permission('hr.onboarding'));
create policy "hr badge reads" on storage.objects for select to authenticated using(bucket_id='hr-badges' and (public.has_permission('hr.onboarding') or public.has_permission('hr.registries')));
