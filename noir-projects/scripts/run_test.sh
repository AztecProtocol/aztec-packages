#!/bin/bash
set -eu

cd $(dirname $0)/../$1

export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}

$NARGO test --silence-warnings --skip-brillig-constraints-check --package $2 $3