#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

case "$cmd" in
  ""|"full")
    echo_header "release-image build"
    cd ..
    denoise "docker build -f release-image/Dockerfile -t aztecprotocol/aztec:$(git rev-parse HEAD) ."
    docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:latest
    if [ "$REF_NAME" == "master" ] && [ "$CI" -eq 1 ]; then
      docker tag aztecprotocol/aztec:$COMMIT_HASH aztecprotocol/aztec:$COMMIT_HASH-$(arch)
      do_or_dryrun docker push aztecprotocol/aztec:$COMMIT_HASH-$(arch)
    fi
    ;;
  "release")
    echo_header "release-image release"
    docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:${REF_NAME}-$(arch)
    do_or_dryrun docker push aztecprotocol/aztec:${REF_NAME}-$(arch)

    # If doing a release in CI, update the remote manifest if we're the arm build.
    if [ "${DRY_RUN:-0}" == 0 ] && [ "$(arch)" == "arm64" ] && [ "$CI" -eq 1 ]; then
      # Wait for amd64 image to be available.
      while ! docker manifest inspect aztecprotocol/aztec:${REFNAME}-$(arch) &>/dev/null; do
        echo "Waiting for amd64 image to be pushed..."
        sleep 10
      done

      docker manifest create aztecprotocol/aztec:$REF_NAME \
        --amend aztecprotocol/aztec:${REF_NAME}-amd64 \
        --amend aztecprotocol/aztec:${REF_NAME}-arm64
      docker manifest push $REF_NAME

      docker manifest create aztecprotocol/aztec:$(dist_tag) \
        --amend aztecprotocol/aztec:${REF_NAME}-amd64 \
        --amend aztecprotocol/aztec:${REF_NAME}-arm64
      docker manifest push $(dist_tag)
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
