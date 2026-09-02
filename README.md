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
- **Orders & requests** (`/admin`): paid orders appear automatically with the
  shipping address, plus custom requests and the drop email list.
- **Products & stock** (`/admin/products`): add designs, edit names, prices,
  stories, upload photos from your phone or computer, and control
  availability:
  - **Always available** = made to order, no limits.
  - **Track stock by size** = you set a count per size (S–2XL). A size at 0
    shows as sold out, checkout refuses quantities you don't have, and every
    paid order subtracts automatically.
  - **Shown / Hidden** toggles whether a design appears on the site at all.
    New designs start hidden until you're ready.
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
   That creates orders, custom requests, the drop list, **and the products
   table pre-loaded with the four launch designs**. Safe to re-run any time —
   it never wipes data. **Run it again any time this file changes** — it
   adds new tables and columns (products, drop unsubscribes) without
   touching what's already there.
3. Click **Connect** and copy the connection string → that's `DATABASE_URL`.

### Step 4 — Stripe (payments) — **optional for now**

> **Ordering is currently set to email mode** (`ORDER_MODE = "email"` at the
> top of `lib/products.ts`). Customers add shirts to the cart, fill in their
> name, email, and shipping address, and hit *Send the order*. You get an
> email (reply-to is the customer, so just hit Reply with payment details) and
> a phone push, the order lands on `/admin` as **Awaiting payment**, and the
> customer gets a copy once your sending domain is verified. Nothing is
> charged on the site. If email isn't connected yet, the cart hands the
> customer a pre-written email to send from their own mail app instead.
> When you're ready for card checkout, do this step and flip that one line
> to `"stripe"`.


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

Then **redeploy** (Deployments → ⋯ → Redeploy) so they take effect.

### Step 8 — Your domain

Vercel → Settings → Domains → Add → follow the DNS records it shows you at
your registrar. Afterwards update `NEXT_PUBLIC_SITE_URL` and the Stripe
webhook URL to the new domain.

---

## Everyday things

**Add or change a product:** log in → Products & stock. Photos: use a
square-ish photo for the grid, any tall/portrait photo for the design page.
The oak and fern designs are still seeded with crops of the sumac shirt as
technique samples — replace them with real photos from the admin when you've
made those shirts, and untick "technique sample."

**Run a limited drop:** create the design (or edit an existing one), switch
it to "Track stock by size," enter the counts, flip it to Shown, and email
the drop list (the emails are in `/admin`). Sizes sell down to 0 and show
sold out on their own.

**Change flat shipping:** `SHIPPING_CENTS` in `lib/products.ts` (500 = $5.00),
then push to GitHub.

**Order alerts:** when a payment clears you get an email with what to
make, the size, the shipping address, and the total — hit reply and it
goes straight to the customer. Custom requests email you too, also
reply-ready. Nothing about email can break a sale: if Resend is down or a
key is wrong, the order still saves and still shows in `/admin`.

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
