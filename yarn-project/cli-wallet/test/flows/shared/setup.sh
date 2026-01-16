#!/usr/bin/env bash

# Colors
r="\033[31m" # Red
g="\033[32m" # Green
y="\033[33m" # Yellow
b="\033[34m" # Blue
p="\033[35m" # Purple
rs="\033[0m"  # Reset
bold="\033[1m"

# Call our cli-wallet entrypoint as the default command.
command="${COMMAND:-"node --no-warnings $root/yarn-project/cli-wallet/dest/bin/index.js"}"
flows=$(pwd)
cd $root/noir-projects/noir-contracts

export PXE_PROVER="none"

function aztec-wallet {
  echo_header aztec-wallet "$@"
  $command "$@"
}

function assert_eq {
  if [ $1 = $2 ]; then
    echo
    echo -e "✅ ${bold}${g}Pass${rs}"
    echo
    echo "---------------------------------"
    echo
  else
    echo
    echo -e "❌ ${bold}${rs}Fail${rs}"
    echo
    exit 1
  fi
}

function test_title {
  echo -e "🧪 ${bold}${b}Test: $@${rs}"
  echo
}

function warn {
  echo -e "${bold}${y}$@${rs}"
}

function err {
  echo -e "${bold}${r}$@${rs}"
}

function bold {
  echo -e "${bold}$@${rs}"
}

function section {
  echo
  bold "➡️ $@"
  echo
}

warn "aztec-wallet is $command"
echo
