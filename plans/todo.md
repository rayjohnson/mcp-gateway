# MCP Gateway — To Do

## Google Services (Gmail, Google Calendar, Google Drive)
Tool calls fail with `Error: Incompatible auth server: does not support dynamic client
registration`. Google's OAuth server (`accounts.google.com`) does not implement Dynamic
Client Registration (RFC 7591), which is the only auth mechanism `mcp-remote` supports
for headless/daemon contexts.

**Current state:** Connections initialize and tools list successfully, but all tool calls
time out after 30s as mcp-remote loops on failed auth attempts.

**Fix options:**
1. Wait for `mcp-remote` to support pre-configured bearer tokens or standard OAuth2 PKCE
   flows without DCR.
2. Switch to local MCP packages that handle Google OAuth with stored refresh tokens
   (e.g. `@modelcontextprotocol/server-gdrive` requires a pre-obtained credentials JSON).
3. Remove these servers from the gateway and rely on the claude.ai direct integrations
   (which handle Google auth separately and work fine in Claude Code).

**Workaround:** All three services work normally via claude.ai's direct integrations in
Claude Code. They are broken only in Claude Desktop (which connects exclusively via the
gateway).

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
