# Getting J.M_CP Specialist Live — Public Website Guide

This is the direct path to a real, working public URL — something anyone in
Kenya can open and get help from, with no Anthropic account of their own,
no download, nothing to install. You don't need to write code for this.
You need about 30–60 minutes and a payment card for one small step.

## What you'll end up with

A URL like `jm-cp-specialist.onrender.com` (or your own domain, later, if you
want one) that anyone can visit. It's the same app you've been testing —
Consult, Record a Case, Emergency Actions, everything — just reachable by
anyone, not only inside Claude.

## What it costs

- **Render** (hosting the server): free tier works to start. It sleeps after
  15 minutes of no traffic and takes ~30 seconds to wake up on the next
  visit — fine for early use; upgrade later ($7/month) once there's real
  traffic and that delay matters.
- **Anthropic API**: pay-as-you-go, roughly fractions of a cent per message.
  Put in $10–20 to start. The rate limit built into the server (20 messages
  per visitor per hour, adjustable) is what keeps this from being drained by
  one person or a bot — it's not perfect, but it's real protection, not
  nothing.
- **WhatsApp, Jotform, email monitoring**: all optional, skip entirely for
  now. This guide only covers getting the public chat website live.

## Step 1 — Get your Anthropic API key (if you haven't already)

console.anthropic.com → sign up → Settings → Billing → add a card and some
credit → Settings → API Keys → Create Key → copy it somewhere safe. This is
the one piece of "your own money" this whole thing needs.

## Step 2 — Put the two files in the right place

You need a folder with:
```
jm-cp-specialist/
├── server.js
├── package.json
├── public/
│   └── index.html      ← this is JM_CP_Specialist_Live.html, renamed
```
Rename `JM_CP_Specialist_Live.html` to `index.html` and put it inside a
folder called `public`, sitting next to `server.js`. That's the only file
move required.

## Step 3 — Put this folder on GitHub

1. Go to github.com, make a free account if you don't have one.
2. Click "New repository," name it something like `jm-cp-specialist`, keep
   it private if you'd rather (doesn't affect anything below).
3. Upload the folder from Step 2 — GitHub's website lets you drag-and-drop
   files directly, no command line needed.

## Step 3.5 — (Optional) Test it on your own computer first

If Node.js is installed on your machine, you can run this locally before
ever touching GitHub or Render — catches problems early and is much faster
to iterate on.

```
npm install
ANTHROPIC_API_KEY=your-key-here npm run dev
```

`npm run dev` uses a small tool called nodemon that automatically restarts
the server whenever you edit `server.js` — no need to manually stop and
restart it each time you make a change. Open `http://localhost:3000` in
your browser to see the app. (`npm start` — no `dev` — runs it the plain
way, which is what Render uses in production; you don't need to touch that
part.)

## Step 4 — Deploy it on Render

1. Go to render.com, sign up (you can sign up directly with your GitHub
   account — makes this step faster).
2. Click "New" → "Web Service."
3. Connect the GitHub repository you made in Step 3.
4. Render will detect it's a Node app automatically. Leave the defaults —
   Build Command `npm install`, Start Command `npm start`.
5. Before deploying, add your environment variable: `ANTHROPIC_API_KEY` =
   the key from Step 1. (Render has an "Environment" section for this —
   it's a simple form, name and value.)
6. Click "Create Web Service." Wait a few minutes for the first build.

## Step 5 — Open it

Render gives you a URL when it's done (something like
`https://jm-cp-specialist.onrender.com`). Open it. You should see the exact
same app you've been testing here — except now it's live, for anyone.

## Optional but worth doing: keep it awake

Render's free tier sleeps after 15 minutes of no traffic, and takes ~30
seconds to wake back up on the next visit — not ideal for something people
might reach for urgently. Fix: a free service like uptimerobot.com or
cron-job.org can ping your URL every 10 minutes automatically, which keeps
it from ever sleeping. Point it at `https://your-url.onrender.com/health` —
that's a lightweight endpoint built for exactly this, it just replies "ok"
without doing any real work.

## Optional: check how much it's actually being used

Visit `https://your-url.onrender.com/stats` to see today's message count
and number of unique visitors — counts only, never what anyone actually
asked. If you set an `ADMIN_KEY` environment variable in Render, add
`?key=your-key` to that URL or anyone who finds it can see the numbers too.

## Test it properly before sharing it

- Open the URL in a phone browser, not just a laptop — most people who'd
  actually use this will be on a phone.
- Send a few real test messages and confirm it replies.
- Deliberately send 21+ messages quickly to confirm the rate limit kicks in
  with a sensible message rather than something broken.
- Check Record a Case and the Referral Pathway tab work the same as before.

## What's genuinely NOT covered by this guide

- **WhatsApp** — separate setup, covered in `WHATSAPP_HANDOFF.md`. The same
  server can do both once WhatsApp is added; this guide is chat-website-only.
- **A custom domain** (e.g. `jmcpspecialist.org` instead of the Render
  subdomain) — possible, cheap (a few dollars/year for the domain), a later
  step once this is working and you want it to look more official.
- **Handling real scale** — if this genuinely gets heavy traffic one day
  (hundreds of people daily), the free Render tier and simple rate limiter
  won't be enough, and it'll be worth a proper developer's time to harden
  it. Cross that bridge if you get there — it means this worked.

## If something breaks

Render shows live logs for the server — that's the first place to look.
Common issues: forgot to add `ANTHROPIC_API_KEY` in Step 4.5, or the
`public/index.html` file wasn't named exactly that. Bring the error back
here if you get stuck — I can help debug from the log text even without
seeing the live site myself.
