#!/usr/bin/env bash
# Usage: ./bootstrap.sh <full|fast|check|clean>"
#   full: Bootstrap the repo from scratch.
#   fast: Bootstrap the repo using CI cache where possible to save time building.
#   check: Check required toolchains and versions are installed.
#   clean: Force a complete clean of the repo. Erases untracked files, be careful!
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

# Enable abbreviated output.
export DENOISE=1

# Enable abbreviated output.
export DENOISE=1

CMD=${1:-}

YELLOW="\033[93m"
RED="\033[31m"
BOLD="\033[1m"
RESET="\033[0m"

function encourage_dev_container {
  echo -e "${BOLD}${RED}ERROR: Toolchain incompatibility. We encourage use of our dev container. See build-images/README.md.${RESET}"
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
  CMAKE_MIN_VERSION="3.24"
  CMAKE_INSTALLED_VERSION=$(cmake --version | head -n1 | awk '{print $3}')
  if [[ "$(printf '%s\n' "$CMAKE_MIN_VERSION" "$CMAKE_INSTALLED_VERSION" | sort -V | head -n1)" != "$CMAKE_MIN_VERSION" ]]; then
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
  NODE_MIN_VERSION="18.19.0"
  NODE_INSTALLED_VERSION=$(node --version | cut -d 'v' -f 2)
  if [[ "$(printf '%s\n' "$NODE_MIN_VERSION" "$NODE_INSTALLED_VERSION" | sort -V | head -n1)" != "$NODE_MIN_VERSION" ]]; then
    encourage_dev_container
    echo "Minimum Node.js version 18.19.0 not found."
    echo "Installation: nvm install 18"
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

case "$CMD" in
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
    for SUBMODULE in $(git config --file .gitmodules --get-regexp path | awk '{print $2}'); do
      rm -rf $SUBMODULE
    done

    # Remove all untracked files, directories, nested repos, and .gitignore files.
    git clean -ffdx

    echo "Cleaning complete"
    exit 0
  ;;
  "full")
    echo -e "${BOLD}${YELLOW}WARNING: Performing a full bootstrap. Consider leveraging './bootstrap.sh fast' to use CI cache.${RESET}"
    echo
  ;;
  "fast")
    export USE_CACHE=1
  ;;
  "check")
    check_toolchains
    echo "Toolchains look good! 🎉"
    exit 0
  ;;
  "test-e2e")
    ./bootstrap.sh image-aztec
    ./bootstrap.sh image-e2e
    yarn-project/end-to-end/scripts/e2e_test.sh $@
    exit
  ;;
  "test-cache")
    # Test cache by running minio with full and fast bootstraps
    scripts/tests/bootstrap/test-cache
    exit
    ;;
  "test-boxes")
    github_group "test-boxes"
    bootstrap_local "CI=1 TEST=0 ./bootstrap.sh fast && ./boxes/bootstrap.sh test";
    exit
  ;;
  "image-aztec")
    IMAGE=aztecprotocol/aztec:$(git rev-parse HEAD)
    if docker_has_image $IMAGE; then
      exit
    fi
    github_group "image-aztec"
    source $ci3/source_tmp
    echo "earthly artifact build:"
    earthly --artifact +bootstrap-aztec/usr/src $TMP/usr/src
    echo "docker image build:"
    docker build -f Dockerfile.aztec -t $IMAGE $TMP
    github_endgroup
    exit
  ;;
  "image-e2e")
    IMAGE=aztecprotocol/end-to-end:$(git rev-parse HEAD)
    if docker_has_image $IMAGE; then
      echo "Image $IMAGE already exists." && exit
    fi
    github_group "image-e2e"
    source $ci3/source_tmp
    echo "earthly artifact build:"
    earthly --artifact +bootstrap-end-to-end/usr/src $TMP/usr/src
    earthly --artifact +bootstrap-end-to-end/anvil $TMP/anvil
    echo "docker image build:"
    docker build -f Dockerfile.end-to-end -t $IMAGE $TMP
    github_endgroup
    exit
  ;;
  "image-faucet")
    IMAGE=aztecprotocol/aztec-faucet:$(git rev-parse HEAD)
    if docker_has_image $IMAGE; then
      echo "Image $IMAGE already exists." && exit
    fi
    github_group "image-faucet"
    source $ci3/source_tmp
    mkdir -p $TMP/usr
    echo "earthly artifact build:"
    earthly --artifact +bootstrap-faucet/usr/src $TMP/usr/src
    echo "docker image build:"
    docker build -f Dockerfile.aztec-faucet -t $IMAGE $TMP
    github_endgroup
    exit
  ;;
  *)
    echo "usage: $0 <clean|full|fast|check|test-e2e|test-cache|test-boxes|image-aztec|image-e2e|image-faucet>"
    exit 1
  ;;
esac

# Install pre-commit git hooks.
HOOKS_DIR=$(git rev-parse --git-path hooks)
echo "(cd barretenberg/cpp && ./format.sh staged)" >$HOOKS_DIR/pre-commit
chmod +x $HOOKS_DIR/pre-commit

github_group "Pull Submodules"
denoise git submodule update --init --recursive
github_endgroup

check_toolchains

PROJECTS=(
  noir
  barretenberg
  l1-contracts
  avm-transpiler
  noir-projects
  yarn-project
  boxes
)

# Build projects.
# Death wrapper ensures no child process exist after exit.
for project in "${PROJECTS[@]}"; do
  echo "**************************************"
  echo -e "\033[1mBootstrapping $project...\033[0m"
  echo "**************************************"
  echo
  (cd $project && ./bootstrap.sh)
  echo
  echo
done
