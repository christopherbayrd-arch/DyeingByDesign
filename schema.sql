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
  items              text,             -- e.g. "sumac|M|black|x2; fern|L|daisy|x1"
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
-- track_stock = true   →  stock holds per color+size counts keyed "color-key:SIZE",
--                         e.g. {"cherry-red:M":2,"sky-blue:L":5}  (colors live in lib/products.ts)
--                         checkout blocks anything beyond the count, and paid
--                         orders subtract automatically.
create table if not exists products (
  id           serial primary key,
  slug         text unique not null,
  name         text not null,
  species      text not null default '',
  line         text not null default 'botanical',  -- 'botanical' (real leaves) or 'stencil' (graphic & stencil)
  blurb        text not null default '',
  story        text not null default '',
  image        text not null default '',   -- big photo on the design page
  card         text not null default '',   -- square photo in grids
  price_cents  integer not null default 4500,
  sizes        jsonb not null default '["S","M","L","XL","2XL"]',
  track_stock  boolean not null default false,
  stock        jsonb not null default '{}',
  active       boolean not null default true,
  sample_photo boolean not null default false,
  badge        text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Seed the launch designs (skipped automatically if they already exist)
insert into products (slug, name, species, blurb, story, image, card, price_cents, sample_photo, badge, sort) values
(
  'sumac', 'Sumac', 'Staghorn sumac · Rhus typhina',
  'Feathered fronds, deep burn. The original.',
  'The one that started it all. Staghorn sumac grows wild along every back road in Maine, and its feathered fronds leave the cleanest shadow we print. We lay fronds across the chest and shoulders, mist the bleach by hand, and let the fabric burn to its lighter tone before the leaf ever moves.',
  '/images/sumac-shirt.jpg', '/images/design-sumac.jpg', 4500, false, 'The original', 1
),
(
  'cedar', 'Cedar', 'Northern white cedar · Thuja occidentalis',
  'Fanned sprays that branch like frost. The North Woods one.',
  'Northern white cedar grows thick along Maine''s lake shores and swamp edges. Its flat, fanned sprays lie tight to the cotton, so every branch and tiny scale comes through. We scatter sprigs across the front and sleeves, mist the bleach by hand, and the shirt keeps its color everywhere the cedar sat.',
  '/images/cedar-shirt.jpg', '/images/design-cedar.jpg', 4500, false, 'New', 3
),
(
  'fern', 'Fern', 'Ostrich fern · Matteuccia struthiopteris',
  'Lacy, layered, almost too fine to believe it''s bleach.',
  'The same fern Mainers hunt for fiddleheads in May. Its fronds leave a shadow so detailed people assume it''s screen printed. It isn''t. It''s a leaf, a steady hand, and one pass of spray.',
  '/images/design-fern.jpg', '/images/design-fern.jpg', 4500, false, null, 4
)
on conflict (slug) do nothing;

-- Housekeeping (safe to re-run): the fern photo is a real fern shirt now,
-- maple is retired, and oak is paused (cedar took its spot, Sept 2026).
-- Hiding them here keeps them out of the storefront even before they're
-- deleted from the admin.
update products set sample_photo = false where slug = 'fern';
update products set active = false where slug in ('maple', 'oak');

-- ============ DROP ANNOUNCEMENTS ============
-- Every subscriber gets a private unsubscribe token, and unsubscribes are
-- honored forever (the row stays so nobody gets re-added by accident).
-- v3: product lines (Botanical vs Graphic & Stencil) + custom request artwork
alter table products add column if not exists line text not null default 'botanical';
alter table special_requests add column if not exists kind text not null default 'leaves';   -- leaves | logo | graphic | other
alter table special_requests add column if not exists artwork_url text;
alter table special_requests add column if not exists color text;                             -- blank color key (lib/products.ts COLORS)                       -- uploaded logo/graphic (Vercel Blob)

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

-- ============ COGS (cost of goods) — one JSON document, edited in /admin/cogs ============
-- Holds blank tee costs per color+size, the materials list (bulk cost + how
-- many shirts a unit covers) and the product types built from them.
create table if not exists cogs (
  id          integer primary key default 1 check (id = 1),
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ============================================================
--  Sales history (v4). Every shirt sold gets its own row, with the
--  cost frozen at the moment it was paid for, so changing prices on
--  the COGS page later never rewrites old margins.
-- ============================================================
create table if not exists order_lines (
  id               serial primary key,
  order_id         integer not null references orders(id) on delete cascade,
  slug             text not null,
  name             text not null default '',
  size             text not null default '',
  color            text not null default '',
  qty              integer not null default 1,
  unit_price_cents integer not null default 0,  -- what the customer paid per shirt
  unit_cogs_cents  integer,                      -- cost per shirt when paid (null = not costed yet)
  cogs_breakdown   jsonb,                        -- blank + materials + whether it was estimated
  costed_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists order_lines_order_idx on order_lines(order_id);

-- Every saved version of the COGS sheet, so an old sale can be costed
-- with the prices that were true at the time.
create table if not exists cogs_versions (
  id          serial primary key,
  data        jsonb not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

alter table orders add column if not exists channel        text not null default 'site';  -- site | request | market | instagram | other
alter table orders add column if not exists shipping_cents integer;      -- what the customer paid for shipping
alter table orders add column if not exists fee_cents      integer;      -- card processing fee (Stripe)
alter table orders add column if not exists postage_cents  integer;      -- what you actually paid to ship it
alter table orders add column if not exists paid_at        timestamptz;
alter table orders add column if not exists sold_at        timestamptz;  -- date of sale for hand-entered sales
alter table orders add column if not exists note           text;

-- Fill in the new columns for orders that were already there (safe to re-run)
update orders set paid_at = created_at where paid_at is null and status <> 'requested';
update orders set channel = 'request' where channel = 'site' and stripe_session_id like 'email_%';

-- ============================================================
--  Shipping labels (v5). Bought through EasyPost from /admin; the
--  label, tracking number, and what the postage cost live on the order.
-- ============================================================
alter table orders add column if not exists shipment_id     text;   -- EasyPost shipment id
alter table orders add column if not exists tracking_number text;
alter table orders add column if not exists tracking_url    text;
alter table orders add column if not exists label_url       text;   -- PDF to print
alter table orders add column if not exists carrier         text;   -- USPS
alter table orders add column if not exists service         text;   -- GroundAdvantage, Priority…
alter table orders add column if not exists label_bought_at timestamptz;
alter table orders add column if not exists shipped_at      timestamptz;

-- ============================================================
--  Customer accounts (v5). Sign in with Google / Apple / Facebook or an
--  emailed link. These four tables are the shape Auth.js expects — keep
--  the quoted camelCase column names exactly as they are.
-- ============================================================
create table if not exists users (
  id              serial primary key,
  name            varchar(255),
  email           varchar(255),
  "emailVerified" timestamptz,
  image           text
);
create table if not exists accounts (
  id                  serial primary key,
  "userId"            integer not null,
  type                varchar(255) not null,
  provider            varchar(255) not null,
  "providerAccountId" varchar(255) not null,
  refresh_token       text,
  access_token        text,
  expires_at          bigint,
  id_token            text,
  scope               text,
  session_state       text,
  token_type          text
);
create table if not exists sessions (
  id             serial primary key,
  "userId"       integer not null,
  expires        timestamptz not null,
  "sessionToken" varchar(255) not null
);
create table if not exists verification_token (
  identifier text not null,
  expires    timestamptz not null,
  token      text not null,
  primary key (identifier, token)
);
create index if not exists accounts_user_idx on accounts("userId");
create index if not exists sessions_token_idx on sessions("sessionToken");
create index if not exists users_email_idx on users(email);

-- A signed-in customer's cart follows them between devices
create table if not exists carts (
  user_id     integer primary key,
  data        jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);

-- Which account (if any) placed an order or request
alter table orders add column if not exists user_id integer;
alter table special_requests add column if not exists user_id integer;

-- ============================================================
--  Custom requests, first class (v6). A request can be turned into a
--  real order (same statuses, labels, and sales history as everything
--  else), carry an owner note, and be archived out of the way.
-- ============================================================
alter table special_requests add column if not exists order_id    integer;      -- the order it became
alter table special_requests add column if not exists note        text;         -- your own note, never shown to the customer
alter table special_requests add column if not exists quote_cents integer;      -- what you quoted
alter table special_requests add column if not exists archived_at timestamptz;  -- hidden from the desk when set
alter table special_requests add column if not exists updated_at  timestamptz not null default now();
create index if not exists special_requests_order_idx on special_requests(order_id);
-- Orders can be archived too (shipped and done, out of the list)
alter table orders add column if not exists archived_at timestamptz;

-- ============================================================
--  Make queue (v7). Orders are worked first come first served, with a
--  rush flag and a hold flag, and each shirt gets ticked off as it's made.
-- ============================================================
alter table orders add column if not exists priority  smallint not null default 0;  -- 1 rush · 0 normal · -1 on hold
alter table orders add column if not exists queued_at timestamptz;                  -- place in line (earlier = sooner)
update orders set queued_at = coalesce(queued_at, created_at);
alter table orders alter column queued_at set default now();
alter table order_lines add column if not exists made_at timestamptz;              -- ticked off in the queue
create index if not exists orders_queue_idx on orders(priority desc, queued_at asc);

-- ============================================================
--  News & events (v8). Posts written from /admin/news. An "event" post
--  (a craft fair, a market) carries a date, a place, and a booth number;
--  it gets a countdown card on the home page until it's over and tells
--  Google about itself so it can show up in event searches.
-- ============================================================
create table if not exists news_posts (
  id            serial primary key,
  slug          text unique not null,
  kind          text not null default 'news',   -- news | event
  title         text not null,
  summary       text not null default '',       -- a line or two for cards, the home page, and search results
  body          text not null default '',       -- blank line = new paragraph, "- " starts a bullet
  image_url     text,                           -- a photo (uploaded, or one already on the site)
  published     boolean not null default false,
  published_at  timestamptz,                    -- first time it went live
  starts_on     date,                           -- event: first day
  ends_on       date,                           -- event: last day (empty = one day)
  start_time    text,                           -- event: "09:00", Maine time
  end_time      text,                           -- event: "15:00"
  venue         text,                           -- event: "Brunswick Rec Center"
  street        text,                           -- event: street address, for directions
  town          text,                           -- event: "Brunswick"
  state         text not null default 'ME',
  booth         text,                           -- event: "Booth 14"
  event_url     text,                           -- event: the fair's own page
  show_on_home  boolean not null default true,  -- event: countdown card on the home page
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists news_posts_live_idx on news_posts(published, starts_on);

-- Quick sale (v8): booth and cash sales record how they were paid and
-- which event (craft fair, market) they happened at.
alter table orders add column if not exists pay_method text;   -- cash | card | venmo | other
alter table orders add column if not exists event_id   integer references news_posts(id) on delete set null;
create index if not exists orders_event_idx on orders(event_id);

-- ============================================================
--  Inventory (v9). What's physically on the shelf: finished shirts
--  ready to sell, plain blanks, and other items (tie dye, hoodies,
--  one offs). Every change is written to inventory_moves, so a count
--  can always be explained: made 5, sold at the fair, counted, used.
-- ============================================================
create table if not exists inventory (
  id           serial primary key,
  kind         text not null,                -- shirt | blank | other
  slug         text not null default '',     -- shirt: the design (products.slug)
  name         text not null default '',     -- other: what it is ("Tie dye hoodie")
  color        text not null default '',     -- shirt + blank: color key from lib/products.ts; other: any text
  size         text not null default '',
  qty          integer not null default 0,
  price_cents  integer,                      -- other: what you sell it for (optional)
  updated_at   timestamptz not null default now(),
  unique (kind, slug, name, color, size)
);
create table if not exists inventory_moves (
  id           serial primary key,
  item_id      integer references inventory(id) on delete set null,
  kind         text not null,
  label        text not null default '',     -- "Sumac · Royal blue · L", kept even if the item is deleted
  delta        integer not null,             -- +5 made, -1 sold …
  qty_after    integer,
  reason       text not null,                -- made | bought | sold | pulled | used | counted | adjusted | returned
  order_id     integer,                      -- the sale or order it came from
  line_id      integer,                      -- the order line (make queue)
  note         text,
  reversed_at  timestamptz,                  -- set when an undo put it back
  created_at   timestamptz not null default now()
);
create index if not exists inventory_moves_item_idx  on inventory_moves(item_id, created_at desc);
create index if not exists inventory_moves_order_idx on inventory_moves(order_id);
create index if not exists inventory_moves_line_idx  on inventory_moves(line_id);

-- Carry over any counts typed into the old "Track stock by size" grid on
-- Products & stock (one time — re-running this never changes a count).
insert into inventory (kind, slug, color, size, qty)
select 'shirt', c.slug, split_part(c.key, ':', 1), split_part(c.key, ':', 2), c.n
from (
  select p.slug, s.key,
         case when s.value ~ '^[0-9]{1,6}$' then s.value::int else 0 end as n
  from products p, jsonb_each_text(coalesce(p.stock, '{}'::jsonb)) s
) c
where c.n > 0 and position(':' in c.key) > 0
on conflict (kind, slug, name, color, size) do nothing;

-- ============================================================
--  Bandanas (v10). A second thing to sell: a bleach dyed handkerchief,
--  one size, for a dog or anyone else. products.kind says what a row is;
--  order_lines.variant remembers which design went on a bandana.
-- ============================================================
alter table products add column if not exists kind text not null default 'shirt';  -- shirt | bandana
alter table order_lines add column if not exists variant text not null default '';  -- the design on a bandana

-- The bandana itself. sample_photo = true because the photos show maple, and
-- the design that goes on yours is the one you pick on the page.
-- To take it off the site: Products & stock → The Bandana → Hidden.
insert into products (slug, name, species, line, kind, blurb, story, image, card,
                      price_cents, sizes, active, sample_photo, sort)
values (
  'bandana', 'The Bandana', 'One size · for dogs and people', 'botanical', 'bandana',
  'The same leaves, sized for a good dog. Or your back pocket.',
  'Same blanks, same bleach, same leaves off the same back roads — cut square instead of sewn into a tee. It ties on a dog, folds into a pocket, and comes in every color the shirts do. Pick the design you want on it; it''s made the same way, one at a time.',
  '/images/bandana.jpg', '/images/design-bandana.jpg', 1000, '["One size"]'::jsonb, true, true, 10
)
on conflict (slug) do nothing;

-- Re-running this fills in the photos on a bandana row that was made before
-- they existed, without touching anything you've edited in the admin.
update products
set image = '/images/bandana.jpg', card = '/images/design-bandana.jpg'
where slug = 'bandana' and (image = '' or card = '');

-- ============================================================
--  Swaps (v11). No returns — every piece is made to order — but one
--  free size or color swap per item. A customer asks from /swap, the
--  request lands in /admin/swaps, and marking it Done puts the piece
--  that came back on the Inventory shelf.
-- ============================================================
alter table order_lines add column if not exists swapped_at timestamptz;  -- this one's swap has been used

create table if not exists swaps (
  id            serial primary key,
  ref           text unique,                 -- SW-XXXX, what the customer sees
  order_id      integer references orders(id) on delete set null,
  line_id       integer references order_lines(id) on delete set null,
  email         text not null,
  name          text not null default '',
  slug          text not null default '',    -- the design they have
  variant       text not null default '',    -- the design on it, when it's a bandana
  color         text not null default '',
  size          text not null default '',
  want_color    text not null default '',
  want_size     text not null default '',
  reason        text not null default '',    -- too-small | too-big | color | other
  note          text not null default '',
  address       jsonb,                       -- where the replacement goes
  status        text not null default 'requested',  -- requested | approved | sent | done | declined
  owner_note    text not null default '',    -- what Corey said back
  from_stock    boolean not null default false, -- the replacement came off the shelf
  decided_at    timestamptz,
  sent_at       timestamptz,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists swaps_status_idx on swaps (status, created_at desc);
create index if not exists swaps_order_idx  on swaps (order_id);

-- ============================================================
--  v12 — CANCEL, DELETE, AND TEST ORDERS (2026-09-13)
--
--  Three different ways an order stops being a live order, and
--  they are not the same thing:
--
--    Cancelled  the order was real and isn't happening any more.
--               It keeps its number and stays on the desk; it just
--               drops out of revenue and out of the make queue.
--               The shirts can go back on the shelf and whatever
--               money went back to the customer is written down.
--    Deleted    it was never a real order — your own test, spam,
--               a duplicate. Hidden everywhere and out of every
--               number, but sitting in the bin and recoverable for
--               30 days before it's really gone.
--    Test       Stripe says the payment was made in test mode.
--               Stamped automatically by the webhook, tagged on the
--               desk, and kept out of Sales history, COGS and the
--               make queue so a test never moves your real numbers.
--
--  Safe to run again: every line is "add column if not exists".
-- ============================================================
alter table orders add column if not exists cancelled_at  timestamptz;
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists refund_cents  integer;      -- money actually sent back
alter table orders add column if not exists restocked_at  timestamptz;  -- the shirts went back on the shelf
alter table orders add column if not exists deleted_at    timestamptz;  -- in the bin; purged after 30 days
alter table orders add column if not exists delete_reason text;
alter table orders add column if not exists test_mode     boolean not null default false;

create index if not exists orders_deleted_idx on orders (deleted_at);
create index if not exists orders_live_idx    on orders (deleted_at, test_mode, status);

-- ============================================================
--  v13 — TAKING SOMETHING OUT OF SALES HISTORY (2026-09-13)
--
--  Two different removals, because they aren't the same thing:
--
--    a whole sale   uses the v12 bin (orders.deleted_at). It's
--                   already filtered out of the history, the
--                   queue and the desk, and it comes back with
--                   Restore for 30 days.
--    one line       really leaves order_lines, because a row
--                   that's still there is a row some query will
--                   eventually count. The whole row is copied
--                   here first, so it can be put back exactly
--                   and there's a record of what left and why.
--
--  Nothing reads removed_lines except the Removed panel on
--  Sales history, so a row sitting here can never be counted
--  as a sale by accident.
-- ============================================================
create table if not exists removed_lines (
  id           serial primary key,
  order_id     integer,
  line_id      integer,                     -- the id it had before it left
  snapshot     jsonb not null,              -- the whole order_lines row
  label        text not null default '',    -- readable, for the Removed list
  amount_cents integer not null default 0,  -- what it was worth (qty × price)
  cogs_cents   integer,                     -- what it had cost, if it was costed
  reason       text not null default '',
  restocked    boolean not null default false,
  removed_at   timestamptz not null default now(),
  restored_at  timestamptz
);
create index if not exists removed_lines_order_idx on removed_lines (order_id);
create index if not exists removed_lines_open_idx  on removed_lines (restored_at, removed_at desc);
