#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

case "$cmd" in
  ""|"fast"|"full")
    echo_header "release-image build"
    cd ..
    denoise "docker build -f release-image/Dockerfile -t aztecprotocol/aztec:$(git rev-parse HEAD) ."
    docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:latest

    # TOOD(#10775): see 'releases'. We want to move away from this and use nightlies.
    if [ "$REF_NAME" == "master" ] && [ "${CI:-0}" -eq 1 ]; then
      if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
        echo "Missing DOCKERHUB_PASSWORD."
        exit 1
      fi
      echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin
      docker tag aztecprotocol/aztec:$COMMIT_HASH aztecprotocol/aztec:$COMMIT_HASH-$(arch)
      do_or_dryrun docker push aztecprotocol/aztec:$COMMIT_HASH-$(arch)
    fi
    ;;
  "release")
    echo_header "release-image release"

    if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
      echo "Missing DOCKERHUB_PASSWORD."
      exit 1
    fi
    echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin

    # We strip leading 'v' so that this is a valid semver.
    tag=${REF_NAME#v}
    docker tag aztecprotocol/aztec:$COMMIT_HASH aztecprotocol/aztec:$tag-$(arch)
    do_or_dryrun docker push aztecprotocol/aztec:$tag-$(arch)

    # If doing a release in CI, update the remote manifest if we're the arm build.
    if [ "${DRY_RUN:-0}" == 0 ] && [ "$(arch)" == "arm64" ] && [ "${CI:-0}" -eq 1 ]; then
      # Wait for amd64 image to be available.
      while ! docker manifest inspect aztecprotocol/aztec:$tag-amd64 &>/dev/null; do
        echo "Waiting for amd64 image to be pushed..."
        sleep 10
      done

      # We release with our tag, e.g. 1.0.0
      docker manifest create aztecprotocol/aztec:$tag \
        --amend aztecprotocol/aztec:$tag-amd64 \
        --amend aztecprotocol/aztec:$tag-arm64
      docker manifest push aztecprotocol/aztec:$tag

      # We also release with our dist_tag, e.g. 'latest' or 'nightly'.
      docker manifest create aztecprotocol/aztec:$(dist_tag) \
        --amend aztecprotocol/aztec:$tag-amd64 \
        --amend aztecprotocol/aztec:$tag-arm64
      docker manifest push aztecprotocol/aztec:$(dist_tag)
    fi
    ;;
  "release_commit")
    echo_header "release-image release commit"
    docker push aztecprotocol/aztec:$(git rev-parse HEAD)
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
