#!/usr/bin/env bash

set -e

cd $(dirname $0)/

VERSION=$1

TEMP_DIR=$(mktemp -d)
trap 'rm -rf $TEMP_DIR' EXIT

for attempt in {1..3}; do
    set +e
    BB_PATH=$TEMP_DIR ./bbup -v $VERSION && break
    status=$?
    if ! [[ $status -eq 22 && $attempt -lt 3 ]]; then
        exit $status
    fi
    set -e
    echo "bbup failed with exit code 22 possibly indicating bad download, retrying..."
done

if ! grep "$VERSION" <<< $($TEMP_DIR/bb --version) > /dev/null; then
    echo "Did not find expected version of bb"
    echo "Expected: $VERSION"
    echo "Found: $SEEN_VERSION"
    exit 1
fi
