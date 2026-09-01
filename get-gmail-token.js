/**
 * Run this ONCE PER INBOX to get the refresh token server.js needs
 * for email monitoring. Not part of the running server — a
 * developer runs it manually on their own machine, three times
 * total (once for wgmagencies@, once for josephmaticha3@, once
 * for jnmaticha@gmail.com), signing in as that inbox each time.
 *
 * One-time setup before running this at all:
 *   1. Go to console.cloud.google.com → create a project (or use an
 *      existing one).
 *   2. Enable the "Gmail API" for that project.
 *   3. Create OAuth 2.0 credentials → "Desktop app" type. Note the
 *      Client ID and Client Secret — these are GMAIL_CLIENT_ID and
 *      GMAIL_CLIENT_SECRET in server.js's env vars (same for all
 *      three inboxes, it's one OAuth app).
 *   4. Add your own email as a "test user" under the OAuth consent
 *      screen if the app is in testing mode (it will be, initially).
 *
 * Usage:
 *   npm install googleapis open
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node get-gmail-token.js
 *
 * It opens a browser, you sign in AS THE INBOX YOU'RE AUTHORIZING,
 * approve access, and the refresh token prints in the terminal.
 * Copy it into the matching env var in server.js's deployment
 * (GMAIL_REFRESH_TOKEN_WGMAGENCIES, etc.) — never commit it to code.
 */

const { google } = require("googleapis");
const http = require("http");
const url = require("url");
const open = require("open");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:53682/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars first — see the comment at the top of this file.");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh token, not just an access token
  prompt: "consent",      // forces a refresh token even on repeat runs
  scope: ["https://www.googleapis.com/auth/gmail.modify"],
});

console.log("Opening browser — sign in AS THE INBOX YOU WANT TO AUTHORIZE.\n");
console.log("If it doesn't open automatically, visit:\n" + authUrl + "\n");
open(authUrl);

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/callback")) return;
  const qs = new url.URL(req.url, REDIRECT_URI).searchParams;
  const code = qs.get("code");
  res.end("Done — you can close this tab and check your terminal.");
  server.close();

  const { tokens } = await oAuth2Client.getToken(code);
  console.log("\n=== Refresh token (copy this into your server's env vars) ===\n");
  console.log(tokens.refresh_token);
  console.log("\n===============================================================\n");
});

server.listen(53682);
