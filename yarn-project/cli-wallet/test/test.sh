#!/usr/bin/env bash
set -e

LOCATION=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

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

export WALLET_DATA_DIRECTORY="${LOCATION}/data"
export PXE_PROVER="none"

rm -rf $WALLET_DATA_DIRECTORY
mkdir -p $WALLET_DATA_DIRECTORY

if [ "${REMOTE_PXE:-}" = "1" ]; then
  echo "Using remote PXE"
  export REMOTE_PXE="1"
fi

if [ "${USE_DOCKER:-}" = "1" ]; then
    echo "Using docker"
    # overwrite default command in flows
    export COMMAND="aztec-wallet"
fi

cd ./flows

for file in $(ls *.sh | grep ${FILTER:-"."}); do
    ./$file
done
