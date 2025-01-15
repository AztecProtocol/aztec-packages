#!/usr/bin/env bash

HONK_FLAVOR="honk"
SRS_PATH="../cpp/srs_db/ignition"
OUTPUT_PATH="./src/honk"

mkdir -p './src/honk/keys'

../cpp/build/bin/honk_solidity_key_gen $HONK_FLAVOR add2 $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen $HONK_FLAVOR blake $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/honk_solidity_key_gen $HONK_FLAVOR ecdsa $OUTPUT_PATH $SRS_PATH