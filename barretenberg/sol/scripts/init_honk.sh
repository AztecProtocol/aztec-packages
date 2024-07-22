#!/usr/bin/env bash

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1057): Honk solidity verifier
PLONK_FLAVOUR="honk"
SRS_PATH="../cpp/srs_db/ignition"
OUTPUT_PATH="./src/honk"

mkdir -p './src/honk/keys'

../cpp/build/bin/honk_solidity_key_gen $PLONK_FLAVOUR add2 $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen $PLONK_FLAVOUR blake $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen $PLONK_FLAVOUR ecdsa $OUTPUT_PATH $SRS_PATH