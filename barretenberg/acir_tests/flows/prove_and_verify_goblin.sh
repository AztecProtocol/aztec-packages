#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}

<<<<<<< HEAD
=======
# This is the fastest flow, because it only generates pk/vk once, gate count once, etc.
# It may not catch all class of bugs.
>>>>>>> origin/cg-lde/expose-goblin
$BIN prove_and_verify_goblin $VFLAG -c $CRS_PATH -b ./target/acir.gz