#!/bin/bash

# VSCode is meant to be able to format json for me, but it's not doing it, so here's a script (which admittedly is longer than the underlying `jq` command, but I'm forgetful).

# File: prettify_abi.sh
# Usage:
#   ./scripts/prettify_abi_json.sh target/input.json                   -> writes to target/prettified_input.json
#   ./scripts/prettify_abi_json.sh target/input.json output.json       -> writes to output.json

set -e

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 <input-json-file> [output-json-file]"
  exit 1
fi

INPUT="$1"

if [ "$#" -eq 2 ]; then
  OUTPUT="$2"
else
  DIR="$(dirname "$INPUT")"
  BASENAME="$(basename "$INPUT")"
  OUTPUT="${DIR}/prettified_${BASENAME}"
fi

jq '.' "$INPUT" > "$OUTPUT"
echo "Prettified JSON written to $OUTPUT"
