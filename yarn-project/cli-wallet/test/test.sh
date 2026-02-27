#!/usr/bin/env bash

# To run these tests against a local network:
# 1. Start a local Ethereum node (Anvil):
#    anvil --host 127.0.0.1 --port 8545
#
# 2. Start the Aztec local network:
#    cd yarn-project/aztec
#    NODE_NO_WARNINGS=1 ETHEREUM_HOSTS=http://127.0.0.1:8545 node ./dest/bin/index.js start --local-network
#
# 3. Run the tests:
#    ./test.sh 

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

if [ "${USE_DOCKER:-}" = "1" ]; then
    echo "Using docker"
    # overwrite default command in flows
    export COMMAND="aztec-wallet"
fi

cd ./flows

for file in $(ls *.sh | grep ${FILTER:-"."}); do
    ./$file
done
