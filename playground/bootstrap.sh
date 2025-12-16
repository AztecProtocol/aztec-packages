#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))

function build {
  echo_header "playground build"
  npm_install_deps

  if ! cache_download playground-$hash.tar.gz; then
    denoise 'yarn build'
    cache_upload playground-$hash.tar.gz $(git ls-files --others --ignored --exclude-standard | grep -vE '^"?node_modules/')
  fi
}

function test {
  echo_header "playground test"
  test_cmds | filter_test_cmds | parallelize
}

function test_cmds {
  for browser in chromium webkit firefox; do
    echo "$hash playground/scripts/run_test.sh $browser"
  done
}

function release {
  echo_header "playground release"

  do_or_dryrun aws s3 sync ./dist s3://play.aztec.network/$(dist_tag) --quiet
  do_or_dryrun aws s3 sync ./dist s3://play.aztec.network/$REF_NAME --quiet

  # We want the root to redirect to the latest master version.
  echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/latest"></head></html>' | \
    do_or_dryrun aws s3 cp - s3://play.aztec.network/index.html --content-type text/html

  invalidate_cloudfront
}

# Port release: copy S3 artifacts from source version to target version/dist_tag.
function port_release {
  local source_ref=${1:-$SOURCE_REF}
  local target_ref=${2:-$TARGET_REF}

  echo_header "playground port_release: $source_ref -> $target_ref"

  local target_dist_tag=$(REF_NAME=$target_ref dist_tag)

  # Copy from source ref to target dist_tag and target ref.
  echo "Copying S3 files from $source_ref to $target_dist_tag..."
  do_or_dryrun aws s3 sync "s3://play.aztec.network/$source_ref" "s3://play.aztec.network/$target_dist_tag" --quiet

  echo "Copying S3 files from $source_ref to $target_ref..."
  do_or_dryrun aws s3 sync "s3://play.aztec.network/$source_ref" "s3://play.aztec.network/$target_ref" --quiet

  invalidate_cloudfront
}

function invalidate_cloudfront {
  local id=$(cd terraform && terraform init &>/dev/null && terraform output -raw cloudfront_distribution_id)
  do_or_dryrun aws cloudfront create-invalidation --distribution-id $id --paths "/*"
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
