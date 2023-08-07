#!/bin/bash
# Script to install noirup and the latest nargo
set -eu

VERSION="nightly"

export NARGO_HOME="$(pwd)/.nargo"
NARGO_BIN_DIR="$NARGO_HOME/bin"
BIN_URL="https://raw.githubusercontent.com/noir-lang/noirup/master/noirup"
BIN_PATH="$NARGO_BIN_DIR/noirup"
NARGO_MAN_DIR="$NARGO_HOME/share/man/man1"

# Clean
rm -rf $NARGO_HOME

# Install noirup.
mkdir -p $NARGO_BIN_DIR
mkdir -p $NARGO_MAN_DIR

curl -# -L $BIN_URL -o $BIN_PATH
chmod +x $BIN_PATH
export PATH=$NARGO_BIN_DIR:$PATH

# Install nargo
noirup -v $VERSION