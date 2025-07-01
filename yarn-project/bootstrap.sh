#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

if [[ $(arch) == "arm64" && "$CI" -eq 1 ]]; then
  export DISABLE_AZTEC_VM=1
fi

function hash {
  hash_str \
    $(../noir/bootstrap.sh hash) \
    $(cache_content_hash \
      ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
      ../barretenberg/*/.rebuild_patterns)
}

function compile_project {
  # TODO: 16 jobs is magic. Was seeing weird errors otherwise.
  parallel -j16 --line-buffered --tag 'cd {} && ../node_modules/.bin/swc src -d dest --config-file=../.swcrc --strip-leading-paths' "$@"
}

# Returns a list of projects to compile/lint/publish.
# Ensure exclusions are matching in both cases.
function get_projects {
  if [ "${1:-}" == 'topological' ]; then
    yarn workspaces foreach --topological-dev -A \
      --exclude @aztec/aztec3-packages \
      --exclude @aztec/noir-bb-bench \
      --exclude @aztec/scripts \
      exec 'basename $(pwd)' | cat | grep -v "Done"
  else
    dirname */src l1-artifacts/generated | grep -vE 'noir-bb-bench'
  fi
}

function format {
  local arg=${1:-"-w"}
  find ./*/src -type f -regex '.*\.\(json\|js\|mjs\|cjs\|ts\)$' | \
    parallel -N30 ./node_modules/.bin/prettier --log-level warn "$arg"
}

function lint {
  local arg="--fix"
  if [ "${1-}" == "--check" ]; then
    arg=""
    shift 1
  fi
  get_projects | parallel "cd {} && ../node_modules/.bin/eslint $@ --cache $arg ./src"
}

function compile_all {
  set -euo pipefail
  local hash=$(hash)
  if cache_download yarn-project-$hash.tar.gz; then
    return
  fi
  # hack, after running prettier foundation may fail to resolve hash.js dependency.
  # it is only currently foundation, presumably because hash.js looks like a js file.
  rm -rf foundation/node_modules
  compile_project ::: constants foundation stdlib builder ethereum l1-artifacts

  # Call all projects that have a generation stage.
  parallel --joblog joblog.txt --line-buffered --tag 'cd {} && yarn generate' ::: \
    accounts \
    bb-prover \
    stdlib \
    ivc-integration \
    l1-artifacts \
    native \
    noir-contracts.js \
    noir-test-contracts.js \
    noir-protocol-circuits-types \
    protocol-contracts \
    pxe
  cat joblog.txt

  get_projects | compile_project

  cmds=('format --check')
  if [ "${TYPECHECK:-0}" -eq 1 ] || [ "${CI:-0}" -eq 1 ]; then
    # Fully type check and lint.
    cmds+=('yarn tsc -b --emitDeclarationOnly && lint --check')
  else
    # We just need the type declarations required for downstream consumers.
    cmds+=('cd aztec.js && yarn tsc -b --emitDeclarationOnly')
  fi
  parallel --joblog joblog.txt --tag denoise ::: "${cmds[@]}"
  cat joblog.txt

  if [ "$CI" -eq 1 ]; then
    cache_upload "yarn-project-$hash.tar.gz" $(git ls-files --others --ignored --exclude-standard | grep -v '^node_modules/')
  fi
}

export -f compile_project format lint get_projects compile_all hash

function build {
  echo_header "yarn-project build"
  denoise "./bootstrap.sh clean-lite"
  npm_install_deps
  denoise "compile_all"
}

function test_cmds {
  local hash=$(hash)

  # Exclusions:
  # end-to-end: e2e tests handled separately with end-to-end/bootstrap.sh.
  # kv-store: Uses mocha so will need different treatment.
  # noir-bb-bench: A slow pain. Figure out later.
  for test in !(end-to-end|kv-store|noir-bb-bench|aztec)/src/**/*.test.ts; do
    # If DISABLE_AZTEC_VM, filter out avm_proving_tests/*.test.ts and avm_integration.test.ts
    # Also must filter out rollup_ivc_integration.test.ts as it includes AVM proving.
    if [[ "${DISABLE_AZTEC_VM:-0}" -eq 1 && "$test" =~ (avm_proving_tests|avm_integration|rollup_ivc_integration) ]]; then
      continue
    fi

    local prefix=$hash
    local cmd_env=""

    # These need isolation due to network stack usage (p2p, anvil, etc).
    if [[ "$test" =~ ^(prover-node|p2p|ethereum|aztec|prover-client/src/test)/ ]]; then
      prefix+=":ISOLATE=1:NAME=$test"
    fi

    # Boost some tests resources.
    if [[ "$test" =~ testbench ]]; then
      prefix+=":CPUS=10:MEM=16g"
    elif [[ "$test" =~ ^ivc-integration/ ]]; then
      prefix+=":CPUS=8"
    fi

    # Add debug logging for tests that require a bit more info
    if [[ "$test" == p2p/src/client/p2p_client.test.ts || "$test" == p2p/src/services/discv5/discv5_service.test.ts || "$test" == p2p/src/client/p2p_client.integration.test.ts ]]; then
      cmd_env+=" LOG_LEVEL=debug"
    elif [[ "$test" =~ e2e_p2p ]]; then
      cmd_env+=" LOG_LEVEL='verbose; debug:p2p'"
    fi

    # Enable real proofs in prover-client integration tests only on CI full.
    if [[ "$test" =~ ^prover-client/src/test/ ]]; then
      if [ "$CI_FULL" -eq 1 ]; then
        prefix+=":CPUS=16:MEM=96g"
        cmd_env+=" LOG_LEVEL=verbose"
      else
        cmd_env+=" FAKE_PROOFS=1"
      fi
    fi

    if [[ "$test" =~ rollup_ivc_integration || "$test" =~ avm_integration ]]; then
      cmd_env+=" LOG_LEVEL=trace BB_VERBOSE=1 "
    fi

    echo "${prefix}${cmd_env} yarn-project/scripts/run_test.sh $test"
  done

  # Uses mocha for browser tests, so we have to treat it differently.
  echo "$hash cd yarn-project/kv-store && yarn test"
  echo "$hash cd yarn-project/ivc-integration && yarn test:browser"

  if [ "$CI" -eq 0 ] || [[ "${TARGET_BRANCH:-}" == "master" || "${TARGET_BRANCH:-}" == "staging" ]]; then
    echo "$hash yarn-project/scripts/run_test.sh aztec/src/test/testnet_compatibility.test.ts"
  fi
}

function test {
  echo_header "yarn-project test"
  test_cmds | filter_test_cmds | parallelise
}

function bench_cmds {
  local hash=$(hash)
  echo "$hash BENCH_OUTPUT=bench-out/sim.bench.json yarn-project/scripts/run_test.sh simulator/src/public/public_tx_simulator/apps_tests/bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/native_world_state.bench.json yarn-project/scripts/run_test.sh world-state/src/native/native_bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/kv_store.bench.json yarn-project/scripts/run_test.sh kv-store/src/bench/map_bench.test.ts"
  echo "$hash:ISOLATE=1:CPUS=10:MEM=16g:LOG_LEVEL=silent BENCH_OUTPUT=bench-out/proving_broker.bench.json yarn-project/scripts/run_test.sh prover-client/src/test/proving_broker_testbench.test.ts"
}

function release_packages {
  echo "Computing packages to publish..."
  local packages=$(get_projects topological)
  local package_list=()
  for package in $packages; do
    (cd $package && retry "deploy_npm $1 $2")
    local package_name=$(jq -r .name "$package/package.json")
    package_list+=("$package_name@$2")
  done
  # Smoke test the deployed packages.
  local dir=$(mktemp -d)
  cd "$dir"
  do_or_dryrun npm init -y
  # NOTE: originally this was on one line, but sometimes snagged downloading end-to-end (most recently published package).
  # Strictly speaking this could need a retry, but the natural time this takes should make it available by install time.
  for package in "${package_list[@]}"; do
    do_or_dryrun npm install $package
  done
  rm -rf "$dir"
}

function release {
  echo_header "yarn-project release"
  release_packages "$(dist_tag)" "${REF_NAME#v}"
}

case "$cmd" in
  "clean")
    [ -n "${2:-}" ] && cd $2
    git clean -fdx
    ;;
  "clean-lite")
    files=$(git ls-files --ignored --others --exclude-standard | grep -vE '(node_modules/|^\.yarn/)' || true)
    if [ -n "$files" ]; then
      echo "$files" | xargs rm -rf
    fi
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast")
    build
    ;;
  "full")
    TYPECHECK=1 build
    ;;
  "compile")
    if [ -n "${1:-}" ]; then
      compile_project ::: "$@"
    else
      get_projects | compile_project
    fi
    ;;
  lint|format)
    $cmd "$@"
    ;;
  test|test_cmds|bench_cmds|hash|release|format)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
