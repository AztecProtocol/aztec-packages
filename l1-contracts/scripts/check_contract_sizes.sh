#!/usr/bin/env bash
set -euo pipefail

# Fail if any deployable contract exceeds the EIP-170 runtime bytecode limit.
#
# An oversized contract compiles fine and only breaks at deploy time, where foundry reports the
# anonymous CREATE index instead of the contract ("`Unknown11` is above the contract size limit
# (25097 > 24576)"), so the overage is close to undiagnosable. Checking sizes directly names the
# contract instead.
#
# Both deploy profiles are checked, because they produce different sizes: `production` remaps
# @aztec-blob-lib to the real BlobLib and is used for mainnet deploys, while the default profile
# remaps it to the mock and is what every other network and scripts/test_rollup_upgrade.sh deploy.

cd "$(dirname "$0")/.."

# EIP-170 runtime bytecode limit.
limit=24576
# Report, without failing, contracts with less than this much room left.
warn_margin=1024

paths=(src)
# Present only after bootstrap's build_verifier; it is a deployed contract, so check it when it is.
[ -f generated/HonkVerifier.sol ] && paths+=(generated/HonkVerifier.sol)

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

status=0
for profile in default production; do
  echo "=== Checking contract sizes ($profile profile) ==="

  sizes=$workdir/$profile.json
  # Build into a dedicated out/cache so this never clobbers the artifacts shared with concurrently
  # running forge test commands. forge's exit code is not usable here: it is non-zero when a
  # contract is oversized but zero when compilation fails outright, so the report drives the
  # verdict and an empty report means the build failed.
  FOUNDRY_PROFILE=$profile forge build --sizes --json \
    -o "$workdir/out-$profile" --cache-path "$workdir/cache-$profile" \
    "${paths[@]}" > "$sizes" || true

  report=$(jq -r --argjson limit "$limit" --argjson warn "$warn_margin" '
    to_entries
    | map(select(.value.runtime_size != null))
    | sort_by(-.value.runtime_size)
    | if length == 0 then "NONE"
      else
        (.[0] | select($limit - .value.runtime_size >= $warn)
              | "INFO largest contract: \(.key) at \(.value.runtime_size) bytes, \($limit - .value.runtime_size) below the \($limit) byte limit"),
        (.[] | select(.value.runtime_size > $limit)
             | "FAIL \(.key) is above the EIP-170 contract size limit (\(.value.runtime_size) > \($limit)), over by \(.value.runtime_size - $limit) bytes"),
        (.[] | select(.value.runtime_size <= $limit and $limit - .value.runtime_size < $warn)
             | "WARN \(.key) is close to the EIP-170 contract size limit: \(.value.runtime_size) bytes, only \($limit - .value.runtime_size) to spare")
      end
  ' "$sizes" 2>/dev/null) || report=NONE

  if [ "$report" = "NONE" ]; then
    # `forge build --sizes --json` reports an empty object and still exits 0 when compilation
    # fails, so rerun without --json to surface the compiler error.
    echo "ERROR: forge build produced no contract sizes under the $profile profile. Rerunning to show why:"
    FOUNDRY_PROFILE=$profile forge build \
      -o "$workdir/out-$profile" --cache-path "$workdir/cache-$profile" "${paths[@]}"
    exit 1
  fi

  while IFS= read -r line; do
    case "$line" in
      "INFO "*) echo "  ${line#INFO }" ;;
      "WARN "*) echo "  WARNING: ${line#WARN } ($profile profile)" ;;
      "FAIL "*) echo "  ERROR: ${line#FAIL } ($profile profile)"; status=1 ;;
    esac
  done <<< "$report"
done

if [ "$status" -ne 0 ]; then
  echo
  echo "One or more contracts are above the EIP-170 runtime bytecode limit of $limit bytes and cannot be"
  echo "deployed. Shrink them, or move logic into an external library."
  exit 1
fi

echo "All contracts are within the EIP-170 runtime bytecode limit of $limit bytes."
