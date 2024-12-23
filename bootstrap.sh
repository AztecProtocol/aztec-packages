#!/usr/bin/env bash
# Usage: ./bootstrap.sh <full|fast|check|clean>"
#   full: Bootstrap the repo from scratch.
#   fast: Bootstrap the repo using CI cache where possible to save time building.
#   check: Check required toolchains and versions are installed.
#   clean: Force a complete clean of the repo. Erases untracked files, be careful!
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Enable abbreviated output.
export DENOISE=1
# We always want color.
export FORCE_COLOR=true

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
  if ! rustup show | grep "1.74" > /dev/null; then
    encourage_dev_container
    echo "Rust version 1.74 not installed."
    echo "Installation:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.74.1"
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
      echo "  foundryup -v nightly-25f24e677a6a32a62512ad4f561995589ac2c7dc"
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
  # Check for yarn availability
  if ! command -v yarn > /dev/null; then
    encourage_dev_container
    echo "yarn not found."
    echo "Installation: corepack enable"
    exit 1
  fi
  # Check for yarn version
  local yarn_min_version="4.5.2"
  local yarn_installed_version=$(yarn --version)
  if [[ "$(printf '%s\n' "$yarn_min_version" "$yarn_installed_version" | sort -V | head -n1)" != "$yarn_min_version" ]]; then
    encourage_dev_container
    echo "Minimum yarn version $yarn_min_version not found (got $yarn_installed_version)."
    echo "Installation: yarn set version $yarn_min_version; yarn install"
    exit 1
  fi
}

# Install pre-commit git hooks.
function install_hooks {
  hooks_dir=$(git rev-parse --git-path hooks)
  echo "(cd barretenberg/cpp && ./format.sh staged)" >$hooks_dir/pre-commit
  echo "./yarn-project/precommit.sh" >>$hooks_dir/pre-commit
  chmod +x $hooks_dir/pre-commit
}

function test_cmds {
  if [ "$#" -gt 0 ]; then
    for arg in "$@"; do
      "$arg/bootstrap.sh" test-cmds
    done
  else
    # Ordered with longest running first, to ensure they get scheduled earliest.
    ./yarn-project/bootstrap.sh test-cmds
    ./noir-projects/bootstrap.sh test-cmds
    ./boxes/bootstrap.sh test-cmds
    ./barretenberg/bootstrap.sh test-cmds
    ./l1-contracts/bootstrap.sh test-cmds
    ./noir/bootstrap.sh test-cmds
  fi
}

function test {
  # Rust is very annoying.
  # You sneeze and everything needs recompiling and you can't avoid recompiling when running tests.
  # Ensure tests are up-to-date first so parallel doesn't complain about slow startup.
  echo "Building tests..."
  ./noir/bootstrap.sh build-tests

  # Starting txe servers with incrementing port numbers.
  export NUM_TXES=8
  trap 'kill $(jobs -p) &>/dev/null' EXIT
  for i in $(seq 0 $((NUM_TXES-1))); do
    (cd $root/yarn-project/txe && LOG_LEVEL=silent TXE_PORT=$((45730 + i)) yarn start) &
  done
  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      while ! nc -z 127.0.0.1 $((45730 + i)) &>/dev/null; do sleep 1; done
  done

  echo "Gathering tests to run..."
  test_cmds | parallelise 96
}

function build {
  github_group "pull submodules"
  denoise git submodule update --init --recursive
  github_endgroup

  check_toolchains

  projects=(
    noir
    barretenberg
    l1-contracts
    avm-transpiler
    noir-projects
    yarn-project
    boxes
  )

  # Build projects.
  for project in "${projects[@]}"; do
    $project/bootstrap.sh $cmd
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

    echo "Cleaning complete"
    exit 0
  ;;
  "check")
    check_toolchains
    echo "Toolchains look good! 🎉"
    exit 0
  ;;
  # "test-e2e")
  #   ./bootstrap.sh image-e2e
  #   shift 1
  #   yarn-project/end-to-end/scripts/e2e_test.sh $@
  #   exit
  # ;;
  # "test-cache")
  #   # Test cache by running minio with full and fast bootstraps
  #   scripts/tests/bootstrap/test-cache
  #   exit
  #   ;;
  # "test-boxes")
  #   github_group "test-boxes"
  #   bootstrap_local_noninteractive "CI=1 SKIP_BB_CRS=1 ./bootstrap.sh fast && ./boxes/bootstrap.sh test";
  #   exit
  # ;;
  "image-aztec")
    image=aztecprotocol/aztec:$(git rev-parse HEAD)
    docker pull $image &>/dev/null || true
    if docker_has_image $image; then
      exit
    fi
    github_group "image-aztec"
    source $ci3/source_tmp
    echo "earthly artifact build:"
    scripts/earthly-ci --artifact +bootstrap-aztec/usr/src $TMP/usr/src
    echo "docker image build:"
    docker pull aztecprotocol/aztec-base:v1.0-$(arch)
    docker tag aztecprotocol/aztec-base:v1.0-$(arch) aztecprotocol/aztec-base:latest
    docker build -f Dockerfile.aztec -t $image $TMP
    if [ "${CI:-0}" = 1 ]; then
      docker push $image
    fi
    github_endgroup
    exit
  ;;
  "_image-e2e")
    image=aztecprotocol/end-to-end:$(git rev-parse HEAD)
    docker pull $image &>/dev/null || true
    if docker_has_image $image; then
      echo "Image $image already exists." && exit
    fi
    github_group "image-e2e"
    source $ci3/source_tmp
    echo "earthly artifact build:"
    scripts/earthly-ci --artifact +bootstrap-end-to-end/usr/src $TMP/usr/src
    scripts/earthly-ci --artifact +bootstrap-end-to-end/anvil $TMP/anvil
    echo "docker image build:"
    docker pull aztecprotocol/end-to-end-base:v1.0-$(arch)
    docker tag aztecprotocol/end-to-end-base:v1.0-$(arch) aztecprotocol/end-to-end-base:latest
    docker build -f Dockerfile.end-to-end -t $image $TMP
    if [ "${CI:-0}" = 1 ]; then
      docker push $image
    fi
    github_endgroup
    exit
  ;;
  "image-e2e")
    parallel --line-buffer ./bootstrap.sh ::: image-aztec _image-e2e
    exit
  ;;
  "image-faucet")
    image=aztecprotocol/aztec-faucet:$(git rev-parse HEAD)
    if docker_has_image $image; then
      echo "Image $image already exists." && exit
    fi
    github_group "image-faucet"
    source $ci3/source_tmp
    mkdir -p $TMP/usr
    echo "earthly artifact build:"
    scripts/earthly-ci --artifact +bootstrap-faucet/usr/src $TMP/usr/src
    echo "docker image build:"
    docker build -f Dockerfile.aztec-faucet -t $image $TMP
    if [ "${CI:-0}" = 1 ]; then
      docker push $image
    fi
    github_endgroup
    exit
  ;;
  ""|"fast"|"full")
    build
  ;;
  "test-cmds")
    test_cmds $@
  ;;
  "test")
    test $@
  ;;
  "ci")
    build
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "usage: $0 <clean|full|fast|test|check|test-e2e|test-cache|test-boxes|test-kind-network|image-aztec|image-e2e|image-faucet>"
    exit 1
  ;;
esac
