#!/usr/bin/env node
/**
 * One-time setup: authorizes Google access and saves refresh tokens to
 * ~/.config/mcp-gateway/google-tokens.json
 *
 * Run this whenever tokens expire (testing-mode OAuth apps expire every 7 days).
 * Usage: node scripts/google-auth-setup.mjs
 */

import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const CREDENTIALS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-credentials.json');
const TOKENS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-tokens.json');
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

const tokens = await new Promise((resolve, reject) => {
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

mkdirSync(join(homedir(), '.config', 'mcp-gateway'), { recursive: true });
writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
console.log(`\nTokens saved to ${TOKENS_PATH}`);
console.log('Done! Restart the gateway to apply.');
