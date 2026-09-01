# J.M_CP Specialist — WhatsApp Build: Handoff Package

For: whoever picks up the WhatsApp deployment
From: this project's working chat build (`JM_CP_Specialist_Live.html`) — same brain, new channel

**Not looking for WhatsApp specifically?** If the immediate goal is just a public
website anyone can use — no phone number, no Meta Business account — see
`GO_LIVE_PUBLIC_WEBSITE.md` instead. It's simpler, faster, and this same
`server.js` already supports it (§8 below). WhatsApp can be added on top of
that later without redoing anything.

## 1. What already exists (don't rebuild this)

- **The system prompt** — full reporting procedure, 38 CPIMS categories, 32 interventions,
  adoption rules and guardrails, tone/voice instructions, trilingual (EN/Kiswahili/Ekegusii)
  handling, 116-first emergency escalation. It's in `server.js` below, copied verbatim from
  the working chat version — don't rewrite it, just extend it if the officer asks for more.
- **The case form logic** — Jotform ID `262276166347059`, already reordered to match the
  paper Case Record Sheet, with the conditional logic (Entry No., caregiver-vs-parents,
  "Other" on Family Status) already built in Jotform itself.
- **The risk tiering** — category → high/standard mapping, already decided (see `server.js`).

## 2. What this package adds

A WhatsApp channel that:
1. Answers child-protection questions in the officer's own WhatsApp, in whichever of the
   three languages the sender used.
2. Flags high-risk messages immediately (defilement, trafficking, abduction, FGM, etc.) with
   a 116-first message, then continues the conversation.
3. Lets the officer text a summary of a case; the bot returns a structured version they can
   paste into the Jotform, and can optionally push it straight into Jotform via the API.
4. Runs a **weekly research digest** — searches for genuinely new Kenyan child-protection
   developments, WhatsApps a numbered list to the officer, and only adds anything to the
   bot's own knowledge once the officer replies "approve N" for that item. Same
   approval-gated trust model as the chat app's Research tab, just on a real timer instead
   of needing someone to tap a button — see §7.
5. **Monitors all three of the officer's Gmail inboxes** for unread mail that looks
   child-protection-relevant, and forwards a summary to WhatsApp — see §7.
6. **Does not** attempt: voice notes in the officer's cloned voice, monitoring of the DCS
   website, or monitoring social accounts. See §6 for why each is out of scope.

## 3. Architecture

```
WhatsApp user (officer or a reporter)
        │
        ▼
Meta WhatsApp Cloud API  ──webhook──▶  Node/Express server (server.js below)
        │                                     │
        │                                     ├── calls Anthropic API (chat + triage)
        │                                     ├── calls Jotform API (create submission)
        │                                     └── (optional) calls Twilio/WhatsApp to
        │                                         push a proactive alert to the officer's
        │                                         own number for HIGH-risk cases
        ▼
Officer's WhatsApp
```

Recommended: **Meta's own WhatsApp Cloud API** (free tier covers low message volume,
no per-message markup like Twilio) — needs a Meta Business account and a verified
WhatsApp Business number. Twilio is the easier-to-set-up alternative if Meta's business
verification is a blocker; swap the send/receive calls in `server.js` accordingly.

## 4. What the developer needs from Joseph before starting

**To get WhatsApp Q&A + case capture working (required):**
- [ ] A WhatsApp Business number (can be the existing work number or a new one)
- [ ] Meta Business Manager access (or a Twilio account, if going that route)
- [ ] An Anthropic API key with billing enabled — **this was the blocker before**;
      without it the bot cannot answer anything. (console.anthropic.com → billing)
- [ ] A Jotform API key (Jotform → Account Settings → API) to push cases in and/or
      read submissions back out
- [ ] Hosting for `server.js` — any small Node host works (Render, Railway, a $5/mo VPS).
      It needs a public HTTPS URL for Meta's webhook to reach.
- [ ] Decision: does every message from every reporter go through the bot, or is this
      strictly an officer-facing tool (recommended to start, given how much of the
      guidance requires human judgement on a live case)?

**To also get the research digest working (optional):**
- [ ] Nothing extra — it only needs the Anthropic key above. Runs automatically once
      deployed (weekly by default; see §7 to change the schedule).

**To also get email monitoring working (optional):**
- [ ] A Google Cloud project with the Gmail API enabled, and an OAuth 2.0 "Desktop app"
      client ID + secret (one app, shared across all three inboxes — see §7)
- [ ] Three separate one-time sign-ins (one per inbox: wgmagencies@, josephmaticha3@,
      jnmaticha@gmail.com) to generate each inbox's refresh token — `get-gmail-token.js`
      walks through this, takes a couple of minutes per inbox

## 5. Setup steps (once the above is in hand)

1. `npm install` in this project (package.json included).
2. Set environment variables: `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
   `WHATSAPP_VERIFY_TOKEN` (any string you choose), `JOTFORM_API_KEY`, `OFFICER_WHATSAPP_NUMBER`.
3. Deploy `server.js` to your host; note the public URL.
4. In Meta Developer Console → your app → WhatsApp → Configuration, set the webhook URL
   to `https://<your-host>/webhook` and the verify token to match step 2.
5. Send a test WhatsApp message to the business number — it should get a reply within
   a few seconds.
6. Test a high-risk phrase (e.g. "child was defiled yesterday") and confirm the 116-first
   flag fires before the normal reply.
7. (Optional) For email monitoring: run `npm run get-gmail-token` three times, once per
   inbox, following the prompts; set the three `GMAIL_REFRESH_TOKEN_*` env vars plus
   `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` on your host; redeploy. The server logs which
   inboxes are active on startup.
8. (Optional) The research digest needs nothing extra — confirm it's running by checking
   the server logs for the weekly cron firing, or temporarily shorten `RESEARCH_CRON` to
   test it sooner (node-cron syntax, e.g. `*/5 * * * *` for every 5 minutes while testing).

## 6. Explicitly out of scope for this package (separate projects)

- **Cloned voice replies in WhatsApp** (as an audio message, not the chat app — that's
  already live, see below): needs the same ElevenLabs call the chat app now makes,
  wrapped so the server sends the resulting audio as a WhatsApp voice-note message
  (a different API endpoint from text). Reuse `speakWithClonedVoice`'s logic from
  `JM_CP_Specialist_Live.html`; the ElevenLabs half is proven, this is just plumbing
  the audio into WhatsApp's audio-message send call instead of playing it in-browser.
- **Monitoring childprotection.go.ke**: the site has no public API; this would mean
  scraping, which is fragile and can break silently. Lower priority than it sounds.
- **Social monitoring/posting (LinkedIn, Instagram, Facebook, TikTok)**: each platform
  has its own developer program, approval process, and rate limits; realistically a
  multi-week effort per platform, not a feature to bundle into the WhatsApp build.

Email monitoring and the research digest are no longer in this "out of scope" list —
both are implemented in `server.js` (§7) and just need credentials to switch on.

## 7. Research digest & email monitoring — how they actually work

**Research digest** (`runResearchDigest`, scheduled via `node-cron`): searches the web
for genuinely new Kenyan child-protection developments, using the same prompt and
`[[FINDING|...]]` marker format as the chat app's Research tab. Findings are written to
`data/pending_findings.json` and WhatsApped to the officer as a numbered list. Replying
"approve 3" or "reject 3" moves that item out of pending — approved items land in
`data/approved_findings.json` and are folded into every future chat answer via
`approvedResearchPromptBlock()`. Default schedule: Monday 07:00 server time — change via
the `RESEARCH_CRON` env var (standard node-cron syntax).

⚠️ **Storage caveat**: `data/*.json` lives on local disk. That's fine on a host with a
persistent filesystem, but free tiers on some hosts (Render, Railway) wipe local disk on
every redeploy or restart — findings would silently vanish. If that turns out to be a
problem, either add a persistent disk/volume on your host, or swap the `readJSON`/
`writeJSON` helpers for calls to a Google Sheet instead (natural given Joseph's Google
account is already in the picture for email — just extra setup this file doesn't include).

**Email monitoring** (`pollAllInboxes`, every 15 minutes via `node-cron`): polls
`is:unread newer_than:2d` on each configured inbox, keeps anything whose subject/snippet
mentions child-protection-relevant keywords, and WhatsApps a summary. Each inbox is
independent — configure one, two, or all three by setting only the matching
`GMAIL_REFRESH_TOKEN_*` env vars; unconfigured ones are just skipped (server logs which
are active on startup). Getting a refresh token is a one-time, per-inbox action — run
`get-gmail-token.js` (instructions inside the file), sign in as that inbox, copy the
printed token into the matching env var. The keyword filter in `EMAIL_RELEVANCE_WORDS`
is deliberately simple (substring match) — tune it if it's too noisy or missing things.

## 8. Public website (no WhatsApp needed) — already built in

`server.js` serves a `public/` folder as a website if one exists next to it
(`app.use(express.static(...))`), and exposes a rate-limited `/api/chat`
endpoint the app calls automatically when it detects it's running outside
Claude with no personal API key configured. Put `JM_CP_Specialist_Live.html`
in `public/index.html`, deploy this server anywhere, and that URL is a fully
public, multi-user version of the chat app — no WhatsApp Business account,
no Meta approval process, no per-visitor API key. See
`GO_LIVE_PUBLIC_WEBSITE.md` for the full walkthrough; it's the fastest way
to get something real in front of people.

Rate limiting (`PUBLIC_CHAT_RATE_LIMIT`, default 20 messages/visitor/hour)
is what stands between this being public and the officer's API bill being
unbounded — it's IP-based, so not airtight against a determined attacker
with many IPs, but real protection against ordinary overuse. Worth
revisiting if this ever gets serious traffic.
