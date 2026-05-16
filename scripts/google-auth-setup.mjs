#!/usr/bin/env node
/**
 * Authorizes Google access and saves tokens to ~/.config/mcp-gateway/google-tokens.json
 *
 * Called automatically by google-mcp-wrapper.mjs when tokens expire.
 * Can also be run manually: node scripts/google-auth-setup.mjs
 */

import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { createServer } from 'http';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const CREDENTIALS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-credentials.json');
const TOKENS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-tokens.json');
const LOCK_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-reauth-pending');
const REDIRECT_PORT = 3051;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'openid',
  'email',
  'profile',
];

let credentials;
try {
  const raw = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  credentials = raw.installed || raw.web;
} catch {
  console.error(`Cannot read credentials from ${CREDENTIALS_PATH}`);
  console.error('Run: op document get "Google OAuth Client - MCP Gateway" --vault Ray --output ~/.config/mcp-gateway/google-credentials.json');
  rmSync(LOCK_PATH, { force: true });
  process.exit(1);
}

const client = new OAuth2Client({
  clientId: credentials.client_id,
  clientSecret: credentials.client_secret,
  redirectUri: REDIRECT_URI,
});

const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\nOpening browser for Google authorization...');
console.log('If the browser does not open, visit:\n');
console.log(authUrl + '\n');
try { execSync(`open "${authUrl}"`); } catch {}

let tokens;
try {
  tokens = await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const params = new URL(req.url, REDIRECT_URI).searchParams;
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        res.end(`<html><body><h2>Authorization denied: ${error}</h2></body></html>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (!code) {
        res.end('<html><body><h2>No code received.</h2></body></html>');
        return;
      }

      res.end('<html><body><h2>Authorization complete! You can close this tab.</h2></body></html>');
      server.close();

      try {
        const { tokens } = await client.getToken({ code, redirect_uri: REDIRECT_URI });
        resolve(tokens);
      } catch (err) {
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, 'localhost', () => {
      console.log(`Waiting for callback on ${REDIRECT_URI} ...`);
    });
    server.on('error', reject);
  });
} catch (err) {
  console.error(`Auth failed: ${err.message}`);
  rmSync(LOCK_PATH, { force: true });
  process.exit(1);
}

mkdirSync(join(homedir(), '.config', 'mcp-gateway'), { recursive: true });
// Store issued_at so the wrapper can proactively re-auth before the 7-day expiry
writeFileSync(TOKENS_PATH, JSON.stringify({ ...tokens, issued_at: Date.now() }, null, 2), { mode: 0o600 });
rmSync(LOCK_PATH, { force: true });
console.log(`\nTokens saved to ${TOKENS_PATH}`);

// Restart the gateway so 1mcp picks up the fresh tokens
try {
  execSync('launchctl stop com.rayjohnson.mcp-gateway');
  execSync('launchctl start com.rayjohnson.mcp-gateway');
  console.log('Gateway restarted — Google services restored.');
} catch {
  console.log('Done! Restart the gateway manually to apply: launchctl stop com.rayjohnson.mcp-gateway && launchctl start com.rayjohnson.mcp-gateway');
}
