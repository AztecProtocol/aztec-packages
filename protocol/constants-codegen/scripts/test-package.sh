#!/usr/bin/env bash

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
    --solidity "$work_dir/Constants.sol"
)

function check_output {
  if ! grep -Fq "$2" "$work_dir/$1"; then
    echo "installed constants-codegen produced unexpected $1:" >&2
    cat "$work_dir/$1" >&2
    exit 1
  fi
}

# Each language receives a different allowlisted subset of the input constants,
# so each check uses a constant known to be in that language's subset.
check_output constants.ts 'export const ARCHIVE_HEIGHT = 30;'
check_output constants.hpp '#define ARCHIVE_HEIGHT 30'
check_output constants.pil 'pol MAX_ETH_ADDRESS_VALUE = 1461501637330902918203684832716283019655932542975;'
check_output Constants.sol 'uint256 internal constant MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616;'
