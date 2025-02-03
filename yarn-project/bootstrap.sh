#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash \
  ../noir/.rebuild_patterns \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function compile_project {
  # TODO: 16 jobs is magic. Was seeing weird errors otherwise.
  parallel -j16 --line-buffered --tag 'cd {} && ../node_modules/.bin/swc src -d dest --config-file=../.swcrc --strip-leading-paths' "$@"
}

function get_projects {
  dirname */src l1-artifacts/generated | grep -vE '(noir-bb-bench|scripts)'
}

function format {
  find ./*/src -type f -regex '.*\.\(json\|js\|mjs\|cjs\|ts\)$' | \
    parallel -N30 ./node_modules/.bin/prettier --loglevel warn --check
}

function lint {
  get_projects | parallel 'cd {} && ../node_modules/.bin/eslint --cache ./src'
}
export -f format lint get_projects

function build {
  echo_header "yarn-project build"

  denoise "$0 clean-lite"
  denoise "yarn install"

  if cache_download yarn-project-$hash.tar.gz; then
    return
  fi

  compile_project ::: foundation circuits.js types builder ethereum l1-artifacts

  # This many projects have a generation stage now!?
  parallel --joblog joblog.txt --line-buffered --tag 'cd {} && yarn generate' ::: \
    accounts \
    circuit-types \
    circuits.js \
    ivc-integration \
    kv-store \
    l1-artifacts \
    native \
    noir-contracts.js \
    noir-protocol-circuits-types \
    protocol-contracts \
    pxe \
    types
  cat joblog.txt

  get_projects | compile_project

  cmds=(
    format
    'cd aztec.js && yarn build:web'
    'cd end-to-end && yarn build:web'
  )
  if [ "${typecheck:-0}" -eq 1 ]; then
    cmds+=(
      'yarn tsc -b --emitDeclarationOnly'
      lint
    )
  fi
  parallel --joblog joblog.txt --tag denoise ::: "${cmds[@]}"
  cat joblog.txt
  # parallel --line-buffered --tag denoise 'cd {} && yarn build:web' ::: aztec.js end-to-end

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
    [ -n "${2:-}" ] && cd $2
    git clean -fdx
    ;;
  "clean-lite")
    # git clean -fdx --exclude=node_modules --exclude=.yarn
    git ls-files --ignored --others --exclude-standard \
      | grep -vE '^(node_modules/|\.yarn/)' || true \
      | xargs --no-run-if-empty rm -rf
    ;;
  "ci")
    typecheck=1 build
    test
    ;;
  ""|"fast")
    build
    ;;
  "full")
    typecheck=1 build
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
  "compile")
    shift
    if [ -n "${1:-}" ]; then
      compile_project ::: "$@"
    else
      get_projects | compile_project
    fi
    ;;
  "format")
    format
    ;;
  "lint")
    lint
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
