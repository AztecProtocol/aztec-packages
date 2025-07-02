#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(cache_content_hash ^aztec-up/) $(../yarn-project/bootstrap.sh hash))


function build_dind_image {
  echo_header "aztec-up build test image"
  denoise "docker build -t aztecprotocol/dind ."
}

function update_manifest {
  # We update the manifest to point to the latest arch specific images, pushed above.
  local image=aztecprotocol/dind:latest
  # Remove any old local manifest if present.
  docker manifest rm $image || true
  # Create new manifest and push.
  docker manifest create $image \
    --amend aztecprotocol/dind:latest-amd64 \
    --amend aztecprotocol/dind:latest-arm64
  docker manifest push $image
}

function test_cmds {
  echo "$hash aztec-up/scripts/run_test.sh amm_flow"
  echo "$hash aztec-up/scripts/run_test.sh bridge_and_claim"
  echo "$hash aztec-up/scripts/run_test.sh basic_install"
  echo "$hash aztec-up/scripts/run_test.sh counter_contract"
}

function test {
  echo_header "aztec-up test"
  test_cmds | filter_test_cmds | parallelise
}

function release {
  echo_header "aztec-up release"
  local version=${REF_NAME#v}

  # Always create a version directory and upload files there.
  do_or_dryrun aws s3 sync ./bin "s3://install.aztec.network/$version/"

  if [[ $(dist_tag) != "latest" ]]; then
    # Also upload to a $dist_tag directory, if not latest.
    do_or_dryrun aws s3 sync ./bin "s3://install.aztec.network/$(dist_tag)/"
  else
    # Upload new version to root.
    do_or_dryrun aws s3 sync ./bin s3://install.aztec.network/
  fi
}

case "$cmd" in
  ""|"full"|"fast")
    ;;
  test_cmds|test|release|build_dind_image|update_manifest)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
