#!/usr/bin/env bash

SRS_PATH="$HOME/.bb-crs"
OUTPUT_PATH="./src/ultra"

../cpp/build/bin/solidity_key_gen add2 $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/solidity_key_gen blake $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/solidity_key_gen ecdsa $OUTPUT_PATH $SRS_PATH
../cpp/build/bin/solidity_key_gen recursive $OUTPUT_PATH $SRS_PATH
