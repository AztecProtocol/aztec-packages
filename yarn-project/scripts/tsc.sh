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
[ "${CLAUDECODE:-0}" = "1" ] || tsgo_cmd+=" --pretty"
$no_emit && tsgo_cmd+=" --noEmit" || tsgo_cmd+=" --emitDeclarationOnly"
$watch && tsgo_cmd+=" --watch"
for arg in "${extra_args[@]+"${extra_args[@]}"}"; do tsgo_cmd+=" $arg"; done

swc_args="src -d dest --config-file=$root/.swcrc --strip-leading-paths"
$watch && swc_args+=" --watch"

# In watch mode, run with full output
if $watch; then
  if $skip_swc; then
    exec $tsgo_cmd
  elif [[ -d "src" ]]; then
    parallel --halt now,fail=1 ::: "$tsgo_cmd" "cd . && $swc $swc_args"
  else
    { echo "$tsgo_cmd"; dirname */src | while read d; do echo "cd $d && $swc $swc_args"; done; } | parallel --halt now,fail=1 --line-buffered
  fi
  exit 0
fi

# Non-watch mode: capture output per job, only show output from failed jobs
results_dir=$(mktemp -d)
trap "rm -rf $results_dir" EXIT

run_parallel() {
  local exit_code
  parallel --halt now,fail=1 --results "$results_dir" --joblog "$results_dir/log" "$@" 2>/dev/null && exit_code=0 || exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    # Show output only from failed jobs (Exitval column 7 != 0)
    # parallel encodes / as +z in directory names
    awk -F'\t' 'NR>1 && $7!=0 {gsub("/", "+z", $NF); print $NF}' "$results_dir/log" | while read -r encoded_cmd; do
      dir="$results_dir/1/$encoded_cmd"
      [[ -s "$dir/stdout" ]] && cat "$dir/stdout"
      [[ -s "$dir/stderr" ]] && cat "$dir/stderr"
    done
    return $exit_code
  fi
}

if $skip_swc; then
  run_parallel ::: "$tsgo_cmd"
elif [[ -d "src" ]]; then
  run_parallel ::: "$tsgo_cmd" "cd . && $swc $swc_args"
else
  { echo "$tsgo_cmd"; dirname */src | while read d; do echo "cd $d && $swc $swc_args"; done; } | run_parallel
fi
echo "Typescript build succeeded"
