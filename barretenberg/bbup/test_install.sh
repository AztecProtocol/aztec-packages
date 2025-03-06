#!/usr/bin/env bash

set -e

cd $(dirname $0)/

VERSION=$1

TEMP_DIR=$(mktemp -d)

BB_PATH=$TEMP_DIR ./bbup -v $VERSION

# omg why did we remove bb --version?
version_gte() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

SEEN_VERSION=""
if version_gte "$VERSION" "0.77.0"; then
    SEEN_VERSION=$($TEMP_DIR/bb version)
else
    SEEN_VERSION=$($TEMP_DIR/bb --version)
fi

rm -rf $TEMP_DIR

if ! grep "$VERSION" <<< $SEEN_VERSION > /dev/null; then
    echo "Did not find expected version of bb"
    echo "Expected: $VERSION"
    echo "Found: $SEEN_VERSION"
    exit 1
fi

