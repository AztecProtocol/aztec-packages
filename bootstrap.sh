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

function encourage_dev_container {
  echo -e "${bold}${red}ERROR: Toolchain incompatibility. We encourage use of our dev container. See build-images/README.md.${reset}"
}

# Checks for required utilities, toolchains and their versions.
# Developers should probably use the dev container in /build-images to ensure the smoothest experience.
function check_toolchains {
  # Check for various required utilities.
  for util in jq parallel awk git curl; do
    if ! command -v $util > /dev/null; then
      encourage_dev_container
      echo "Utility $util not found."
      echo "Installation: sudo apt install $util"
      exit 1
    fi
  done
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
  # Check rust version.
  if ! rustup show | grep "1.75" > /dev/null; then
    encourage_dev_container
    echo "Rust version 1.75 not installed."
    echo "Installation:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.75.0"
    exit 1
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
  for tool in forge anvil; do
    if ! $tool --version 2> /dev/null | grep 25f24e6 > /dev/null; then
      encourage_dev_container
      echo "$tool not in PATH or incorrect version (requires 25f24e677a6a32a62512ad4f561995589ac2c7dc)."
      echo "Installation: https://book.getfoundry.sh/getting-started/installation"
      echo "  curl -L https://foundry.paradigm.xyz | bash"
      echo "  foundryup -i nightly-25f24e677a6a32a62512ad4f561995589ac2c7dc"
      exit 1
    fi
  done
  # Check Node.js version.
  local node_min_version="18.19.0"
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
  echo "(cd barretenberg/cpp && ./format.sh staged)" >$hooks_dir/pre-commit
  echo "./yarn-project/precommit.sh" >>$hooks_dir/pre-commit
  echo "./noir-projects/precommit.sh" >>$hooks_dir/pre-commit
  echo "./yarn-project/constants/precommit.sh" >>$hooks_dir/pre-commit
  chmod +x $hooks_dir/pre-commit
}

function test_cmds {
  if [ "$#" -eq 0 ]; then
    # Ordered with longest running first, to ensure they get scheduled earliest.
    set -- spartan yarn-project/end-to-end aztec-up yarn-project noir-projects boxes barretenberg l1-contracts noir
  fi
  parallel -k --line-buffer './{}/bootstrap.sh test_cmds 2>/dev/null' ::: $@ | filter_test_cmds
}

function test {
  echo_header "test all"

  # Make sure KIND starts so it is running by the time we do spartan tests.
  spartan/bootstrap.sh kind &>/dev/null &

  # Starting txe servers with incrementing port numbers.
  trap 'kill $(jobs -p) &>/dev/null || true' EXIT
  for i in $(seq 0 $((NUM_TXES-1))); do
    existing_pid=$(lsof -ti :$((45730 + i)) || true)
    [ -n "$existing_pid" ] && kill -9 $existing_pid
    # TODO: I'd like to use dump_fail here, but TXE needs to exit 0 on receiving a SIGTERM.
    (cd $root/yarn-project/txe && LOG_LEVEL=silent TXE_PORT=$((45730 + i)) retry yarn start) &>/dev/null &
  done
  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      local j=0
      while ! nc -z 127.0.0.1 $((45730 + i)) &>/dev/null; do
        [ $j == 60 ] && echo_stderr "Warning: TXE's taking too long to start. Check them manually." && exit 1
        sleep 1
        j=$((j+1))
      done
  done

  # We will start half as many jobs as we have cpu's.
  # This is based on the slightly magic assumption that many tests can benefit from 2 cpus,
  # and also that half the cpus are logical, not physical.
  echo "Gathering tests to run..."
  local num_cpus=$(get_num_cpus)
  tests=$(test_cmds $@)
  echo "Gathered $(echo "$tests" | wc -l) tests."
  echo "$tests" | parallelise $((num_cpus / 2))
}

function build {
  echo_header "pull submodules"
  denoise "git submodule update --init --recursive"

  check_toolchains

  # Ensure we have yarn set up.
  corepack enable

  projects=(
    noir
    barretenberg
    avm-transpiler
    noir-projects
    # Relies on noir-projects for verifier solidity generation.
    l1-contracts
    yarn-project
    boxes
    docs
    release-image
    aztec-up
  )

  for project in "${projects[@]}"; do
    $project/bootstrap.sh ${1:-}
  done
}

function bench {
  # TODO bench for arm64.
  if [ "$CI_FULL" -eq 0 ] || [ $(arch) == arm64 ]; then
    return
  fi
  denoise "barretenberg/bootstrap.sh bench"
  denoise "yarn-project/end-to-end/bootstrap.sh bench"
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
  #   docs => publish docs if dist tag is latest. TODO Link build in github release.
  #   release-image => push docker image to dist tag.
  #   boxes/l1-contracts => mirror repo to branch equal to dist tag (master if latest). Also mirror to tag equal to REF_NAME.

  echo_header "release all"
  set -x
  check_release

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
    docs
    release-image
  )
  if [ $(arch) == arm64 ]; then
    echo "Only deploying packages with platform-specific binaries on arm64."
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

function release_commit {
  export REF_NAME="commit-$COMMIT_HASH"

  release_github

  projects=(
    barretenberg/cpp
    barretenberg/ts
    noir
    l1-contracts
    yarn-project
    # Should publish at least one of our boxes to it's own repo.
    #boxes
    docs
    release-image
  )

  for project in "${projects[@]}"; do
    $project/bootstrap.sh release_commit
  done
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
    build $cmd
  ;;
  "ci")
    build
    test
    bench
    release
    ;;
  test|test_cmds|bench|release|release_dryrun|release_commit)
    $cmd "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "usage: $0 <clean|check|fast|full|test_cmds|test|ci|release>"
    exit 1
  ;;
esac
