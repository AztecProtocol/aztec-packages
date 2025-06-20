#!/usr/bin/env bash

FLAVOR=${1:-"ultra"}
CIRCUIT=${2:-"blake"}
INPUTS=${3:-"1,2,3,4"}

BIN="../cpp/build/bin/solidity_proof_gen"

INPUTS="$( sed 's/\\n//g' <<<"$INPUTS" )"

SRS_PATH="$HOME/.bb-crs"

# If flavor is honk, then run the honk generator
if [ "$FLAVOR" == "honk" ] || [ "$FLAVOR" == "honk_zk" ] ; then
    BIN="../cpp/build/bin/honk_solidity_proof_gen"
fi

# @note This needs to be updated to point to the generator
$BIN $FLAVOR $CIRCUIT $CRS_PATH $INPUTS
