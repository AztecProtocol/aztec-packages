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

cmd=${1:-}

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
  "test-e2e")
    ./bootstrap.sh image-aztec
    ./bootstrap.sh image-e2e
    yarn-project/end-to-end/scripts/e2e_test.sh $@
    exit
  ;;
  "test-cache")
    # Spin up ec2 instance and bootstrap.
    scripts/tests/bootstrap/test-cache
    exit
    ;;
  "image-aztec")
    github_group "image-aztec"
    source $ci3/source_tmp
    mkdir -p $TMP/usr/src
    # TODO(ci3) eventually this will just be a normal mounted docker build
    denoise earthly --artifact +bootstrap-aztec/usr/src $TMP/usr/src
    local git_hash=$(git rev-parse --short HEAD)
    shift 1 # remove command parameter
    docker build -f Dockerfile.aztec -t aztecprotocol/aztec:$git_hash $TMP $@
    github_endgroup
    exit
  ;;
  "image-e2e")
    github_group "image-aztec"
    source $ci3/source_tmp
    mkdir -p $TMP/usr
    # TODO(ci3) eventually this will just be a normal mounted docker build
    denoise earthly --artifact +bootstrap-end-to-end/usr/src $TMP/usr
    denoise earthly --artifact +bootstrap-aztec/anvil $TMP/anvil
    local git_hash=$(git rev-parse --short HEAD)
    shift 1 # remove command parameter
    docker build -f Dockerfile.end-to-end -t aztecprotocol/end-to-end:$git_hash $TMP $@
    github_endgroup
    exit
  ;;
  "image-faucet")
    github_group "image-faucet"
    source $ci3/source_tmp
    mkdir -p $TMP/usr
    # TODO(ci3) eventually this will just be a normal mounted docker build
    earthly --artifact +bootstrap-faucet/usr/src $TMP/usr
    local git_hash=$(git rev-parse --short HEAD)
    shift 1 # remove command parameter
    docker build -f Dockerfile.aztec-faucet -t aztecprotocol/aztec-faucet:$git_hash $TMP $@
    github_endgroup
    exit
  ;;
  ""|"fast"|"full"|"test"|"ci")
    # Drop through. source_bootstrap on script entry has set flags.
  ;;
  *)
    echo "usage: $0 <clean|full|fast|test|check|test-e2e|test-cache|image-aztec|image-e2e|image-faucet>"
    exit 1
  ;;
esac

# Install pre-commit git hooks.
hooks_dir=$(git rev-parse --git-path hooks)
echo "(cd barretenberg/cpp && ./format.sh staged)" >$hooks_dir/pre-commit
chmod +x $hooks_dir/pre-commit

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
  echo
  echo
  $project/bootstrap.sh $cmd
done
