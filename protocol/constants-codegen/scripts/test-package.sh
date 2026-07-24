#!/usr/bin/env bash

# Verify the distribution boundary by packing the prebuilt output, installing it in an isolated consumer, and invoking
# the published binary as an external user would.
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

# The release tarball embeds the protocol inputs via prepack; npm pack --ignore-scripts skips prepack
# (that's what lets us pack the prebuilt dest/ as-is), so run the embed step explicitly.
"$package_dir/scripts/embed-inputs.sh"
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
  ./node_modules/.bin/constants-codegen --input "$input" --typescript "$work_dir/constants.ts"
  ./node_modules/.bin/constants-codegen --input "$input" --cpp "$work_dir/constants.hpp"
  ./node_modules/.bin/constants-codegen --input "$input" --pil "$work_dir/constants.pil"
  ./node_modules/.bin/constants-codegen --input "$input" --solidity "$work_dir/Constants.sol"
  ./node_modules/.bin/constants-codegen --input "$input" --rust "$work_dir/constants.rs"

  # Without --input the installed package falls back to the inputs embedded at pack time.
  ./node_modules/.bin/constants-codegen --typescript "$work_dir/default.ts"
)

# The embedded snapshot must reproduce exactly what the live monorepo sources produce.
"$package_dir/scripts/generate.sh" --typescript "$work_dir/reference.ts"
if ! cmp -s "$work_dir/default.ts" "$work_dir/reference.ts"; then
  echo "embedded inputs produced different output than the monorepo default input:" >&2
  diff "$work_dir/reference.ts" "$work_dir/default.ts" | head >&2
  exit 1
fi

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
check_output default.ts 'export const MAX_TX_BLOB_DATA_SIZE_IN_FIELDS'
