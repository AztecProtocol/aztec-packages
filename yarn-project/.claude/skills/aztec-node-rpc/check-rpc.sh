#!/usr/bin/env bash
# Health-check an Aztec node JSON-RPC endpoint by calling <namespace>_getBlockNumber.
#
# Usage:
#   check-rpc.sh <url> [--key <api-key>] [--ns aztec|node] [--method <method>]
#
#   <url>       full endpoint, e.g. https://v5.testnet.rpc.aztec-labs.com or http://localhost:8080
#   --key       API key sent as `x-aztec-api-key` header (mainnet gateway etc.);
#               falls back to $AZTEC_RPC_API_KEY
#   --ns        method namespace: aztec (default) or node (legacy; required by drpc)
#   --method    override the method entirely (default: <ns>_getBlockNumber)
#
# When the aztec_* method is unavailable (-32601), it retries once with the legacy node_*
# namespace, so it works against public gateways, drpc, and port-forwarded cluster nodes.
set -euo pipefail

URL=""
KEY="${AZTEC_RPC_API_KEY:-}"
NS="aztec"
METHOD=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key) KEY="$2"; shift 2 ;;
    --ns) NS="$2"; shift 2 ;;
    --method) METHOD="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) URL="$1"; shift ;;
  esac
done

if [[ -z "$URL" ]]; then
  echo "usage: check-rpc.sh <url> [--key KEY] [--ns aztec|node] [--method M]" >&2
  exit 2
fi

call() {
  local method="$1"
  local hdr=()
  [[ -n "$KEY" ]] && hdr=(-H "x-aztec-api-key: $KEY")
  curl -s -m 25 -X POST "$URL" -H 'content-type: application/json' "${hdr[@]}" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":[],\"id\":1}"
}

method="${METHOD:-${NS}_getBlockNumber}"
resp="$(call "$method")"

if [[ -z "$METHOD" && "$NS" == "aztec" && "$resp" == *'-32601'* ]]; then
  method="node_getBlockNumber"
  resp="$(call "$method")"
fi

if [[ "$resp" == *'"result"'* ]]; then
  bn="$(printf '%s' "$resp" | sed -n 's/.*"result":\([0-9]*\).*/\1/p')"
  echo "OK    $URL  ($method)  block=${bn:-?}"
  exit 0
fi

echo "FAIL  $URL  ($method)"
echo "  ${resp:-<no response>}"
exit 1
