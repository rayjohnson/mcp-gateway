#!/usr/bin/env node
/**
 * Runtime wrapper for Google MCP servers.
 *
 * Gets an OAuth access token from stored credentials and passes it to mcp-remote.
 * If tokens are expired or within 1 day of expiry, automatically triggers re-auth:
 *   - Opens the browser for the OAuth flow
 *   - Shows a macOS notification
 *   - Exits so 1mcp retries the server after auth completes
 *
 * Usage (via mcp.json): node wrappers/google-mcp-wrapper.mjs <mcp-url>
 */

import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-credentials.json');
const TOKENS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-tokens.json');
const LOCK_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-reauth-pending');
const SETUP_SCRIPT = join(__dirname, '..', 'scripts', 'google-auth-setup.mjs');

// Trigger re-auth 1 day before the 7-day testing-mode expiry
const REAUTH_AFTER_MS = 6 * 24 * 60 * 60 * 1000;

const url = process.argv[2];
if (!url) {
  process.stderr.write('Usage: google-mcp-wrapper.mjs <mcp-url>\n');
  process.exit(1);
}

function triggerReauth(reason) {
  if (existsSync(LOCK_PATH)) {
    process.stderr.write(`google-mcp-wrapper: re-auth already in progress (${reason})\n`);
    process.exit(1);
  }

  writeFileSync(LOCK_PATH, String(Date.now()));
  process.stderr.write(`google-mcp-wrapper: ${reason} — opening browser for re-authorization\n`);

  try {
    execSync(
      `osascript -e 'display notification "Sign in to restore Gmail, Calendar & Drive tools." with title "MCP Gateway: Google auth expired"'`
    );
  } catch {}

  const child = spawn('node', [SETUP_SCRIPT], { detached: true, stdio: 'ignore' });
  child.unref();
  process.exit(1);
}

let credentials, tokens;

try {
  const raw = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  credentials = raw.installed || raw.web;
} catch {
  process.stderr.write(`google-mcp-wrapper: cannot read ${CREDENTIALS_PATH}\n`);
  process.exit(1);
}

try {
  tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
} catch {
  triggerReauth('no tokens found');
}

// Proactively re-auth if tokens are 6+ days old (expiry is at 7 days for testing-mode apps)
if (tokens.issued_at && Date.now() - tokens.issued_at > REAUTH_AFTER_MS) {
  triggerReauth('tokens are 6 days old and will expire soon');
}

const client = new OAuth2Client({
  clientId: credentials.client_id,
  clientSecret: credentials.client_secret,
  redirectUri: 'http://localhost:3051',
});
client.setCredentials(tokens);

let token;
try {
  ({ token } = await client.getAccessToken());
} catch (err) {
  const isExpired = err.message?.includes('invalid_grant') ||
    err.response?.data?.error === 'invalid_grant';
  if (isExpired) {
    triggerReauth('refresh token expired');
  }
  process.stderr.write(`google-mcp-wrapper: failed to get access token: ${err.message}\n`);
  process.exit(1);
}

const child = spawn(
  'npx',
  ['-y', 'mcp-remote', url, '--header', `Authorization: Bearer ${token}`],
  { stdio: 'inherit', env: process.env }
);

child.on('exit', (code) => process.exit(code ?? 0));
