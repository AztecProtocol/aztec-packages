#!/bin/bash
set -eu

# This file is used for Noir CI and is not required.

BACKEND=${BACKEND:-bb}

./codegen_verifier.sh

if ! [ -f ./target/contract.sol ]; then 
    printf '%s\n' "Contract not written to file" >&2
    exit 1
fi