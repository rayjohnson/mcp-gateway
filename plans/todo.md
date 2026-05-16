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
