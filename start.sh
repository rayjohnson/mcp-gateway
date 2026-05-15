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

if ! command -v 1mcp &>/dev/null; then
  echo "Installing @1mcp/agent globally..."
  npm install -g @1mcp/agent
fi

cd "${SCRIPT_DIR}"
echo "Starting 1MCP gateway on http://127.0.0.1:3050 ..."
exec 1mcp serve
