#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

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

# Note: We rely on 'aztec' being built
anvil &
ANVIL_PID=$!
../../aztec/bin/index.js start --sandbox &
SANDBOX_PID=$!
function cleanup {
  kill $ANVIL_PID
  kill $SANDBOX_PID
}
trap cleanup EXIT
while ! nc -z localhost 8080; do sleep 1; done;

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
  ./$file $COMMAND $root/noir-projects/noir-contracts
done
