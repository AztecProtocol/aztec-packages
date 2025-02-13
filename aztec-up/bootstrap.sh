#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash ^aztec-up/)

function build_dind_image {
  echo_header "aztec-up build test image"
  denoise "docker build -t aztecprotocol/dind ."
}

function test_cmds {
  echo "$hash aztec-up/scripts/run_test.sh basic_install"
  echo "$hash aztec-up/scripts/run_test.sh counter_contract"
}

function test {
  echo_header "aztec-up test"
  test_cmds | parallelise
}

function release {
  echo_header "aztec-up release"
  local version=${REF_NAME#v}

  # Function to compare versions.
  version_gt() { test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"; }

  # Read the current version from S3.
  local current_version=$(aws s3 cp s3://install.aztec.network/VERSION - 2>/dev/null || echo "0.0.0")

  if [ $(dist_tag) != latest ]; then
    echo_stderr -e "${yellow}Not uploading aztec-up scripts for dist-tag $(dist_tag). They are expected to still be compatible with latest."
    return
  fi

  # Validate that version is a valid semver.
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Warning: $version is not a valid semver version. Skipping version comparison."
  else
    # Check if new version is greater than current version.
    if version_gt "$version" "$current_version"; then
      echo "Uploading new version: $version"

      # Upload new version to root.
      do_or_dryrun aws s3 sync ./bin s3://install.aztec.network/

      # Update VERSION file.
      echo "$version" | do_or_dryrun aws s3 cp - s3://install.aztec.network/VERSION
    else
      echo "New version $version is not greater than current version $current_version. Skipping root upload."
    fi
  fi

  # Always create a version directory and upload files there.
  do_or_dryrun aws s3 sync ./bin s3://install.aztec.network/$version/
}

case "$cmd" in
  ""|"full")
    build_dind_image
    ;;
  test_cmds|test|release)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
