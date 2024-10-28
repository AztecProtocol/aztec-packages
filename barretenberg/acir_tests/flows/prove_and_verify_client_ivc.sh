#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/acir.msgpack.b64"
FLAGS="-c $CRS_PATH $VFLAG"

$BIN client_ivc_prove_and_verify $FLAGS $BFLAG
