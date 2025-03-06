#!/usr/bin/env bash

set -e

cd $(dirname $0)/

VERSION=$1

TEMP_DIR=$(mktemp -d)

BB_PATH=$TEMP_DIR ./bbup -v $VERSION

if ! grep "$VERSION" <<< $($TEMP_DIR/bb --version) > /dev/null; then
    echo "Did not find expected version of bb"
    echo "Expected: $VERSION"
    echo "Found: $SEEN_VERSION"
    exit 1
fi

rm -rf $TEMP_DIR
