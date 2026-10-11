#!/usr/bin/env bash
set -euo pipefail
cd /workspace/byga-agency
export CI=1
export WRANGLER_SEND_METRICS=false
export XDG_CONFIG_HOME=/workspace/.config
export WRANGLER_LOG_PATH=/workspace/byga-agency/.wrangler/logs
node -e 'if(Number(process.versions.node.split(".")[0])<22) throw new Error("Node.js >=22 required")'
npm ci --cache /workspace/.npm-cache
npm run build
npm run db:migrate:local
