#!/bin/sh
# TODO(https://github.com/AztecProtocol/barretenberg/issues/898): Grumpkin needs to match new layout.
set -eu
cd $(dirname $0)
./download_srs.sh "TEST%20GRUMPKIN" grumpkin/monomial 1 $@