#!/usr/bin/env bash

# Verify the distribution boundary by packing the prebuilt output, installing it in an isolated consumer, and invoking
# the published binary as an external user would.
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

(cd "$package_dir" && npm pack --ignore-scripts --pack-destination "$work_dir" --quiet >/dev/null)

shopt -s nullglob
tarballs=("$work_dir"/*.tgz)
if [ "${#tarballs[@]}" -ne 1 ]; then
  echo "expected npm pack to produce one tarball, found ${#tarballs[@]}" >&2
  exit 1
fi

input="$work_dir/constants.nr"
cat > "$input" <<'EOF'
pub global MAX_FIELD_VALUE: Field =
    21888242871839275222246405745257275088548364400416034343698204186575808495616;
pub global MAX_ETH_ADDRESS_VALUE: Field = 0xffffffffffffffffffffffffffffffffffffffff;
pub global ARCHIVE_HEIGHT: u32 = 30;
EOF

mkdir "$work_dir/consumer"
(
  cd "$work_dir/consumer"
  npm init --yes >/dev/null
  npm install --ignore-scripts "${tarballs[0]}" >/dev/null
  ./node_modules/.bin/constants-codegen \
    --input "$input" \
    --typescript "$work_dir/constants.ts" \
    --cpp "$work_dir/constants.hpp" \
    --pil "$work_dir/constants.pil" \
    --solidity "$work_dir/Constants.sol" \
    --rust "$work_dir/constants.rs"

  # The monorepo --input default must not resolve inside node_modules; external users get an
  # explicit error instead of a silently wrong input file.
  if error=$(./node_modules/.bin/constants-codegen --typescript "$work_dir/unused.ts" 2>&1); then
    echo "expected constants-codegen to fail without --input outside the monorepo" >&2
    exit 1
  fi
  if [[ "$error" != *"--input is required"* ]]; then
    echo "unexpected error from constants-codegen without --input: $error" >&2
    exit 1
  fi
)

function check_output {
  if ! grep -Fq "$2" "$work_dir/$1"; then
    echo "installed constants-codegen produced unexpected $1:" >&2
    cat "$work_dir/$1" >&2
    exit 1
  fi
}

# No selection files are passed, so every output contains all parsed constants.
check_output constants.ts 'export const ARCHIVE_HEIGHT = 30;'
check_output constants.hpp '#define ARCHIVE_HEIGHT 30'
check_output constants.pil 'pol MAX_ETH_ADDRESS_VALUE = 1461501637330902918203684832716283019655932542975;'
check_output Constants.sol 'uint256 internal constant MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616;'
check_output constants.rs 'pub const ARCHIVE_HEIGHT: u128 = 30;'
