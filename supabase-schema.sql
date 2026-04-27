-- Supabase schema for NYC Tailblazers client agent platform
-- Run in Supabase SQL editor: https://app.supabase.com

-- ─────────────────────────────────────────
-- client_configs  (feature flags per business)
-- ─────────────────────────────────────────
create table if not exists client_configs (
  business                text primary key check (business in ('hvac', 'coaching', 'salon')),
  feat_lead_capture       boolean not null default true,
  feat_booking_agent      boolean not null default true,
  feat_followup_agent     boolean not null default true,
  feat_chat_widget        boolean not null default true,
  feat_reputation_monitor boolean not null default false,
  feat_no_show_recovery   boolean not null default false,
  feat_review_generation  boolean not null default false,
  feat_social_auto_poster boolean not null default false,
  feat_lead_reactivation  boolean not null default false,
  feat_competitor_tracker boolean not null default false,
  feat_smart_slot_filler  boolean not null default false,
  updated_at              timestamptz not null default now()
);

-- seed default configs
insert into client_configs (business) values ('hvac'), ('coaching'), ('salon')
  on conflict (business) do nothing;

-- ─────────────────────────────────────────
-- leads  (contact form submissions)
-- ─────────────────────────────────────────
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  business    text not null check (business in ('hvac', 'coaching', 'salon')),
  name        text,
  phone       text,
  email       text,
  service     text,
  message     text,
  status      text not null default 'new'
              check (status in ('new', 'contacted', 'qualified', 'lost', 'converted')),
  ai_reply    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists leads_business_status on leads (business, status);
create index if not exists leads_created_at on leads (created_at desc);

-- ─────────────────────────────────────────
-- bookings  (appointment requests)
-- ─────────────────────────────────────────
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  business       text not null check (business in ('hvac', 'coaching', 'salon')),
  lead_id        uuid references leads (id) on delete set null,
  name           text,
  phone          text,
  email          text,
  service        text,
  preferred_date date,
  stylist_pref   text,
  notes          text,
  status         text not null default 'pending'
                 check (status in ('pending', 'confirmed', 'completed', 'no_show', 'cancelled')),
  reminder_sent  boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bookings_business_status on bookings (business, status);
create index if not exists bookings_preferred_date on bookings (preferred_date);

-- ─────────────────────────────────────────
-- follow_ups  (scheduled outreach log)
-- ─────────────────────────────────────────
create table if not exists follow_ups (
  id           uuid primary key default gen_random_uuid(),
  business     text not null check (business in ('hvac', 'coaching', 'salon')),
  lead_id      uuid references leads (id) on delete cascade,
  booking_id   uuid references bookings (id) on delete cascade,
  type         text not null
               check (type in ('sms', 'email', 'call_note', 'review_request', 'reactivation', 'no_show')),
  channel      text not null default 'email' check (channel in ('email', 'sms', 'internal')),
  body         text,
  sent_at      timestamptz,
  status       text not null default 'pending'
               check (status in ('pending', 'sent', 'failed', 'skipped')),
  created_at   timestamptz not null default now()
);

create index if not exists follow_ups_business_status on follow_ups (business, status);
create index if not exists follow_ups_lead_id on follow_ups (lead_id);

-- ─────────────────────────────────────────
-- auto-updated updated_at trigger
-- ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

create or replace trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

create or replace trigger client_configs_updated_at
  before update on client_configs
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────
-- Row Level Security (anon can insert leads/bookings; agents need service role key)
-- ─────────────────────────────────────────
alter table leads enable row level security;
alter table bookings enable row level security;
alter table follow_ups enable row level security;
alter table client_configs enable row level security;

-- allow anonymous inserts from website forms
create policy "anon insert leads" on leads for insert to anon with check (true);
create policy "anon insert bookings" on bookings for insert to anon with check (true);

-- agents use service role key (bypasses RLS) — no extra policy needed
