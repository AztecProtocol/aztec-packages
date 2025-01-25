#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash \
  ../spartan/.rebuild_patterns)

function build {
  github_group "spartan build"
}

if [ "$cmd" = "hash" ]; then
  echo $hash
fi
