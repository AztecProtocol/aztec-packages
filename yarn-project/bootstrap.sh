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

  denoise "yarn install"

  if cache_download yarn-project-$hash.tar.gz; then
    return
  fi

  for project in foundation l1-artifacts circuits.js; do
    denoise "cd $project && yarn build"
  done
  denoise "yarn generate"
  denoise "yarn tsc -b"

  parallel --line-buffered --tag "denoise 'cd {}; yarn build:web'" ::: aztec.js end-to-end

  # Upload common patterns for artifacts: dest, fixtures, build, artifacts, generated
  # Then one-off cases. If you've written into src, you need to update this.
  cache_upload yarn-project-$hash.tar.gz \
    */{dest,fixtures,build,artifacts,generated} \
    circuit-types/src/test/artifacts \
    end-to-end/src/web/{main.js,main.js.LICENSE.txt,*.wasm.gz} \
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
  # kv-store: Uses mocha so will need different treatment.
  # prover-node: Isolated using docker above.
  # p2p: Isolated using docker above.
  for test in !(end-to-end|kv-store|prover-node|p2p)/src/**/*.test.ts; do
    echo $hash yarn-project/scripts/run_test.sh $test
  done

  # Uses mocha - so we have to treat it differently...
  echo "$hash cd yarn-project/kv-store && yarn test"
}

function test {
  echo_header "yarn-project test"
  local num_cpus=$(get_num_cpus)
  test_cmds | parallelise $((num_cpus / 2))
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "clean-lite")
    git ls-files --ignored --others --exclude-standard \
      | grep -v '^node_modules/' \
      | grep -v '^\.yarn/' \
      | xargs rm -rf || true
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast")
    build
    ;;
  "full")
    git clean -fdx --exclude=node_modules --exclude=.yarn
    build
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
  "release")
    release
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
