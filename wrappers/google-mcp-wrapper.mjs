#!/usr/bin/env node
/**
 * Runtime wrapper for Google MCP servers.
 * Reads stored OAuth tokens, refreshes the access token, and passes it to mcp-remote.
 *
 * If tokens are missing or expired beyond refresh, exit non-zero so 1mcp surfaces the error.
 * Re-authorize by running: node scripts/google-auth-setup.mjs
 *
 * Usage (via mcp.json): node wrappers/google-mcp-wrapper.mjs <mcp-url>
 */

import { OAuth2Client } from 'google-auth-library';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

const CREDENTIALS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-credentials.json');
const TOKENS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-tokens.json');

const url = process.argv[2];
if (!url) {
  process.stderr.write('Usage: google-mcp-wrapper.mjs <mcp-url>\n');
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
  process.stderr.write(
    `google-mcp-wrapper: no tokens at ${TOKENS_PATH}\n` +
    `Run: node scripts/google-auth-setup.mjs\n`
  );
  process.exit(1);
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
  process.stderr.write(
    `google-mcp-wrapper: failed to get access token: ${err.message}\n` +
    `Re-authorize by running: node scripts/google-auth-setup.mjs\n`
  );
  process.exit(1);
}

const child = spawn(
  'npx',
  ['-y', 'mcp-remote', url, '--header', `Authorization: Bearer ${token}`],
  { stdio: 'inherit', env: process.env }
);

child.on('exit', (code) => process.exit(code ?? 0));
