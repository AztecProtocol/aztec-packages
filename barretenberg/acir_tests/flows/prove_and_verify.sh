#!/bin/bash
# prove_and_verify produces no output, so is parallel safe.
set -eu

flags="-c $CRS_PATH ${VERBOSE:+-v}"
[ "${RECURSIVE}" = "true" ] && flags+=" --recursive"

case ${SYS:-} in
  "")
    cmd=prove_and_verify
    ;;
  "client_ivc")
    cmd=prove_and_verify
    flags+=" --scheme client_ivc ${INPUT_TYPE:+--input_type $INPUT_TYPE}"
    ;;
  "ultra_honk")
    cmd=prove_and_verify
    flags+=" --scheme ultra_honk ${INPUT_TYPE:+--input_type $INPUT_TYPE}"
    ;;
  *)
    cmd=prove_and_verify_$SYS
    ;;
esac

$BIN $cmd $flags -b ./target/program.json
