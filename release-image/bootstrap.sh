#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash ^release-image/Dockerfile ^build-images/src/Dockerfile ^yarn-project/yarn.lock)

function build_image {
  set -euo pipefail
  cd ..

  # Use AZTEC_RELEASE_REPO for image name (defaults to aztec)
  local repo=${AZTEC_RELEASE_REPO:-aztec}
  local image_name="aztecprotocol/$repo"

  if semver check $REF_NAME; then
    # We are a tagged release. Use the version from the tag.
    # We strip leading 'v' so that this is a valid semver.
    local version=${REF_NAME#v}
  else
    # Otherwise, use the commit hash as the version.
    local version=$(git rev-parse HEAD)
  fi
  local previous_ids=$(docker images $image_name --format "{{.ID}}" | uniq)
  docker build -f release-image/Dockerfile --build-arg VERSION=$version -t $image_name:$(git rev-parse HEAD) .
  docker tag $image_name:$(git rev-parse HEAD) $image_name:latest

  # If we actually built a new image (not from cache), remove all but the just-built image.
  local new_ids=$(docker images $image_name --format "{{.ID}}" | uniq)
  if [ "$previous_ids" != "$new_ids" ]; then
    echo "$previous_ids" | xargs -r docker rmi -f
  fi
}
export -f build_image

function build {
  echo_header "release-image build"

  if ! cache_download release-image-base-$hash.zst; then
    denoise "cd .. && docker build -f release-image/Dockerfile.base -t aztecprotocol/release-image-base ."
    docker save aztecprotocol/release-image-base:latest > release-image-base
    cache_upload release-image-base-$hash.zst release-image-base
  else
    docker load < release-image-base
  fi

  denoise "build_image"
}

case "$cmd" in
  ""|"fast"|"full")
    build
    ;;
  "push")
    echo_header "release-image push"

    # Use AZTEC_RELEASE_REPO for image name (defaults to aztec)
    repo=${AZTEC_RELEASE_REPO:-aztec}
    image_name="aztecprotocol/$repo"

    if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
      echo "Missing DOCKERHUB_PASSWORD."
      exit 1
    fi
    echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin
    do_or_dryrun docker push $image_name:$COMMIT_HASH
    ;;
  "release")
    echo_header "release-image release"

    # Use AZTEC_RELEASE_REPO for image name (defaults to aztec)
    repo=${AZTEC_RELEASE_REPO:-aztec}
    image_name="aztecprotocol/$repo"

    if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
      echo "Missing DOCKERHUB_PASSWORD."
      exit 1
    fi
    echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin

    # We strip leading 'v' so that this is a valid semver.
    tag=${REF_NAME#v}
    docker tag $image_name:$COMMIT_HASH $image_name:$tag-$(arch)
    do_or_dryrun docker push $image_name:$tag-$(arch)

    # If doing a release in CI, update the remote manifest if we're the arm build.
    if [ "${DRY_RUN:-0}" == 0 ] && [ "$(arch)" == "arm64" ] && [ "${CI:-0}" -eq 1 ]; then
      # Wait for amd64 image to be available.
      while ! docker manifest inspect $image_name:$tag-amd64 &>/dev/null; do
        echo "Waiting for amd64 image to be pushed..."
        sleep 10
      done

      # We release with our tag, e.g. 1.0.0
      docker manifest create $image_name:$tag \
        --amend $image_name:$tag-amd64 \
        --amend $image_name:$tag-arm64
      docker manifest push $image_name:$tag

      # We also release with our dist_tag, e.g. 'latest', 'staging' or 'nightly'.
      docker manifest create $image_name:$(dist_tag) \
        --amend $image_name:$tag-amd64 \
        --amend $image_name:$tag-arm64
      docker manifest push $image_name:$(dist_tag)
    fi
    ;;
  build)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
