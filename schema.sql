-- Dyeing By Design — database schema for Neon
-- Run this once in the Neon console: open your project → SQL Editor →
-- paste this whole file → Run. Safe to run again later (uses IF NOT EXISTS).

-- Paid orders, written automatically by the Stripe webhook
create table if not exists orders (
  id                 serial primary key,
  stripe_session_id  text unique not null,
  email              text,
  name               text,
  amount_total       integer,          -- cents, includes shipping
  items              text,             -- e.g. "sumac|M|x2; maple|L|x1"
  shipping           jsonb,            -- shipping name + address from Stripe
  status             text not null default 'paid',   -- paid → made → shipped
  created_at         timestamptz not null default now()
);

-- Custom shirt requests from the /custom page
create table if not exists special_requests (
  id          serial primary key,
  name        text not null,
  email       text not null,
  size        text,
  idea        text not null,
  status      text not null default 'new',   -- new → quoted → accepted → done
  created_at  timestamptz not null default now()
);

-- Email list for limited drop announcements
create table if not exists drop_signups (
  id          serial primary key,
  email       text unique not null,
  created_at  timestamptz not null default now()
);
