# MCP Gateway

A unified, local-first [Model Context Protocol](https://modelcontextprotocol.io) hub for macOS. Powered by [1MCP](https://github.com/1mcp-app/agent), it aggregates 8+ MCP servers behind a single runtime endpoint so Claude Desktop, Cursor, Gemini, and other AI clients can share one configuration.

## Services

| Server | Package | Tags |
|--------|---------|------|
| iMessage | `imessage-mcp` | communication, macos |
| Obsidian | `@bitbonsai/mcpvault` | knowledge, notes |
| Things 3 | `things3-mcp` | productivity, tasks, macos |
| Gmail | `@gongrzhe/server-gmail-autoauth-mcp` | communication, email |
| Slack | `@modelcontextprotocol/server-slack` | communication, work |
| GitHub | `@modelcontextprotocol/server-github` | development, git |
| Linear | `linear-mcp-server` | development, project-management |
| Notion | `@notionhq/notion-mcp-server` | knowledge, project-management |

## Prerequisites

- macOS (ARM64 or x86_64)
- Node.js 18+
- Things 3 installed with "Enable Things URLs" turned on (Settings → General)
- Terminal app granted **Full Disk Access** in System Settings → Privacy & Security (required for iMessage)
- Docker (optional — only needed if you switch GitHub to the official Docker-based server)

## Installation

### 1. Clone and configure secrets

**Option A — 1Password CLI (recommended):**

```bash
git clone <repo-url> mcp-gateway && cd mcp-gateway
./1password-export.sh          # fetches secrets from vault "MCP Gateway"
```

**Option B — manual:**

```bash
cp .env.example .env
# Edit .env and fill in each token/key
```

### 2. One-time Gmail OAuth setup

Gmail uses file-based OAuth. Run this once before starting the gateway:

```bash
# Place your GCP OAuth client credentials at ~/.gmail-mcp/gcp-oauth.keys.json first
# (Download from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client)
npx @gongrzhe/server-gmail-autoauth-mcp auth
```

This opens a browser window and saves `~/.gmail-mcp/credentials.json` automatically.

### 3. Start the gateway

```bash
./start.sh
```

This installs `@1mcp/agent` globally if needed, then starts the aggregated runtime at `http://127.0.0.1:3050`.

## Connecting AI Clients

### Claude Desktop

Merge the following into `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "1mcp": {
      "url": "http://127.0.0.1:3050/mcp?app=claude-desktop"
    }
  }
}
```

### Cursor

In Cursor settings → MCP, add:

```json
{
  "mcpServers": {
    "1mcp": {
      "url": "http://127.0.0.1:3050/mcp?app=cursor"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add -t http 1mcp "http://127.0.0.1:3050/mcp?app=claude-code"
```

### Any stdio-compatible client

For clients that don't support HTTP/SSE natively, use the stdio proxy instead of the URL above:

```json
{
  "mcpServers": {
    "1mcp": {
      "command": "1mcp",
      "args": ["proxy"]
    }
  }
}
```

## 1Password Setup

Secrets are expected in a vault named **MCP Gateway** with the following items and fields:

| 1Password Item | Field | Maps to |
|----------------|-------|---------|
| Obsidian | `vault_path` | `OBSIDIAN_VAULT_PATH` |
| Things 3 | `auth_token` | `THINGS3_AUTH_TOKEN` |
| Slack MCP | `bot_token` | `SLACK_BOT_TOKEN` |
| Slack MCP | `team_id` | `SLACK_TEAM_ID` |
| GitHub MCP | `personal_access_token` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Linear MCP | `api_key` | `LINEAR_API_KEY` |
| Notion MCP | `token` | `NOTION_TOKEN` |

## Where to Get Each Token

- **Things 3**: Settings → General → Enable Things URLs → Manage
- **Slack**: [api.slack.com/apps](https://api.slack.com/apps) → create app → OAuth & Permissions → install to workspace
- **GitHub**: [github.com/settings/tokens](https://github.com/settings/tokens) (classic or fine-grained)
- **Linear**: linear.app → Settings → API → Personal API keys
- **Notion**: [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → copy secret

## Architecture

See [`plans/architecture.md`](plans/architecture.md) for a full description of how the system is structured.
