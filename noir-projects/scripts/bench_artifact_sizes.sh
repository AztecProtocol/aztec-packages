#!/usr/bin/env bash
# Sizes every compiled noir-contracts artifact and emits github-action-benchmark JSON: per contract,
# the total on-disk size of the artifact JSON and the size of its decoded public (AVM) bytecode.
# bench_merge prefixes the metric names with this component's directory, so on the dashboard they
# appear under "noir-projects/noir-contracts/artifact-size/<contract>/...". Driven by noir-contracts'
# bootstrap.sh bench_cmds.
set -euo pipefail

cd "$(dirname "$0")/../noir-contracts"

shopt -s nullglob
artifacts=(target/*.json)
shopt -u nullglob
if [ "${#artifacts[@]}" -eq 0 ]; then
  echo "No artifacts in $(pwd)/target; build the contracts first." >&2
  exit 1
fi

# Decoded byte length of a standard padded base64 string, computed arithmetically. This avoids
# depending on a base64 binary (whose decode flag differs across platforms) and avoids jq's
# codepoint-vs-byte counting, which would skew on non-UTF-8 bytecode.
function b64_decoded_len {
  local s=$1
  local len=${#s}
  [ "$len" -eq 0 ] && { echo 0; return; }
  local pad=0
  case "$s" in
    *==) pad=2 ;;
    *=) pad=1 ;;
  esac
  echo $((len / 4 * 3 - pad))
}

# One TSV row per artifact: <contract>\t<artifact bytes>\t<public bytecode bytes>.
function size_rows {
  local artifact name artifact_bytes b64
  for artifact in "${artifacts[@]}"; do
    name=$(basename "$artifact" .json)
    artifact_bytes=$(wc -c <"$artifact" | tr -d '[:space:]')
    # The contract's whole public (AVM) bytecode lives in its single `public_dispatch` function,
    # base64-encoded (not gzipped). A contract with no public functions has no such entry => 0 bytes.
    b64=$(jq -r '[.functions[] | select(.name == "public_dispatch") | .bytecode][0] // ""' "$artifact")
    printf '%s\t%s\t%s\n' "$name" "$artifact_bytes" "$(b64_decoded_len "$b64")"
  done
}

output="${BENCH_OUTPUT:-bench-out/artifact-sizes.bench.json}"
mkdir -p "$(dirname "$output")"

size_rows | jq -R -s '
  split("\n")
  | map(select(length > 0) | split("\t"))
  | map(
      { name: ("artifact-size/" + .[0] + "/artifactSizeBytes"),       value: (.[1] | tonumber), unit: "bytes" },
      { name: ("artifact-size/" + .[0] + "/publicBytecodeSizeBytes"), value: (.[2] | tonumber), unit: "bytes" }
    )
' >"$output"

echo "Wrote artifact-size benchmark to $output (${#artifacts[@]} artifacts)." >&2
