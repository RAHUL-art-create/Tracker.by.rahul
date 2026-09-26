-- ============================================================
-- Personal Tracker - Cloud Backup (Supabase) setup script
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> Run
--
-- SECURITY MODEL:
--   * Zero-signup app: every visitor gets an automatic, INVISIBLE
--     "anonymous" account (must be enabled in Dashboard -> Authentication
--     -> Sign In / Providers -> Anonymous sign-ins = ON).
--   * One row per data key, per anonymous user. Each visitor can ONLY
--     ever see and touch their own rows (Row Level Security below) -
--     nobody can read another visitor's tracker data.
--   * The public "anon" key used by the website can do NOTHING without
--     a session, and even then only to that visitor's own rows.
--   * The secret "service_role" key is never used by the website.
-- ============================================================

-- 1. Data table: every dataset (events, milkData, ...) is saved under
--    its own key, mirroring how the app saves locally.
create table if not exists public.app_data (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key     text not null,
  value   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 2. Row Level Security: the master lock. Without this, ANY visitor with
--    the anon key could read/write everything. Never disable it.
alter table public.app_data enable row level security;

-- 3. Policies: users can only select/insert/update/delete THEIR OWN rows.
drop policy if exists "own rows only - all" on public.app_data;
create policy "own rows only - all"
  on public.app_data
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Extra hardening: the anonymous role loses ALL rights on the table,
--    and authenticated users only get the 4 operations they need
--    (no TRUNCATE, no REFERENCES, etc.).
revoke all on public.app_data from anon, authenticated;
grant select, insert, update, delete on public.app_data to authenticated;

-- 5. Sensible guard rails: keys must be from the app's known list and
--    rows must have a sane size (protects the 500 MB free tier).
alter table public.app_data drop constraint if exists app_data_key_whitelist;
alter table public.app_data add constraint app_data_key_whitelist
  check (key in (
    'events', 'salaryData', 'milkData', 'milkQuantities', 'milkQuantities2',
    'milkBillType', 'userName', 'selectedCategories', 'quickAmounts', 'quickQuantities'
  ));

alter table public.app_data drop constraint if exists app_data_value_size_limit;
alter table public.app_data add constraint app_data_value_size_limit
  check (pg_column_size(value) < 1024 * 1024); -- max ~1 MB per key

-- ============================================================
-- OPTIONAL HOUSEKEEPING (run manually in SQL editor every few months)
-- Visitors who cleared their browser data leave orphaned anonymous
-- slots behind. This safely removes ones older than 90 days:
--
--   delete from public.app_data
--     where user_id in (select id from auth.users
--                        where is_anonymous = true
--                          and created_at < now() - interval '90 days');
--   delete from auth.users
--     where is_anonymous = true
--       and created_at < now() - interval '90 days';
-- ============================================================
