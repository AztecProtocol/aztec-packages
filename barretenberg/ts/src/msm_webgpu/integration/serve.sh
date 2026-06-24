#!/usr/bin/env sh
# Local viewer for the integration/ docs.
#
# Serves the repository root over HTTP so `../msm_v2.ts` and the deeper
# `../../../../cpp/...` cross-references in the markdown resolve as
# clickable links. Markdown lives in integration/, so the viewer URL has
# integration/ in the path.

set -e

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
REL="$(cd "$(dirname "$0")" && pwd)"
REL="${REL#$ROOT/}"
PORT="${1:-8765}"

URL="http://localhost:$PORT/$REL/index.html"

echo "Serving $ROOT at http://localhost:$PORT"
echo "Open: $URL"
echo ""

cd "$ROOT"
exec python3 -m http.server "$PORT"
