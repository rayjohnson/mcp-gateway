#!/usr/bin/env bash
# Installs the MCP gateway as a launchd user agent that starts at login
# and restarts automatically on failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="${SCRIPT_DIR}/com.rayjohnson.mcp-gateway.plist"
PLIST_DEST="${HOME}/Library/LaunchAgents/com.rayjohnson.mcp-gateway.plist"
LOG_DIR="${HOME}/Library/Logs/mcp-gateway"
LABEL="com.rayjohnson.mcp-gateway"

mkdir -p "${LOG_DIR}"
cp "${PLIST_SRC}" "${PLIST_DEST}"

# Unload first if already registered (ignore errors)
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true

launchctl bootstrap "gui/$(id -u)" "${PLIST_DEST}"

echo "Gateway installed as launchd agent."
echo ""
echo "Useful commands:"
echo "  Status:  launchctl print gui/$(id -u)/${LABEL}"
echo "  Stop:    launchctl stop ${LABEL}"
echo "  Start:   launchctl start ${LABEL}"
echo "  Logs:    tail -f ${LOG_DIR}/stdout.log"
echo "  Remove:  ${SCRIPT_DIR}/uninstall.sh"
