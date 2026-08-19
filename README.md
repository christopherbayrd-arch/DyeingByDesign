# Dyeing By Design — the website

Hand bleached leaf shirts, made in Maine. This is the full store: product
pages, cart, Stripe checkout, custom request form, drop email list, and a
password-protected admin page — built with Next.js, ready for GitHub → Vercel,
with Neon as the database.

**BRANDING.md** in this folder has the name/slogan/domain kit and the growth
playbook.

---

## Run it on your computer (optional but nice)

You need Node.js installed (nodejs.org, the LTS version).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The site fully works without any keys — checkout
and the forms just show friendly "not set up yet" messages until you finish
the steps below.

---

## Going live, step by step

### Step 1 — Put it on GitHub

1. Create a free account at github.com if you don't have one.
2. Easiest path: install **GitHub Desktop** (desktop.github.com) → File →
   Add local repository → pick this folder → "create a repository" when
   prompted → Publish repository (keep it private if you like — Vercel can
   still see it).

   Or by command line:
   ```bash
   git init
   git add .
   git commit -m "Dyeing By Design launch"
   ```
   then create an empty repo on GitHub and follow its "push an existing
   repository" instructions.

### Step 2 — Deploy on Vercel

1. Sign up at vercel.com **with your GitHub account** (free Hobby plan is fine).
2. Add New → Project → Import your repository → Deploy. That's it — Vercel
   detects Next.js automatically.
3. You'll get a live URL like `dyeing-by-design.vercel.app`. From now on,
   every push to GitHub redeploys the site automatically.

### Step 3 — Set up Neon (the database)

1. Sign up at neon.tech (free tier is plenty to start).
2. Create a project (call it `dyeing-by-design`, any US region).
3. Open the **SQL Editor**, paste the entire contents of `schema.sql` from
   this folder, and Run. That creates your three tables: orders, custom
   requests, and the drop email list.
4. Click **Connect** and copy the connection string (starts with
   `postgresql://...`). That's your `DATABASE_URL`.

   Tip: Vercel also has a Neon integration (Vercel → Storage → Neon) that
   creates the database and adds `DATABASE_URL` for you — either way works;
   you still need to run `schema.sql` in the SQL Editor.

### Step 4 — Set up Stripe (payments)

1. Sign up at stripe.com and activate the account (business info, bank
   account for payouts).
2. **Developers → API keys** → copy the **Secret key**. Use the *test* key
   (`sk_test_...`) first so you can practice; switch to the *live* key
   (`sk_live_...`) when you're ready for real money.
3. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://YOUR-SITE-URL/api/webhook`
   - Events: select **checkout.session.completed**
   - After creating it, copy the **Signing secret** (`whsec_...`).
   This is how paid orders get written into your Neon database automatically.
4. Test it with Stripe's test card: `4242 4242 4242 4242`, any future date,
   any CVC. Then check `/admin` — the order should be sitting there.

### Step 5 — Add the environment variables in Vercel

Vercel → your project → Settings → Environment Variables. Add all five
(they're listed with explanations in `.env.example`):

| Name | Value |
|---|---|
| `DATABASE_URL` | from Neon (step 3) |
| `STRIPE_SECRET_KEY` | from Stripe (step 4) |
| `STRIPE_WEBHOOK_SECRET` | from Stripe (step 4) |
| `ADMIN_PASSWORD` | any strong password you choose |
| `NEXT_PUBLIC_SITE_URL` | your site's full URL, e.g. `https://dyeingbydesign.shop` |

Then **redeploy** (Deployments → ⋯ on the latest → Redeploy) so they take
effect.

### Step 6 — Your domain

Buy the domain (see BRANDING.md for the shortlist), then Vercel → Settings →
Domains → Add. Vercel shows you exactly what to change at your registrar,
and HTTPS is automatic. Afterwards, update `NEXT_PUBLIC_SITE_URL` and the
Stripe webhook URL to the new domain.

---

## Everyday things you'll actually do

**See orders, custom requests, and email signups:** go to `/admin` on your
site and enter your `ADMIN_PASSWORD` (leave the username blank). Orders appear
there automatically after checkout, with the shipping address.

**Change a price, name, or story:** edit `lib/products.ts` — everything about
the four designs lives in that one file. Shipping cost lives there too
(`SHIPPING_CENTS`). Push to GitHub and the site updates itself.

**Swap in real photos (important):** the maple, oak, and fern pages currently
show crops of your sumac shirt as technique samples (they're honest about it —
each has a small "photo shows the technique" note). When you've made real
ones: photograph them straight on in good light, drop the files into
`public/images/`, and update the `image` and `card` paths in
`lib/products.ts`. Square-ish photos work best for the `card` one.

**Edit words on a page:** homepage text is in `app/page.tsx`, the process +
FAQ page is `app/about/page.tsx`, the custom page is `app/custom/page.tsx`.
The words are right there in the code — edit, push, done.

**Announce a drop:** your signup emails are in `/admin` (and in Neon). Copy
them into BCC in your email app for v1; when the list outgrows that, add a
free Mailchimp/Buttondown account.

---

## What's wired up where

```
app/page.tsx              homepage
app/shop/                 design grid + individual design pages
app/custom/               special request form  → saved to Neon
app/about/                process story + care + FAQ
app/cart/                 cart (stored in the visitor's browser)
app/success/              post-checkout thank you page
app/admin/                password-protected order desk
app/api/checkout/         creates the Stripe Checkout session
app/api/webhook/          Stripe → writes paid orders into Neon
app/api/special-request/  saves custom requests
app/api/signup/           saves drop-list emails
components/               header, footer, cards, cart, forms
lib/products.ts           ★ your designs, prices, sizes — edit here
lib/db.ts                 Neon connection helper
middleware.ts             the /admin password gate
schema.sql                run once in Neon's SQL editor
scripts/                  art + screenshot helpers (not part of the site)
```

Prices are enforced on the server from `lib/products.ts` — nobody can pay a
made-up price from their browser. Real keys belong only in `.env.local` (which
git ignores) and in Vercel's environment variables — never commit them.

---

## Going further, whenever you want

Ask Claude to: add more shirt colors, add hoodies or totes, build real drop
inventory with sold-out states, email you when an order or custom request
lands (Resend has a free tier), add order status emails, or hook up a
Mailchimp export for the drop list. The database and structure are already
shaped for all of it.
