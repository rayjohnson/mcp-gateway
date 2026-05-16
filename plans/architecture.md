# MCP Gateway — Architecture

## Overview

This project is a local-first MCP aggregation hub running on macOS. It replaces the pattern of configuring each MCP server separately in every AI client with a single runtime that all clients share.

```
┌──────────────────────────────────────────────────────────────┐
│                        AI Clients                            │
│  Claude Desktop  │  Cursor  │  Gemini  │  Claude Code CLI   │
└────────┬─────────┴────┬─────┴────┬─────┴──────┬─────────────┘
         │              │          │             │
         └──────────────┴──────────┴─────────────┘
                        │  HTTP (Streamable MCP)
                        │  http://127.0.0.1:3050/mcp?app=<client>
                        ▼
         ┌──────────────────────────────────┐
         │           1mcp serve             │
         │     (aggregated MCP runtime)     │
         │     @1mcp/agent  port 3050       │
         └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┘
            │  │  │  │  │  │  │  │  │  │  │
   iMessage │  │  │  │  │  │  │  │  │  │  │ 1Password
  Obsidian ─┘  │  │  │  │  │  │  │  │  │  └─ (stdio)
  Things3 ─────┘  │  │  │  │  │  │  │  └──── Home Assistant
  Gmail ──────────┘  │  │  │  │  │  └──────── Honeycomb
  G.Calendar ────────┘  │  │  │  └──────────── Notion
  G.Drive ──────────────┘  │  └────────────── Linear
  GitHub ───────────────────┘                (all stdio)
```

## Runtime: 1MCP

**Package:** `@1mcp/agent`  
**Docs:** https://docs.1mcp.app  
**Start command:** `1mcp serve`  
**Default port:** `3050`

1MCP reads `mcp.json` at startup, spawns each configured MCP server as a stdio child process, and exposes them all through a single streamable HTTP endpoint. Clients connect with a `?app=<name>` query parameter that 1MCP uses for session scoping.

Key properties:
- **Progressive discovery** — agents use `instructions → inspect → run` rather than receiving all 100+ tools at once, keeping context windows lean.
- **Tag-based filtering** — clients can request a subset of servers by tag (e.g., `"tags": ["development"]` for a coding session).
- **Single process** — one `1mcp serve` instance replaces running 12 separate server processes per client.

## Daemon: launchd

The gateway runs as a launchd user agent (`com.rayjohnson.mcp-gateway`), installed via `launchd/install.sh`. It starts at login, restarts automatically on failure, and writes logs to `~/Library/Logs/mcp-gateway/`.

`start.sh` is the entrypoint: it sources `.env`, exports `GATEWAY_DIR` (so `mcp.json` can reference `${GATEWAY_DIR}` in args), and runs `1mcp serve`.

## Configuration: `mcp.json`

The central config file. Follows the [1mcp config schema](https://docs.1mcp.app/schemas/v1.0.0/mcp-config.json). Each server entry defines:

- `command` / `args` — how to launch the stdio MCP server
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
        │  sourced by start.sh → exported to GATEWAY_DIR + all secret vars
        ▼
  1mcp serve process env
        │
        │  injected per-server via mcp.json env blocks
        ▼
  each stdio MCP server child process
```

`1password-export.sh` uses the `op` CLI to fetch each secret by item name and field, then writes `.env`. On a fresh machine, `./1password-export.sh` followed by `./launchd/install.sh` brings the full stack up.

## Wrappers

Some MCP servers required shim scripts in `wrappers/` to fix compatibility issues:

### `wrappers/things3-wrapper.mjs`
`things3-mcp` returns responses in an old MCP draft format (`{ toolResult: [...] }`) instead of the current spec (`{ content: [{ type: "text", text: "..." }] }`). This stdio proxy intercepts every JSON-RPC response and rewrites the format before passing it to 1mcp.

### `wrappers/google-mcp-wrapper.mjs`
Google's OAuth server doesn't support Dynamic Client Registration (RFC 7591), which is the only auth mechanism `mcp-remote` supports for headless use. This wrapper uses `google-auth-library` to obtain a fresh access token from stored OAuth credentials, then passes it to `mcp-remote` via `--header "Authorization: Bearer TOKEN"`.

On startup it checks if tokens are 6+ days old (Google's testing-mode apps expire refresh tokens at 7 days) or if `getAccessToken()` throws `invalid_grant`. On either condition it:
1. Checks for a lock file (`~/.config/mcp-gateway/google-reauth-pending`) to avoid duplicate browser windows
2. Launches `scripts/google-auth-setup.mjs` detached (opens browser)
3. Shows a macOS notification
4. Exits so 1mcp marks the server unavailable until auth completes

After auth, `google-auth-setup.mjs` deletes the lock file and restarts the gateway automatically.

## MCP Servers

### iMessage
- **Transport:** `${GATEWAY_DIR}/.imessage-venv/bin/fastmcp run <script>` (stdio)
- **Auth:** none — reads `~/Library/Messages/chat.db` directly
- **macOS requirement:** Full Disk Access granted to both `/opt/homebrew/bin/node` (the responsible process under launchd) and the venv Python binary. See README for why both are needed.
- **Note:** uses a project-local venv (`.imessage-venv/`) so the Python path is stable across `brew upgrade uv`

### Obsidian
- **Package:** `mcp-obsidian` (via `uvx`)
- **Transport:** stdio → Obsidian Local REST API plugin (HTTP on localhost)
- **Auth:** `OBSIDIAN_API_KEY`, `OBSIDIAN_HOST`, `OBSIDIAN_PORT`
- **Requirement:** Obsidian must be running with the Local REST API plugin enabled

### Things 3
- **Transport:** `wrappers/things3-wrapper.mjs` → `things3-mcp` (stdio proxy)
- **Auth:** `THINGS3_AUTH_TOKEN`
- **Requirement:** Things 3 installed with "Enable Things URLs" on

### Gmail / Google Calendar / Google Drive
- **Transport:** `wrappers/google-mcp-wrapper.mjs` → `mcp-remote` → Google's MCP endpoints (stdio → HTTP)
- **Endpoints:** `gmailmcp.googleapis.com/mcp/v1`, `calendarmcp.googleapis.com/mcp/v1`, `drivemcp.googleapis.com/mcp/v1`
- **Auth:** Custom OAuth 2.0 Desktop app credentials at `~/.config/mcp-gateway/google-credentials.json`, tokens at `~/.config/mcp-gateway/google-tokens.json`
- **Token refresh:** Automatic — browser opens when tokens approach 7-day expiry. See `scripts/google-auth-setup.mjs`.

### GitHub
- **Package:** `@modelcontextprotocol/server-github` (via `npx`)
- **Transport:** stdio → GitHub REST API
- **Auth:** `GITHUB_PERSONAL_ACCESS_TOKEN` pulled from `gh auth token` at startup

### Linear
- **Transport:** `mcp-remote` → `mcp.linear.app/mcp` (stdio → HTTP)
- **Auth:** OAuth on first connect (browser prompt via mcp-remote)

### Notion
- **Transport:** `mcp-remote` → `mcp.notion.com/mcp` (stdio → HTTP)
- **Auth:** OAuth on first connect (browser prompt via mcp-remote)

### Honeycomb
- **Transport:** `mcp-remote` → `mcp.honeycomb.io/mcp` (stdio → HTTP)
- **Auth:** OAuth on first connect (browser prompt via mcp-remote)

### Home Assistant
- **Package:** `ha-mcp` (via `uvx`)
- **Transport:** stdio → Home Assistant REST API
- **Auth:** `HOMEASSISTANT_URL`, `HOMEASSISTANT_TOKEN`

### 1Password
- **Package:** `@jrejaud/op-mcp` (via `npx`)
- **Transport:** stdio → `op` CLI
- **Auth:** none — uses the active `op` CLI session

### Slack
- **Status:** ⚠️ Pending — see `plans/todo.md`
- **Blocker:** MoovFinancial workspace requires admin approval for custom Slack apps. User tokens require an approved app to generate.

## Client Connection Patterns

| Client | Connection method | Notes |
|--------|-------------------|-------|
| Claude Desktop | `npx mcp-remote http://127.0.0.1:3050/mcp?app=claude-desktop --allow-http` | mcp-remote bridge required for local HTTP |
| Cursor | Streamable HTTP `http://127.0.0.1:3050/mcp?app=cursor` | native HTTP MCP support |
| Claude Code CLI | Streamable HTTP `http://127.0.0.1:3050/mcp?app=claude-code` | added via `claude mcp add -s user -t http` |
| stdio-only clients | `1mcp proxy` | requires `1mcp serve` already running |

The `?app=` parameter is used by 1MCP for session scoping. It does not restrict access — all servers are available to all clients unless tag-based filtering is configured.

## File Inventory

| File / Directory | Purpose |
|------------------|---------|
| `mcp.json` | 1MCP server definitions |
| `.env.example` | Template listing all required environment variables |
| `.env` | Machine-local secrets — **git-ignored, never committed** |
| `start.sh` | Sources `.env`, exports `GATEWAY_DIR`, runs `1mcp serve` |
| `1password-export.sh` | Pulls secrets from 1Password → writes `.env` |
| `package.json` | npm dependencies for wrappers (`google-auth-library`) |
| `wrappers/things3-wrapper.mjs` | Response format shim for `things3-mcp` |
| `wrappers/google-mcp-wrapper.mjs` | OAuth token injection for Google MCP endpoints |
| `scripts/google-auth-setup.mjs` | One-time / periodic Google OAuth browser flow |
| `launchd/install.sh` | Installs gateway as launchd user agent |
| `launchd/uninstall.sh` | Removes launchd user agent |
| `.imessage-venv/` | Project-local Python venv for iMessage server (git-ignored) |
| `plans/architecture.md` | This file |
| `plans/todo.md` | Known issues and pending work |

## Adding a New Server

1. Find the npm/uvx package for the MCP server.
2. Add an entry to `mcpServers` in `mcp.json` with `command`, `args`, `env`, and `tags`.
3. Add required env vars to `.env.example` with documentation.
4. If the server needs secrets, add the 1Password item/field mapping to `1password-export.sh` and the README.
5. If the server has response format issues, add a wrapper in `wrappers/`.
6. Restart the gateway.
