#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/acir.msgpack"
FLAGS="-c $CRS_PATH $VFLAG"

$BIN client_ivc_prove_output_all $FLAGS $BFLAG
$BIN verify_client_ivc $FLAGS
