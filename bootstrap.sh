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

cmd=${1:-}
[ -n "$cmd" ] && shift

if [ ! -v NOIR_HASH ] && [ "$cmd" != "clean" ]; then
  export NOIR_HASH=$(./noir/bootstrap.sh hash)
  [ -n "$NOIR_HASH" ]
fi

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
  if ! clang++-16 --version | grep "clang version 16." > /dev/null; then
    encourage_dev_container
    echo "clang 16 not installed."
    echo "Installation: sudo apt install clang-16"
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
  if ! cat /opt/wasi-sdk/VERSION 2> /dev/null | grep 22.0 > /dev/null; then
    encourage_dev_container
    echo "wasi-sdk-22 not found at /opt/wasi-sdk."
    echo "Use dev container, build from source, or you can install linux x86 version with:"
    echo "  curl -s -L https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-22/wasi-sdk-22.0-linux.tar.gz | tar zxf - && sudo mv wasi-sdk-22.0 /opt/wasi-sdk"
    exit 1
  fi
  # Check foundry version.
  local foundry_version="nightly-99634144b6c9371982dcfc551a7975c5dbf9fad8"
  for tool in forge anvil; do
    if ! $tool --version 2> /dev/null | grep "${foundry_version#nightly-}" > /dev/null; then
      encourage_dev_container
      echo "$tool not in PATH or incorrect version (requires $foundry_version)."
      echo "Installation: https://book.getfoundry.sh/getting-started/installation"
      echo "  curl -L https://foundry.paradigm.xyz | bash"
      echo "  foundryup -i $foundry_version"
      exit 1
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

function sort_by_cpus {
  awk '
    {
      cpus = 0;  # Default value
      # Split line on space, take first field ($1)
      split($1, subfields, ":");  # Split first field on :
      for (i in subfields) {
        split(subfields[i], arr, "=");
        if (arr[1] == "CPUS") {
          cpus = arr[2];
          break;
        }
      }
      # Print padded CPUS value followed by original line
      printf "%010d %s\n", cpus, $0
    }
  ' | sort -s -r -n -k1,1 | cut -d' ' -f2-
}

function test_cmds {
  if [ "$#" -eq 0 ]; then
    # Ordered with longest running first, to ensure they get scheduled earliest.
    set -- spartan yarn-project/end-to-end aztec-up yarn-project noir-projects boxes playground barretenberg l1-contracts noir docs
  fi
  parallel -k --line-buffer './{}/bootstrap.sh test_cmds' ::: $@ | filter_test_cmds | sort_by_cpus
}

function start_txes {
  # Starting txe servers with incrementing port numbers.
  trap 'kill -SIGTERM $txe_pids &>/dev/null || true' EXIT
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
export -f start_txes

function test {
  echo_header "test all"

  start_txes

  # Make sure KIND starts so it is running by the time we do spartan tests.
  # spartan/bootstrap.sh kind &>/dev/null &

  # We will start half as many jobs as we have cpu's.
  # This is based on the slightly magic assumption that many tests can benefit from 2 cpus,
  # and also that half the cpus are logical, not physical.
  echo "Gathering tests to run..."
  tests=$(test_cmds $@)

  # Note: Capturing strips last newline. The echo re-adds it.
  local num
  [ -z "$tests" ] && num=0 || num=$(echo "$tests" | wc -l)
  echo "Gathered $num tests."

  echo "$tests" | parallelise
}

function build {
  echo_header "pull submodules"
  denoise "git submodule update --init --recursive"

  check_toolchains

  # Ensure we have yarn set up.
  corepack enable

  # These projects are dependent on each other and must be built linearly.
  serial_projects=(
    noir
    barretenberg
    avm-transpiler
    noir-projects
    l1-contracts
    yarn-project
  )
  # These projects can be built in parallel.
  parallel_cmds=(
    boxes/bootstrap.sh
    playground/bootstrap.sh
    docs/bootstrap.sh
    release-image/bootstrap.sh
    spartan/bootstrap.sh
    aztec-up/bootstrap.sh
  )

  for project in "${serial_projects[@]}"; do
    $project/bootstrap.sh ${1:-}
  done

  parallel --line-buffer --tag --halt now,fail=1 "denoise '{}'" ::: ${parallel_cmds[@]}
}

function bench_cmds {
  if [ "$#" -eq 0 ]; then
    # Ordered with longest running first, to ensure they get scheduled earliest.
    set -- yarn-project/end-to-end yarn-project barretenberg/cpp barretenberg/acir_tests noir-projects/noir-protocol-circuits l1-contracts
  fi
  parallel -k --line-buffer './{}/bootstrap.sh bench_cmds' ::: $@ | sort_by_cpus
}

function build_bench {
  # TODO bench for arm64.
  if [ $(arch) == arm64 ]; then
    return
  fi
  parallel --line-buffer --tag --halt now,fail=1 'denoise "{}/bootstrap.sh build_bench"' ::: \
    barretenberg/cpp \
    yarn-project/end-to-end
}
export -f build_bench

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
  build_bench
  find . -type d -iname bench-out | xargs rm -rf
  bench_cmds | STRICT_SCHEDULING=1 parallelise
  rm -rf bench-out
  mkdir -p bench-out
  bench_merge
  cache_upload bench-$COMMIT_HASH.tar.gz bench-out/bench.json
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
  #   boxes/l1-contracts => mirror repo to branch equal to dist tag (master if latest). Also mirror to tag equal to REF_NAME.

  echo_header "release all"
  set -x

  # Ensure we have a github release for our REF_NAME, if not on latest.
  # On latest we rely on release-please to create this for us.
  if [ $(dist_tag) != latest ]; then
    release_github
  fi

  projects=(
    barretenberg/cpp
    barretenberg/ts
    noir
    l1-contracts
    yarn-project
    boxes
    aztec-up
    playground
    # docs # released as part of ci
    release-image
  )
  if [ $(arch) == arm64 ]; then
    echo "Only releasing packages with platform-specific binaries on arm64."
    projects=(
      barretenberg/cpp
      release-image
    )
  fi

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
  ""|"fast"|"full")
    install_hooks
    build
  ;;
  "ci-fast")
    export CI=1
    export USE_TEST_CACHE=1
    export CI_FULL=0
    build
    test
    ;;
  "ci-full")
    export CI=1
    export USE_TEST_CACHE=0
    export CI_FULL=1
    build
    test
    bench
    ;;
  "ci-nightly")
    export CI=1
    export USE_TEST_CACHE=1
    export CI_NIGHTLY=1
    build
    release-image/bootstrap.sh push
    test
    release
    docs/bootstrap.sh release-docs
    ;;
  "ci-release")
    export CI=1
    export USE_TEST_CACHE=1
    if ! semver check $REF_NAME; then
      exit 1
    fi
    build
    release
    ;;
  "ci-barretenberg")
    export CI=1
    export USE_TEST_CACHE=1
    export DISABLE_AZTEC_VM=1
    barretenberg/cpp/bootstrap.sh ci
    ;;
  test|test_cmds|build_bench|bench|bench_cmds|bench_merge|release|release_dryrun)
    $cmd "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
