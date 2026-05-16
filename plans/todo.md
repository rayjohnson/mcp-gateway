# MCP Gateway — To Do

## Google Services — Token Expiry (Gmail, Google Calendar, Google Drive)
The Google Cloud OAuth app is in "Testing" publishing status, which limits refresh token
lifetime to 7 days. Tokens must be renewed weekly by running:

```bash
node scripts/google-auth-setup.mjs
```

**To remove the 7-day limit:** Publish the OAuth app in Google Cloud Console → OAuth
consent screen → Publish App. This requires Google's verification review, which involves
submitting the app, providing a privacy policy URL, and waiting for approval (days to
weeks). Not worth it for a personal tool.

---

## Slack
`mcp.slack.com/mcp` uses a proprietary OAuth flow that `mcp-remote` cannot complete
headlessly. The remote MCP approach fails with "Incompatible auth server: does not
support dynamic client registration".

**Fix options:**
1. Create a Slack bot app at api.slack.com/apps, get a `xoxb-` bot token, and switch
   back to `@modelcontextprotocol/server-slack` with `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID`
   in `.env`.
2. Investigate whether Slack publishes a supported mcp-remote-compatible OAuth endpoint.

**Required scopes for option 1:**
`channels:history`, `channels:read`, `groups:history`, `groups:read`,
`im:history`, `im:read`, `mpim:history`, `mpim:read`,
`users:read`, `users:read.email`, `chat:write`, `search:read`

---

## Health Check Script
Add a `./status.sh` that queries the gateway and prints each server as green/red.
Useful after restarts or `brew upgrade` to confirm everything came back up without
having to tail logs.

---

## Pin Dependency Versions
Currently `mcp.json` uses `npx -y package` which always pulls latest. A breaking
upstream update could silently break servers. Pin versions explicitly
(e.g. `npx -y package@1.2.3`) for stability. Audit current versions and lock them in.

---

## Multiple Google Accounts
Support authenticating as more than one Google account simultaneously (e.g., Moov work
account and personal account). Currently a single token file is shared across all three
Google servers, so only one account can be active.

**Approach:**
1. Store separate token files — e.g., `google-tokens-moov.json`, `google-tokens-personal.json`
2. Update `google-mcp-wrapper.mjs` to accept a token-file path as a second argument
3. Update `google-auth-setup.mjs` to accept a `--token-file` flag
4. Add duplicate server entries in `mcp.json` (e.g., `gmail-moov`, `gmail-personal`)

---

## Config Web Dashboard
A local web UI for managing the gateway without touching config files or the CLI.

**Features:**
- List all configured MCP servers with their status (running/stopped/error)
- Show active OAuth tokens and their expiry (Google, Slack, etc.)
- Trigger OAuth re-auth flows (e.g., renew Google tokens) from the browser
- View/edit environment variables and server config
- Tail gateway logs

**Approach:** Small Express/Fastify server bundled with the gateway, served on localhost
(e.g., `http://localhost:3050`). Could be started as a separate launchd service or on-demand.

---

## Additional Servers
Potential additions depending on actual usage:
- **Figma** — design file access
- **Raycast** — if Raycast publishes an MCP server
- **Filesystem** — local file access outside of Obsidian vault
