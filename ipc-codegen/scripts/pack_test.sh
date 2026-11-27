#!/usr/bin/env bash
# The published package must run from node_modules, where Node will not strip types: pack it, install the
# tarball into an empty project and generate every language through its bin.
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source
set -euo pipefail

codegen="$root/ipc-codegen"
work=$(mktemp -d)
trap "rm -rf $work" EXIT

tarball=$(cd "$codegen" && npm pack --silent --pack-destination "$work")
[ ! -e "$codegen/dist" ] || { echo "npm pack left $codegen/dist behind"; exit 1; }
cd "$work"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "./$tarball"
for lang in rust ts zig cpp; do
  npx --no-install ipc-codegen --schema "$codegen/echo_example/schema/schema.jsonc" --lang "$lang" \
    --out "$work/out/$lang" --server --client >/dev/null
done
echo "the packed ipc-codegen generates rust, ts, zig and cpp from node_modules."
