#!/bin/bash
# TODO consider moving this and the flows it defines into end-to-end folder.
source $(git rev-parse --show-toplevel)/ci3/source

$root/yarn-project/cli-wallet/test/test.sh
