#!/usr/bin/env node
/**
 * Direct HTTP proxy to Google MCP API with automatic token refresh.
 *
 * Replaces the previous approach of passing a static Bearer token to
 * mcp-remote. Instead, this wrapper acts as a first-class MCP-over-HTTP
 * bridge: it calls client.getAccessToken() for every outbound request,
 * which silently uses the stored refresh token whenever the 1-hour access
 * token has expired. The process never needs to restart for token refresh.
 *
 * Full re-auth (invalid_grant / refresh token revoked) still triggers the
 * existing browser-based re-auth flow.
 *
 * Usage (via mcp.json): node wrappers/google-mcp-wrapper.mjs <mcp-url>
 */

import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { createInterface } from 'node:readline';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-credentials.json');
const TOKENS_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-tokens.json');
const LOCK_PATH = join(homedir(), '.config', 'mcp-gateway', 'google-reauth-pending');
const SETUP_SCRIPT = join(__dirname, '..', 'scripts', 'google-auth-setup.mjs');
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
if (tokens.issued_at && Date.now() - tokens.issued_at > REAUTH_AFTER_MS) {
  triggerReauth('tokens are 6 days old and will expire soon');
}

const client = new OAuth2Client({
  clientId: credentials.client_id,
  clientSecret: credentials.client_secret,
  redirectUri: 'http://localhost:3051',
});
client.setCredentials(tokens);

// Verify we can get a token at startup before accepting any MCP traffic.
try {
  await client.getAccessToken();
} catch (err) {
  if (err.message?.includes('invalid_grant') || err.response?.data?.error === 'invalid_grant') {
    triggerReauth('refresh token expired');
  }
  process.stderr.write(`google-mcp-wrapper: failed to get access token: ${err.message}\n`);
  process.exit(1);
}

async function getFreshToken() {
  try {
    const { token } = await client.getAccessToken();
    return token;
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.response?.data?.error === 'invalid_grant') {
      triggerReauth('refresh token expired');
    }
    throw err;
  }
}

// MCP Streamable HTTP session — established on first initialize response.
let sessionId = null;

// Track in-flight requests so we can abort them on notifications/cancelled.
const pendingAborts = new Map();

async function forwardToGoogle(msg) {
  const token = await getFreshToken();
  const controller = new AbortController();
  if (msg.id !== undefined) pendingAborts.set(msg.id, controller);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${token}`,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(msg),
      signal: controller.signal,
    });

    const newSession = res.headers.get('mcp-session-id');
    if (newSession) sessionId = newSession;

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // Stream SSE events line by line to stdout.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines.
        const parts = buf.split('\n\n');
        buf = parts.pop();

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data) process.stdout.write(data + '\n');
            }
          }
        }
      }
    } else {
      const text = await res.text();
      if (text.trim()) process.stdout.write(text.trim() + '\n');
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    throw err;
  } finally {
    if (msg.id !== undefined) pendingAborts.delete(msg.id);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  // Cancel an in-flight request when 1mcp sends notifications/cancelled.
  if (msg.method === 'notifications/cancelled' && msg.params?.requestId !== undefined) {
    const controller = pendingAborts.get(msg.params.requestId);
    if (controller) {
      controller.abort();
      pendingAborts.delete(msg.params.requestId);
    }
    return;
  }

  forwardToGoogle(msg).catch((err) => {
    process.stderr.write(`google-mcp-wrapper: ${err.message}\n`);
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32000, message: err.message },
      }) + '\n');
    }
  });
});

rl.on('close', () => process.exit(0));
