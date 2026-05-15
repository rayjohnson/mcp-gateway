# MCP Gateway — To Do

## Linear
The `linear-mcp-server` package (deprecated) has a response format bug — `list_issues`
returns structured objects where the MCP protocol expects strings, causing a `-32602`
validation error.

**Fix options:**
1. Switch to Linear's official remote MCP at `https://mcp.linear.app/mcp` via `mcp-remote`
   (OAuth-based, same pattern as Notion/Honeycomb — no API key needed).
2. Find an actively maintained local Linear MCP package that handles response formatting correctly.

Option 1 is the obvious path given we've already moved other services to remote MCPs.

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
