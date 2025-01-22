#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

case "$cmd" in
  ""|"full")
    echo_header "release-image build"
    cd ..
    docker build -f release-image/Dockerfile -t aztecprotocol/aztec:$(git rev-parse HEAD) .
    docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:latest
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
