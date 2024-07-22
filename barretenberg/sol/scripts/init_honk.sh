#!/usr/bin/env bash

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1057): Honk solidity verifier
FLAVOUR="honk"
SRS_PATH="../cpp/srs_db/ignition"
OUTPUT_PATH="./src/honk"

mkdir -p './src/honk/keys'

../cpp/build/bin/honk_solidity_key_gen $FLAVOUR add2 $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen $FLAVOUR blake $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen $FLAVOUR ecdsa $OUTPUT_PATH $SRS_PATH