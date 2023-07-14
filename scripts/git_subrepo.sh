#!/bin/bash
set -eu

VERSION="0.4.6"

if ! [ -f git-subrepo-"$VERSION"/lib/git-subrepo ] ; then
  url="https://github.com/ingydotnet/git-subrepo/archive/refs/tags/$VERSION.tar.gz"
  
  # Download the archive
  curl -L -o git-subrepo.tar.gz $url
  
  # Extract the archive
  tar -xzvf git-subrepo.tar.gz
fi
git-subrepo-"$VERSION"/lib/git-subrepo $@
