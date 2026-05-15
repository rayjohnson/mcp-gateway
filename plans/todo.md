# MCP Gateway — To Do

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
