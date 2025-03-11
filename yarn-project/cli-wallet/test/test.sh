#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--docker)
      USE_DOCKER="1"
      shift
      ;;
    -f|--filter)
      FILTER="$2"
      shift 2
      ;;
    -r|--remote-pxe)
      REMOTE_PXE="1"
      shift
      ;;
    -*|--*)
      echo "Unknown option $1"
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1") # save positional arg
      shift # past argument
      ;;
  esac
done

set -- "${POSITIONAL_ARGS[@]}" # restore positional parameters

# Set up wallet data directory
rm -rf data
mkdir -p data
export WALLET_DATA_DIRECTORY="$(pwd)/data"

COMMAND="node --no-warnings $(pwd)/../dest/bin/index.js"

if [ "${REMOTE_PXE:-}" = "1" ]; then
  echo "Using remote PXE"
  export REMOTE_PXE="1"
fi

if [ "${USE_DOCKER:-}" = "1" ]; then
  echo "Using docker"
  COMMAND="aztec-wallet"
fi

cd ./flows

for file in $(ls *.sh | grep ${FILTER:-"."}); do
  echo ./$file $COMMAND $root/noir-projects/noir-contracts
  ./$file $COMMAND $root/noir-projects/noir-contracts
done
