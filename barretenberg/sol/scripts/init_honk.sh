#!/usr/bin/env bash
# the verification key is the same for ultra and ultra zk
SRS_PATH="$HOME/.bb-crs"
OUTPUT_PATH="./src/honk"

mkdir -p './src/honk/keys'

../cpp/build/bin/honk_solidity_key_gen add2 $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen blake $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen ecdsa $OUTPUT_PATH $SRS_PATH
