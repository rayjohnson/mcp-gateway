# MCP Gateway

A unified, local-first [Model Context Protocol](https://modelcontextprotocol.io) hub for macOS. Powered by [1MCP](https://github.com/1mcp-app/agent), it aggregates 13 MCP servers behind a single runtime endpoint so Claude Desktop, Cursor, Gemini, and other AI clients can share one configuration.

## Services

| Server | Transport | Tags |
|--------|-----------|------|
| iMessage | Local (fastmcp Python script) | communication, macos |
| Obsidian | Local (`mcp-obsidian` via uvx) | knowledge, notes |
| Things 3 | Local (`things3-mcp`) | productivity, tasks, macos |
| Gmail | Remote OAuth (`gmailmcp.googleapis.com`) | communication, email |
| Google Calendar | Remote OAuth (`calendarmcp.googleapis.com`) | communication, calendar, google |
| Google Drive | Remote OAuth (`drivemcp.googleapis.com`) | storage, files, google |
| GitHub | Local (`server-github` + `gh` CLI token) | development, git |
| Linear | Local (`linear-mcp-server`) | development, project-management |
| Notion | Remote OAuth (`mcp.notion.com`) | knowledge, project-management |
| Honeycomb | Remote OAuth (`mcp.honeycomb.io`) | observability, development |
| Home Assistant | Local (`ha-mcp` via uvx) | home, automation |
| 1Password | Local (`op-mcp`) | security, passwords |
| Slack | ⚠️ Pending — see `plans/todo.md` | communication, work |

## Prerequisites

- macOS (ARM64)
- Node.js 18+ and npm (via Homebrew)
- `uv` / `uvx` (for Python-based servers: `brew install uv`)
- `gh` CLI authenticated (`gh auth login`)
- Things 3 installed with "Enable Things URLs" on (Settings → General)
- Obsidian running with the [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) enabled
- Terminal granted **Full Disk Access** in System Settings → Privacy & Security (for iMessage)

## Installation

### 1. Clone and configure secrets

**Option A — 1Password CLI (recommended):**

```bash
git clone <repo-url> mcp-gateway && cd mcp-gateway
./1password-export.sh    # fetches secrets from 1Password vault "MCP Gateway"
```

**Option B — manual:**

```bash
cp .env.example .env
# Edit .env and fill in each token/key
```

### 2. Install as a background daemon (recommended)

Installs the gateway as a launchd user agent — starts at login, restarts automatically on failure:

```bash
npm install -g @1mcp/agent   # install 1mcp globally first
./launchd/install.sh
```

Logs are written to `~/Library/Logs/mcp-gateway/`.

See [Daemon Management](#daemon-management) for start/stop/status commands.

### 3. Or run manually

```bash
./start.sh
```

Starts the gateway in the foreground at `http://127.0.0.1:3050`.

## Connecting AI Clients

All clients connect to the same gateway — just change the `app=` parameter so 1MCP can scope sessions correctly.

### Claude Desktop

Replace the `mcpServers` block in `~/Library/Application Support/Claude/claude_desktop_config.json`.
Claude Desktop requires `mcp-remote` as a bridge for local HTTP servers:

```json
{
  "mcpServers": {
    "1mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3050/mcp?app=claude-desktop", "--allow-http"]
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add -s user -t http 1mcp "http://127.0.0.1:3050/mcp?app=claude-code"
```

### Cursor

In Cursor Settings → MCP:

```json
{
  "mcpServers": {
    "1mcp": {
      "url": "http://127.0.0.1:3050/mcp?app=cursor"
    }
  }
}
```

### Any stdio-compatible client

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

## Daemon Management

The gateway runs as a launchd user agent (`com.rayjohnson.mcp-gateway`).

```bash
# Install / enable (run once)
./launchd/install.sh

# Remove / disable
./launchd/uninstall.sh

# Start / stop without uninstalling
launchctl start com.rayjohnson.mcp-gateway
launchctl stop com.rayjohnson.mcp-gateway

# Check status
launchctl print gui/$(id -u)/com.rayjohnson.mcp-gateway

# Tail logs
tail -f ~/Library/Logs/mcp-gateway/stdout.log
tail -f ~/Library/Logs/mcp-gateway/stderr.log

# Reload after editing mcp.json (hot-reload is supported — a restart is not required)
launchctl stop com.rayjohnson.mcp-gateway && launchctl start com.rayjohnson.mcp-gateway
```

## 1Password Setup

Secrets are stored in a vault named **MCP Gateway**. Run `./1password-export.sh` to populate `.env` from it. Expected items and fields:

| 1Password Item | Field | Env var |
|----------------|-------|---------|
| Obsidian MCP | `api_key`, `host`, `port` | `OBSIDIAN_API_KEY`, `OBSIDIAN_HOST`, `OBSIDIAN_PORT` |
| Things 3 MCP | `auth_token` | `THINGS3_AUTH_TOKEN` |
| Linear MCP | `api_key` | `LINEAR_API_KEY` |
| Home Assistant MCP | `url`, `token` | `HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN` |

GitHub token is pulled automatically from `gh auth token` — no 1Password entry needed.
Gmail, Google Calendar, Google Drive, Notion, Honeycomb use OAuth on first connect — no token stored.

## Architecture

See [`plans/architecture.md`](plans/architecture.md) for a full description of how the system is structured.
See [`plans/todo.md`](plans/todo.md) for known issues and pending work.
