#!/usr/bin/env bash
# Verify that all test files which require ci3 annotations have them,
# and that all existing annotations use valid YAML syntax parseable by yq.
#
# Run from yarn-project/:
#   bash scripts/check_ci3_annotations.sh
#
# Exits 0 if all checks pass, 1 if any fail.
set -euo pipefail

errors=0

# ──────────────────────────────────────────────────────────────────────────────
# 1. Packages whose tests MUST have "// ci3: { isolate: true, ... }" on line 1.
#    These use network stacks (anvil, libp2p, etc.) and need docker isolation.
# ──────────────────────────────────────────────────────────────────────────────
ISOLATE_REQUIRED_PATTERNS=(
  "^prover-node/"
  "^p2p/"
  "^ethereum/"
  "^aztec-node/"
  "^aztec\.js/"
  "^prover-client/src/test/"
  "^stdlib/src/l1-contracts/"
  "^ivc-integration/src/chonk_browser"
)

# Build a single regex from the patterns.
isolate_regex=$(IFS='|'; echo "${ISOLATE_REQUIRED_PATTERNS[*]}")

# Iterate test files in the test_cmds glob (same as bootstrap.sh).
shopt -s extglob globstar
cd "$(dirname "$0")/.."

for test in !(end-to-end|kv-store|aztec)/src/**/*.test.ts; do
  # Skip .bench.test.ts (excluded from test_cmds).
  [[ "$test" =~ \.bench\.test\.ts$ ]] && continue

  first_line=$(head -1 "$test")

  # Check 1: Files in isolate-required packages must have "isolate: true" in annotation.
  if [[ "$test" =~ $isolate_regex ]]; then
    if [[ ! "$first_line" =~ ^//\ ci3:.*isolate:\ true ]]; then
      echo "ERROR: $test — requires '// ci3: { isolate: true, ... }' (package needs docker isolation)"
      ((errors++))
    fi
  fi

  # Check 2: Any file with a ci3 annotation must be valid YAML parseable by yq.
  if [[ "$first_line" =~ ^//\ ci3:\ (.+) ]]; then
    yaml="${BASH_REMATCH[1]}"
    if ! echo "$yaml" | yq '.' > /dev/null 2>&1; then
      echo "ERROR: $test — malformed YAML annotation: $first_line"
      ((errors++))
    fi
  fi
done

# ──────────────────────────────────────────────────────────────────────────────
# 2. Check e2e test annotations (end-to-end/).
# ──────────────────────────────────────────────────────────────────────────────
for test in end-to-end/src/**/*.test.ts; do
  first_line=$(head -1 "$test")

  # Only validate syntax if annotation exists (e2e ISOLATE comes from bootstrap prefix).
  if [[ "$first_line" =~ ^//\ ci3:\ (.+) ]]; then
    yaml="${BASH_REMATCH[1]}"
    if ! echo "$yaml" | yq '.' > /dev/null 2>&1; then
      echo "ERROR: $test — malformed YAML annotation: $first_line"
      ((errors++))
    fi
  fi
done

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "FAILED: $errors annotation error(s) found."
  echo "See yarn-project/scripts/parse_ci3_annotation.sh for annotation format docs."
  exit 1
else
  echo "OK: All ci3 annotations are valid."
fi
