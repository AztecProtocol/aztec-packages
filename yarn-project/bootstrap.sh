#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

TEST_FLAKES=${TEST_FLAKES:-0}
cmd=${1:-}

hash=$(cache_content_hash \
  ../noir/.rebuild_patterns \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function build {
  github_group "yarn-project build"

  # Generate l1-artifacts before creating lock file
  (cd l1-artifacts && ./scripts/generate-artifacts.sh)

  # Fast build does not delete everything first.
  # It regenerates all generated code, then performs an incremental tsc build.
  echo -e "${blue}${bold}Attempting fast incremental build...${reset}"
  denoise yarn install

  # We append a cache busting number we can bump if need be.
  tar_file=yarn-project-$hash.tar.gz

  if ! cache_download $tar_file; then
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
      noir-protocol-circuits-types/src/{private_kernel_reset_data.ts,types/} \
      pxe/src/config/package_info.ts \
      protocol-contracts/src/protocol_contract_data.ts
    echo
    echo -e "${green}Yarn project successfully built!${reset}"
  fi
  github_endgroup
}

function test_cmds {
  for test in !(end-to-end|kv-store|bb-prover|prover-client)/src/**/*.test.ts; do
    echo yarn-project/scripts/run_test.sh $test
  done
  # TODO: formatting?
}

function test {
  test_should_run yarn-project-unit-tests-$hash || return 0

  github_group "yarn-project test"
  denoise yarn formatting
  denoise yarn test
  cache_upload_flag yarn-project-unit-tests-$hash
  github_endgroup
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "full"|"ci")
    build full
    ;;
  "fast-only")
    build fast
    ;;
  ""|"fast")
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
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
