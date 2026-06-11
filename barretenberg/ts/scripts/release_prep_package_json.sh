#!/usr/bin/env bash
set -euo pipefail

version=$1
tmp=$(mktemp)

jq --arg v "$version" '.optionalDependencies = (.optionalDependencies // {}) + {
  "@aztec/bb.js-darwin-arm64": $v,
  "@aztec/bb.js-darwin-x64": $v,
  "@aztec/bb.js-linux-arm64": $v,
  "@aztec/bb.js-linux-x64": $v
}' package.json >"$tmp" && mv "$tmp" package.json
