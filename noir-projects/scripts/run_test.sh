#!/bin/bash
set -eu

sub_project=$1
package=$2
test=$3
txe_port=${4:-}

cd $(dirname $0)/../$sub_project

export RAYON_NUM_THREADS=1
export NARGO_FOREIGN_CALL_TIMEOUT=300000
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}

[ -n "$txe_port" ] && args="--oracle-resolver http://127.0.0.1:$txe_port" || args=""

$NARGO test --silence-warnings --skip-brillig-constraints-check $args --package $package --exact $test