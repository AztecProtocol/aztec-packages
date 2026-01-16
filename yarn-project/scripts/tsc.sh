#!/usr/bin/env bash
# Combines tsgo (for .d.ts) with swc (for .js) transpilation.
# Works from both yarn-project root and individual package directories.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$script_dir")"
tsgo="$root/node_modules/.bin/tsgo"
swc="$root/node_modules/.bin/swc"

watch=false
skip_swc=false
no_emit=false
extra_args=()

for arg in "$@"; do
  case $arg in
    -w|--watch) watch=true ;;
    --emitDeclarationOnly) skip_swc=true ;;
    --noEmit) no_emit=true; skip_swc=true ;;
    -b|--build) ;; # already included by default
    *) extra_args+=("$arg") ;;
  esac
done

# Build tsgo command
tsgo_cmd="$tsgo -b"
$no_emit && tsgo_cmd+=" --noEmit" || tsgo_cmd+=" --emitDeclarationOnly"
$watch && tsgo_cmd+=" --watch"
for arg in "${extra_args[@]+"${extra_args[@]}"}"; do tsgo_cmd+=" $arg"; done

if $skip_swc; then
  exec $tsgo_cmd
fi

swc_cmd="cd {} && $swc src -d dest --config-file=$root/.swcrc --strip-leading-paths"
$watch && swc_cmd+=" --watch"

if [[ -d "src" ]]; then
  # Package mode - run tsgo and swc in parallel
  parallel --halt now,fail=1 ::: "$tsgo_cmd" "cd . && $swc src -d dest --config-file=$root/.swcrc --strip-leading-paths"
else
  # Root mode - run tsgo and all swc calls in parallel
  { echo "$tsgo_cmd"; dirname */src | while read d; do echo "cd $d && $swc src -d dest --config-file=$root/.swcrc --strip-leading-paths"; done; } | parallel --halt now,fail=1 --line-buffered --tag
fi
