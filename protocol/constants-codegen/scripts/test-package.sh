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
output="$work_dir/constants.ts"
printf 'pub global ARCHIVE_HEIGHT: u32 = 30;\n' > "$input"

mkdir "$work_dir/consumer"
(
  cd "$work_dir/consumer"
  npm init --yes >/dev/null
  npm install --ignore-scripts "${tarballs[0]}" >/dev/null
  ./node_modules/.bin/constants-codegen --input "$input" --typescript "$output"
)

if ! grep -Fq 'export const ARCHIVE_HEIGHT = 30;' "$output"; then
  echo "installed constants-codegen produced unexpected TypeScript output:" >&2
  cat "$output" >&2
  exit 1
fi
