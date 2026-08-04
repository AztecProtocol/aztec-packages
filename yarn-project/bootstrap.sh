#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

function hash {
  # Pinned dependencies are hashed via yarn.lock (covered by the yarn-project patterns).
  # The fnd components remain because their build artifacts are still copied from
  # source at generate time (noir-protocol-circuits-types, ivc-integration,
  # protocol-contracts); TODO(monorepo-split): remove them once those are consumed
  # as published packages.
  # The ipc-codegen/cdb patterns cover the simulator's cdb server codegen, which
  # runs ipc-codegen against barretenberg's cdb_schema.json on every build.
  hash_str \
    $(../labs-aztec-toolchain/bootstrap.sh hash) \
    $(../noir-projects/labs/noir-contracts/bootstrap.sh hash) \
    $(../noir-projects/labs/aztec-nr/bootstrap.sh hash) \
    $(../noir-projects/fnd/noir-protocol-circuits/bootstrap.sh hash) \
    $(cache_content_hash "^noir-projects/fnd/mock-protocol-circuits/" "^noir-projects/fnd/noir-contracts/") \
    $(cache_content_hash "^ipc-codegen/" "^barretenberg/cpp/src/barretenberg/cdb/") \
    $(cache_content_hash ../yarn-project/.rebuild_patterns)
}

function compile_project {
  # TODO: 16 jobs is magic. Was seeing weird errors otherwise.
  parallel -j16 --line-buffered --tag 'cd {} && ../node_modules/.bin/swc src -d dest --config-file=../.swcrc --strip-leading-paths' "$@"
}

# Returns a list of project paths to compile/lint/publish.
# Ensure exclusions are matching in both cases.
function get_projects {
  if [ "${1:-}" == 'topological' ]; then
    yarn workspaces foreach --topological-dev -A \
      --exclude @aztec/aztec3-packages \
      --exclude @aztec/scripts \
      exec 'echo $(pwd)' | cat | grep -v "Done"
  else
    dirname */src | xargs realpath
  fi
}

function format {
  local arg="-w"
  local packages=()

  # Parse all arguments
  while [ $# -gt 0 ]; do
    case "$1" in
      --check)
        arg="--check"
        ;;
      -w|--write)
        arg="-w"
        ;;
      -*)
        echo "Unknown flag: $1" >&2
        return 1
        ;;
      *)
        packages+=("$1")
        ;;
    esac
    shift
  done

  # Build the paths array to search
  local paths=()
  if [ ${#packages[@]} -eq 0 ]; then
    paths=(./*/src)
  else
    for pkg in "${packages[@]}"; do
      if [ ! -d "./$pkg/src" ]; then
        echo "Error: Package '$pkg' not found or has no src directory" >&2
        return 1
      fi
      paths+=("./$pkg/src")
    done
  fi

  find "${paths[@]}" -type f -regex '.*\.\(json\|js\|mjs\|cjs\|ts\)$' | \
    parallel -N30 ./node_modules/.bin/prettier --log-level warn "$arg"
}

function lint {
  local arg="--fix"
  local packages=()

  # Parse all arguments
  while [ $# -gt 0 ]; do
    case "$1" in
      --check)
        arg=""
        ;;
      --fix)
        arg="--fix"
        ;;
      -*)
        echo "Unknown flag: $1" >&2
        return 1
        ;;
      *)
        packages+=("$1")
        ;;
    esac
    shift
  done

  if [ ${#packages[@]} -gt 0 ]; then
    # Validate packages exist
    for pkg in "${packages[@]}"; do
      if [ ! -d "./$pkg/src" ]; then
        echo "Error: Package '$pkg' not found or has no src directory" >&2
        return 1
      fi
    done
    # Lint specified packages in parallel (use at most half of CPU cores)
    printf '%s\n' "${packages[@]}" | parallel -j 50% "cd {} && ../node_modules/.bin/eslint --cache $arg ./src"
  else
    # Lint all packages in parallel (use at most half of CPU cores)
    get_projects | parallel -j 50% "cd {} && ../node_modules/.bin/eslint --cache $arg ./src"
  fi
}

function compile_all_projects {
  get_projects | compile_project
}

function compile_all {
  set -euo pipefail
  local hash=$(hash)
  if cache_download yarn-project-$hash.tar.gz; then
    return
  fi

  # Ensure the pinned version sqlite3mc-wasm upstream artifacts are present before any package builds.
  ./sqlite3mc-wasm/scripts/vendor.sh ensure

  # produce constants.gen.ts before compiling the constants package.
  constants/scripts/remake-constants.sh

  compile_project ::: constants foundation stdlib blob-lib builder ethereum

  # Call all projects that have a generation stage.
  parallel --joblog joblog.txt --line-buffered --tag 'cd {} && yarn generate' ::: \
    accounts \
    aztec.js \
    cli \
    slasher \
    stdlib \
    ivc-integration \
    noir-contracts.js \
    noir-test-contracts.js \
    noir-protocol-circuits-types \
    protocol-contracts \
    pxe \
    simulator \
    standard-contracts
  cat joblog.txt

  get_projects | compile_project

  cd txe && yarn build
  cd ..

  # Run oracle version checks after compilation
  cd pxe && yarn check_oracle_version
  cd ..
  cd txe && yarn check_txe_oracle_version
  cd ..

  cmds=('format --check' 'yarn tsgo -b --emitDeclarationOnly')
  if [ "${CI:-0}" -eq 1 ]; then
    cmds+=('lint --check')
  fi
  parallel --joblog joblog.txt --tag denoise ::: "${cmds[@]}"
  cat joblog.txt

  if [ "$CI" -eq 1 ]; then
    cache_upload "yarn-project-$hash.tar.gz" $(git ls-files --others --ignored --exclude-standard | grep -v '^node_modules/')
  fi
}

export -f compile_project format lint get_projects compile_all hash

# The @aztec/l1-artifacts foundry bundle references solc by version (a portable npm
# package cannot ship a platform binary), so the runtime forge deploy resolves it through
# ~/.svm. The e2e containers run without network and inherit ~/.svm from the host's home
# mount, so warm it at build time. The version is read from the installed bundle, so it
# cannot drift from what the deploy will request. On the monorepo this is normally a no-op:
# l1-contracts-solc has already populated ~/.svm by the time yarn-project builds.
function warm_solc_cache {
  local foundry_toml=node_modules/@aztec/l1-artifacts/l1-contracts/foundry.toml
  [ -f "$foundry_toml" ] || return 0
  local solc_version=$(sed -n 's/^solc_version = "\(.*\)"$/\1/p' "$foundry_toml")
  # A bundle that ships its own solc binary (solc = "./solc-x.y.z") needs no warming.
  [ -n "$solc_version" ] || return 0
  [ -f "$HOME/.svm/$solc_version/solc-$solc_version" ] && return 0
  echo_stderr "Warming solc $solc_version into ~/.svm for the offline forge deploy path..."
  # svm-rs only uses ~/.svm if it exists (falling back to XDG dirs otherwise), so make sure
  # it does: the deploy path inside the containers must find the binary at this exact path.
  mkdir -p "$HOME/.svm"
  local tmp=$(mktemp -d)
  mkdir -p "$tmp/src"
  printf '[profile.default]\nsolc_version = "%s"\n' "$solc_version" > "$tmp/foundry.toml"
  printf '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Warm {}\n' > "$tmp/src/Warm.sol"
  # svm fetches from binaries.soliditylang.org, which intermittently fails to resolve under
  # heavy parallel CI load; retry only on connection/DNS failures so real errors fail fast.
  RETRY_ATTEMPTS=30 RETRY_SLEEP=10 retry -p 'dns error|Temporary failure in name resolution|error sending request|failed to lookup address|Connection refused|connection reset' \
    "cd $tmp && forge build"
  rm -rf "$tmp"
  if [ ! -f "$HOME/.svm/$solc_version/solc-$solc_version" ]; then
    echo_stderr "ERROR: forge/svm did not install solc $solc_version into ~/.svm."
    exit 1
  fi
}

function build {
  echo_header "yarn-project build"
  denoise "./bootstrap.sh clean-lite"
  npm_install_deps ../noir
  denoise "warm_solc_cache"
  denoise "compile_all"
}

function test_cmds {
  local hash=$(hash)

  # Exclusions:
  # end-to-end: e2e tests handled separately with end-to-end/bootstrap.sh.
  # kv-store: per-file fan-out handled by kv-store/bootstrap.sh test_cmds.
  for test in !(end-to-end|kv-store|aztec)/src/**/*.test.ts; do
    # Skip benchmarks here.
    [[ "$test" =~ \.bench\.test\.ts$ ]] && continue

    local prefix=$hash
    local cmd_env=""

    # These need isolation due to network stack usage (p2p, anvil, etc).
    if [[ "$test" =~ ^(prover-node|p2p|ethereum|aztec|prover-client/src/test|stdlib/src/l1-contracts|ivc-integration/src/chonk_browser|blob-client/src/server) ]]; then
      prefix+=":ISOLATE=1:NAME=$test"
    fi

    if [[ "$test" =~ ^ivc-integration/src/chonk_browser ]]; then
      prefix+=":NET=1"
    fi

    # Boost some tests resources.
    if [[ "$test" =~ testbench ]]; then
      prefix+=":CPUS=10:MEM=16g"
    elif [[ "$test" =~ avm_proving_tests || "$test" =~ rollup_ivc_integration || "$test" =~ avm_integration ]]; then
      prefix+=":CPUS=16:MEM=16g"
    elif [[ "$test" =~ ^ivc-integration/ ]]; then
      prefix+=":CPUS=8"
    fi

    # Add debug logging for tests that require a bit more info
    if [[ "$test" == p2p/src/client/p2p_client.test.ts || "$test" == p2p/src/services/discv5/discv5_service.test.ts || "$test" == p2p/src/client/p2p_client.integration.test.ts ]]; then
      cmd_env+=" LOG_LEVEL=\"debug; info: json-rpc, simulator\""
    elif [[ "$test" =~ rollup_ivc_integration || "$test" =~ avm_integration ]]; then
      cmd_env+=" LOG_LEVEL=\"debug; info: json-rpc, simulator\" BB_VERBOSE=1 "
    elif [[ "$test" =~ e2e_p2p ]]; then
      cmd_env+=" LOG_LEVEL='verbose; debug:p2p'"
    fi

    # Enable real proofs in prover-client integration tests only on CI full.
    if [[ "$test" =~ ^prover-client/src/test/ ]]; then
      if [ "$CI_FULL" -eq 1 ]; then
        prefix+=":CPUS=16:MEM=96g"
        cmd_env+=" LOG_LEVEL=verbose HARDWARE_CONCURRENCY=16"
      else
        cmd_env+=" FAKE_PROOFS=1"
      fi
    fi

    echo "${prefix}${cmd_env} yarn-project/scripts/run_test.sh $test"
  done

  # kv-store: per-file fan-out (mocha for node tests, vitest for browser tests).
  kv-store/bootstrap.sh test_cmds

  # Aztec CLI tests
  aztec/bootstrap.sh test_cmds

  if [[ "${TARGET_BRANCH:-}" =~ ^(v[0-9]+(-next)?|backport-to-v[0-9]+-(staging|next))$ ]]; then
    echo "$hash yarn-project/scripts/run_test.sh aztec/src/testnet_compatibility.test.ts"
    echo "$hash yarn-project/scripts/run_test.sh aztec/src/mainnet_compatibility.test.ts"
  fi
}

function test {
  echo_header "yarn-project test"
  test_cmds | filter_test_cmds | parallelize
}

function bench_cmds {
  local hash=$(hash)
  echo "$hash BENCH_OUTPUT=bench-out/sim.bench.json yarn-project/scripts/run_test.sh simulator/src/public/public_tx_simulator/apps_tests/bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/native_world_state.bench.json yarn-project/scripts/run_test.sh world-state/src/native/native_bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/kv_store.bench.json yarn-project/scripts/run_test.sh kv-store/src/bench/map_bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/tx_pool_v2.bench.json yarn-project/scripts/run_test.sh p2p/src/mem_pools/tx_pool_v2/tx_pool_v2_bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/tx_validator.bench.json yarn-project/scripts/run_test.sh p2p/src/msg_validators/tx_validator/tx_validator_bench.test.ts"
  echo "$hash:ISOLATE=1:CPUS=16:MEM=32g:TIMEOUT=1800 BENCH_OUTPUT=bench-out/p2p_client_batch_tx_requester.bench.json yarn-project/scripts/run_test.sh p2p/src/client/test/p2p_client.batch_tx_requester.bench.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/tx.bench.json yarn-project/scripts/run_test.sh stdlib/src/tx/tx_bench.test.ts"
  echo "$hash:ISOLATE=1:CPUS=10:MEM=16g:LOG_LEVEL=silent BENCH_OUTPUT=bench-out/proving_broker.bench.json yarn-project/scripts/run_test.sh prover-client/src/test/proving_broker_testbench.test.ts"
  echo "$hash:ISOLATE=1:CPUS=16:MEM=16g BENCH_OUTPUT=bench-out/avm_bulk_test.bench.json yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts"
  echo "$hash BENCH_OUTPUT=bench-out/lightweight_checkpoint_builder.bench.json yarn-project/scripts/run_test.sh prover-client/src/light/lightweight_checkpoint_builder.bench.test.ts"
  echo "$hash:ISOLATE=1:CPUS=8:MEM=32g:TIMEOUT=1200 BENCH_OUTPUT=bench-out/batch_verifier.bench.json yarn-project/scripts/run_test.sh ivc-integration/src/batch_verifier.bench.test.ts"
}

function release_packages {
  echo "Computing packages to publish..."
  local packages=$(get_projects topological)

  local package_list=()
  for package in $packages; do
    (cd $package && retry "deploy_npm $1")
    local package_name=$(jq -r .name "$package/package.json")
    package_list+=("$package_name@$1")
  done
  # Smoke test the deployed packages.
  local dir=$(mktemp -d)
  cd "$dir"
  do_or_dryrun npm init -y
  # NOTE: originally this was on one line, but sometimes snagged downloading end-to-end (most recently published package).
  for package in "${package_list[@]}"; do
    retry "do_or_dryrun npm install $package"
  done
  rm -rf "$dir"
}

function release {
  echo_header "yarn-project release"
  release_packages "${REF_NAME#v}"
}

case "$cmd" in
  "clean")
    [ -n "${1:-}" ] && cd $1
    git clean -fdx
    ;;
  "clean-lite")
    # Preserve gitignored fixture dirs that are populated by sibling builds and
    # consumed concurrently by parallel test commands. Wiping them mid-test
    # yanks files out from under readers (see chonk_inputs.sh download path).
    files=$(git ls-files --ignored --others --exclude-standard | grep -vE '(node_modules/|^\.yarn/|^tmp/|^end-to-end/example-app-ivc-inputs-out/|^end-to-end/ultrahonk-bench-inputs/|^end-to-end/dumped-avm-circuit-inputs/)' || true)
    if [ -n "$files" ]; then
      echo "$files" | xargs rm -rf
    fi
    ;;
  "")
    build
    ;;
  "compile")
    if [ -n "${1:-}" ]; then
      compile_project ::: "$@"
    else
      get_projects | compile_project
    fi
    ;;
  instrumented_profile)
    # Automatically hooks sites with benchmarking instrumentation.
    if [ "$#" -gt 1 ]; then
      echo "Usage: ./bootstrap.sh profile <command>"
      exit 1
    fi
    cmd=$1
    # Refuse to continue if there are uncommitted changes to tracked files.
    if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
      echo "Please commit or stash your changes before running this command."
      exit 1
    fi
    rm -f profile-*.json
    echo "NOTE: If you interrupt this you may have a dirty git state or build state. Otherwise it will clean up."
    ( cd ./scripts/instrumenting-profiler && npm install )
    ./scripts/instrumenting-profiler/instrument.sh
    denoise "./bootstrap.sh compile"
    pwd=$(pwd)
    cleanup_instrumentation() {
      # we may have changed paths
      git checkout "$pwd"
      denoise "cd '$pwd' && ./bootstrap.sh compile"
      for f in profile-*.json; do
        echo "To print: ./scripts/instrumenting-profiler/print.mjs $(pwd)/$f"
      done
    }
    trap cleanup_instrumentation EXIT
    eval "$cmd"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
