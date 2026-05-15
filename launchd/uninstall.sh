#!/usr/bin/env bash
# Stops and removes the MCP gateway launchd agent.
set -euo pipefail

LABEL="com.rayjohnson.mcp-gateway"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "${PLIST}"

echo "Gateway launchd agent removed."
