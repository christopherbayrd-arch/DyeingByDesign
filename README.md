# Dyeing By Design — the website

Hand bleached shirts — real botanicals and hand-cut stencils — made in Maine. This is the full store **and** the
back office: product pages, cart, Stripe checkout, custom request form, drop
email list, plus an owner login where you manage products, prices, photos,
and per-size stock — built with Next.js, ready for GitHub → Vercel, with Neon
as the database and Vercel Blob for photo uploads.

**BRANDING.md** in this folder has the name/slogan/domain kit and the growth
playbook.

---

## The owner's back room (start here if the site is already live)

- **Log in:** go to `yoursite.com/admin/login` and enter the password
  (that's the `ADMIN_PASSWORD` environment variable in Vercel). Sessions last
  30 days; changing the password in Vercel signs everyone out.
- **Orders & requests** (`/admin`): orders appear automatically with the
  shipping address (card orders as **Paid**, order requests as **Awaiting
  payment** — change the status there once the customer has paid your
  Stripe link or invoice), plus custom requests and the drop email list.
- **Products & stock** (`/admin/products`): add designs, edit names, prices,
  stories, upload photos from your phone or computer, and control
  availability:
  - **Always available** = made to order, no limits. These order by request
    (you reply with a payment link).
  - **Track stock by size** = you set a count per color and size. A size at 0
    shows as sold out, checkout refuses quantities you don't have, and every
    paid order subtracts automatically. These are the shirts that get the
    **Buy now** card checkout once Stripe is connected.
  - **Shown / Hidden** toggles whether a design appears on the site at all.
    New designs start hidden until you're ready.
- **COGS** (`/admin/cogs`): what each kind of shirt costs you to make. Enter
  what you pay for blanks (per color and size), list your materials with the
  bulk price and how many shirts a unit covers, and build product types
  (bleach shirt, tie dye shirt…) from them. It shows cost per shirt and
  profit at your sale price. Hit **Save** when you're done — it's stored in
  the database, and every save also files a dated copy so old sales keep
  their old costs (the little "what changed" box next to Save is a note on
  that copy). The **History** button at the top of the page opens those
  copies: *What changed* lists every save with the blank, material, and
  shirt type prices that moved (cost increases in rust), and *One item over
  time* charts a single blank, material, or shirt type across every version.
  *Load this version into the editor* puts an old sheet back as unsaved
  changes — Save to make it current again.
- **Sales history** (`/admin/history`): every shirt sold, with the cost that
  was true the day it was paid for — frozen on the sale, so changing prices on
  the COGS page later never rewrites an old margin. Card orders freeze their
  cost in the webhook (plus the exact Stripe fee); order requests freeze it
  the moment you flip them to **Paid**. Totals by month and by design, then
  every sale with price, cost, and margin; type a postage or card fee on a
  row and click away to save it. **Record a sale** is for anything that
  didn't go through the site (market table, a DM, Tap to Pay) — pick the
  design, price, date, and where it sold. **Download CSV** gives you one row
  per shirt for a spreadsheet or the accountant. Orders from before this
  existed show a **Backfill** button: it builds their lines and costs them
  with today's sheet, marked *est.* A shirt shows *not costed* when its
  design isn't linked to a shirt type on the COGS page — fix that, then
  **Cost the missing ones**. *recost* on a row re-freezes it with the sheet
  from its paid date. Needs the latest `schema.sql` run in Neon.
- **Announce a drop** (`/admin/drop`): write one email and send it to
  everyone on the drop list. Send yourself a test first — it's the exact
  email subscribers get. Everyone receives their own copy (nobody sees
  anyone else's address) and every email carries an unsubscribe link.
  Emailing the list needs a verified sending domain — see step 6.
- Changes go live on the storefront within about a minute.

---

## Run it on your computer (optional)

You need Node.js installed (nodejs.org, the LTS version).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The site fully works without any keys — checkout,
the forms, and the admin just show friendly "not set up yet" messages until
the steps below are done. To use the admin locally, put `ADMIN_PASSWORD=something`
in a `.env.local` file.

---

## Going live, step by step

### Step 1 — Put it on GitHub

Easiest: **GitHub Desktop** (desktop.github.com) → File → Add local
repository → pick this folder → create a repository when prompted → Publish.
(Private is fine — Vercel can still see it.) Uploading the folder contents
through github.com's "Add files via upload" also works — just make sure
`package.json` ends up at the top level of the repo, not inside a subfolder.

### Step 2 — Deploy on Vercel

vercel.com → sign up with GitHub → Add New → Project → import the repo →
Deploy. Every push/upload to GitHub redeploys automatically.

### Step 3 — Neon (the database)

1. neon.tech → create a project (free tier is plenty).
2. Open the **SQL Editor**, paste the entire contents of `schema.sql`, Run.
   (Re-run it any time the file changes — v3 added the product **line** column
   for the Botanical / Graphic & Stencil split, and **kind** + **artwork_url**
   on custom requests for logo uploads. Existing rows default to Botanical.)
   That creates orders, custom requests, the drop list, the COGS table, the
   sales history tables (`order_lines`, `cogs_versions`, v4), **and
   the products table pre-loaded with the launch designs**. Safe to re-run any time —
   it never wipes data. **Run it again any time this file changes** — it
   adds new tables and columns (products, drop unsubscribes) without
   touching what's already there.
3. Click **Connect** and copy the connection string → that's `DATABASE_URL`.

### Step 4 — Stripe (payments) — **optional for now**

> **Ordering is set to split mode** (`ORDER_MODE = "split"` at the top of
> `lib/products.ts`), which works like this:
>
> - A design with **Track stock** switched on in the admin (counted shirts,
>   ready to ship — drops, for example) gets a **Buy now** button and a card
>   checkout through Stripe. Stock is subtracted automatically when the
>   payment clears.
> - A design that is **always available** (made to order) gets **Order this
>   one**. The customer fills in name, email, and shipping address and hits
>   *Send the order*. You get an email (reply-to is the customer, so just hit
>   Reply with a Stripe payment link or invoice) and a phone push, the order
>   lands on `/admin` as **Awaiting payment**, and the customer gets a copy
>   once your sending domain is verified. When they've paid, change the
>   status on `/admin` to **Paid**.
> - A cart that mixes both kinds goes in as one order request, so the
>   customer pays once.
> - **Until the Stripe keys below are in place, everything takes the order
>   request route** — the site notices on its own, nothing to flip.
>
> The other two settings: `"email"` = no card checkout anywhere, `"stripe"` =
> everything checks out by card, made to order included.


1. stripe.com → create and activate an account.
2. **Developers → API keys** → copy the Secret key (`sk_test_...` to practice,
   `sk_live_...` for real money).
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-SITE/api/webhook`
   - Event: **checkout.session.completed**
   - Copy the **Signing secret** (`whsec_...`).
   The webhook is what writes paid orders into Neon and subtracts stock.
4. Test with card `4242 4242 4242 4242`, any future date, any CVC — then
   check `/admin` for the order.

### Step 5 — Photo storage (Vercel Blob)

So the admin's "Upload photo" buttons work:

1. In Vercel: your project → **Storage** tab → **Create** → **Blob** →
   accept the defaults and **Connect** it to this project.
2. That automatically adds the `BLOB_READ_WRITE_TOKEN` environment variable.
3. Redeploy. Uploads now land in Blob storage and the site serves them
   directly. (Free tier includes plenty of space for product photos.)

### Step 6 — Email notifications (Resend)

So you hear about orders instead of having to check the site:

1. Sign up free at **resend.com** (3,000 emails a month free — plenty).
2. **API Keys → Create API Key** → copy it. That's `RESEND_API_KEY`.
3. Set `NOTIFY_EMAIL` to wherever alerts should land. **Important:** until
   you verify a domain (below), Resend only lets you send to the address
   you signed up with — so use that one first.
4. Redeploy, log into `/admin`, and hit **Send test email**. The badge at
   the top of that page tells you whether alerts are on.

**Optional — email customers too.** To send the branded "we got your
order" confirmation to buyers, and send from your own address instead of
Resend's test one, verify the domain:

1. Resend → **Domains → Add Domain** → `dyeingbydesign.com`.
2. Resend shows a few DNS records. Add them in **Vercel → your project →
   Domains → dyeingbydesign.com** (Vercel runs your DNS now that the
   nameservers point there).
3. Once Resend marks the domain verified, set
   `EMAIL_FROM=Dyeing By Design <hello@dyeingbydesign.com>` and redeploy.

Until `EMAIL_FROM` is set, customer confirmations are simply skipped —
buyers still get Stripe's payment receipt, and you still get your alerts.

To see what the emails look like without sending one, log in and visit
`/api/admin/preview-email?k=order` (also `request`, `customer`, `drop`, `test`).

### Step 6b — Phone alerts (Pushover, optional, 5 minutes)

1. Install **Pushover** on your phone (free 30-day trial, then $5 one time)
   and create an account.
2. pushover.net → copy **Your User Key** from the dashboard.
3. pushover.net/apps/build → name it "Dyeing By Design" → copy the **API Token**.
4. Add both as env vars (next step), redeploy, then press **Send test push**
   on `/admin`. Orders (cash-register sound) and custom requests (chime) both
   push, with a link that opens the order desk.

### Step 7 — Environment variables

Vercel → project → Settings → Environment Variables (all explained in
`.env.example`):

| Name | Value |
|---|---|
| `DATABASE_URL` | from Neon (step 3) |
| `STRIPE_SECRET_KEY` | from Stripe (step 4) |
| `STRIPE_WEBHOOK_SECRET` | from Stripe (step 4) |
| `ADMIN_PASSWORD` | the owner login password — pick something strong |
| `NEXT_PUBLIC_SITE_URL` | your site's full URL, e.g. `https://www.dyeingbydesign.com` |
| `BLOB_READ_WRITE_TOKEN` | added automatically by the Blob store (step 5) |
| `RESEND_API_KEY` | from Resend (step 6) — optional but recommended |
| `NOTIFY_EMAIL` | where order alerts go (step 6) — also the address the mailto fallback uses |
| `PUSHOVER_USER_KEY` | phone alerts (optional) — your user key from pushover.net |
| `PUSHOVER_APP_TOKEN` | phone alerts (optional) — the app token from pushover.net/apps/build |
| `EMAIL_FROM` | only after verifying your domain in Resend (step 6) |
| `EASYPOST_API_KEY` + `SHIP_FROM_*` | shipping labels (step 9) |
| `AUTH_SECRET` + `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | customer sign in (step 10) |

Then **redeploy** (Deployments → ⋯ → Redeploy) so they take effect.

### Step 8 — Your domain

Vercel → Settings → Domains → Add → follow the DNS records it shows you at
your registrar. Afterwards update `NEXT_PUBLIC_SITE_URL` and the Stripe
webhook URL to the new domain.

### Step 9 — Shipping labels (EasyPost, free)

Buys USPS labels from the admin with the customer's address already filled
in. Free up to thousands of labels a month; you only pay the postage.

1. Make an account at easypost.com (no card needed to start). In the
   dashboard find **API Keys**: there's a **Test** key (starts `EZTK`, makes
   fake labels, charges nothing) and a **Production** key (starts `EZAK`).
2. Start with the test key. Add these to Vercel and redeploy:

   | Name | Value |
   |---|---|
   | `EASYPOST_API_KEY` | the key |
   | `SHIP_FROM_NAME` | the name on the return address (Corey's, or Dyeing By Design) |
   | `SHIP_FROM_STREET1` / `SHIP_FROM_STREET2` | your street address (STREET2 optional) |
   | `SHIP_FROM_CITY` / `SHIP_FROM_STATE` / `SHIP_FROM_ZIP` | Brunswick / ME / your ZIP |
   | `SHIP_FROM_PHONE` | optional, some carriers want one |

3. In `/admin` every order now has a **Buy label** button: it checks the
   address with USPS, picks a package from how many shirts are in the order
   (the weights per size are in `lib/shipping.ts`, tune them after weighing
   a few real packages), shows the rates, and buys the one you pick. The
   label opens in a new tab (print on paper and tape it, or a 4×6 thermal
   printer), the order goes to **Shipped**, the postage lands in Sales
   history, and the customer gets a tracking email. **void label** asks for
   the postage back on one you didn't use.
4. When test labels look right, swap in the production key. To pay for real
   postage, add a card or bank in EasyPost → Billing.

### Step 10 — Customer sign in (optional)

Lets customers sign in with Google (or Apple / Facebook, or an emailed
link) so their cart follows them between devices, the order form fills in
their name and email, and `/account` shows their orders with tracking.
Ordering never requires it.

1. `AUTH_SECRET`: run `openssl rand -base64 32` (or use any long random
   string) and add it to Vercel.
2. Google: console.cloud.google.com → create a project → **APIs & Services
   → OAuth consent screen** (External, app name Dyeing By Design, your
   email) → **Credentials → Create credentials → OAuth client ID → Web
   application**. Authorized redirect URI:
   `https://www.dyeingbydesign.com/api/auth/callback/google`. Copy the
   client ID and secret into Vercel as `AUTH_GOOGLE_ID` and
   `AUTH_GOOGLE_SECRET`.
3. Emailed sign in link: works as soon as `RESEND_API_KEY` and `EMAIL_FROM`
   (verified domain, step 6) are set — nothing else to do.
4. Apple (`AUTH_APPLE_ID` / `AUTH_APPLE_SECRET`, needs a paid Apple
   Developer account) and Facebook (`AUTH_FACEBOOK_ID` /
   `AUTH_FACEBOOK_SECRET`, needs a Meta developer app) are already wired:
   the button appears the moment its keys exist. Redirect URIs are
   `/api/auth/callback/apple` and `/api/auth/callback/facebook` on your
   domain.
5. Redeploy. The header shows **Sign in**; `/account/signin` only offers
   the ways that are switched on. Re-run `schema.sql` in Neon first — it
   adds the account tables.

---

## Everyday things

**Add or change a product:** log in → Products & stock. Photos: use a
square-ish photo for the grid, any tall/portrait photo for the design page.
The oak design is still seeded with a crop of the sumac shirt as a
technique sample — replace it with a real photo from the admin when you've
made that shirt, and untick "technique sample." (Fern has a real photo now;
if the fern page still shows the "Photo shows the technique" badge, untick
"technique sample" on Fern in the admin, or re-run `schema.sql` in Neon, which
clears it.) Retired designs are listed in `RETIRED_SLUGS` in
`lib/products.ts` — the storefront skips them even if they're still in the
database.

**Run a limited drop:** create the design (or edit an existing one), switch
it to "Track stock by size," enter the counts, flip it to Shown, and email
the drop list (the emails are in `/admin`). Sizes sell down to 0 and show
sold out on their own.

**Change flat rate shipping:** `SHIPPING_CENTS` in `lib/products.ts` (700 = $7.00),
then push to GitHub. Every price shown on the site and in the emails reads from it.

**Instagram link:** the header, footer, and artist page all read the URL from
`lib/site.ts` (`INSTAGRAM_URL`). Change it there once.

**Search engines (SEO):** the site publishes `/sitemap.xml` (every public
page plus every shown design, read from the database) and `/robots.txt`
(keeps Google out of `/admin`, `/api`, the cart, and the order-received
page). Every page also carries invisible schema.org data — `lib/seo.ts`
builds it: who the business is (name, **DBD** as the short name, Brunswick,
Maine, the Instagram profile), each shirt's price and shipping, and the
about page FAQ. The town, state, short name, and Instagram profile all live
in `lib/site.ts`. "DBD" is deliberately in the page titles, the home page
kicker, the footer, and the about page FAQ — search engines only learn a
nickname if the site actually uses it. After a deploy, submit
`https://www.dyeingbydesign.com/sitemap.xml` in Google Search Console once;
after that Google re-reads it on its own.

**Swapping a photo, the logo, or the favicon:** just replace the file in
`public/images/` (or `app/icon.png` / `app/apple-icon.png` / `app/favicon.ico`)
and push. Every build runs `scripts/hash-assets.mjs` first, which fingerprints
the files in `public/` so their web addresses change whenever their contents
do (`/images/logo.png?v=82fa4d99`) — that's what stops browsers and Vercel's
image cache from showing the old picture after a deploy. Next.js does the same
for the icons. You should never need to clear your cache; if a phone still
shows an old favicon it's the phone's own icon cache — Safari keeps those
until you close the tab, or delete the site from Settings → Safari →
Advanced → Website Data.

**Order alerts:** when a payment clears you get an email with what to
make, the size, the shipping address, and the total — hit reply and it
goes straight to the customer. Custom requests email you too, also
reply-ready. Nothing about email can break a sale: if Resend is down or a
key is wrong, the order still saves and still shows in `/admin`.

**Custom requests:** each one on `/admin` has a status (New → Quoted →
Accepted → Done), a note box only you see, and **Archive** to get it off
the desk (Show archived brings them back). Quote by replying to the email;
when the customer says yes, **Turn into order** makes a real order for it
with the price you quoted, an optional cost, and their address, so it gets
the same statuses, the Buy label button, and a row in Sales history as any
lineup shirt. Orders have an **archive** link under their status too.
In Sales history, click any shirt's cost to type your own in (it shows
*by hand* and recost never overwrites it) — that's how custom pieces get
costed when the COGS sheet can't know them.

**Announce a drop:** log in → **Announce a drop**. Write a subject,
headline, and message, optionally feature one of your designs (it pulls
in the photo, name, and price), then send yourself a test. When it looks
right, hit send and confirm. The sidebar shows how many people are on
the list and what you've sent before. Unsubscribes are handled for you
and are permanent.

---

## What's wired up where

```
app/page.tsx              homepage (products from the database)
app/shop/                 design grid + individual design pages
app/custom/               special request form  → saved to Neon
app/about/                process story + care + FAQ
app/cart/                 cart (stored in the visitor's browser)
app/success/              post-checkout thank you page
app/admin/                owner area: orders, custom requests, drop list
app/admin/login/          owner login page
app/admin/products/       product & stock manager
app/api/checkout/         creates the Stripe Checkout session (server-side
                          price + stock enforcement)
app/api/webhook/          Stripe → writes orders into Neon + subtracts stock
app/api/admin/*           login/logout, products, photo upload,
                          test + preview email
lib/email.ts              Resend setup and the email templates
lib/orderFormat.ts        order data → readable email lines
app/admin/drop/           write and send a drop announcement
app/unsubscribe/          one-click unsubscribe confirmation page
components/               header, footer, cards, cart, forms, product manager
lib/products.ts           types, shipping constant, fallback designs
lib/catalog.ts            reads live products from Neon
lib/adminAuth.ts          owner session cookie helpers
middleware.ts             guards /admin and /api/admin
schema.sql                run in Neon's SQL editor (safe to re-run)
scripts/                  art generation helper (not part of the site)
```

Security notes: prices and stock are enforced on the server from the
database — nobody can pay a made-up price or over-order from their browser.
Real keys belong only in `.env.local` (git-ignored) and Vercel's environment
variables — never commit them.

---

## Going further, whenever you want

Ask Claude to: add more shirt colors or product types (hoodies, totes), email
you when an order or custom request lands (Resend has a free tier), send
customers shipping-status emails, add discount codes, or separate logins for
two people. The database and structure are already shaped for it.
