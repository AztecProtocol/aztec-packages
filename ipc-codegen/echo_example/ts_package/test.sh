#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
transport="${1:-uds}"

(cd "$DIR" && npm run test --silent -- --transport "$transport")
