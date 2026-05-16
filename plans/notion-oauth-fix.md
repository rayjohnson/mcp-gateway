# Notion (and Linear/Honeycomb) OAuth Callback Fix

## Problem

When 1mcp starts, it sends multiple MCP requests simultaneously to each server
(tools/list, resources/list, prompts/list). For unauthenticated servers, every
one of these requests gets a 401 from Notion. Each concurrent 401 triggers
mcp-remote's lazy auth initializer (`createLazyAuthCoordinator`) before the
first one has finished setting up. The result:

- Three separate auth flows start in parallel
- Each generates a different PKCE `code_challenge`
- Each tries to start a callback server on port 9553
- Only the first one succeeds in binding; the others fall back to random ports
- The browser opens multiple times with different auth URLs
- If the user clicks one URL, Notion redirects to port 9553 — but the PKCE
  verifier stored at port 9553 doesn't match the URL the user clicked
- Auth fails; the cycle repeats

The callback server IS kept alive in mcp-remote's memory after a successful
auth (`authState` is cached). The problem is that a successful auth never
completes because the race condition prevents it.

Additionally, 1mcp has `requestTimeout: 30000` which cancels requests after 30
seconds, further disrupting the auth flow.

## Root Cause

mcp-remote's `initializeAuth` function has a race condition — it checks
`if (authState)` but `authState` is only set *after* `coordinateAuth` resolves.
Multiple concurrent callers all see `null` and each starts their own auth flow.
We can't patch mcp-remote directly (it's an npx package).

## Solution: Request-Serializing Wrappers

Write a thin Node.js wrapper (`wrappers/oauth-mcp-wrapper.mjs`) that sits
between 1mcp and the real mcp-remote. The wrapper:

1. Accepts stdio from 1mcp (appears to be mcp-remote from 1mcp's perspective)
2. Spawns the real mcp-remote as a child process
3. **Queues MCP requests** — sends only one request at a time to mcp-remote,
   waits for the response before sending the next
4. Forwards notifications (no `id` field) immediately without queuing

With serialization, only ONE request hits mcp-remote during the unauthenticated
state. Only ONE auth flow starts. One PKCE challenge. One callback server on
port 9553. The user sees one browser window. The callback lands correctly. Auth
succeeds. All subsequent queued requests flow through on the authenticated
connection.

After auth succeeds, the callback server on port 9553 stays alive in
mcp-remote's memory for the life of the process — ready for future re-auths.

## Also Fix: requestTimeout

Increase `requestTimeout` in `mcp.json` from 30s to 300s so 1mcp doesn't
cancel requests mid-auth.

## Files to Create/Change

1. **`wrappers/oauth-mcp-wrapper.mjs`** — the generic serializing wrapper
   - Parses newline-delimited JSON-RPC frames from stdin
   - Distinguishes requests (have `id`) from notifications (no `id`)
   - Queues requests; forwards notifications immediately
   - Matches responses back to queued requests by `id`
   - Passes mcp-remote stderr through unchanged (so auth URLs/prompts still show)

2. **`mcp.json`** — update three servers to use the wrapper:
   ```
   notion:    node wrappers/oauth-mcp-wrapper.mjs https://mcp.notion.com/mcp
   linear:    node wrappers/oauth-mcp-wrapper.mjs https://mcp.linear.app/mcp
   honeycomb: node wrappers/oauth-mcp-wrapper.mjs https://mcp.honeycomb.io/mcp
   ```
   Also change `requestTimeout: 30000` → `requestTimeout: 300000`

## What This Does NOT Change

- Port 9553 is still mcp-remote's callback port (no conflict, no relay needed)
- No patching of mcp-remote
- No separate persistent process to manage
- Slack is already broken for a different reason (see todo.md), skip for now

## Open Question Before Starting

The serialization adds latency during normal (post-auth) operation: 1mcp's
burst of capability queries at session start will be sequential instead of
parallel. In practice this means startup is ~3× slower (three sequential
round-trips instead of one parallel burst). This is probably fine — it only
affects the moment Claude opens — but worth confirming.
