#!/usr/bin/env node
/**
 * Serializing wrapper for mcp-remote OAuth servers.
 *
 * mcp-remote has a race condition: when 1mcp sends multiple MCP requests
 * concurrently (tools/list, resources/list, prompts/list), each one that
 * receives a 401 starts its own auth flow before the first one finishes.
 * Each flow generates a different PKCE code_challenge, creating a mismatch
 * when the OAuth callback arrives.
 *
 * This wrapper queues client requests and sends them one at a time to
 * mcp-remote, so only one auth flow ever starts. Notifications pass through
 * immediately in both directions. Server-initiated requests from mcp-remote
 * also pass through immediately.
 *
 * Usage: node oauth-mcp-wrapper.mjs <server-url> [mcp-remote-args...]
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const [,, ...args] = process.argv;
if (args.length === 0) {
  process.stderr.write('Usage: oauth-mcp-wrapper.mjs <server-url> [mcp-remote-args...]\n');
  process.exit(1);
}

const child = spawn('npx', ['-y', 'mcp-remote', ...args], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  process.stderr.write(`mcp-remote error: ${err.message}\n`);
  process.exit(1);
});

// Queue of pending client requests waiting to be sent to mcp-remote.
// Each entry: { line: string, id: any, onComplete: () => void }
const queue = [];
let pendingId = null; // id of the request currently in-flight to mcp-remote

function drainQueue() {
  if (pendingId !== null || queue.length === 0) return;
  const next = queue.shift();
  pendingId = next.id;
  child.stdin.write(next.line + '\n');
}

// Messages from 1mcp → mcp-remote
const parentRl = createInterface({ input: process.stdin, crlfDelay: Infinity });

parentRl.on('line', (line) => {
  if (!line.trim()) return;

  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const isClientRequest = msg.method !== undefined && msg.id !== undefined;

  if (isClientRequest) {
    // Queue it; send when the current in-flight request completes.
    queue.push({ line, id: msg.id });
    drainQueue();
  } else {
    // Notification (no id) or response to a server-initiated request: pass through immediately.
    child.stdin.write(line + '\n');
  }
});

parentRl.on('close', () => child.stdin.end());

// Messages from mcp-remote → 1mcp
const childRl = createInterface({ input: child.stdout, crlfDelay: Infinity });

childRl.on('line', (line) => {
  if (!line.trim()) return;

  let msg;
  try { msg = JSON.parse(line); } catch {
    process.stdout.write(line + '\n');
    return;
  }

  // Always forward to 1mcp.
  process.stdout.write(line + '\n');

  // If this is a response to the current in-flight client request, unblock the queue.
  const isResponse = msg.method === undefined && (msg.result !== undefined || msg.error !== undefined);
  if (isResponse && msg.id === pendingId) {
    pendingId = null;
    drainQueue();
  }
});
