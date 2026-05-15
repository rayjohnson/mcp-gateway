# MCP Gateway — Architecture

## Overview

This project is a local-first MCP aggregation hub running on macOS. It replaces the pattern of configuring each MCP server separately in every AI client with a single runtime that all clients share.

```
┌─────────────────────────────────────────────────────────┐
│                     AI Clients                          │
│  Claude Desktop  │  Cursor  │  Gemini  │  Claude Code  │
└────────┬─────────┴────┬─────┴────┬─────┴──────┬────────┘
         │              │          │             │
         └──────────────┴──────────┴─────────────┘
                        │  HTTP (Streamable MCP)
                        │  http://127.0.0.1:3050/mcp?app=<client>
                        ▼
         ┌──────────────────────────────┐
         │       1mcp serve             │
         │   (aggregated MCP runtime)   │
         │   @1mcp/agent  port 3050     │
         └──┬───┬───┬───┬───┬───┬───┬──┘
            │   │   │   │   │   │   │
    ┌───────┘   │   │   │   │   │   └───────┐
    ▼           ▼   ▼   ▼   ▼   ▼           ▼
 iMessage  Obsidian Things Gmail Slack  GitHub  Linear  Notion
  (stdio)  (stdio) (stdio)(stdio)(stdio)(stdio) (stdio) (stdio)
```

## Runtime: 1MCP

**Package:** `@1mcp/agent`  
**Docs:** https://docs.1mcp.app  
**Start command:** `1mcp serve`  
**Default port:** `3050`

1MCP is the aggregation layer. It reads `mcp.json` at startup, spawns each configured MCP server as a stdio child process, and exposes them all through a single streamable HTTP endpoint. Clients connect with a `?app=<name>` query parameter that 1MCP uses for session scoping and filtering.

Key properties:
- **Progressive discovery** — agents use `instructions → inspect → run` rather than receiving all 40+ tools at once, keeping context windows lean.
- **Tag-based filtering** — clients or presets can request a subset of servers by tag (e.g., `"tags": ["development"]` for a coding session).
- **Single process** — one `1mcp serve` instance replaces running 8 separate server processes per client.

## Configuration: `mcp.json`

The central config file. Follows the [1mcp config schema](https://docs.1mcp.app/schemas/v1.0.0/mcp-config.json). Each server entry defines:

- `command` / `args` — how to launch the stdio MCP server via npx
- `env` — secrets injected at runtime from environment variables (sourced from `.env`)
- `tags` — used by clients to filter which servers are visible per session

Secrets are never stored in `mcp.json`. They live in `.env` (git-ignored), generated either manually from `.env.example` or automatically from 1Password via `1password-export.sh`.

## Secrets Management

```
1Password vault "MCP Gateway"
        │
        │  ./1password-export.sh
        ▼
      .env  (git-ignored, machine-local)
        │
        │  sourced by start.sh
        ▼
  1mcp serve process env
        │
        │  injected per-server via mcp.json env blocks
        ▼
  each stdio MCP server child process
```

The `1password-export.sh` script uses the `op` CLI to fetch each secret by item name and field, then writes `.env`. On a fresh machine, running `./1password-export.sh` followed by `./start.sh` is sufficient to bring the full stack up.

## MCP Servers

### iMessage
- **Package:** `imessage-mcp`
- **Transport:** stdio → reads `~/Library/Messages/chat.db` directly
- **Auth:** none (file access only)
- **macOS requirement:** Full Disk Access granted to the terminal process in System Settings

### Obsidian
- **Package:** `@bitbonsai/mcpvault`
- **Transport:** stdio → reads `.md` files from the vault directory
- **Auth:** none (directory access only)
- **Config:** vault path passed as CLI argument via `OBSIDIAN_VAULT_PATH` env var
- **Note:** does not require the Obsidian app to be running

### Things 3
- **Package:** `things3-mcp`
- **Transport:** stdio → communicates via AppleScript / Things URL scheme
- **Auth:** `THINGS3_AUTH_TOKEN` (from Things 3 settings)
- **macOS requirement:** Things 3 must be installed and running

### Gmail
- **Package:** `@gongrzhe/server-gmail-autoauth-mcp`
- **Transport:** stdio → Google Gmail API
- **Auth:** file-based OAuth 2.0 stored at `~/.gmail-mcp/credentials.json`
- **One-time setup:** run `npx @gongrzhe/server-gmail-autoauth-mcp auth` to complete browser OAuth flow
- **Note:** no runtime env var needed once credentials file exists

### Slack
- **Package:** `@modelcontextprotocol/server-slack`
- **Transport:** stdio → Slack Web API
- **Auth:** `SLACK_BOT_TOKEN` (xoxb- prefix), `SLACK_TEAM_ID`
- **Note:** archived upstream but still functional

### GitHub
- **Package:** `@modelcontextprotocol/server-github` (npm, deprecated)
- **Transport:** stdio → GitHub REST API
- **Auth:** `GITHUB_PERSONAL_ACCESS_TOKEN`
- **Alternative:** official Docker image `ghcr.io/github/github-mcp-server` (swap `command`/`args` in `mcp.json` if Docker is preferred)

### Linear
- **Package:** `linear-mcp-server`
- **Transport:** stdio → Linear GraphQL API
- **Auth:** `LINEAR_API_KEY`
- **Alternative:** Linear's official remote MCP at `https://mcp.linear.app/sse` via `mcp-remote` (OAuth-based, no API key needed)

### Notion
- **Package:** `@notionhq/notion-mcp-server` (official, maintained by Notion)
- **Transport:** stdio → Notion REST API
- **Auth:** `NOTION_TOKEN` (ntn_ prefix)
- **Note:** pages and databases must be explicitly shared with the integration inside Notion

## Client Connection Patterns

| Client | Connection method | URL / config |
|--------|-------------------|--------------|
| Claude Desktop | Streamable HTTP | `http://127.0.0.1:3050/mcp?app=claude-desktop` |
| Cursor | Streamable HTTP | `http://127.0.0.1:3050/mcp?app=cursor` |
| Claude Code CLI | Streamable HTTP | `claude mcp add -t http 1mcp "http://127.0.0.1:3050/mcp?app=claude-code"` |
| Gemini / other HTTP | Streamable HTTP | `http://127.0.0.1:3050/mcp?app=<name>` |
| stdio-only clients | stdio proxy | `1mcp proxy` (requires `1mcp serve` running) |

The `?app=` query parameter is used by 1MCP for session scoping. It does not restrict access — all servers are available to all clients unless tag-based filtering is configured.

## File Inventory

| File | Purpose |
|------|---------|
| `mcp.json` | 1MCP server definitions (infrastructure as code) |
| `.env.example` | Template listing all required environment variables |
| `.env` | Machine-local secrets — **git-ignored, never committed** |
| `start.sh` | Installs 1mcp if absent, loads `.env`, runs `1mcp serve` |
| `1password-export.sh` | Pulls secrets from 1Password vault → writes `.env` |
| `claude_desktop_config.json` | Ready-to-paste client config for Claude Desktop |
| `plans/architecture.md` | This file |

## Adding a New Server

1. Find the npm package for the MCP server.
2. Add an entry to `mcpServers` in `mcp.json` with the `command`, `args`, `env`, and `tags`.
3. Add the required env var(s) to `.env.example` with documentation.
4. Add the 1Password item/field mapping to `README.md` and `1password-export.sh`.
5. Restart the gateway (`./start.sh`).
