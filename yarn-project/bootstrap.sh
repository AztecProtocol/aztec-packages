#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

TEST_FLAKES=${TEST_FLAKES:-0}
cmd=${1:-}

hash=$(cache_content_hash \
  ../noir/.rebuild_patterns \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function build {
  echo_header "yarn-project build"

  # Generate l1-artifacts before creating lock file
  (cd l1-artifacts && ./scripts/generate-artifacts.sh)

  # Fast build does not delete everything first.
  # It regenerates all generated code, then performs an incremental tsc build.
  echo -e "${blue}${bold}Attempting fast incremental build...${reset}"
  denoise "yarn install"

  # We append a cache busting number we can bump if need be.
  tar_file=yarn-project-$hash.tar.gz

  if cache_download $tar_file; then
    yarn install
    return
  fi

  case "${1:-}" in
    "fast")
      yarn build:fast
      ;;
    "full")
      yarn build
      ;;
    *)
      if ! yarn build:fast; then
        echo -e "${yellow}${bold}Incremental build failed for some reason, attempting full build...${reset}\n"
        yarn build
      fi
  esac


  denoise 'cd end-to-end && yarn build:web'

  # Upload common patterns for artifacts: dest, fixtures, build, artifacts, generated
  # Then one-off cases. If you've written into src, you need to update this.
  cache_upload $tar_file */{dest,fixtures,build,artifacts,generated} \
    circuit-types/src/test/artifacts \
    end-to-end/src/web/{main.js,main.js.LICENSE.txt} \
    ivc-integration/src/types/ \
    noir-contracts.js/{codegenCache.json,src/} \
    noir-protocol-circuits-types/src/{private_kernel_reset_data.ts,private_kernel_reset_vks.ts,private_kernel_reset_types.ts,client_artifacts_helper.ts,types/} \
    pxe/src/config/package_info.ts \
    protocol-contracts/src/protocol_contract_data.ts
  echo
  echo -e "${green}Yarn project successfully built!${reset}"
}

function test_cmds {
  # TODO: This takes way longer than it probably should.
  echo "$hash cd yarn-project && yarn formatting"

  # These need isolation due to network stack usage.
  for test in {prover-node,p2p}/src/**/*.test.ts; do
    echo "$hash ISOLATE=1 yarn-project/scripts/run_test.sh $test"
  done

  # Exclusions:
  # end-to-end: e2e tests handled separately with end-to-end/bootstrap.sh.
  # kv-store: Uses mocha so will need different treatment. WORKTODO(adam)
  # prover-node: Isolated using docker above.
  # p2p: Isolated using docker above.
  # WORKTODO(adam) I reenabled bb-prover and prover-client as we have tested these in the past.
  # WORKTODO(adam) if we don't want these has to be conscious decision
  for test in !(end-to-end|kv-store|prover-node|p2p)/src/**/*.test.ts; do
    echo $hash yarn-project/scripts/run_test.sh $test
  done

  # Uses mocha - so we have to treat it differently...
  # echo "cd yarn-project/kv-store && yarn test"
}

function test {
  echo_header "yarn-project test"
  test_cmds | parallelise
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build $cmd
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
