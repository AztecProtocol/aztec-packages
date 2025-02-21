#!/bin/bash
# prove_and_verify produces no output, so is parallel safe.
set -eu

flags="-c $CRS_PATH ${VERBOSE:+-v}"
[ "${RECURSIVE}" = "true" ] && flags+=" --recursive"

case ${SYS:-} in
  "")
    cmd=prove_and_verify
    ;;
  *)
    cmd=prove_and_verify_$SYS
    ;;
esac

$BIN $cmd $flags -b ./target/program.json
