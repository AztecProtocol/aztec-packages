#!/bin/bash
set -eu

VERSION="0.4.6"
SCRIPT_DIR=$(dirname "$(realpath "$0")")

if ! [ -f "$SCRIPT_DIR"/git-subrepo-"$VERSION"/lib/git-subrepo ] ; then
  url="https://github.com/ingydotnet/git-subrepo/archive/refs/tags/$VERSION.tar.gz"
  
  # Download the archive
  curl -L -o "$SCRIPT_DIR"/git-subrepo.tar.gz $url
  
  # Extract the archive
  tar -xzvf "$SCRIPT_DIR"/git-subrepo.tar.gz -C "$SCRIPT_DIR"
fi
"$SCRIPT_DIR"/git-subrepo-"$VERSION"/lib/git-subrepo $@

