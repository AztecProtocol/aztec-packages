#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

$ci3/github/group "noir-projects build"

# Use fmt as a trick to download dependencies.
# Otherwise parallel runs of nargo will trip over each other trying to download dependencies.
# Also doubles up as our formatting check.
(cd noir-protocol-circuits && yarn && node ./scripts/generate_variants.js)
for dir in noir-contracts noir-protocol-circuits mock-protocol-circuits aztec-nr; do
  (cd $dir && ../../noir/noir-repo/target/release/nargo fmt --check)
done

parallel -v --tag --line-buffered --joblog joblog.txt --halt now,fail=1 ::: \
  "./mock-protocol-circuits/bootstrap.sh" \
  "./noir-protocol-circuits/bootstrap.sh" \
  "./noir-contracts/bootstrap.sh"

$ci3/github/endgroup

# TODO: Testing aztec.nr/contracts requires TXE, so must be pushed to after the final yarn project build.
