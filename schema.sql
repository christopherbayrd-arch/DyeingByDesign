-- Dyeing By Design — database schema for Neon (v2)
-- Run this whole file in the Neon console: your project → SQL Editor →
-- paste everything → Run. Safe to run again any time (it only creates
-- what's missing and never wipes data).

-- ============ ORDERS (written automatically by the Stripe webhook) ============
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

-- ============ CUSTOM REQUESTS (from the /custom page) ============
create table if not exists special_requests (
  id          serial primary key,
  name        text not null,
  email       text not null,
  size        text,
  idea        text not null,
  status      text not null default 'new',   -- new → quoted → accepted → done
  created_at  timestamptz not null default now()
);

-- ============ DROP LIST (email signups) ============
create table if not exists drop_signups (
  id          serial primary key,
  email       text unique not null,
  created_at  timestamptz not null default now()
);

-- ============ PRODUCTS (managed from /admin/products) ============
-- track_stock = false  →  "always available" (made to order)
-- track_stock = true   →  stock holds per-size counts, e.g. {"S":2,"M":0,"L":5}
--                         checkout blocks anything beyond the count, and paid
--                         orders subtract automatically.
create table if not exists products (
  id           serial primary key,
  slug         text unique not null,
  name         text not null,
  species      text not null default '',
  blurb        text not null default '',
  story        text not null default '',
  image        text not null default '',   -- big photo on the design page
  card         text not null default '',   -- square photo in grids
  price_cents  integer not null default 3999,
  sizes        jsonb not null default '["S","M","L","XL","2XL"]',
  track_stock  boolean not null default false,
  stock        jsonb not null default '{}',
  active       boolean not null default true,
  sample_photo boolean not null default false,
  badge        text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Seed the four launch designs (skipped automatically if they already exist)
insert into products (slug, name, species, blurb, story, image, card, price_cents, sample_photo, badge, sort) values
(
  'sumac', 'Sumac', 'Staghorn sumac · Rhus typhina',
  'Feathered fronds, deep amber burn. The original.',
  'The one that started it all. Staghorn sumac grows wild along every back road in Maine, and its feathered fronds leave the cleanest shadow we print. We lay fronds across the chest and shoulders, mist the bleach by hand, and let the fabric turn that deep amber gold before the leaf ever moves.',
  '/images/sumac-shirt.jpg', '/images/design-sumac.jpg', 3999, false, 'The original', 1
),
(
  'maple', 'Maple', 'Sugar maple · Acer saccharum',
  'Leaves scattered like they just fell there. Deep gold burn.',
  'Maple leaves laid out across the whole shirt, front and back, the way they land on the ground in October. We pick them the day they drop, while they still lie flat and full, then spray until the cotton burns to gold and the leaves keep their dark. Every shirt catches the spray differently, so no two ever land the same.',
  '/images/maple-shirt.jpg', '/images/design-maple.jpg', 3999, false, null, 2
),
(
  'oak', 'Oak', 'Northern red oak · Quercus rubra',
  'Broad lobes, real presence. The sturdy one.',
  'Oak leaves hold their shape under the spray better than anything else we work with. The result is a heavy, grounded silhouette that wears in like a favorite flannel.',
  '/images/design-oak.jpg', '/images/design-oak.jpg', 3999, true, null, 3
),
(
  'fern', 'Fern', 'Ostrich fern · Matteuccia struthiopteris',
  'Lacy, layered, almost too fine to believe it''s bleach.',
  'The same fern Mainers hunt for fiddleheads in May. Its fronds leave a shadow so detailed people assume it''s screen printed. It isn''t. It''s a leaf, a steady hand, and one pass of spray.',
  '/images/design-fern.jpg', '/images/design-fern.jpg', 3999, true, null, 4
)
on conflict (slug) do nothing;

-- Refresh the maple design if this database was seeded before the real
-- maple shirt was photographed (harmless to run when it's already current,
-- and it leaves any edits you made in /admin/products alone apart from
-- the photo + sample flag).
update products
set image = '/images/maple-shirt.jpg',
    sample_photo = false
where slug = 'maple' and image = '/images/design-maple.jpg';

-- ============ DROP ANNOUNCEMENTS ============
-- Every subscriber gets a private unsubscribe token, and unsubscribes are
-- honored forever (the row stays so nobody gets re-added by accident).
alter table drop_signups add column if not exists unsub_token uuid not null default gen_random_uuid();
alter table drop_signups add column if not exists unsubscribed boolean not null default false;
alter table drop_signups add column if not exists unsubscribed_at timestamptz;

-- A log of what you've sent, so you can see the history in /admin/drop
create table if not exists drop_sends (
  id          serial primary key,
  subject     text not null,
  headline    text not null default '',
  sent        integer not null default 0,
  failed      integer not null default 0,
  created_at  timestamptz not null default now()
);
