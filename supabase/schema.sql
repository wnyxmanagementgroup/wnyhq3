create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_users (
  username text primary key,
  login_name text,
  full_name text,
  position text,
  department text,
  role text,
  email text,
  special_position text,
  token text,
  legacy_password text,
  supabase_auth_user_id uuid unique references auth.users(id) on delete set null,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

create index if not exists idx_app_users_login_name on public.app_users(login_name);

create table if not exists public.draft_requests (
  draft_id text primary key,
  username text references public.app_users(username) on delete set null,
  doc_date date,
  requester_name text,
  requester_position text,
  location text,
  province text,
  purpose text,
  start_date date,
  end_date date,
  attendees jsonb not null default '[]'::jsonb,
  expense_option text,
  expense_items jsonb not null default '[]'::jsonb,
  total_expense numeric(14,2),
  vehicle_option text,
  license_plate text,
  department text,
  head_name text,
  status text,
  timestamp_source timestamptz,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_draft_requests_username on public.draft_requests(username);
create index if not exists idx_draft_requests_doc_date on public.draft_requests(doc_date);
create index if not exists idx_draft_requests_timestamp_source on public.draft_requests(timestamp_source desc);

create trigger set_draft_requests_updated_at
before update on public.draft_requests
for each row
execute function public.set_updated_at();

create table if not exists public.requests (
  request_id text primary key,
  created_by text references public.app_users(username) on delete set null,
  ref_number text,
  doc_date date,
  requester_name text,
  requester_position text,
  location text,
  purpose text,
  start_date date,
  end_date date,
  duration text,
  expense_option text,
  expense_items jsonb,
  total_expense numeric(14,2),
  vehicle_option text,
  license_plate text,
  department text,
  head_name text,
  pdf_url text,
  created_at_source timestamptz,
  status text,
  command_pdf_url text,
  command_status text,
  command_pdf_url_solo text,
  command_pdf_url_group_small text,
  command_pdf_url_group_large text,
  dispatch_book_pdf_url text,
  item_1 text,
  qty_1 numeric(12,2),
  item_2 text,
  qty_2 numeric(12,2),
  item_3 text,
  qty_3 numeric(12,2),
  item_4 text,
  qty_4 numeric(12,2),
  item_5 text,
  qty_5 numeric(12,2),
  item_6 text,
  qty_6 numeric(12,2),
  item_7 text,
  qty_7 numeric(12,2),
  command_doc_url_solo text,
  command_doc_url_group_large text,
  doc_url text,
  command_doc_url_group_small text,
  province text,
  stay_at text,
  dispatch_vehicle_type text,
  dispatch_vehicle_id text,
  completed_memo_url text,
  completed_command_url text,
  memo_status text,
  dispatch_book_url text,
  admin_memo_url text,
  doc_status text,
  was_rejected boolean,
  rejection_reason text,
  command_template_type text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_requests_created_by on public.requests(created_by);
create index if not exists idx_requests_status on public.requests(status);
create index if not exists idx_requests_doc_status on public.requests(doc_status);
create index if not exists idx_requests_doc_date on public.requests(doc_date);
create index if not exists idx_requests_start_date on public.requests(start_date);
create index if not exists idx_requests_created_at_source on public.requests(created_at_source desc);

create trigger set_requests_updated_at
before update on public.requests
for each row
execute function public.set_updated_at();

create table if not exists public.attendees (
  id bigserial primary key,
  request_id text not null references public.requests(request_id) on delete cascade,
  source_row_key text unique,
  full_name text not null,
  position text,
  source_date_text text,
  attended_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendees_request_id on public.attendees(request_id);

create trigger set_attendees_updated_at
before update on public.attendees
for each row
execute function public.set_updated_at();

create table if not exists public.memos (
  memo_id text primary key,
  submitted_by text references public.app_users(username) on delete set null,
  ref_number text references public.requests(request_id) on delete cascade,
  status text,
  created_at_source timestamptz,
  file_id text,
  file_url text,
  completed_memo_url text,
  completed_command_url text,
  dispatch_book_url text,
  admin_memo_url text,
  memo_pdf_url text,
  current_pdf_url text,
  dispatch_status text,
  completed_dispatch_book_url text,
  doc_status text,
  rejected_at timestamptz,
  finalized_at timestamptz,
  last_updated_source timestamptz,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_memos_ref_number on public.memos(ref_number);
create index if not exists idx_memos_status on public.memos(status);
create index if not exists idx_memos_created_at_source on public.memos(created_at_source desc);

create trigger set_memos_updated_at
before update on public.memos
for each row
execute function public.set_updated_at();

create table if not exists public.trash_requests (
  trash_id uuid primary key default gen_random_uuid(),
  source_row_key text unique,
  request_id text,
  created_by text,
  ref_number text,
  doc_date date,
  requester_name text,
  requester_position text,
  location text,
  purpose text,
  start_date date,
  end_date date,
  duration text,
  expense_option text,
  expense_items jsonb,
  total_expense numeric(14,2),
  vehicle_option text,
  license_plate text,
  department text,
  head_name text,
  pdf_url text,
  created_at_source timestamptz,
  status text,
  command_pdf_url text,
  command_status text,
  command_pdf_url_solo text,
  command_pdf_url_group_small text,
  command_pdf_url_group_large text,
  dispatch_book_pdf_url text,
  command_doc_url_solo text,
  command_doc_url_group_large text,
  doc_url text,
  command_doc_url_group_small text,
  province text,
  stay_at text,
  dispatch_vehicle_type text,
  dispatch_vehicle_id text,
  completed_memo_url text,
  completed_command_url text,
  deleted_at timestamptz,
  deleted_by text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trash_requests_request_id on public.trash_requests(request_id);
create index if not exists idx_trash_requests_deleted_at on public.trash_requests(deleted_at desc);

create trigger set_trash_requests_updated_at
before update on public.trash_requests
for each row
execute function public.set_updated_at();

create table if not exists public.request_counters (
  year_be integer primary key,
  current_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_links (
  token text primary key,
  request_id text references public.requests(request_id) on delete cascade,
  safe_id text,
  role text,
  used boolean not null default false,
  created_by text references public.app_users(username) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create index if not exists idx_approval_links_request_id on public.approval_links(request_id);
create index if not exists idx_approval_links_used on public.approval_links(used);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text references public.app_users(username) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_app_settings_updated_at
before update on public.app_settings
for each row
execute function public.set_updated_at();

create table if not exists public.system_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text references public.app_users(username) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_system_config_updated_at
before update on public.system_config
for each row
execute function public.set_updated_at();

create or replace function public.generate_request_id(p_doc_date date)
returns text
language plpgsql
security definer
as $$
declare
  v_year_be integer;
  v_next_count integer;
begin
  if p_doc_date is null then
    raise exception 'doc_date is required';
  end if;

  v_year_be := extract(year from p_doc_date)::integer + 543;

  insert into public.request_counters (year_be, current_count)
  values (v_year_be, 1)
  on conflict (year_be)
  do update
    set current_count = public.request_counters.current_count + 1,
        updated_at = now()
  returning current_count into v_next_count;

  return 'บค' || lpad(v_next_count::text, 3, '0') || '/' || v_year_be::text;
end;
$$;

comment on table public.app_users is 'Migrated from Users sheet. Keep GAS verifyCredentials during phase 1, then optionally attach auth.users later.';
comment on table public.requests is 'Primary workflow table replacing Firestore requests collection.';
comment on table public.memos is 'Primary memo table replacing Firestore memos collection and Memos sheet.';
comment on table public.app_settings is 'Replaces settings collection, including announcement.';
comment on table public.system_config is 'Replaces systemConfig collection such as workflowSettings and signerPositions.';
