#!/usr/bin/env bash
# BrowserStack wasm Chonk bench package.
# `bench_cmds` emits one command per platform/flow; run-ci-bench handles BrowserStack and JSONL.
# Required CI env for `bench`: BROWSERSTACK_USERNAME plus BROWSERSTACK_ACCESS_KEY.
# Without them, generic `bench` emits no commands.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(hash_str \
  $(../cpp/bootstrap.sh hash) \
  $(cache_content_hash \
    ^barretenberg/wasm-bench/ \
    ./.rebuild_patterns \
  ))

config_file="$root/barretenberg/wasm-bench/wasm-bench.config.json"

default_runs=${WASM_BENCH_RUNS:-2}

function build {
  echo_header "wasm-bench build"
  npm_install_deps
  denoise "yarn build"
}

function test_cmds {
  local dir=$(realpath --relative-to=$root .)
  echo "$hash $dir/bootstrap.sh test"
}

function test {
  echo_header "wasm-bench test"
  npm_install_deps
  denoise "yarn test"
}

function bench_cmds {
  export BROWSERSTACK_USERNAME="${BROWSERSTACK_USERNAME:-${BROWSERSTACK_USER_NAME:-}}"
  if [ -z "${BROWSERSTACK_USERNAME:-}" ] || [ -z "${BROWSERSTACK_ACCESS_KEY:-}" ]; then
    echo_stderr "wasm-bench: BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY not set; skipping bench_cmds emission."
    return 0
  fi

  local platforms=(${WASM_BENCH_PLATFORMS:-})
  platforms=(${platforms[@]//,/ })
  if [ ${#platforms[@]} -eq 0 ] || [ "${platforms[0]}" = "default" ] || [ "${platforms[0]}" = "core" ]; then
    mapfile -t platforms < <(jq -r '.defaultMatrix[]' "$config_file")
  elif [ ${#platforms[@]} -eq 1 ] && { [ "${platforms[0]}" = "all" ] || [ "${platforms[0]}" = "extended" ]; }; then
    mapfile -t platforms < <(jq -r '(.extendedMatrix // (.targets | keys))[]' "$config_file")
  elif [ ${#platforms[@]} -eq 1 ] && jq -e --arg profile "${platforms[0]}" '.matrixProfiles[$profile].targets' "$config_file" >/dev/null; then
    mapfile -t platforms < <(jq -r --arg profile "${platforms[0]}" '.matrixProfiles[$profile].targets[]' "$config_file")
  fi

  local benchmark="${WASM_BENCH_BENCHMARK:-$(jq -r '.defaultBenchmark' "$config_file")}"
  if ! jq -e --arg benchmark "$benchmark" '.benchmarks[$benchmark]' "$config_file" >/dev/null; then
    echo_stderr "wasm-bench: unknown WASM_BENCH_BENCHMARK=$benchmark. Available benchmarks:"
    jq -r '.benchmarks | keys[]' "$config_file" >&2
    return 1
  fi

  local flows=(${WASM_BENCH_FLOWS:-})
  flows=(${flows[@]//,/ })
  if [ ${#flows[@]} -eq 0 ]; then
    mapfile -t flows < <(jq -r --arg benchmark "$benchmark" '.benchmarks[$benchmark].defaultFlow // empty' "$config_file")
  fi
  if [ ${#flows[@]} -eq 0 ]; then
    echo_stderr "wasm-bench: no flows configured. Set WASM_BENCH_FLOWS or add benchmarks.$benchmark.defaultFlow."
    return 1
  fi

  local prefix="$hash:NET=1:HOST_NETWORK=1:CPUS=2:MEM=4g:TIMEOUT=35m:ISOLATE=1:PARALLEL=0:ENV_VARS_TO_INJECT=BROWSERSTACK_USERNAME,BROWSERSTACK_USER_NAME,BROWSERSTACK_ACCESS_KEY"
  local dir=$(realpath --relative-to=$root .)
  for platform in "${platforms[@]}"; do
    if ! jq -e --arg platform "$platform" '.targets[$platform]' "$config_file" >/dev/null; then
      echo_stderr "wasm-bench: unknown WASM_BENCH_PLATFORMS target/profile '$platform'. Available targets:"
      jq -r '.targets | keys[]' "$config_file" >&2
      echo_stderr "Available profiles:"
      jq -r '["default", "core", "extended"] + (.matrixProfiles | keys) | unique[]' "$config_file" >&2
      return 1
    fi
    for flow in "${flows[@]}"; do
      local name="$platform-${benchmark}-${flow//+/_}"
      echo "$prefix:NAME=wasm-bench/$name WASM_BENCH_BENCHMARK=$benchmark $dir/scripts/run-ci-bench.sh $platform $flow $default_runs"
    done
  done
}

function bench {
  echo_header "wasm-bench bench"
  rm -rf bench-out && mkdir -p bench-out
  if [ "${WASM_BENCH_CONTINUE_ON_TARGET_FAILURES:-0}" -eq 1 ]; then
    local failed=0
    local total=0
    local cmd
    while IFS= read -r cmd || [ -n "$cmd" ]; do
      [ -n "$cmd" ] || continue
      total=$((total + 1))
      if ! (cd "$root" && CI=0 PASS_LOG=1 LIVE_LOGGING="${CI_REDIS_AVAILABLE:-0}" run_test_cmd "$cmd"); then
        failed=$((failed + 1))
      fi
    done < <(bench_cmds)
    echo "Completed wasm-bench report run of $total target(s) with $failed failure(s)."
  else
    bench_cmds | BENCH_CPU_COUNT=2 STRICT_SCHEDULING=1 parallelize
  fi
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
