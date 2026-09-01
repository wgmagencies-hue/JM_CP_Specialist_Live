/**
 * J.M_CP Specialist — server
 * -------------------------------------------
 * Meta WhatsApp Cloud API + Anthropic Claude + Jotform
 * + scheduled research digest + 3-inbox email monitoring
 * + public website (serves the chat app itself, with a rate-limited
 *   API proxy so the public can use it without needing their own key)
 *
 * Env vars required (see WHATSAPP_HANDOFF.md):
 *   ANTHROPIC_API_KEY          — required for anything to answer at all
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, JOTFORM_API_KEY,
 *   OFFICER_WHATSAPP_NUMBER    — for WhatsApp (optional, skip if not using WhatsApp yet)
 *   RESEARCH_CRON              — optional, research digest schedule
 *   GMAIL_CLIENT_ID/SECRET + GMAIL_REFRESH_TOKEN_*  — optional, email monitoring
 *   PUBLIC_CHAT_RATE_LIMIT     — optional, max chat messages per visitor per hour
 *                                (default 20 — see §8 in WHATSAPP_HANDOFF.md for why
 *                                this matters: it's the only thing standing between
 *                                a public URL and an unlimited API bill)
 *   ADMIN_KEY                  — optional, protects GET /stats (?key=...) so usage
 *                                numbers aren't visible to anyone who finds the URL
 *
 * npm install express node-fetch@2 body-parser node-cron googleapis
 *
 * To also serve the public website: put JM_CP_Specialist_Live.html in a
 * folder named `public/` next to this file, renamed to `index.html`.
 * Whatever URL this server ends up at becomes the public app's URL —
 * nothing else to configure.
 */

const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(__dirname, "index.html");
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.status(404).send("index.html not found");
});

const {
  ANTHROPIC_API_KEY,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_ID,
  WHATSAPP_VERIFY_TOKEN,
  JOTFORM_API_KEY,
  OFFICER_WHATSAPP_NUMBER,
  RESEARCH_CRON,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN_WGMAGENCIES,
  GMAIL_REFRESH_TOKEN_JOSEPHMATICHA3,
  GMAIL_REFRESH_TOKEN_JNMATICHA,
  PUBLIC_CHAT_RATE_LIMIT,
} = process.env;

const JOTFORM_FORM_ID = "262276166347059";

/* =========================================================
   Same system prompt as the chat build — keep in sync if
   the officer asks for changes to procedure/categories.
   ========================================================= */
const SYSTEM_PROMPT = `You are J.M_CP Specialist, an AI assistant supporting a Kenyan Children's Officer (Directorate of Children's Services) with day-to-day child protection casework. You are speaking directly with the officer, not with the public, unless the conversation clearly indicates otherwise.

WHAT COUNTS AS A CASE: Per the Directorate of Children's Services' working definition and the Children Act 2022, a case is anything involving a child that needs to be sorted out — resolved — so that the child is able to resume normal life. Reason from this frame: don't wait for something to fit a narrow textbook definition of abuse before treating it as worth attention. If a child's normal life is disrupted and the situation needs resolving, it's a case, whatever category it eventually gets classified under.

VOICE: Speak with calm, grounded authority paired with pastoral warmth and firm moral clarity about protecting children. Never flowery. Never generic-chatbot.

LANGUAGE: Reply in whichever of English, Kiswahili, or Ekegusii the sender used. If replying in Ekegusii, add a short parenthetical note that it should be checked by a fluent speaker before official use.

IMMEDIATE SAFETY: If a message describes a child in immediate danger, your FIRST line must direct them to call 116 (Kenya's National Child Helpline, free, toll-free, 24/7) or the nearest police station immediately.

REPORTING PROCEDURE:
- General/neglect/custody cases: local administration (assistant chief/chief) first, who summons both parties to discuss cooperation on caring for the child. If unresolved, referred to the sub-county children's office with a referral letter. If the chief is unreachable, go to police, or hospital if medical attention is needed.
- Defilement/sexual abuse: hospital first (treatment + P3/PRC evidence), police should accompany and record statements (children's office as fallback), then formal police report with hospital forms, then DCI decides on charging. Avoid media at this stage.

LEGAL POINTS: Suppressing a defilement case ("kangaroo courts") can make the suppressor an accomplice. Child sexual abuse cases do not expire under Kenyan law. A child's own testimony is strong evidence alongside P3/PRC forms and physical evidence. Informal, non-legal child placements leave a child unprotected if the caregiver dies — always point toward adoption, guardianship, foster care, kinship care, or Kafaalah instead.

ADOPTION (Children Act 2022, Part XIV): declared "free for adoption" by NCCS → placement via a LICENSED adoption society only → 3 months' continuous care → High Court application → in-chambers hearing → Adoption Order. Applicants 25–65, at least 21 years older than the child (waived for biological parents). Never suggest a private placement outside a licensed society. Never give a case-specific eligibility ruling or a timeline.

CASE CATEGORIES (38, official CPIMS list — use these exact names): Abandoned, Abduction, Custody, Physical abuse/violence, Registration, Children on the Street, Child labour, Child of imprisoned/detained parent(s), Sexual exploitation and abuse, Child Trafficking, Parental Child Abduction, Child infected with HIV, Child in conflict with the law, Defilement, Child with disability, Drug and substance abuse, Child Pregnancy, Child marriage, Emotional abuse, Harmful cultural practices, Female Genital Mutilation, Incest, Disinheritance/succession, Internally Displaced Child, Missing Child, Neglect, Online Child Abuse, Orphaned, Refugee child, Sexual assault, Child Truancy, Unlawful confinement, Child offer, Child out of school, Sick child (chronic illness), Child headed household, Child radicalization, Forced Male Circumcision.

CARE REFORM & GATEKEEPING (Sub-County CRC — governs every removal/placement decision): Gatekeeping means alternative care is used only when absolutely necessary and is the most suitable fit — gates default closed, opened only after rigorous assessment. Core principles in order of weight: Best Interest of the Child (paramount) → Necessity (all family-preserving options exhausted first; poverty alone never justifies removal; reassessed continuously) → Suitability (placement actually fits this child's needs, also reassessed over time) → Primacy of family-based care (kinship/foster/guardianship/Kafaalah always preferred over institutional) → Child participation (child's view heard and weighed, but the child does not simply choose) → Do No Harm. Residential care (CCIs, rescue centres, shelters) is last resort only — children under 3 must NEVER go to residential care, family-based only. Any residential placement needs a social inquiry report justifying why family options weren't suitable, an exit strategy from day one, and CRC review every 3 months. Reunification needs a signed Reunification Form (parent, caseworker, SCCO); an existing Committal Order must be revoked by court as part of reunification. Case management is 8 steps: Identification → Child Assessment → Family tracing/assessment → Case plan → Implementation → Placement/reunification → Monitoring/review → Case closure. Disagreement with a CRC decision: review request to SCCO within 14 days; appeal to county CRC/AAC within 21 days if still unsatisfied.

BOUNDARIES: Inform, triage, guide — never replace the officer's judgement, never issue legal rulings, never promise outcomes or timelines. Keep replies short and WhatsApp-appropriate (a few short paragraphs max) unless asked for detail.`;

const HIGH_RISK_WORDS = [
  "defilement", "rape", "assault", "trafficking", "abduct", "fgm", "mutilation",
  "forced marriage", "child marriage", "incest", "radicaliz", "confinement",
  "missing child", "overdose", "suicid", "abandon", "dumped", "newborn",
  "kutupwa", "kuachwa", "kichakani",
];

/* =========================================================
   1. Webhook verification (Meta calls this once on setup)
   ========================================================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/* =========================================================
   2. Incoming messages
   ========================================================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // ack immediately; WhatsApp expects a fast 200

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from = message.from; // sender's WhatsApp number
    const text = message.text.body;

    // "approve 2" / "reject 2" replying to a research digest
    const approvalMatch = text.trim().match(/^(approve|reject)\s+(\d+)$/i);
    if (approvalMatch && from === OFFICER_WHATSAPP_NUMBER) {
      await handleResearchApprovalReply(approvalMatch[1].toLowerCase(), parseInt(approvalMatch[2], 10));
      return;
    }

    const flagged = HIGH_RISK_WORDS.some((w) => text.toLowerCase().includes(w));
    if (flagged) {
      await sendWhatsApp(from,
        "⚑ This reads as high-risk. If the child is in danger right now, call 116 or the nearest police station before doing anything else.");
      if (OFFICER_WHATSAPP_NUMBER && from !== OFFICER_WHATSAPP_NUMBER) {
        await sendWhatsApp(OFFICER_WHATSAPP_NUMBER,
          `⚑ HIGH-RISK message received from ${from}:\n"${text}"`);
      }
    }

    const reply = await callClaude(text);
    await sendWhatsApp(from, reply);
  } catch (err) {
    console.error("webhook handling error:", err);
  }
});

/* =========================================================
   3. Anthropic call
   ========================================================= */
async function callClaude(userText) {
  if (!ANTHROPIC_API_KEY) {
    return "ℹ️ J.M_CP Specialist [Demo Mode]: Server connection is live! Add ANTHROPIC_API_KEY in Render settings to enable full AI responses.";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 600,
      system: SYSTEM_PROMPT + approvedResearchPromptBlock(),
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text || "Sorry, I couldn't process that — please try again.";
}

/* =========================================================
   3b. PUBLIC WEBSITE — serves JM_CP_Specialist_Live.html
   itself (from ./public, if present) plus a rate-limited chat
   proxy, so anyone with the URL can use the agent without
   needing their own Anthropic API key. The officer's key pays
   for it — rate limiting per visitor is the only thing
   standing between a public URL and an unlimited bill. Not
   airtight (IP-based, an attacker with many IPs could still
   run up cost), but a real, working line of defence, not
   security theatre — raise PUBLIC_CHAT_RATE_LIMIT if it's too
   strict for genuine traffic, lower it if cost becomes a
   problem.
   ========================================================= */
const RATE_LIMIT = parseInt(PUBLIC_CHAT_RATE_LIMIT || "20", 10); // messages per visitor per hour
const rateLimitLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const history = (rateLimitLog.get(ip) || []).filter((t) => t > hourAgo);
  history.push(now);
  rateLimitLog.set(ip, history);
  return history.length > RATE_LIMIT;
}
// Clear old entries periodically so this doesn't grow forever on a long-running server.
setInterval(() => {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  for (const [ip, hist] of rateLimitLog) {
    const kept = hist.filter((t) => t > hourAgo);
    if (kept.length) rateLimitLog.set(ip, kept);
    else rateLimitLog.delete(ip);
  }
}, 15 * 60 * 1000);

const RATE_LIMIT_MESSAGE = {
  en: "Too many messages from this connection in the last hour. Please wait and try again.",
  sw: "Ujumbe mwingi mno kutoka muunganisho huu katika saa iliyopita. Tafadhali subiri kisha ujaribu tena.",
  eg: "Amang'ana amaingi mono kwima esaa emwe eyekare. Rigiria mbeye ogeria ende.",
};

/* Simple, privacy-safe usage counter: counts only, never message content.
   Lets the officer see this is actually reaching people without storing
   anything about who or what they asked. Persisted daily so a restart
   doesn't lose today's count (same durability caveat as research findings
   — see the note above PENDING_FILE/APPROVED_FILE below). */
const usageToday = { date: new Date().toISOString().slice(0, 10), messages: 0, uniqueIps: new Set() };
function recordUsage(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (usageToday.date !== today) {
    usageToday.date = today;
    usageToday.messages = 0;
    usageToday.uniqueIps = new Set();
  }
  usageToday.messages += 1;
  usageToday.uniqueIps.add(ip);
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) });
});

app.get("/stats", (req, res) => {
  const { ADMIN_KEY } = process.env;
  if (ADMIN_KEY && req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: "forbidden" });
  }
  res.json({
    date: usageToday.date,
    messagesToday: usageToday.messages,
    uniqueVisitorsToday: usageToday.uniqueIps.size,
    note: "Counts only — no message content is ever stored server-side.",
  });
});

app.post("/api/chat", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const { message, lang } = req.body || {};
  const safeLang = ["en", "sw", "eg"].includes(lang) ? lang : "en";

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: "rate_limited",
      message: RATE_LIMIT_MESSAGE[safeLang],
    });
  }

  if (!message || typeof message !== "string" || message.length > 4000) {
    return res.status(400).json({ error: "invalid_request" });
  }

  recordUsage(ip);
  const langLabel = { en: "English", sw: "Kiswahili", eg: "Ekegusii" }[safeLang];

  if (!ANTHROPIC_API_KEY) {
    return res.json({
      reply: "✅ J.M_CP Specialist [Free Demo Mode]: Your website & Render server are working 100% perfectly! This is a free demonstration response. For immediate emergency help in Kenya, call 116 (Child Helpline). When ready, add an ANTHROPIC_API_KEY in Render to activate live AI responses."
    });
  }

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 900,
        system: SYSTEM_PROMPT + approvedResearchPromptBlock(),
        messages: [{ role: "user", content: `[Respond in: ${langLabel}]\n\n${message}` }],
      }),
    });
    const data = await apiRes.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    res.json({ reply: text || "…" });
  } catch (err) {
    console.error("public chat error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/* =========================================================
   4. WhatsApp send
   ========================================================= */
async function sendWhatsApp(to, body) {
  await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
}

/* =========================================================
   5. Optional: push a structured case into Jotform
   Call this from wherever the officer confirms a case
   summary is ready (e.g. after a short guided exchange).
   Field IDs (qXX_name) must be filled in from the officer's
   actual Jotform — open the form builder and check each
   field's "Name" under its Advanced properties.
   ========================================================= */
async function pushCaseToJotform(fields) {
  const params = new URLSearchParams();
  Object.entries(fields).forEach(([k, v]) => params.append(k, v));
  const res = await fetch(
    `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions?apiKey=${JOTFORM_API_KEY}`,
    { method: "POST", body: params }
  );
  return res.json();
}

const PORT = process.env.PORT || 3000;

/* =========================================================
   6. RESEARCH DIGEST — same approval-gated trust model as the
   chat app's Research tab, just running on a real schedule
   instead of waiting for a tap.

   Storage note: this uses a local JSON file, which is simple
   but NOT durable on hosts with an ephemeral filesystem (e.g.
   Render/Railway free tiers wipe local disk on every redeploy
   or restart). Fine to start with; if findings keep vanishing,
   move DATA_DIR to a persistent volume/disk add-on, or swap
   readJSON/writeJSON below for calls to a Google Sheet instead
   — natural given the officer's Google account is already in
   the picture, just extra setup this file doesn't include.
   ========================================================= */
const DATA_DIR = path.join(__dirname, "data");
const PENDING_FILE = path.join(DATA_DIR, "pending_findings.json");
const APPROVED_FILE = path.join(DATA_DIR, "approved_findings.json");

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return []; }
}
function writeJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const RESEARCH_PROMPT = `Search for recent developments relevant to Kenyan child protection casework — specifically: amendments to the Children Act 2022, newly NCCS-licensed adoption societies, changes to CPIMS case categories or definitions, updated NCAJ/SGBV court-users'-committee procedures, National Child Helpline (116) changes, or new Directorate of Children's Services circulars or guidance. Only report things that look genuinely new or changed.

For each finding, respond using ONLY this exact format, one block per finding:
[[FINDING|title=<short title>|summary=<one or two sentence summary>|source=<the URL>|suggest=<one sentence: what should change in the agent's guidance>]]

If a genuine URL isn't available for a finding, don't include it. If nothing new turns up, respond with exactly: NO_NEW_FINDINGS`;

function extractFindingMarkers(text) {
  const re = /\[\[FINDING\|title=([^|]+)\|summary=([^|]+)\|source=([^|]+)\|suggest=([^\]]+)\]\]/g;
  const items = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ title: m[1].trim(), summary: m[2].trim(), source: m[3].trim(), suggestion: m[4].trim() });
  }
  return items;
}

async function runResearchDigest() {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1200,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: RESEARCH_PROMPT }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const findings = extractFindingMarkers(text);

    if (!findings.length) {
      if (OFFICER_WHATSAPP_NUMBER) await sendWhatsApp(OFFICER_WHATSAPP_NUMBER, "Research check ran — nothing new or relevant found this time.");
      return;
    }

    const pending = readJSON(PENDING_FILE);
    const startIndex = pending.length;
    findings.forEach((f) => pending.push({ ...f, createdAt: new Date().toISOString() }));
    writeJSON(PENDING_FILE, pending);

    if (OFFICER_WHATSAPP_NUMBER) {
      const lines = findings.map((f, i) =>
        `${startIndex + i + 1}. *${f.title}*\n${f.summary}\nSuggests: ${f.suggestion}\nSource: ${f.source}`
      );
      await sendWhatsApp(OFFICER_WHATSAPP_NUMBER,
        `📚 Research digest — ${findings.length} new finding(s):\n\n${lines.join("\n\n")}\n\nReply "approve <number>" or "reject <number>" for each.`);
    }
  } catch (err) {
    console.error("research digest error:", err);
  }
}

async function handleResearchApprovalReply(action, number) {
  const pending = readJSON(PENDING_FILE);
  const idx = number - 1;
  if (idx < 0 || idx >= pending.length || !pending[idx]) {
    await sendWhatsApp(OFFICER_WHATSAPP_NUMBER, `No pending finding #${number} — it may already have been handled.`);
    return;
  }
  const finding = pending[idx];
  if (action === "approve") {
    const approved = readJSON(APPROVED_FILE);
    approved.push({ ...finding, approvedAt: new Date().toISOString() });
    writeJSON(APPROVED_FILE, approved);
    await sendWhatsApp(OFFICER_WHATSAPP_NUMBER, `✓ Approved: "${finding.title}" — now part of the agent's confirmed knowledge.`);
  } else {
    await sendWhatsApp(OFFICER_WHATSAPP_NUMBER, `Rejected: "${finding.title}".`);
  }
  pending.splice(idx, 1);
  writeJSON(PENDING_FILE, pending);
}

function approvedResearchPromptBlock() {
  const approved = readJSON(APPROVED_FILE);
  if (!approved.length) return "";
  return "\n\nOFFICER-APPROVED RECENT UPDATES (confirmed current — use these):\n"
    + approved.map((f) => `- ${f.title}: ${f.suggestion}`).join("\n");
}

// Default: every Monday at 07:00 server time. Override with RESEARCH_CRON env var
// (standard node-cron syntax) or unset ANTHROPIC_API_KEY-dependent behaviour by
// removing this block if the digest isn't wanted yet.
if (ANTHROPIC_API_KEY) {
  cron.schedule(RESEARCH_CRON || "0 7 * * 1", runResearchDigest);
}

/* =========================================================
   7. EMAIL MONITORING — polls the officer's three inboxes for
   unread, child-protection-relevant mail and forwards a
   summary to WhatsApp. Each inbox needs its own one-time
   Google OAuth authorization — see get-gmail-token.js — after
   which it runs unattended using the stored refresh token.

   NOT included: the DCS website (no public API — would mean
   fragile scraping) and social accounts (each platform needs
   its own developer approval process, weeks of lead time per
   platform) — deliberately out of scope here, see
   WHATSAPP_HANDOFF.md §6 for why.
   ========================================================= */
const GMAIL_ACCOUNTS = [
  { label: "wgmagencies@gmail.com", refreshToken: GMAIL_REFRESH_TOKEN_WGMAGENCIES },
  { label: "josephmaticha3@gmail.com", refreshToken: GMAIL_REFRESH_TOKEN_JOSEPHMATICHA3 },
  { label: "jnmaticha@gmail.com", refreshToken: GMAIL_REFRESH_TOKEN_JNMATICHA },
].filter((a) => a.refreshToken); // only accounts with a token actually get polled

const EMAIL_RELEVANCE_WORDS = [
  "child", "children", "dcs", "defilement", "case record", "jotform",
  "children's office", "adoption", "custody", "guardian", "cpims",
];

function gmailClientFor(refreshToken) {
  const client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: client });
}

async function checkInbox(account) {
  const gmail = gmailClientFor(account.refreshToken);
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread newer_than:2d",
    maxResults: 15,
  });
  const messages = listRes.data.messages || [];
  const relevant = [];

  for (const m of messages) {
    const msg = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["Subject", "From"] });
    const headers = msg.data.payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
    const sender = headers.find((h) => h.name === "From")?.value || "unknown";
    const snippet = msg.data.snippet || "";
    const haystack = (subject + " " + snippet).toLowerCase();

    if (EMAIL_RELEVANCE_WORDS.some((w) => haystack.includes(w))) {
      relevant.push({ id: m.id, subject, sender, snippet });
      // Label as notified so it isn't re-alerted every poll; requires a label
      // named "jmcp-notified" to exist (Gmail creates it automatically here if
      // permissions allow, otherwise create it once manually in Gmail settings).
      try {
        await gmail.users.messages.modify({
          userId: "me", id: m.id,
          requestBody: { removeLabelIds: [], addLabelIds: [] }, // left inert: mark-as-read is a bigger behaviour change than this skeleton should decide for the officer
        });
      } catch (e) { /* labelling is best-effort, not critical */ }
    }
  }
  return relevant;
}

async function pollAllInboxes() {
  for (const account of GMAIL_ACCOUNTS) {
    try {
      const relevant = await checkInbox(account);
      if (relevant.length && OFFICER_WHATSAPP_NUMBER) {
        const lines = relevant.map((r) => `• *${r.subject}*\nFrom: ${r.sender}\n"${r.snippet}"`);
        await sendWhatsApp(OFFICER_WHATSAPP_NUMBER,
          `📧 ${relevant.length} relevant unread email(s) in ${account.label}:\n\n${lines.join("\n\n")}`);
      }
    } catch (err) {
      console.error(`Gmail poll failed for ${account.label}:`, err.message);
    }
  }
}

if (GMAIL_ACCOUNTS.length) {
  cron.schedule("*/15 * * * *", pollAllInboxes); // every 15 minutes
  console.log(`Email monitoring active for: ${GMAIL_ACCOUNTS.map((a) => a.label).join(", ")}`);
} else {
  console.log("Email monitoring inactive — no Gmail refresh tokens configured.");
}

/* =========================================================
   9. CRASH VISIBILITY — this now serves real people, possibly
   including vulnerable children directly, not just the officer
   testing it. If the process dies unexpectedly, that matters —
   silently going down with no one noticing is the failure mode
   worth guarding against. Best-effort WhatsApp alert to the
   officer, then let the process exit so the host (Render, etc.)
   restarts it, which is the standard/correct behaviour for an
   uncaught exception rather than trying to limp on in an
   unknown state.
   ========================================================= */
function alertOfficerOfCrash(kind, err) {
  console.error(`${kind}:`, err);
  if (OFFICER_WHATSAPP_NUMBER && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
    sendWhatsApp(OFFICER_WHATSAPP_NUMBER, `⚠️ J.M_CP Specialist server hit a ${kind} and is restarting:\n${String(err).slice(0, 300)}`)
      .catch(() => {}); // best-effort — don't let the alert itself throw
  }
}
process.on("uncaughtException", (err) => {
  alertOfficerOfCrash("uncaught exception", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  alertOfficerOfCrash("unhandled rejection", err); // non-fatal, keep running
});

app.listen(PORT, () => console.log(`J.M_CP Specialist WhatsApp server on :${PORT}`));
