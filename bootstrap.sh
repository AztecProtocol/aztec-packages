#!/usr/bin/env bash
# Usage: ./bootstrap.sh <full|fast|check|clean>"
#   full: Bootstrap the repo from scratch.
#   fast: Bootstrap the repo using CI cache where possible to save time building.
#   check: Check required toolchains and versions are installed.
#   clean: Force a complete clean of the repo. Erases untracked files, be careful!
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Enable abbreviated output by default.
export DENOISE=${DENOISE:-1}

# Number of TXE servers to run when testing.
export NUM_TXES=8

export MAKEFLAGS="-j${MAKE_JOBS:-$(get_num_cpus)}"

cmd=${1:-}
[ -n "$cmd" ] && shift

if [ ! -v NOIR_HASH ] && [ "$cmd" != "clean" ]; then
  export NOIR_HASH=$(./noir/bootstrap.sh hash)
  [ -n "$NOIR_HASH" ]
fi

# Cleanup function. Called on script exit.
function cleanup {
  if [ -n "${txe_pids:-}" ]; then
    kill -SIGTERM $txe_pids &>/dev/null || true
  fi
}
trap cleanup EXIT

function encourage_dev_container {
  echo -e "${bold}${red}ERROR: Toolchain incompatibility. We encourage use of our dev container. See build-images/README.md.${reset}"
}

# Checks for required utilities, toolchains and their versions.
# Developers should probably use the dev container in /build-images to ensure the smoothest experience.
function check_toolchains {
  # Check for various required utilities.
  for util in jq parallel awk git curl zstd; do
    if ! command -v $util > /dev/null; then
      encourage_dev_container
      echo "Utility $util not found."
      echo "Installation: sudo apt install $util"
      exit 1
    fi
  done
  if ! command -v ldid > /dev/null; then
    encourage_dev_container
    echo "Utility ldid not found."
    echo "Install from https://github.com/ProcursusTeam/ldid."
    exit 1
  fi
  if ! yq --version | grep "version v4" > /dev/null; then
    encourage_dev_container
    echo "yq v4 not installed."
    echo "Installation: https://github.com/mikefarah/yq/#install"
    exit 1
  fi
  # Check cmake version.
  local cmake_min_version="3.24"
  local cmake_installed_version=$(cmake --version | head -n1 | awk '{print $3}')
  if [[ "$(printf '%s\n' "$cmake_min_version" "$cmake_installed_version" | sort -V | head -n1)" != "$cmake_min_version" ]]; then
    encourage_dev_container
    echo "Minimum cmake version 3.24 not found."
    exit 1
  fi
  # Check clang version.
  if ! clang++-20 --version | grep "clang version 20." > /dev/null; then
    encourage_dev_container
    echo "clang 16 not installed."
    echo "Installation: sudo apt install clang-20"
    exit 1
  fi
  # Check zig version.
  if ! zig version | grep "0.15.1" > /dev/null; then
    encourage_dev_container
    echo "zig 0.15.1 not installed."
    echo "Install in /opt/zig."
    exit 1
  fi
  # Check rustup installed.
  local rust_version=$(yq '.toolchain.channel' ./avm-transpiler/rust-toolchain.toml)
  if ! command -v rustup > /dev/null; then
    encourage_dev_container
    echo "Rustup not installed."
    echo "Installation:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain $rust_version"
    exit 1
  fi
  if ! rustup show | grep $rust_version > /dev/null; then
    # Cargo will download necessary version of rust at runtime but warn to alert that an update to the build-image
    # is desirable.
    echo -e "${bold}${yellow}WARN: Rust ${rust_version} is not installed. Performance will be degraded.${reset}"
  fi
  # Check wasi-sdk version.
  if ! cat /opt/wasi-sdk/VERSION 2> /dev/null | grep 27.0 > /dev/null; then
    encourage_dev_container
    echo "wasi-sdk-27 not found at /opt/wasi-sdk."
    echo "Use dev container, build from source, or you can install linux x86 version with:"
    echo "  curl -s -L https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/wasi-sdk-27.0-x86_64-linux.tar.gz | tar zxf - && sudo mv wasi-sdk-27.0-x86_64-linux /opt/wasi-sdk"
    exit 1
  fi
  # Check foundry version.
  local foundry_version="v1.4.1"
  for tool in forge anvil; do
    if ! $tool --version 2> /dev/null | grep "${foundry_version#nightly-}" > /dev/null; then
      echo "$tool not in PATH or incorrect version (requires $foundry_version)."
      if [ "${CI:-0}" -eq 1 ]; then
        echo "Attempting install of required foundry version $foundry_version"
        curl -L https://foundry.paradigm.xyz | bash
        ~/.foundry/bin/foundryup -i $foundry_version
      else
        encourage_dev_container
        echo "Installation: https://book.getfoundry.sh/getting-started/installation"
        echo "  curl -L https://foundry.paradigm.xyz | bash"
        echo "  foundryup -i $foundry_version"
        exit 1
      fi
    fi
  done
  # Check Node.js version.
  local node_min_version="22.15.0"
  local node_installed_version=$(node --version | cut -d 'v' -f 2)
  if [[ "$(printf '%s\n' "$node_min_version" "$node_installed_version" | sort -V | head -n1)" != "$node_min_version" ]]; then
    encourage_dev_container
    echo "Minimum Node.js version $node_min_version not found (got $node_installed_version)."
    echo "Installation: nvm install $node_min_version"
    exit 1
  fi
  # Check for required npm globals.
  for util in corepack solhint; do
    if ! command -v $util > /dev/null; then
      encourage_dev_container
      echo "$util not found."
      echo "Installation: npm install --global $util"
      exit 1
    fi
  done
}

# Install pre-commit git hooks.
function install_hooks {
  hooks_dir=$(git rev-parse --git-path hooks)
  cat <<EOF >$hooks_dir/pre-commit
#!/usr/bin/env bash
set -euo pipefail
(cd barretenberg/cpp && ./format.sh staged)
./yarn-project/precommit.sh
./noir-projects/precommit.sh
./yarn-project/constants/precommit.sh
EOF
  chmod +x $hooks_dir/pre-commit
  echo "(cd noir && ./postcheckout.sh \$@)" >$hooks_dir/post-checkout
  chmod +x $hooks_dir/post-checkout
}

export test_cmds_file="/tmp/test_cmds"

function start_txes {
  # Starting txe servers with incrementing port numbers.
  for i in $(seq 0 $((NUM_TXES-1))); do
    port=$((45730 + i))
    existing_pid=$(lsof -ti :$port || true)
    if [ -n "$existing_pid" ]; then
      echo "Killing existing process $existing_pid on port: $port"
      kill -9 $existing_pid &>/dev/null || true
      while kill -0 $existing_pid &>/dev/null; do sleep 0.1; done
    fi
    dump_fail "LOG_LEVEL=info TXE_PORT=$port retry 'node --no-warnings ./yarn-project/txe/dest/bin/index.js'" &
    txe_pids+="$! "
  done

  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      local j=0
      while ! nc -z 127.0.0.1 $((45730 + i)) &>/dev/null; do
        [ $j == 60 ] && echo_stderr "TXE $i took too long to start. Exiting." && exit 1
        sleep 1
        j=$((j+1))
      done
  done
}

function test_engine_start {
  set -euo pipefail
  rm -f $test_cmds_file
  touch $test_cmds_file
  DENOISE=0 parallelize "$@" < <(awk '/^$/{exit} {print}' < <(tail -f $test_cmds_file))
  local ret=$?
  # If a test failed, kill the build.
  if [ "$ret" -ne 0 ]; then
    pkill make &>/dev/null
  fi
  return $ret
}
export -f test_engine_start

function prep {
  echo_header "pull submodules"
  denoise "git submodule update --init --recursive"

  check_toolchains

  # Ensure we have yarn set up.
  corepack enable

  rm -f $test_cmds_file
}

function build_and_test {
  prep
  echo_header "build and test"

  # Start the test engine.
  color_prefix "test-engine" "denoise test_engine_start" &
  test_engine_pid=$!

  make "$@"

  # TODO: Handle this better to they can be run as part of the Makefile dependency tree.
  start_txes
  make noir-projects-txe-tests

  # Signal complete with empty line.
  # Will wait for any tests in the test engine to complete.
  echo >> $test_cmds_file
  wait $test_engine_pid
}

function build {
  prep
  echo_header "build"
  make "$@"
}

function bench_cmds {
  if [ "$#" -eq 0 ]; then
    # Ordered with longest running first, to ensure they get scheduled earliest.
    set -- yarn-project/end-to-end yarn-project barretenberg/cpp barretenberg/sol barretenberg/acir_tests noir-projects/noir-protocol-circuits l1-contracts
  fi
  parallel -k --line-buffer './{}/bootstrap.sh bench_cmds' ::: $@
}

function bench_merge {
  find . -path "*/bench-out/*.bench.json" -type f -print0 | \
  xargs -0 -I{} bash -c '
    dir=$1; \
    dir=${dir#./}; \
    dir=${dir%/bench-out*}; \
    jq --arg prefix "$dir/" '\''map(.name |= "\($prefix)\(.)")'\'' "$1"
  ' _ {} | jq -s add > bench-out/bench.json
}

function bench {
  # TODO bench for arm64.
  if [ $(arch) == arm64 ]; then
    return
  fi
  echo_header "bench all"
  find . -type d -iname bench-out | xargs rm -rf
  bench_cmds | STRICT_SCHEDULING=1 parallelize
  rm -rf bench-out
  mkdir -p bench-out
  bench_merge
  cache_upload bench-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
}

function release_github {
  # Add an easy link for comparing to previous release.
  local compare_link=""
  if gh release view "v$CURRENT_VERSION" &>/dev/null; then
    compare_link=$(echo -e "See changes: https://github.com/AztecProtocol/aztec-packages/compare/v${CURRENT_VERSION}...${COMMIT_HASH}")
  fi
  # Legacy releases. TODO: Eventually remove.
  if gh release view "aztec-packages-v$CURRENT_VERSION" &>/dev/null; then
    compare_link=$(echo -e "See changes: https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v${CURRENT_VERSION}...${COMMIT_HASH}")
  fi
  # Ensure we have a commit release.
  if ! gh release view "$REF_NAME" &>/dev/null; then
    do_or_dryrun gh release create "$REF_NAME" \
      --prerelease \
      --target $COMMIT_HASH \
      --title "$REF_NAME" \
      --notes "$compare_link"
  fi
}

function release {
  # Our releases are controlled by the REF_NAME environment variable, which should be a valid semver (but can have a leading v).
  # We ensure there is a github release for our REF_NAME, if not on latest (in which case release-please creates it).
  # We derive a dist tag from our prerelease portion of our REF_NAME semver. It is latest if no prerelease.
  # Our steps:
  #   barretenberg/cpp => upload binaries to github release
  #   barretenberg/ts
  #     + noir
  #     + yarn-project => NPM publish to dist tag, version is our REF_NAME without a leading v.
  #   aztec-up => upload scripts to prod if dist tag is latest
  #   playground => publish if dist tag is latest.
  #   release-image => push docker image to dist tag.
  #   boxes/l1-contracts/aztec-nr => mirror repo to branch equal to dist tag (master if latest). Also mirror to tag equal to REF_NAME.

  echo_header "release all"
  set -x

  # Ensure we have a github release for our REF_NAME.
  # This is in case were are not going through release-please.
  release_github

  projects=(
    barretenberg/cpp
    barretenberg/ts
    noir
    l1-contracts
    noir-projects/aztec-nr
    yarn-project
    boxes
    aztec-up
    playground
    release-image
  )

  for project in "${projects[@]}"; do
    $project/bootstrap.sh release
  done
}

function release_dryrun {
  DRY_RUN=1 release
}

case "$cmd" in
  "clean")
    echo "WARNING: This will erase *all* untracked files, including hooks and submodules."
    echo -n "Continue? [y/n] "
    read user_input
    if [[ ! "$user_input" =~ ^[yY](es)?$ ]]; then
      echo "Exiting without cleaning"
      exit 1
    fi

    # Remove hooks and submodules.
    rm -rf .git/hooks/*
    rm -rf .git/modules/*
    for submodule in $(git config --file .gitmodules --get-regexp path | awk '{print $2}'); do
      rm -rf $submodule
    done

    # Remove all untracked files, directories, nested repos, and .gitignore files.
    git clean -ffdx
  ;;
  "check")
    check_toolchains
    echo "Toolchains look good! 🎉"
  ;;
  ""|"fast")
    install_hooks
    build
  ;;
  "full")
    export CI_FULL=1
    install_hooks
    build full
  ;;
  "ci-fast")
    export CI=1
    export USE_TEST_CACHE=1
    export CI_FULL=0
    build_and_test
    ;;
  "ci-full")
    export CI=1
    export USE_TEST_CACHE=0
    export CI_FULL=1
    build_and_test full
    bench
    ;;
  "ci-network-deploy")
    export CI=1
    build
    spartan/bootstrap.sh network_deploy $NETWORK_ENV_FILE
    ;;
  "ci-network-tests")
    export CI=1
    build
    spartan/bootstrap.sh network_tests $NETWORK_ENV_FILE
    ;;
  "ci-release")
    export CI=1
    if ! semver check $REF_NAME; then
      exit 1
    fi
    # We perform most of the release from the amd build (which does cross-compiles etc).
    # The arm build just needs to build and push the release-image.
    if [ "$(arch)" == "amd64" ]; then
      build release
      release
    else
      build
      ./release-image/bootstrap.sh release
    fi
    ;;
  "ci-docs")
    export CI=1
    export USE_TEST_CACHE=1
    ./bootstrap.sh
    docs/bootstrap.sh ci
    ;;
  "ci-barretenberg")
    export CI=1
    export USE_TEST_CACHE=1
    export AVM=0
    export AVM_TRANSPILER=0
    barretenberg/cpp/bootstrap.sh ci
    ;;
  test|test_cmds|build_bench|bench|bench_cmds|bench_merge|release|release_dryrun|build|build_and_test|prep)
    $cmd "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
