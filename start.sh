#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if present
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
  set +a
else
  echo "Warning: .env not found. Copy .env.example to .env and fill in secrets."
  echo "         Or run ./1password-export.sh to generate it from 1Password."
fi

# Pull GitHub token from gh CLI so no PAT needs to be stored in .env
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  GITHUB_PERSONAL_ACCESS_TOKEN="$(gh auth token)"
  export GITHUB_PERSONAL_ACCESS_TOKEN
else
  echo "Warning: gh CLI not authenticated. GitHub MCP server will not work."
  echo "         Run: gh auth login"
fi

if ! command -v 1mcp &>/dev/null; then
  echo "Installing @1mcp/agent globally..."
  npm install -g @1mcp/agent
fi

cd "${SCRIPT_DIR}"
echo "Starting 1MCP gateway on http://127.0.0.1:3050 ..."
exec 1mcp serve --config "${SCRIPT_DIR}/mcp.json"
