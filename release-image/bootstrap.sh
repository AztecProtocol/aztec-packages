#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

case "$cmd" in
  ""|"full")
    echo_header "release-image build"
    cd ..
    denoise "docker build -f release-image/Dockerfile -t aztecprotocol/aztec:$(git rev-parse HEAD) ."
    docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:latest
    ;;
  "prerelease")
    echo_header "release-image prerelease"
    docker push aztecprotocol/aztec:$(git rev-parse HEAD)
    ;;
  "release")
    echo_header "release-image release"
    docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:$REF_NAME
    docker push aztecprotocol/aztec:$REF_NAME
    docker push aztecprotocol/aztec:latest
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
# saleel merge
# bb cpp version sed
# l1 contracts release
