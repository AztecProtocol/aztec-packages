#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(hash_str \
  $(cache_content_hash ^release-image/Dockerfile ^release-image/Dockerfile.base.dockerignore ^release-image/Dockerfile.dockerignore ^build-images/src/Dockerfile ^ipc-runtime/ts/package.json ^yarn-project/yarn.lock) \
  $(../wsdb/bootstrap.sh hash))

function prepare_crs {
  echo_header "prepare crs for prover-agent image"
  local crs_src=${CRS_PATH:-$HOME/.bb-crs}

  if [ ! -f "$crs_src/bn254_g1_compressed.dat" ] || [ ! -f "$crs_src/grumpkin_g1_v2.flat.dat" ]; then
    # this assumes we pull the required number of points for proving the biggest circuit
    echo "CRS not found at $crs_src, downloading..."
    $root/barretenberg/scripts/download_bb_crs.sh
    crs_src=$HOME/.bb-crs
  fi

  mkdir -p crs
  cp "$crs_src/bn254_g1_compressed.dat" crs/
  cp "$crs_src/bn254_g2.dat" crs/
  cp "$crs_src/grumpkin_g1_v2.flat.dat" crs/
  # Normalize timestamps so COPY --link produces an identical layer across builds
  for f in crs/*; do touch -t 197001010000 "$f"; done
  echo "CRS files staged in crs/ ($(du -sh crs | cut -f1))"
}
export -f prepare_crs

function build_prover_agent_image {
  set -euo pipefail
  local tag=$(git rev-parse HEAD)

  if ! docker image inspect aztecprotocol/aztec:$tag &>/dev/null; then
    echo "Base image aztecprotocol/aztec:$tag not found. Run 'release-image/bootstrap.sh' first."
    exit 1
  fi

  prepare_crs
  echo_header "build prover-agent image"
  docker build -f Dockerfile.prover-agent --build-arg AZTEC_IMAGE_TAG=$tag \
    -t aztecprotocol/aztec-prover-agent:$tag .
  docker tag aztecprotocol/aztec-prover-agent:$tag aztecprotocol/aztec-prover-agent:latest
}
export -f build_prover_agent_image

function build_image {
  set -euo pipefail
  cd ..
  if semver check $REF_NAME; then
    # We are a tagged release. Use the version from the tag.
    # We strip leading 'v' so that this is a valid semver.
    local version=${REF_NAME#v}
  else
    # Otherwise, use the commit hash as the version.
    local version=$(git rev-parse HEAD)
  fi
  local previous_ids=$(docker images aztecprotocol/aztec --format "{{.ID}}" | uniq)
  docker build -f release-image/Dockerfile --build-arg VERSION=$version -t aztecprotocol/aztec:$(git rev-parse HEAD) .
  docker tag aztecprotocol/aztec:$(git rev-parse HEAD) aztecprotocol/aztec:latest

  # In CI, dump all files under /usr/src.
  if [ "$CI" -eq 1 ]; then
    docker run --rm --entrypoint /bin/bash aztecprotocol/aztec:latest -c 'cd /usr/src && find . -print | grep -v node_modules'
  fi

  # If we actually built a new image (not from cache), remove all but the just-built image.
  local new_ids=$(docker images aztecprotocol/aztec --format "{{.ID}}" | uniq)
  if [ "$previous_ids" != "$new_ids" ]; then
    echo "$previous_ids" | xargs -r docker rmi -f
  fi
}
export -f build_image

function build {
  echo_header "release-image build"

  if ! command -v docker &>/dev/null; then
    echo "Docker is required to build the release image. Skipping."
    exit 0
  fi

  if ! cache_download release-image-base-$hash.zst; then
    denoise "cd .. && docker build -f release-image/Dockerfile.base -t aztecprotocol/release-image-base ."
    docker save aztecprotocol/release-image-base:latest > release-image-base
    cache_upload release-image-base-$hash.zst release-image-base
  else
    docker load < release-image-base
  fi

  denoise "build_image"

  if semver check "${REF_NAME:-}"; then
    denoise "build_prover_agent_image"
  fi
}

function test_cmds {
  if ! command -v docker &>/dev/null; then
    exit 0
  fi

  # Very simple sanity test.
  echo "$hash docker run --rm aztecprotocol/aztec --version"
}

function release {
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

  docker tag aztecprotocol/aztec-prover-agent:$COMMIT_HASH aztecprotocol/aztec-prover-agent:$tag-$(arch)
  do_or_dryrun docker push aztecprotocol/aztec-prover-agent:$tag-$(arch)

  # If doing a release in CI, update the remote manifest if we're the arm build.
  if [ "${DRY_RUN:-0}" == 0 ] && [ "$(arch)" == "arm64" ] && [ "${CI:-0}" -eq 1 ]; then
    # Wait for amd64 image to be available.
    while ! docker manifest inspect aztecprotocol/aztec:$tag-amd64 &>/dev/null; do
      echo "Waiting for amd64 image to be pushed..."
      sleep 10
    done

    # We release with our tag, e.g. 1.0.0
    docker buildx imagetools create -t aztecprotocol/aztec:$tag \
      aztecprotocol/aztec:$tag-amd64 \
      aztecprotocol/aztec:$tag-arm64

    while ! docker manifest inspect aztecprotocol/aztec-prover-agent:$tag-amd64 &>/dev/null; do
      echo "Waiting for amd64 prover-agent image to be pushed..."
      sleep 10
    done

    docker buildx imagetools create -t aztecprotocol/aztec-prover-agent:$tag \
      aztecprotocol/aztec-prover-agent:$tag-amd64 \
      aztecprotocol/aztec-prover-agent:$tag-arm64

    # We also release with our dist_tag, e.g. 'latest', 'staging' or 'nightly'.
    # docker buildx imagetools create -t aztecprotocol/aztec:$(dist_tag) \
    #   aztecprotocol/aztec:$tag-amd64 \
    #   aztecprotocol/aztec:$tag-arm64
  fi
}

function push {
  echo_header "release-image push"

  if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
    echo "Missing DOCKERHUB_PASSWORD."
    exit 1
  fi
  echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin
  do_or_dryrun docker push aztecprotocol/aztec:$COMMIT_HASH
  do_or_dryrun docker push aztecprotocol/aztec-prover-agent:$COMMIT_HASH
}

function push_pr {
  echo_header "release-image push_pr"

  if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
    echo "Missing DOCKERHUB_PASSWORD."
    exit 1
  fi
  echo $DOCKERHUB_PASSWORD | docker login -u ${DOCKERHUB_USERNAME:-aztecprotocolci} --password-stdin
  docker tag aztecprotocol/aztec:$COMMIT_HASH aztecprotocol/aztecdev:$COMMIT_HASH
  do_or_dryrun docker push aztecprotocol/aztecdev:$COMMIT_HASH
  # Best-effort: push prover-agent image if available.
  if docker tag aztecprotocol/aztec-prover-agent:$COMMIT_HASH aztecprotocol/aztec-prover-agent-dev:$COMMIT_HASH 2>/dev/null; then
    do_or_dryrun docker push aztecprotocol/aztec-prover-agent-dev:$COMMIT_HASH || echo "Warning: failed to push prover-agent-dev image, continuing."
  else
    echo "Warning: prover-agent image not found locally, skipping push."
  fi
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
