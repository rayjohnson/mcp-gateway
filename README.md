# MCP Gateway

A unified, local-first [Model Context Protocol](https://modelcontextprotocol.io) hub for macOS. Powered by [1MCP](https://github.com/1mcp-app/agent), it aggregates 12 MCP servers behind a single runtime endpoint so Claude Desktop, Cursor, Gemini, and other AI clients can share one configuration.

## Services

| Server | Transport | Tags |
|--------|-----------|------|
| iMessage | Local (fastmcp Python script) | communication, macos |
| Obsidian | Local (`mcp-obsidian` via uvx) | knowledge, notes |
| Things 3 | Local (`things3-mcp`) | productivity, tasks, macos |
| Gmail | Local wrapper → `gmailmcp.googleapis.com` (Google OAuth) | communication, email |
| Google Calendar | Local wrapper → `calendarmcp.googleapis.com` (Google OAuth) | communication, calendar, google |
| Google Drive | Local wrapper → `drivemcp.googleapis.com` (Google OAuth) | storage, files, google |
| GitHub | Local (`server-github` + `gh` CLI token) | development, git |
| Linear | Remote OAuth (`mcp.linear.app`) | development, project-management |
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
- `gcloud` CLI installed (`brew install google-cloud-sdk`)
- Things 3 installed with "Enable Things URLs" on (Settings → General)
- Obsidian running with the [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) enabled
- **Full Disk Access** granted to `node` and the venv Python in System Settings → Privacy & Security → Full Disk Access (for iMessage — see [iMessage Setup](#imessage-setup))

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

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Google Services (Gmail, Calendar, Drive)

See [Google Services Setup](#google-services-setup) for the one-time OAuth configuration.

### 4. Install as a background daemon (recommended)

Installs the gateway as a launchd user agent — starts at login, restarts automatically on failure:

```bash
npm install -g @1mcp/agent   # install 1mcp globally first
./launchd/install.sh
```

Logs are written to `~/Library/Logs/mcp-gateway/`.

See [Daemon Management](#daemon-management) for start/stop/status commands.

### 5. Or run manually

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
| Home Assistant MCP | `url`, `token` | `HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN` |

GitHub token is pulled automatically from `gh auth token` — no 1Password entry needed.
Linear, Notion, Honeycomb use OAuth on first connect — no token stored.
Google credentials are stored separately — see [Google Services Setup](#google-services-setup).

## Google Services Setup

Gmail, Google Calendar, and Google Drive use a custom OAuth client because Google's auth server does not support Dynamic Client Registration (required by `mcp-remote`). The setup is a one-time process.

### Prerequisites

- A Google Cloud project with the Gmail, Calendar, and Drive APIs enabled
- An OAuth 2.0 Desktop app client credential downloaded as `~/.config/mcp-gateway/google-credentials.json`
  (stored in 1Password as "Google OAuth Client - MCP Gateway" in the Ray vault)

To restore credentials from 1Password:

```bash
mkdir -p ~/.config/mcp-gateway
op document get "Google OAuth Client - MCP Gateway" --vault Ray \
  --output ~/.config/mcp-gateway/google-credentials.json
```

### Authorize (one-time, and every 7 days)

The Google Cloud app is in "Testing" mode, which means OAuth refresh tokens expire after 7 days. Re-run this whenever tools start failing:

```bash
node scripts/google-auth-setup.mjs
```

This opens a browser, prompts you to sign in with your Google account, and saves tokens to `~/.config/mcp-gateway/google-tokens.json`. Then restart the gateway:

```bash
launchctl stop com.rayjohnson.mcp-gateway && launchctl start com.rayjohnson.mcp-gateway
```

> **Why every 7 days?** Google restricts refresh token lifetime for OAuth apps in "Testing" publishing status. Publishing the app for verification would remove this limit but requires a Google review process.

## iMessage Setup

The iMessage server reads `~/Library/Messages/chat.db` directly. macOS protects this file with Full Disk Access (FDA). The gateway uses a project-local Python virtualenv (`.imessage-venv/`) to run the iMessage script — granting FDA to **that venv's Python** gives a stable path that survives `brew upgrade uv`.

### 1. Create the virtualenv (once, after cloning)

```bash
uv venv .imessage-venv
uv pip install --python .imessage-venv/bin/python3 "fastmcp==0.4.1" imessagedb phonenumbers
```

### 2. Find the real Python path

```bash
realpath .imessage-venv/bin/python3
# e.g. /Users/you/.local/share/uv/python/cpython-3.13.9-macos-aarch64-none/bin/python3.13
```

### 3. Grant Full Disk Access to both node and the venv Python

The gateway runs under `node` (1mcp's runtime). macOS TCC grants FDA based on the **responsible process** — when node spawns the iMessage Python subprocess, node's FDA status determines whether the child can access protected files. Both binaries need FDA.

1. Open **System Settings → Privacy & Security → Full Disk Access**
2. Click **+**, press **Cmd+Shift+G**, paste `/opt/homebrew/bin/node` and add it
3. Repeat for the Python path from step 2
4. Restart the gateway: `launchctl stop com.rayjohnson.mcp-gateway && launchctl start com.rayjohnson.mcp-gateway`

> **Why not grant FDA to `uvx`?** macOS resolves symlinks and stores the Homebrew Cellar path (e.g. `.../Cellar/uv/0.11.13/bin/uvx`). After `brew upgrade uv` the Cellar path changes and the grant silently breaks. The uv-managed Python in `~/.local/share/uv/python/` is versioned separately and is not affected by Homebrew upgrades.

## Architecture

See [`plans/architecture.md`](plans/architecture.md) for a full description of how the system is structured.
See [`plans/todo.md`](plans/todo.md) for known issues and pending work.
