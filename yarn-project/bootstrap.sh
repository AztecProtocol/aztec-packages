#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

function hash {
  cache_content_hash \
    ../noir/.rebuild_patterns \
    ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
    ../barretenberg/*/.rebuild_patterns
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
  find ./*/src -type f -regex '.*\.\(json\|js\|mjs\|cjs\|ts\)$' | \
    parallel -N30 ./node_modules/.bin/prettier --loglevel warn --check
}

function lint {
  get_projects | parallel "cd {} && ../node_modules/.bin/eslint $@ --cache ./src"
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
    stdlib \
    ivc-integration \
    l1-artifacts \
    native \
    noir-contracts.js \
    noir-protocol-circuits-types \
    protocol-contracts \
    pxe
  cat joblog.txt

  get_projects | compile_project

  cmds=(format)
  if [ "${TYPECHECK:-0}" -eq 1 ] || [ "${CI:-0}" -eq 1 ]; then
    # Fully type check and lint.
    cmds+=('yarn tsc -b --emitDeclarationOnly && lint')
  else
    # We just need the type declarations required for downstream consumers.
    cmds+=('cd aztec.js && yarn tsc -b --emitDeclarationOnly')
  fi
  parallel --joblog joblog.txt --tag denoise ::: "${cmds[@]}"
  cat joblog.txt

  if [ "${CI:-0}" -eq 1 ]; then
    cache_upload "yarn-project-$hash.tar.gz" $(git ls-files --others --ignored --exclude-standard | grep -v '^node_modules/')
  fi
}

export -f compile_project format lint get_projects compile_all hash

function build {
  echo_header "yarn-project build"
  denoise "./bootstrap.sh clean-lite"
  if [ "${CI:-0}" = 1 ]; then
    # If in CI mode, retry as bcrypto can sometimes fail mysteriously.
    # We set immutable since we don't expect the yarn.lock to change. Note that we have also added all package.json
    # files to yarn immutablePatterns, so if they are also changed, this step will fail.
    denoise "retry yarn install --immutable"
  else
    denoise "yarn install --no-immutable"
  fi
  denoise "compile_all"
  echo -e "${green}Yarn project successfully built!${reset}"
}

function test_cmds {
  local hash=$(hash)
  # These need isolation due to network stack usage (p2p, anvil, etc).
  for test in {prover-node,p2p,ethereum,aztec}/src/**/*.test.ts; do
    if [[ ! "$test" =~ testbench ]]; then
      echo "$hash ISOLATE=1 yarn-project/scripts/run_test.sh $test"
    else
      # Testbench runs require more memory and CPU.
      echo "$hash ISOLATE=1 CPUS=18 MEM=12g yarn-project/scripts/run_test.sh $test"
    fi

  done

  # Enable real proofs in prover-client integration tests only on CI full
  for test in prover-client/src/test/*.test.ts; do
    if [ "$CI_FULL" -eq 1 ]; then
      echo "$hash ISOLATE=1 LOG_LEVEL=verbose CPUS=16 MEM=96g yarn-project/scripts/run_test.sh $test"
    else
      echo "$hash FAKE_PROOFS=1 yarn-project/scripts/run_test.sh $test"
    fi
  done

  # Exclusions:
  # end-to-end: e2e tests handled separately with end-to-end/bootstrap.sh.
  # kv-store: Uses mocha so will need different treatment.
  # noir-bb-bench: A slow pain. Figure out later.
  # prover-client/src/test: Enable real proofs only on CI full.
  # prover-node|p2p|ethereum|aztec: Isolated using docker above.
  for test in !(end-to-end|kv-store|prover-node|p2p|ethereum|aztec|noir-bb-bench)/src/**/*.test.ts; do
    [[ "$test" == prover-client/src/test/* ]] && continue
    echo $hash yarn-project/scripts/run_test.sh $test
  done

  # Uses mocha for browser tests, so we have to treat it differently.
  echo "$hash cd yarn-project/kv-store && yarn test"
  echo "$hash cd yarn-project/ivc-integration && yarn test:browser"
}

function test {
  echo_header "yarn-project test"
  local num_cpus=$(get_num_cpus)
  test_cmds | filter_test_cmds | parallelise $((num_cpus / 2))
}

function release_packages {
  echo "Computing packages to publish..."
  local packages=$(get_projects topological)
  local package_list=()
  for package in $packages; do
    (cd $package && deploy_npm $1 $2)
    local package_name=$(jq -r .name "$package/package.json")
    package_list+=("$package_name@$2")
  done
  # Smoke test the deployed packages.
  local dir=$(mktemp -d)
  cd "$dir"
  do_or_dryrun npm init -y
  # NOTE: originally this was on one line, but sometimes snagged downloading end-to-end (most recently published package).
  # Strictly speaking this could need a retry, but the natural time this takes should make it available by install time.
  for package in "${packages_list[@]}"; do
    do_or_dryrun npm install $package
  done
  rm -rf "$dir"
}

function release {
  echo_header "yarn-project release"
  # WORKTODO latest is only on master, otherwise use ref name
  release_packages $(dist_tag) ${REF_NAME#v}
}

function release_commit {
  echo_header "yarn-project release commit"
  release_packages next "$CURRENT_VERSION-commit.$COMMIT_HASH"
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
  "lint")
    lint "$@"
    ;;
  test|test_cmds|hash|release|release_commit|format)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
